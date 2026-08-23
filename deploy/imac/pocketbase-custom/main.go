package main

import (
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/plugins/ghupdate"
	"github.com/pocketbase/pocketbase/plugins/jsvm"
	"github.com/pocketbase/pocketbase/plugins/migratecmd"
	"github.com/pocketbase/pocketbase/tools/hook"
)

func main() {
	app := pocketbase.New()
	registerDailyPublicationHooks(app)

	var hooksDir string
	app.RootCmd.PersistentFlags().StringVar(
		&hooksDir,
		"hooksDir",
		"",
		"the directory with the JS app hooks",
	)

	var hooksWatch bool
	app.RootCmd.PersistentFlags().BoolVar(
		&hooksWatch,
		"hooksWatch",
		true,
		"auto restart the app on pb_hooks file change",
	)

	var hooksPool int
	app.RootCmd.PersistentFlags().IntVar(
		&hooksPool,
		"hooksPool",
		15,
		"the total prewarm goja.Runtime instances for the JS app hooks execution",
	)

	var migrationsDir string
	app.RootCmd.PersistentFlags().StringVar(
		&migrationsDir,
		"migrationsDir",
		"",
		"the directory with the user defined migrations",
	)

	var automigrate bool
	app.RootCmd.PersistentFlags().BoolVar(
		&automigrate,
		"automigrate",
		true,
		"enable/disable auto migrations",
	)

	var publicDir string
	app.RootCmd.PersistentFlags().StringVar(
		&publicDir,
		"publicDir",
		defaultPublicDir(),
		"the directory to serve static files",
	)

	var siteDir string
	app.RootCmd.PersistentFlags().StringVar(
		&siteDir,
		"siteDir",
		"./dist",
		"the built public site directory used by SEO routes",
	)

	var indexFallback bool
	app.RootCmd.PersistentFlags().BoolVar(
		&indexFallback,
		"indexFallback",
		true,
		"fallback the request to index.html on missing static path (eg. when pretty urls are used with SPA)",
	)

	var httpRequestTimeout time.Duration
	app.RootCmd.PersistentFlags().DurationVar(
		&httpRequestTimeout,
		"httpRequestTimeout",
		3*time.Hour,
		"HTTP read/write timeout used for large media uploads",
	)

	var tusUploadDir string
	app.RootCmd.PersistentFlags().StringVar(
		&tusUploadDir,
		"tusUploadDir",
		"",
		"temporary directory for resumable media upload chunks",
	)

	app.RootCmd.ParseFlags(os.Args[1:])
	if tusUploadDir == "" {
		tusUploadDir = filepath.Join(filepath.Dir(app.DataDir()), "tus-uploads")
	}
	resumableUploads, err := newResumableUploadService(app, tusUploadDir)
	if err != nil {
		log.Fatal(err)
	}
	seoPages := newSEORenderer(app, siteDir)
	bgmTrimmer := newBGMTrimService(app)
	askQuestions := newAskQuestionService(app)
	app.Cron().MustAdd("cleanup-tus-uploads", "17 4 * * *", func() {
		if err := resumableUploads.cleanupStaleUploads(time.Now()); err != nil {
			app.Logger().Warn("Failed to clean stale tus uploads", "error", err.Error())
		}
	})

	jsvm.MustRegister(app, jsvm.Config{
		MigrationsDir: migrationsDir,
		HooksDir:      hooksDir,
		HooksWatch:    hooksWatch,
		HooksPoolSize: hooksPool,
	})

	migratecmd.MustRegister(app, app.RootCmd, migratecmd.Config{
		TemplateLang: migratecmd.TemplateLangJS,
		Automigrate:  automigrate,
		Dir:          migrationsDir,
	})

	ghupdate.MustRegister(app, app.RootCmd, ghupdate.Config{})

	app.OnServe().BindFunc(func(e *core.ServeEvent) error {
		e.Server.ReadTimeout = httpRequestTimeout
		e.Server.WriteTimeout = httpRequestTimeout
		app.Logger().Info(
			"HTTP request timeout configured",
			"readTimeout", e.Server.ReadTimeout.String(),
			"writeTimeout", e.Server.WriteTimeout.String(),
		)
		return e.Next()
	})

	app.OnServe().BindFunc(func(e *core.ServeEvent) error {
		resumableUploads.registerRoutes(e)
		bgmTrimmer.registerRoutes(e)
		askQuestions.registerRoutes(e)
		seoPages.registerRoutes(e)
		return e.Next()
	})

	app.OnServe().Bind(&hook.Handler[*core.ServeEvent]{
		Func: func(e *core.ServeEvent) error {
			if !e.Router.HasRoute(http.MethodGet, "/{path...}") {
				e.Router.GET("/{path...}", apis.Static(os.DirFS(publicDir), indexFallback))
			}

			return e.Next()
		},
		Priority: 999,
	})

	if err := app.Start(); err != nil {
		log.Fatal(err)
	}
}

func defaultPublicDir() string {
	if strings.HasPrefix(os.Args[0], os.TempDir()) {
		return "./pb_public"
	}

	return filepath.Join(os.Args[0], "../pb_public")
}

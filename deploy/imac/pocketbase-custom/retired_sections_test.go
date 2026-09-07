package main

import (
	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tests"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestRetiredSectionsPreserveDataAndCloseRules(t *testing.T) {
	app, err := tests.NewTestApp()
	if err != nil {
		t.Fatal(err)
	}
	defer app.Cleanup()
	c := core.NewBaseCollection("ask_questions")
	rule := ""
	c.ListRule = &rule
	c.ViewRule = &rule
	c.CreateRule = &rule
	c.UpdateRule = &rule
	c.DeleteRule = &rule
	c.Fields.Add(&core.TextField{Name: "question"})
	if err = app.Save(c); err != nil {
		t.Fatal(err)
	}
	r := core.NewRecord(c)
	r.Set("question", "보존할 질문")
	if err = app.Save(r); err != nil {
		t.Fatal(err)
	}
	for i := 0; i < 2; i++ {
		if err = ensureRetiredSections(app); err != nil {
			t.Fatal(err)
		}
	}
	c, _ = app.FindCollectionByNameOrId(c.Id)
	if c.ListRule != nil || c.ViewRule != nil || c.CreateRule != nil || c.UpdateRule != nil || c.DeleteRule != nil {
		t.Fatal("retired API still public")
	}
	r, err = app.FindRecordById(c.Id, r.Id)
	if err != nil || r.GetString("question") != "보존할 질문" {
		t.Fatal("retirement destroyed history")
	}
}

func TestRetiredSectionRoutesOverrideSPAFallback(t *testing.T) {
	app, err := tests.NewTestApp()
	if err != nil {
		t.Fatal(err)
	}
	defer app.Cleanup()
	users, _ := app.FindCollectionByNameOrId("users")
	_, token := createFileToolAuthRecord(t, app, users, "aaaaaaaaaaaaaaa", "retired-owner@example.com")
	router, err := apis.NewRouter(app)
	if err != nil {
		t.Fatal(err)
	}
	registerRetiredSectionRoutes(&core.ServeEvent{App: app, Router: router})
	router.GET("/{path...}", func(e *core.RequestEvent) error { return e.HTML(200, "<html>SPA fallback</html>") })
	mux, err := router.BuildMux()
	if err != nil {
		t.Fatal(err)
	}
	for _, auth := range []string{"", token} {
		for _, path := range []string{"/api/cwk/ask", "/api/cwk/ask/questions", "/api/cwk/ask/questions/read", "/api/cwk/ask/questions/aaaaaaaaaaaaaaa", "/api/cwk/tools", "/api/cwk/tools/capabilities", "/api/cwk/tools/jobs", "/api/cwk/tools/jobs/example/result"} {
			for _, method := range []string{http.MethodGet, http.MethodHead, http.MethodPost, http.MethodPut, http.MethodPatch, http.MethodDelete, http.MethodOptions} {
				req := httptest.NewRequest(method, path, nil)
				if auth != "" {
					req.Header.Set("Authorization", auth)
				}
				rr := httptest.NewRecorder()
				mux.ServeHTTP(rr, req)
				if rr.Code != http.StatusGone {
					t.Fatalf("%s %s: got%d want410: %s", method, path, rr.Code, rr.Body.String())
				}
			}
		}
	}
}

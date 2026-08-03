package main

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
	"time"
	"unicode/utf8"

	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/filesystem"
	"github.com/tus/tusd/v2/pkg/filelocker"
	"github.com/tus/tusd/v2/pkg/filestore"
	tusd "github.com/tus/tusd/v2/pkg/handler"
)

const (
	resumableUploadBasePath = "/api/cwk/tus/files/"
	mediaUploadMaxBytes     = int64(2147483648)
	resumableParallelParts  = 3
	staleUploadMaxAge       = 7 * 24 * time.Hour
)

var resumableUploadIDPattern = regexp.MustCompile(`^[A-Za-z0-9._+~-]{10,512}$`)

type resumableUploadService struct {
	app       core.App
	uploadDir string
	store     filestore.FileStore
	handler   *tusd.Handler
	finalize  sync.Mutex
}

func newResumableUploadService(app core.App, uploadDir string) (*resumableUploadService, error) {
	if err := os.MkdirAll(uploadDir, 0750); err != nil {
		return nil, fmt.Errorf("create tus upload directory: %w", err)
	}

	store := filestore.New(uploadDir)
	store.DirModePerm = 0750
	store.FileModePerm = 0640
	locker := filelocker.New(uploadDir)
	composer := tusd.NewStoreComposer()
	store.UseIn(composer)
	locker.UseIn(composer)

	handler, err := tusd.NewHandler(tusd.Config{
		BasePath:                resumableUploadBasePath,
		StoreComposer:           composer,
		MaxSize:                 mediaUploadMaxBytes,
		DisableDownload:         true,
		DisableConcatenation:    false,
		RespectForwardedHeaders: true,
	})
	if err != nil {
		return nil, fmt.Errorf("create tus handler: %w", err)
	}

	return &resumableUploadService{
		app:       app,
		uploadDir: uploadDir,
		store:     store,
		handler:   handler,
	}, nil
}

func (service *resumableUploadService) registerRoutes(e *core.ServeEvent) {
	strippedHandler := http.StripPrefix(strings.TrimSuffix(resumableUploadBasePath, "/"), service.handler)
	tusAction := apis.WrapStdHandler(strippedHandler)
	bindTusRoute := func(method string, path string) {
		e.Router.Route(method, path, tusAction).
			Unbind(apis.DefaultBodyLimitMiddlewareId).
			Bind(apis.BodyLimit(mediaUploadMaxBytes)).
			BindFunc(requireOwnerForTus)
	}

	rootPath := strings.TrimSuffix(resumableUploadBasePath, "/")
	resourcePath := resumableUploadBasePath + "{path...}"
	for _, method := range []string{
		http.MethodOptions,
		http.MethodPost,
		http.MethodPatch,
		http.MethodHead,
		http.MethodDelete,
	} {
		bindTusRoute(method, rootPath)
		bindTusRoute(method, resourcePath)
	}

	e.Router.GET("/api/cwk/tus/status", func(event *core.RequestEvent) error {
		return event.JSON(http.StatusOK, map[string]any{
			"available":        true,
			"protocol":         "tus-1.0.0",
			"max_size":         mediaUploadMaxBytes,
			"parallel_uploads": resumableParallelParts,
		})
	}).Bind(apis.RequireAuth("users", core.CollectionNameSuperusers))

	e.Router.POST("/api/cwk/tus/finalize", service.finalizeUpload).
		Bind(apis.RequireAuth("users", core.CollectionNameSuperusers))
}

func requireOwnerForTus(e *core.RequestEvent) error {
	if e.Request.Method == http.MethodOptions {
		return e.Next()
	}
	if e.Auth == nil {
		return e.UnauthorizedError("A valid owner token is required for resumable uploads.", nil)
	}
	collectionName := e.Auth.Collection().Name
	if collectionName != "users" && collectionName != core.CollectionNameSuperusers {
		return e.ForbiddenError("This account cannot upload site media.", nil)
	}
	return e.Next()
}

func (service *resumableUploadService) finalizeUpload(e *core.RequestEvent) error {
	request := struct {
		UploadID string `json:"upload_id" form:"upload_id"`
	}{}
	if err := e.BindBody(&request); err != nil {
		return e.BadRequestError("Invalid resumable upload request.", err)
	}
	uploadID := strings.TrimSpace(request.UploadID)
	if !isSafeResumableUploadID(uploadID) {
		return e.BadRequestError("Invalid resumable upload id.", nil)
	}

	service.finalize.Lock()
	defer service.finalize.Unlock()

	if existing := service.findImportedMedia(uploadID); existing != nil {
		service.cleanupImportedUpload(e.Request.Context(), uploadID)
		return e.JSON(http.StatusOK, existing)
	}

	upload, err := service.store.GetUpload(e.Request.Context(), uploadID)
	if err != nil {
		if errors.Is(err, tusd.ErrNotFound) {
			return e.NotFoundError("The resumable upload was not found.", nil)
		}
		return e.InternalServerError("Failed to read the resumable upload.", err)
	}
	info, err := upload.GetInfo(e.Request.Context())
	if err != nil {
		return e.InternalServerError("Failed to read resumable upload metadata.", err)
	}
	if info.Size <= 0 || info.Offset != info.Size {
		return e.BadRequestError("The resumable upload is not complete yet.", nil)
	}
	if info.Size > mediaUploadMaxBytes {
		return e.BadRequestError("The uploaded file exceeds the 2GB limit.", nil)
	}
	ownerID := strings.TrimSpace(info.MetaData["owner_id"])
	if !e.HasSuperuserAuth() && (ownerID == "" || ownerID != e.Auth.Id) {
		return e.ForbiddenError("This resumable upload belongs to another account.", nil)
	}

	storagePath, err := service.validatedStoragePath(info)
	if err != nil {
		return e.InternalServerError("The uploaded file path is invalid.", err)
	}
	record, err := service.importMediaFile(uploadID, storagePath, info.MetaData)
	if err != nil {
		if existing := service.findImportedMedia(uploadID); existing != nil {
			_ = terminateTusUpload(e.Request.Context(), service.store, upload)
			return e.JSON(http.StatusOK, existing)
		}
		return e.InternalServerError("Failed to register the completed upload as media.", err)
	}

	if err := terminateTusUploadFamily(e.Request.Context(), service.store, upload, info); err != nil {
		service.app.Logger().Warn("Failed to remove finalized tus staging files", "uploadId", uploadID, "error", err.Error())
	}
	return e.JSON(http.StatusOK, record)
}

func (service *resumableUploadService) cleanupImportedUpload(ctx context.Context, uploadID string) {
	upload, err := service.store.GetUpload(ctx, uploadID)
	if err != nil {
		return
	}
	info, err := upload.GetInfo(ctx)
	if err != nil {
		return
	}
	if err := terminateTusUploadFamily(ctx, service.store, upload, info); err != nil {
		service.app.Logger().Warn("Failed to remove imported tus staging files", "uploadId", uploadID, "error", err.Error())
	}
}

func (service *resumableUploadService) findImportedMedia(uploadID string) *core.Record {
	record, err := service.app.FindFirstRecordByData("media", "resumable_upload_id", uploadID)
	if err != nil {
		return nil
	}
	return record
}

func (service *resumableUploadService) importMediaFile(uploadID string, storagePath string, metadata tusd.MetaData) (*core.Record, error) {
	collection, err := service.app.FindCollectionByNameOrId("media")
	if err != nil {
		return nil, err
	}

	importDir, err := os.MkdirTemp(service.uploadDir, ".cwk-import-")
	if err != nil {
		return nil, err
	}
	defer os.RemoveAll(importDir)

	originalName := safeOriginalFilename(metadata["filename"], metadata["filetype"], uploadID)
	importPath := filepath.Join(importDir, originalName)
	if err := os.Link(storagePath, importPath); err != nil {
		return nil, fmt.Errorf("create import hard link: %w", err)
	}
	file, err := filesystem.NewFileFromPath(importPath)
	if err != nil {
		return nil, err
	}

	record := core.NewRecord(collection)
	record.Set("file", file)
	record.Set("alt_text", truncateUTF8(strings.TrimSpace(metadata["alt_text"]), 200))
	record.Set("caption", truncateUTF8(strings.TrimSpace(metadata["caption"]), 500))
	record.Set("resumable_upload_id", uploadID)
	if isVideoMetadata(metadata) {
		record.Set("video_status", "pending")
		record.Set("video_attempts", 0)
	}
	if err := service.app.Save(record); err != nil {
		return nil, err
	}
	return record, nil
}

func (service *resumableUploadService) validatedStoragePath(info tusd.FileInfo) (string, error) {
	storagePath := filepath.Clean(info.Storage[filestore.StorageKeyPath])
	if storagePath == "." || storagePath == "" {
		return "", errors.New("missing filestore path")
	}
	relative, err := filepath.Rel(service.uploadDir, storagePath)
	if err != nil || relative == ".." || strings.HasPrefix(relative, ".."+string(os.PathSeparator)) {
		return "", errors.New("filestore path escapes upload directory")
	}
	return storagePath, nil
}

func (service *resumableUploadService) cleanupStaleUploads(now time.Time) error {
	entries, err := os.ReadDir(service.uploadDir)
	if err != nil {
		return err
	}
	cutoff := now.Add(-staleUploadMaxAge)
	for _, entry := range entries {
		info, err := entry.Info()
		if err != nil || info.ModTime().After(cutoff) {
			continue
		}
		if err := os.RemoveAll(filepath.Join(service.uploadDir, entry.Name())); err != nil {
			service.app.Logger().Warn("Failed to remove stale tus upload", "name", entry.Name(), "error", err.Error())
		}
	}
	return nil
}

func terminateTusUpload(ctx context.Context, store filestore.FileStore, upload tusd.Upload) error {
	terminatable := store.AsTerminatableUpload(upload)
	if terminatable == nil {
		return errors.New("tus upload cannot be terminated")
	}
	return terminatable.Terminate(ctx)
}

func terminateTusUploadFamily(ctx context.Context, store filestore.FileStore, upload tusd.Upload, info tusd.FileInfo) error {
	var cleanupErrors []error
	if err := terminateTusUpload(ctx, store, upload); err != nil {
		cleanupErrors = append(cleanupErrors, err)
	}
	for _, partialUploadID := range info.PartialUploads {
		if !isSafeResumableUploadID(partialUploadID) {
			cleanupErrors = append(cleanupErrors, fmt.Errorf("invalid partial tus upload id: %q", partialUploadID))
			continue
		}
		partialUpload, err := store.GetUpload(ctx, partialUploadID)
		if errors.Is(err, tusd.ErrNotFound) {
			continue
		}
		if err != nil {
			cleanupErrors = append(cleanupErrors, err)
			continue
		}
		if err := terminateTusUpload(ctx, store, partialUpload); err != nil {
			cleanupErrors = append(cleanupErrors, err)
		}
	}
	return errors.Join(cleanupErrors...)
}

func isSafeResumableUploadID(value string) bool {
	return resumableUploadIDPattern.MatchString(value) && !strings.Contains(value, "..")
}

func safeOriginalFilename(value string, contentType string, uploadID string) string {
	name := filepath.Base(strings.TrimSpace(value))
	name = strings.Map(func(r rune) rune {
		if r < 32 || r == '/' || r == '\\' || r == ':' {
			return '_'
		}
		return r
	}, name)
	if name == "" || name == "." || name == ".." {
		name = "upload-" + uploadID
	}
	if filepath.Ext(name) == "" {
		name += extensionForContentType(contentType)
	}
	return truncateUTF8(name, 180)
}

func extensionForContentType(contentType string) string {
	switch strings.ToLower(strings.TrimSpace(contentType)) {
	case "video/mp4":
		return ".mp4"
	case "video/webm":
		return ".webm"
	case "video/quicktime":
		return ".mov"
	case "video/x-m4v":
		return ".m4v"
	default:
		return ".bin"
	}
}

func isVideoMetadata(metadata tusd.MetaData) bool {
	contentType := strings.ToLower(metadata["filetype"])
	name := strings.ToLower(metadata["filename"])
	return strings.HasPrefix(contentType, "video/") || strings.HasSuffix(name, ".mp4") || strings.HasSuffix(name, ".mov") || strings.HasSuffix(name, ".m4v") || strings.HasSuffix(name, ".webm")
}

func truncateUTF8(value string, maxRunes int) string {
	if utf8.RuneCountInString(value) <= maxRunes {
		return value
	}
	runes := []rune(value)
	return string(runes[:maxRunes])
}

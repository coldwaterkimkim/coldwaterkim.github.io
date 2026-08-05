package main

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/tus/tusd/v2/pkg/filestore"
	tusd "github.com/tus/tusd/v2/pkg/handler"
)

func TestResumableUploadIDValidation(t *testing.T) {
	if !isSafeResumableUploadID("eb98b4199771498972ada7f928e8c415") {
		t.Fatal("expected tus id to be accepted")
	}
	for _, value := range []string{"short", "../escape-id", "bad/id-value", strings.Repeat("a", 513)} {
		if isSafeResumableUploadID(value) {
			t.Fatalf("unsafe upload id accepted: %q", value)
		}
	}
}

func TestSafeOriginalFilename(t *testing.T) {
	if got := safeOriginalFilename("../../day-review.mov", "video/quicktime", "upload12345"); got != "day-review.mov" {
		t.Fatalf("unexpected sanitized filename: %q", got)
	}
	if got := safeOriginalFilename("", "video/mp4", "upload12345"); got != "upload-upload12345.mp4" {
		t.Fatalf("unexpected fallback filename: %q", got)
	}
	if got := safeOriginalFilename("folder\\clip:name", "video/webm", "upload12345"); got != "folder_clip_name.webm" {
		t.Fatalf("unexpected separator sanitization: %q", got)
	}
}

func TestValidatedStoragePath(t *testing.T) {
	uploadDir := t.TempDir()
	service := &resumableUploadService{uploadDir: uploadDir}
	inside := filepath.Join(uploadDir, "upload12345")

	path, err := service.validatedStoragePath(tusd.FileInfo{
		Storage: map[string]string{filestore.StorageKeyPath: inside},
	})
	if err != nil || path != inside {
		t.Fatalf("valid filestore path rejected: path=%q err=%v", path, err)
	}

	outside := filepath.Join(filepath.Dir(uploadDir), "escape")
	if _, err := service.validatedStoragePath(tusd.FileInfo{
		Storage: map[string]string{filestore.StorageKeyPath: outside},
	}); err == nil {
		t.Fatal("filestore path outside the tus directory must be rejected")
	}
}

func TestResumableUploadSupportsConcatenation(t *testing.T) {
	service, err := newResumableUploadService(nil, t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	request := httptest.NewRequest(http.MethodOptions, resumableUploadBasePath, nil)
	response := httptest.NewRecorder()
	service.handler.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("unexpected OPTIONS status: %d", response.Code)
	}
	if extensions := response.Header().Get("Tus-Extension"); !strings.Contains(extensions, "concatenation") {
		t.Fatalf("tus concatenation extension is missing: %q", extensions)
	}
}

func TestTerminateTusUploadFamilyRemovesParallelParts(t *testing.T) {
	ctx := context.Background()
	store := filestore.New(t.TempDir())
	partialUploads := make([]tusd.Upload, 0, 3)
	partialUploadIDs := make([]string, 0, 3)
	for range 3 {
		upload, err := store.NewUpload(ctx, tusd.FileInfo{Size: 3})
		if err != nil {
			t.Fatal(err)
		}
		if _, err := upload.WriteChunk(ctx, 0, strings.NewReader("abc")); err != nil {
			t.Fatal(err)
		}
		info, err := upload.GetInfo(ctx)
		if err != nil {
			t.Fatal(err)
		}
		partialUploads = append(partialUploads, upload)
		partialUploadIDs = append(partialUploadIDs, info.ID)
	}

	finalUpload, err := store.NewUpload(ctx, tusd.FileInfo{
		Size:           9,
		IsFinal:        true,
		PartialUploads: partialUploadIDs,
	})
	if err != nil {
		t.Fatal(err)
	}
	if err := store.AsConcatableUpload(finalUpload).ConcatUploads(ctx, partialUploads); err != nil {
		t.Fatal(err)
	}
	finalInfo, err := finalUpload.GetInfo(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if err := terminateTusUploadFamily(ctx, store, finalUpload, finalInfo); err != nil {
		t.Fatal(err)
	}

	for _, uploadID := range append(partialUploadIDs, finalInfo.ID) {
		if _, err := store.GetUpload(ctx, uploadID); !errors.Is(err, tusd.ErrNotFound) {
			t.Fatalf("parallel tus staging file was not removed: id=%q err=%v", uploadID, err)
		}
	}
}

func TestTerminateTusPartialUploadsKeepsCompletedFinal(t *testing.T) {
	ctx := context.Background()
	store := filestore.New(t.TempDir())
	partialUploads := make([]tusd.Upload, 0, 3)
	partialUploadIDs := make([]string, 0, 3)
	for _, chunk := range []string{"abc", "def", "ghi"} {
		upload, err := store.NewUpload(ctx, tusd.FileInfo{Size: 3})
		if err != nil {
			t.Fatal(err)
		}
		if _, err := upload.WriteChunk(ctx, 0, strings.NewReader(chunk)); err != nil {
			t.Fatal(err)
		}
		info, err := upload.GetInfo(ctx)
		if err != nil {
			t.Fatal(err)
		}
		partialUploads = append(partialUploads, upload)
		partialUploadIDs = append(partialUploadIDs, info.ID)
	}

	finalUpload, err := store.NewUpload(ctx, tusd.FileInfo{Size: 9, IsFinal: true, PartialUploads: partialUploadIDs})
	if err != nil {
		t.Fatal(err)
	}
	if err := store.AsConcatableUpload(finalUpload).ConcatUploads(ctx, partialUploads); err != nil {
		t.Fatal(err)
	}
	finalInfo, err := finalUpload.GetInfo(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if err := terminateTusPartialUploads(ctx, store, finalInfo); err != nil {
		t.Fatal(err)
	}
	if _, err := store.GetUpload(ctx, finalInfo.ID); err != nil {
		t.Fatalf("completed final upload was removed with its partials: %v", err)
	}
	for _, uploadID := range partialUploadIDs {
		if _, err := store.GetUpload(ctx, uploadID); !errors.Is(err, tusd.ErrNotFound) {
			t.Fatalf("partial upload was not released before import: id=%q err=%v", uploadID, err)
		}
	}
}

func TestAvailableDiskBytes(t *testing.T) {
	available, err := availableDiskBytes(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	if available <= minimumFreeDiskBytes {
		t.Fatalf("test volume unexpectedly lacks the safety reserve: %d", available)
	}
}

func TestCleanupStaleUploads(t *testing.T) {
	uploadDir := t.TempDir()
	service := &resumableUploadService{uploadDir: uploadDir}
	now := time.Now()
	stalePath := filepath.Join(uploadDir, "stale-upload")
	freshPath := filepath.Join(uploadDir, "fresh-upload")
	if err := os.WriteFile(stalePath, []byte("stale"), 0600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(freshPath, []byte("fresh"), 0600); err != nil {
		t.Fatal(err)
	}
	if err := os.Chtimes(stalePath, now.Add(-staleUploadMaxAge-time.Hour), now.Add(-staleUploadMaxAge-time.Hour)); err != nil {
		t.Fatal(err)
	}

	if err := service.cleanupStaleUploads(now); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(stalePath); !os.IsNotExist(err) {
		t.Fatalf("stale upload was not removed: %v", err)
	}
	if _, err := os.Stat(freshPath); err != nil {
		t.Fatalf("fresh upload was removed: %v", err)
	}
}

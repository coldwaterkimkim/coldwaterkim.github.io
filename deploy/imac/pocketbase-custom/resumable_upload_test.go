package main

import (
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

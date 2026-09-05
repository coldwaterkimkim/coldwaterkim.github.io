package main

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"sync"
	"testing"

	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tests"
)

func TestRecordsV2Validation(t *testing.T) {
	valid := func() recordsV2Document {
		return recordsV2Document{Category: "posts", Status: "draft", RecordDate: "2026-09-05", Attachments: []recordsV2Attachment{{ID: "occurrence-1", URL: "https://example.com/photo.jpg", Kind: "image"}}}
	}
	for _, tc := range []struct {
		name string
		edit func(*recordsV2Document)
	}{
		{"schema", func(d *recordsV2Document) { d.SchemaVersion = 99 }},
		{"oversized source title", func(d *recordsV2Document) {
			d.LegacySource = &recordsV2Source{Collection: "posts", ID: "aaaaaaaaaaaaaaa", URL: "https://example.com/old", Title: strings.Repeat("a", 4097)}
		}},
		{"oversized source slug", func(d *recordsV2Document) {
			d.LegacySource = &recordsV2Source{Collection: "posts", ID: "aaaaaaaaaaaaaaa", URL: "https://example.com/old", Slug: strings.Repeat("a", 2049)}
		}},
		{"category", func(d *recordsV2Document) { d.Category = "unknown" }},
		{"date", func(d *recordsV2Document) { d.RecordDate = "2026-02-30" }},
		{"unsafe URL", func(d *recordsV2Document) { d.Attachments[0].URL = "javascript:alert(1)" }},
		{"unsafe playback URL", func(d *recordsV2Document) { d.Attachments[0].PlaybackURL = "javascript:alert(1)" }},
		{"unsafe poster URL", func(d *recordsV2Document) { d.Attachments[0].PosterURL = "data:image/svg+xml,unsafe" }},
		{"unknown kind", func(d *recordsV2Document) { d.Attachments[0].Kind = "iframe" }},
		{"duplicate occurrence", func(d *recordsV2Document) { d.Attachments = append(d.Attachments, d.Attachments[0]) }},
		{"unsupported embed", func(d *recordsV2Document) {
			d.Embeds = []recordsV2Embed{{ID: "embed-1", Type: "youtube", URL: "https://evil.example/watch?v=x"}}
		}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			d := valid()
			tc.edit(&d)
			if validateRecordsV2(&d) == nil {
				t.Fatal("accepted invalid document")
			}
		})
	}
	d := valid()
	if err := validateRecordsV2(&d); err != nil {
		t.Fatal(err)
	}
	if d.SchemaVersion != 1 || d.Embeds == nil {
		t.Fatal("document defaults not normalized")
	}
}

func TestRecordsV2LifecycleAndReferences(t *testing.T) {
	app, err := tests.NewTestApp()
	if err != nil {
		t.Fatal(err)
	}
	defer app.Cleanup()
	if err = ensureRecordsV2(app); err != nil {
		t.Fatal(err)
	}
	if err = ensureRecordsV2(app); err != nil {
		t.Fatal("schema is not idempotent:", err)
	}
	media := core.NewBaseCollection("media")
	if err = app.Save(media); err != nil {
		t.Fatal(err)
	}
	file := core.NewRecord(media)
	if err = app.Save(file); err != nil {
		t.Fatal(err)
	}
	users, err := app.FindCollectionByNameOrId("users")
	if err != nil {
		t.Fatal(err)
	}
	owner, token := createFileToolAuthRecord(t, app, users, "aaaaaaaaaaaaaaa", "v2owner@example.com")
	_, otherToken := createFileToolAuthRecord(t, app, users, "bbbbbbbbbbbbbbb", "v2other@example.com")
	router, err := apis.NewRouter(app)
	if err != nil {
		t.Fatal(err)
	}
	s := recordsV2Service{app: app, ownerUserID: owner.Id}
	s.registerRoutes(&core.ServeEvent{App: app, Router: router})
	mux, err := router.BuildMux()
	if err != nil {
		t.Fatal(err)
	}
	request := func(method, path, auth string, d any, want int) *httptest.ResponseRecorder {
		t.Helper()
		body, _ := json.Marshal(d)
		req := httptest.NewRequest(method, path, bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		if auth != "" {
			req.Header.Set("Authorization", auth)
		}
		rr := httptest.NewRecorder()
		mux.ServeHTTP(rr, req)
		if rr.Code != want {
			t.Fatalf("%s %s: got %d want %d: %s", method, path, rr.Code, want, rr.Body.String())
		}
		return rr
	}
	path := "/api/cwk/records-v2"
	d := recordsV2Document{Category: "daily", Status: "draft", RecordDate: "2026-09-05", Body: "원본 기록", Attachments: []recordsV2Attachment{{ID: "photo-1", MediaID: file.Id, URL: "https://example.com/a.jpg", Kind: "image", Comment: "사진별 코멘트", PlaybackURL: "https://example.com/playback.mp4", PosterURL: "https://example.com/poster.jpg"}}}
	request("POST", path, "", d, http.StatusUnauthorized)
	request("POST", path, otherToken, d, http.StatusForbidden)
	rr := request("POST", path, token, d, http.StatusCreated)
	if err = json.Unmarshal(rr.Body.Bytes(), &d); err != nil {
		t.Fatal(err)
	}
	if len(d.Attachments) != 1 || d.Attachments[0].PlaybackURL != "https://example.com/playback.mp4" || d.Attachments[0].PosterURL != "https://example.com/poster.jpg" {
		t.Fatal("playback/poster URL lost in response")
	}
	if d.ID == "" || d.Revision != 1 || d.FirstPublishedAt != "" {
		t.Fatalf("unexpected draft: %+v", d)
	}
	refs, err := app.CountRecords("records_v2_media")
	if err != nil || refs != 1 {
		t.Fatalf("references: %d %v", refs, err)
	}
	if err = app.Delete(file); err == nil {
		t.Fatal("referenced media deletion was allowed")
	}
	recordPath := path + "/" + d.ID
	request("GET", recordPath, "", nil, http.StatusNotFound)
	request("GET", recordPath, otherToken, nil, http.StatusNotFound)
	request("GET", recordPath, token, nil, http.StatusOK)
	rr = request("GET", path, "", nil, http.StatusOK)
	var listing struct {
		Items []recordsV2Document `json:"items"`
	}
	json.Unmarshal(rr.Body.Bytes(), &listing)
	if len(listing.Items) != 0 {
		t.Fatal("public draft leaked")
	}
	request("GET", path+"?status=draft", "", nil, http.StatusForbidden)
	stale := d
	d.Status = "published"
	d.FirstPublishedAt = "2000-01-01 00:00:00.000Z"
	rr = request("PUT", recordPath, token, d, http.StatusOK)
	json.Unmarshal(rr.Body.Bytes(), &d)
	if d.FirstPublishedAt == "" || d.FirstPublishedAt == "2000-01-01 00:00:00.000Z" || d.Revision != 2 {
		t.Fatalf("publication invariants failed: %+v", d)
	}
	first := d.FirstPublishedAt
	request("PUT", recordPath, token, stale, http.StatusConflict)
	request("GET", recordPath, "", nil, http.StatusOK)
	// Bad media rolls back both document revision and reference replacement.
	bad := d
	bad.Attachments = []recordsV2Attachment{{ID: "bad", MediaID: "zzzzzzzzzzzzzzz", URL: "https://example.com/missing.jpg", Kind: "image"}}
	request("PUT", recordPath, token, bad, http.StatusBadRequest)
	refs, _ = app.CountRecords("records_v2_media")
	if refs != 1 {
		t.Fatal("failed write lost references")
	}
	d.Status = "draft"
	d.Attachments = nil
	rr = request("PUT", recordPath, token, d, http.StatusOK)
	json.Unmarshal(rr.Body.Bytes(), &d)
	if d.FirstPublishedAt != first || d.Revision != 3 {
		t.Fatal("first publication was changed")
	}
	refs, _ = app.CountRecords("records_v2_media")
	if refs != 0 {
		t.Fatal("removed occurrence retains reference")
	}
	if _, err = app.FindRecordById("media", file.Id); err != nil {
		t.Fatal("attachment removal deleted media")
	}
	d.Status = "published"
	rr = request("PUT", recordPath, token, d, http.StatusOK)
	json.Unmarshal(rr.Body.Bytes(), &d)
	if d.FirstPublishedAt != first {
		t.Fatal("republish reset timestamp")
	}
	request("GET", path+"?category=posts", "", nil, http.StatusOK)
	// Two editors saving the same revision produce exactly one success.
	codes := make(chan int, 2)
	var wg sync.WaitGroup
	for i := 0; i < 2; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			body, _ := json.Marshal(d)
			req := httptest.NewRequest("PUT", recordPath, bytes.NewReader(body))
			req.Header.Set("Content-Type", "application/json")
			req.Header.Set("Authorization", token)
			res := httptest.NewRecorder()
			mux.ServeHTTP(res, req)
			codes <- res.Code
		}()
	}
	wg.Wait()
	close(codes)
	successes, conflicts := 0, 0
	for code := range codes {
		if code == 200 {
			successes++
		}
		if code == 409 {
			conflicts++
		}
	}
	if successes != 1 || conflicts != 1 {
		t.Fatalf("concurrent saves success=%d conflict=%d", successes, conflicts)
	}
	request("DELETE", recordPath+"?revision="+strconv.Itoa(d.Revision), token, nil, http.StatusConflict)
	request("DELETE", recordPath+"?revision="+strconv.Itoa(d.Revision+1), token, nil, http.StatusNoContent)
	if _, err = app.FindRecordById("media", file.Id); err != nil {
		t.Fatal("record deletion removed media")
	}
	// Legacy import reads publication evidence from a real source, ignoring client timestamps.
	posts := core.NewBaseCollection("posts")
	posts.Fields.Add(&core.TextField{Name: "status"}, &core.DateField{Name: "first_published_at"})
	if err = app.Save(posts); err != nil {
		t.Fatal(err)
	}
	legacy := core.NewRecord(posts)
	legacy.Set("status", "published")
	legacy.Set("first_published_at", "2025-01-02 03:04:05.000Z")
	if err = app.Save(legacy); err != nil {
		t.Fatal(err)
	}
	imported := recordsV2Document{Category: "posts", Status: "published", RecordDate: "2025-01-02", LegacySource: &recordsV2Source{Collection: "posts", ID: legacy.Id, URL: "https://example.com/posts/old", Title: "예전 글의 제목", Slug: "예전-글"}, FirstPublishedAt: "2099-01-01 00:00:00.000Z", LegacyHTML: `<p>before</p><img src="https://example.com/api/files/media/` + file.Id + `/photo.jpg"><p>after</p>`}
	rr = request("POST", path, token, imported, http.StatusCreated)
	json.Unmarshal(rr.Body.Bytes(), &imported)
	if imported.FirstPublishedAt != "2025-01-02 03:04:05.000Z" {
		t.Fatal("legacy publication evidence not preserved")
	}
	rr = request("GET", path+"/"+imported.ID, "", nil, http.StatusOK)
	var loaded recordsV2Document
	if err = json.Unmarshal(rr.Body.Bytes(), &loaded); err != nil {
		t.Fatal(err)
	}
	if loaded.LegacySource == nil || loaded.LegacySource.Title != "예전 글의 제목" || loaded.LegacySource.Slug != "예전-글" {
		t.Fatalf("source metadata lost in roundtrip: %+v", loaded.LegacySource)
	}
	refs, _ = app.CountRecords("records_v2_media")
	if refs != 1 {
		t.Fatalf("legacy HTML refs=%d", refs)
	}
	if err = app.Delete(file); err == nil {
		t.Fatal("legacy HTML referenced media deletion was allowed")
	}
	imported.Revision = 0
	request("POST", path, token, imported, http.StatusBadRequest)
	// Generic PocketBase APIs remain locked; custom OWNER route is the only writer.
	request("GET", "/api/collections/records_v2/records", "", nil, http.StatusForbidden)
}

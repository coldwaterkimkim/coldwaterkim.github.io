package main

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tests"
	"github.com/pocketbase/pocketbase/tools/types"
)

func TestNormalizeAlbumTagNameAndMediaKeys(t *testing.T) {
	if got, want := normalizeAlbumTagName("  굿모닝   앤 스마일  "), "굿모닝 앤 스마일"; got != want {
		t.Fatalf("name=%q want=%q", got, want)
	}
	keys, err := normalizeAlbumMediaKeys([]string{
		"media:aaaaaaaaaaaaaaa",
		"media:aaaaaaaaaaaaaaa",
		"nasajab:bbbbbbbbbbbbbbb",
	})
	if err != nil || len(keys) != 2 {
		t.Fatalf("keys=%v err=%v", keys, err)
	}
	if _, err := normalizeAlbumMediaKeys([]string{"other:aaaaaaaaaaaaaaa"}); err == nil {
		t.Fatal("invalid media collection was accepted")
	}
}

func TestAlbumTagOwnerWorkflow(t *testing.T) {
	app, err := tests.NewTestApp()
	if err != nil {
		t.Fatal(err)
	}
	defer app.Cleanup()
	setupAlbumTagTestCollections(t, app)

	router, err := apis.NewRouter(app)
	if err != nil {
		t.Fatal(err)
	}
	service := newAlbumTagService(app)
	service.registerRoutes(&core.ServeEvent{App: app, Router: router})
	mux, err := router.BuildMux()
	if err != nil {
		t.Fatal(err)
	}

	unauthorized := albumTagTestRequest(t, mux, http.MethodPost, albumTagsPath, map[string]any{"name": "여행"}, "")
	if unauthorized.Code != http.StatusUnauthorized {
		t.Fatalf("unauthorized status=%d body=%s", unauthorized.Code, unauthorized.Body.String())
	}

	ownerToken := createAlbumTagOwnerToken(t, app)
	created := albumTagTestRequest(t, mux, http.MethodPost, albumTagsPath, map[string]any{"name": " 여행 "}, ownerToken)
	if created.Code != http.StatusCreated {
		t.Fatalf("create status=%d body=%s", created.Code, created.Body.String())
	}
	createdTag := struct {
		ID   string `json:"id"`
		Name string `json:"name"`
	}{}
	if err := json.Unmarshal(created.Body.Bytes(), &createdTag); err != nil {
		t.Fatal(err)
	}
	if !isPocketBaseRecordID(createdTag.ID) || createdTag.Name != "여행" {
		t.Fatalf("unexpected created tag: %+v", createdTag)
	}

	duplicate := albumTagTestRequest(t, mux, http.MethodPost, albumTagsPath, map[string]any{"name": "여행"}, ownerToken)
	if duplicate.Code != http.StatusBadRequest {
		t.Fatalf("duplicate status=%d body=%s", duplicate.Code, duplicate.Body.String())
	}

	renamed := albumTagTestRequest(t, mux, http.MethodPatch, albumTagsPath+"/"+createdTag.ID, map[string]any{"name": "긴 여행"}, ownerToken)
	if renamed.Code != http.StatusOK || !strings.Contains(renamed.Body.String(), "긴 여행") {
		t.Fatalf("rename status=%d body=%s", renamed.Code, renamed.Body.String())
	}

	mediaKeys := []string{"media:aaaaaaaaaaaaaaa", "nasajab:bbbbbbbbbbbbbbb"}
	added := albumTagTestRequest(t, mux, http.MethodPost, albumTagBatchPath, map[string]any{
		"media_keys": mediaKeys,
		"tag_id":     createdTag.ID,
		"action":     "add",
	}, ownerToken)
	if added.Code != http.StatusOK || !strings.Contains(added.Body.String(), `"changed":2`) {
		t.Fatalf("add status=%d body=%s", added.Code, added.Body.String())
	}
	repeated := albumTagTestRequest(t, mux, http.MethodPost, albumTagBatchPath, map[string]any{
		"media_keys": mediaKeys,
		"tag_id":     createdTag.ID,
		"action":     "add",
	}, ownerToken)
	if repeated.Code != http.StatusOK || !strings.Contains(repeated.Body.String(), `"changed":0`) {
		t.Fatalf("idempotent add status=%d body=%s", repeated.Code, repeated.Body.String())
	}

	removed := albumTagTestRequest(t, mux, http.MethodPost, albumTagBatchPath, map[string]any{
		"media_keys": mediaKeys[:1],
		"tag_id":     createdTag.ID,
		"action":     "remove",
	}, ownerToken)
	if removed.Code != http.StatusOK || !strings.Contains(removed.Body.String(), `"changed":1`) {
		t.Fatalf("remove status=%d body=%s", removed.Code, removed.Body.String())
	}
	assignments, err := app.FindRecordsByFilter("album_media_tags", "", "", 0, 0)
	if err != nil || len(assignments) != 1 {
		t.Fatalf("assignments=%d err=%v", len(assignments), err)
	}

	deleted := albumTagTestRequest(t, mux, http.MethodDelete, albumTagsPath+"/"+createdTag.ID, nil, ownerToken)
	if deleted.Code != http.StatusOK || !strings.Contains(deleted.Body.String(), `"removed_assignments":1`) {
		t.Fatalf("delete status=%d body=%s", deleted.Code, deleted.Body.String())
	}
	if _, err := app.FindRecordById("album_tags", createdTag.ID); err == nil {
		t.Fatal("deleted tag remains")
	}
	assignments, err = app.FindRecordsByFilter("album_media_tags", "", "", 0, 0)
	if err != nil || len(assignments) != 0 {
		t.Fatalf("assignments after delete=%d err=%v", len(assignments), err)
	}
}

func albumTagTestRequest(t *testing.T, mux http.Handler, method, path string, body any, authToken string) *httptest.ResponseRecorder {
	t.Helper()
	var reader io.Reader
	if body != nil {
		raw, err := json.Marshal(body)
		if err != nil {
			t.Fatal(err)
		}
		reader = bytes.NewReader(raw)
	}
	request := httptest.NewRequest(method, path, reader)
	request.Header.Set("Content-Type", "application/json")
	if authToken != "" {
		request.Header.Set("Authorization", authToken)
	}
	response := httptest.NewRecorder()
	mux.ServeHTTP(response, request)
	return response
}

func setupAlbumTagTestCollections(t *testing.T, app core.App) {
	t.Helper()
	tags := core.NewBaseCollection("album_tags")
	tags.ListRule = types.Pointer("")
	tags.ViewRule = types.Pointer("")
	tags.Fields.Add(
		&core.TextField{Name: "name", Required: true, Min: 1, Max: 30},
		&core.NumberField{Name: "position", Required: true, Min: types.Pointer(1.0), OnlyInt: true},
		&core.AutodateField{Name: "created", OnCreate: true},
		&core.AutodateField{Name: "updated", OnCreate: true, OnUpdate: true},
	)
	if err := app.Save(tags); err != nil {
		t.Fatal(err)
	}

	mediaTags := core.NewBaseCollection("album_media_tags")
	mediaTags.Fields.Add(
		&core.TextField{Name: "media_key", Required: true, Min: 17, Max: 40},
		&core.TextField{Name: "tag_id", Required: true, Min: 15, Max: 15},
		&core.AutodateField{Name: "created", OnCreate: true},
		&core.AutodateField{Name: "updated", OnCreate: true, OnUpdate: true},
	)
	if err := app.Save(mediaTags); err != nil {
		t.Fatal(err)
	}

	for _, item := range []struct{ collection, id string }{
		{"media", "aaaaaaaaaaaaaaa"},
		{"nasajab", "bbbbbbbbbbbbbbb"},
	} {
		collection := core.NewBaseCollection(item.collection)
		if err := app.Save(collection); err != nil {
			t.Fatal(err)
		}
		record := core.NewRecord(collection)
		record.Id = item.id
		if err := app.Save(record); err != nil {
			t.Fatal(err)
		}
	}
}

func createAlbumTagOwnerToken(t *testing.T, app core.App) string {
	t.Helper()
	collection, err := app.FindCollectionByNameOrId(core.CollectionNameSuperusers)
	if err != nil {
		t.Fatal(err)
	}
	owner := core.NewRecord(collection)
	owner.Set("email", "album-owner@example.com")
	owner.SetPassword("owner-password-123")
	if err := app.Save(owner); err != nil {
		t.Fatal(err)
	}
	token, err := owner.NewAuthToken()
	if err != nil {
		t.Fatal(err)
	}
	return token
}

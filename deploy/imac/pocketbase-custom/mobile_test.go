package main

import (
	"bytes"
	"encoding/json"
	"errors"
	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tests"
	"image"
	"image/color"
	"image/png"
	"io"
	"mime/multipart"
	"net/http/httptest"
	"testing"
)

func TestMobilePublishing(t *testing.T) {
	app, err := tests.NewTestApp()
	if err != nil {
		t.Fatal(err)
	}
	defer app.Cleanup()
	media := core.NewBaseCollection("media")
	public := ""
	media.ViewRule = &public
	media.Fields.Add(&core.FileField{Name: "file", MaxSelect: 1, MaxSize: mobileFileLimit})
	if err = app.Save(media); err != nil {
		t.Fatal(err)
	}
	for _, name := range []string{"posts", "daily_entries"} {
		c := core.NewBaseCollection(name)
		c.Fields.Add(&core.TextField{Name: "title"}, &core.TextField{Name: "slug"}, &core.TextField{Name: "day_key"}, &core.TextField{Name: "content", Max: 4000000}, &core.TextField{Name: "status"}, &core.DateField{Name: "first_published_at"}, &core.DateField{Name: "published_at"})
		if err = app.Save(c); err != nil {
			t.Fatal(err)
		}
	}
	if err = ensureRecordsV2(app); err != nil {
		t.Fatal(err)
	}
	if err = ensureMobile(app, "aaaaaaaaaaaaaaa"); err != nil {
		t.Fatal(err)
	}
	if err = ensureMobile(app, "aaaaaaaaaaaaaaa"); err != nil {
		t.Fatal(err)
	}
	users, _ := app.FindCollectionByNameOrId("users")
	owner, token := createFileToolAuthRecord(t, app, users, "aaaaaaaaaaaaaaa", "mobile@example.com")
	otherUser, other := createFileToolAuthRecord(t, app, users, "bbbbbbbbbbbbbbb", "othermobile@example.com")
	router, _ := apis.NewRouter(app)
	event := &core.ServeEvent{App: app, Router: router}
	(&mobileService{app: app, ownerUserID: owner.Id}).registerRoutes(event)
	(&recordsV2Service{app: app, ownerUserID: owner.Id}).registerRoutes(event)
	mux, err := router.BuildMux()
	if err != nil {
		t.Fatal(err)
	}
	request := func(method, path, auth, ctype string, body []byte, want int) []byte {
		t.Helper()
		req := httptest.NewRequest(method, path, bytes.NewReader(body))
		req.Header.Set("Authorization", auth)
		req.Header.Set("Content-Type", ctype)
		rr := httptest.NewRecorder()
		mux.ServeHTTP(rr, req)
		if rr.Code != want {
			t.Fatalf("%s %s = %d want %d %s", method, path, rr.Code, want, rr.Body.String())
		}
		return rr.Body.Bytes()
	}
	request("GET", "/api/cwk/mobile/capabilities", "", "", nil, 401)
	request("GET", "/api/cwk/mobile/capabilities", other, "", nil, 403)
	request("GET", "/api/cwk/mobile/capabilities", token, "", nil, 200)
	img := image.NewRGBA(image.Rect(0, 0, 2, 2))
	img.Set(0, 0, color.White)
	var photo bytes.Buffer
	png.Encode(&photo, img)
	original := []byte{0, 0, 0, 24, 'f', 't', 'y', 'p', 'h', 'e', 'i', 'c', 0, 0, 0, 0, 'm', 'i', 'f', '1', 1, 2, 3, 4}
	uploadRequestID := "12345678-1234-1234-1234-123456789abc"
	upload := func(auth string, data, raw []byte, want int) map[string]string {
		t.Helper()
		var b bytes.Buffer
		w := multipart.NewWriter(&b)
		w.WriteField("requestId", uploadRequestID)
		f, _ := w.CreateFormFile("file", "image.png")
		f.Write(data)
		if raw != nil {
			f, _ = w.CreateFormFile("original", "image.heic")
			f.Write(raw)
		}
		w.Close()
		result := request("POST", "/api/cwk/mobile/media", auth, w.FormDataContentType(), b.Bytes(), want)
		var out map[string]string
		if want < 300 {
			json.Unmarshal(result, &out)
		}
		return out
	}
	upload(other, photo.Bytes(), original, 403)
	upload(token, []byte("bad"), original, 400)
	upload(token, photo.Bytes(), []byte("bad"), 400)
	first := upload(token, photo.Bytes(), original, 201)
	again := upload(token, photo.Bytes(), original, 200)
	if first["id"] != again["id"] {
		t.Fatal("duplicate media")
	}
	upload(token, photo.Bytes(), nil, 409)
	r, err := app.FindRecordById("mobile_originals", first["original_id"])
	if err != nil {
		t.Fatal(err)
	}
	fs, err := app.NewFilesystem()
	if err != nil {
		t.Fatal(err)
	}
	defer fs.Close()
	f, err := fs.GetReader(r.BaseFilesPath() + "/" + r.GetString("file"))
	if err != nil {
		t.Fatal(err)
	}
	saved, _ := io.ReadAll(f)
	f.Close()
	if !bytes.Equal(saved, original) {
		t.Fatal("original changed")
	}
	request("GET", "/api/files/"+first["collectionId"]+"/"+first["id"]+"/"+first["original_file"], "", "", nil, 404)
	originalURL := "/api/files/" + first["original_collection"] + "/" + first["original_id"] + "/" + first["original_file"]
	request("GET", originalURL, other, "", nil, 404)
	request("GET", originalURL, token, "", nil, 404)
	ownerFileToken, _ := owner.NewFileToken()
	request("GET", originalURL+"?token="+ownerFileToken, "", "", nil, 200)
	// Use an unextended PocketBase router, simulating an old server binary.
	previousMux := mux
	oldRouter, _ := apis.NewRouter(app)
	mux, err = oldRouter.BuildMux()
	if err != nil {
		t.Fatal(err)
	}
	otherFileToken, _ := otherUser.NewFileToken()
	request("GET", originalURL, "", "", nil, 404)
	request("GET", originalURL+"?token="+otherFileToken, "", "", nil, 404)
	request("GET", originalURL+"?token="+ownerFileToken, "", "", nil, 200)
	request("GET", "/api/collections/mobile_originals/records/"+first["original_id"], other, "", nil, 404)
	mux = previousMux
	d := recordsV2Document{ClientRequestID: "23456789-1234-1234-1234-123456789abc", Category: "daily", Status: "published", RecordDate: "2026-09-07", Body: "아이폰 게시", Attachments: []recordsV2Attachment{{ID: "photo-1", MediaID: first["id"], URL: "https://example.com/api/files/" + first["collectionId"] + "/" + first["id"] + "/" + first["file"], Kind: "image", Mime: "image/png"}}}
	payload, _ := json.Marshal(d)
	out := request("POST", "/api/cwk/records-v2", token, "application/json", payload, 201)
	var doc recordsV2Document
	json.Unmarshal(out, &doc)
	out = request("POST", "/api/cwk/records-v2", token, "application/json", payload, 200)
	var retry recordsV2Document
	json.Unmarshal(out, &retry)
	if retry.ID != doc.ID || retry.Revision != 1 {
		t.Fatal("duplicate record")
	}
	d.Body = "different"
	payload, _ = json.Marshal(d)
	request("POST", "/api/cwk/records-v2", token, "application/json", payload, 409)
	request("GET", "/api/cwk/records-v2/"+doc.ID, "", "", nil, 200)
	uploadRequestID = "34567890-1234-1234-1234-123456789abc"
	pngOriginal := upload(token, photo.Bytes(), photo.Bytes(), 201)
	pngRecord, _ := app.FindRecordById("mobile_originals", pngOriginal["original_id"])
	pngReader, err := fs.GetReader(pngRecord.BaseFilesPath() + "/" + pngRecord.GetString("file"))
	if err != nil {
		t.Fatal(err)
	}
	pngSaved, _ := io.ReadAll(pngReader)
	pngReader.Close()
	if !bytes.Equal(pngSaved, photo.Bytes()) {
		t.Fatal("PNG original changed")
	}
	// Fail the display save after the private original was written; both DB rows and files must roll back.
	var failedOriginalPath string
	captureHook := app.OnRecordCreate("mobile_originals").BindFunc(func(e *core.RecordEvent) error {
		err := e.Next()
		failedOriginalPath = e.Record.BaseFilesPath() + "/" + e.Record.GetString("file")
		return err
	})
	failHook := app.OnRecordCreate("media").BindFunc(func(e *core.RecordEvent) error { return errors.New("injected display save failure") })
	uploadRequestID = "45678901-1234-1234-1234-123456789abc"
	upload(token, photo.Bytes(), original, 400)
	app.OnRecordCreate("mobile_originals").Unbind(captureHook)
	app.OnRecordCreate("media").Unbind(failHook)
	count, err := app.CountRecords("mobile_originals")
	if err != nil || count != 2 {
		t.Fatalf("orphan originals count %d %v", count, err)
	}
	if failedOriginalPath == "" {
		t.Fatal("failure fixture did not write an original")
	}
	if orphan, err := fs.GetReader(failedOriginalPath); err == nil {
		orphan.Close()
		t.Fatal("orphan file after rollback")
	}
	upload(token, photo.Bytes(), original, 201) // failed UUID is safely retryable
	refs, err := app.FindRecordsByFilter("records_v2_media", "media={:media}", "", 0, 0, map[string]any{"media": first["id"]})
	if err != nil || len(refs) != 1 {
		t.Fatalf("references %v %d", err, len(refs))
	}
}

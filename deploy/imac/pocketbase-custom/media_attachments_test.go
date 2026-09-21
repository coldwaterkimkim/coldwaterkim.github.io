package main

import (
	"archive/zip"
	"bytes"
	"encoding/json"
	"io"
	"mime/multipart"
	"net/http/httptest"
	"net/textproto"
	"os"
	"testing"

	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tests"
)

// Exercise actual multipart validation and byte-for-byte download of a zipped
// macOS application, including the executable permission inside its archive.
func TestMediaZIPAttachmentMultipart(t *testing.T) {
	app, err := tests.NewTestApp()
	if err != nil {
		t.Fatal(err)
	}
	defer app.Cleanup()
	data, err := os.ReadFile("../../../pb_schema.json")
	if err != nil {
		t.Fatal(err)
	}
	var schema struct {
		Collections []struct {
			Name   string            `json:"name"`
			Fields []json.RawMessage `json:"fields"`
		} `json:"collections"`
	}
	if err = json.Unmarshal(data, &schema); err != nil {
		t.Fatal(err)
	}
	var fileField core.FileField
	for _, collection := range schema.Collections {
		if collection.Name != "media" {
			continue
		}
		for _, raw := range collection.Fields {
			var field struct {
				Name string `json:"name"`
			}
			json.Unmarshal(raw, &field)
			if field.Name == "file" {
				if err = json.Unmarshal(raw, &fileField); err != nil {
					t.Fatal(err)
				}
			}
		}
	}
	if fileField.Name != "file" {
		t.Fatal("media file schema missing")
	}
	media := core.NewBaseCollection("media")
	public := ""
	media.CreateRule, media.ViewRule = &public, &public // Isolated fixture only.
	media.Fields.Add(&fileField)
	if err = app.Save(media); err != nil {
		t.Fatal(err)
	}
	router, err := apis.NewRouter(app)
	if err != nil {
		t.Fatal(err)
	}
	mux, err := router.BuildMux()
	if err != nil {
		t.Fatal(err)
	}
	var archive bytes.Buffer
	zw := zip.NewWriter(&archive)
	header := &zip.FileHeader{Name: "Example.app/Contents/MacOS/Example", Method: zip.Deflate}
	header.SetMode(0755)
	f, err := zw.CreateHeader(header)
	if err != nil {
		t.Fatal(err)
	}
	f.Write([]byte("#!/bin/sh\necho fixture\n"))
	if err = zw.Close(); err != nil {
		t.Fatal(err)
	}
	for _, contentType := range []string{"application/zip", "application/x-zip-compressed", "application/octet-stream", ""} {
		t.Run(contentType, func(t *testing.T) {
			var body bytes.Buffer
			writer := multipart.NewWriter(&body)
			h := make(textproto.MIMEHeader)
			h.Set("Content-Disposition", `form-data; name="file"; filename="Example.app.zip"`)
			if contentType != "" {
				h.Set("Content-Type", contentType)
			}
			part, err := writer.CreatePart(h)
			if err != nil {
				t.Fatal(err)
			}
			part.Write(archive.Bytes())
			writer.Close()
			req := httptest.NewRequest("POST", "/api/collections/media/records", &body)
			req.Header.Set("Content-Type", writer.FormDataContentType())
			rr := httptest.NewRecorder()
			mux.ServeHTTP(rr, req)
			if rr.Code != 200 {
				t.Fatalf("upload: %d %s", rr.Code, rr.Body.String())
			}
			var record struct {
				ID   string `json:"id"`
				File string `json:"file"`
			}
			if err = json.Unmarshal(rr.Body.Bytes(), &record); err != nil {
				t.Fatal(err)
			}
			download := httptest.NewRecorder()
			mux.ServeHTTP(download, httptest.NewRequest("GET", "/api/files/"+media.Id+"/"+record.ID+"/"+record.File, nil))
			if download.Code != 200 || !bytes.Equal(download.Body.Bytes(), archive.Bytes()) {
				t.Fatalf("download differs: %d", download.Code)
			}
			zr, err := zip.NewReader(bytes.NewReader(download.Body.Bytes()), int64(download.Body.Len()))
			if err != nil {
				t.Fatal(err)
			}
			if zr.File[0].Name != header.Name || zr.File[0].Mode().Perm() != 0755 {
				t.Fatal("app bundle layout or executable mode changed")
			}
			r, _ := zr.File[0].Open()
			payload, _ := io.ReadAll(r)
			r.Close()
			if string(payload) != "#!/bin/sh\necho fixture\n" {
				t.Fatal("app executable changed")
			}
		})
	}
}

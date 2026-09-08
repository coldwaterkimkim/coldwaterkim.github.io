package main

import (
	"bytes"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"image"
	_ "image/jpeg"
	_ "image/png"
	"io"
	"net/http"
	"regexp"
	"strings"
	"sync"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/filesystem"
)

const mobileFileLimit = 64 * 1024 * 1024

var mobileUUID = regexp.MustCompile(`^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$`)
var errMobileConflict = errors.New("Request ID already used with different content")

type mobileService struct {
	app         core.App
	ownerUserID string
	mu          sync.Mutex
}

func ensureMobile(app core.App, ownerUserID string) error {
	return app.RunInTransaction(func(tx core.App) error {
		originals, err := tx.FindCollectionByNameOrId("mobile_originals")
		if errors.Is(err, sql.ErrNoRows) {
			originals = core.NewBaseCollection("mobile_originals")
			originals.Fields.Add(&core.FileField{Name: "file", Required: true, MaxSelect: 1, MaxSize: mobileFileLimit, Protected: true})
		} else if err != nil {
			return err
		}
		// Persist authorization in the database so older binaries retain the same protection.
		rule := "@request.auth.collectionName = 'users' && @request.auth.id = '" + normalizedOwnerUserID(ownerUserID) + "' && @request.auth.id != ''"
		originals.ListRule = &rule
		originals.ViewRule = &rule
		originals.CreateRule = nil
		originals.UpdateRule = nil
		originals.DeleteRule = nil
		if err = tx.Save(originals); err != nil {
			return err
		}
		c, err := tx.FindCollectionByNameOrId("media")
		if err != nil {
			return err
		}
		changed := false
		for _, name := range []string{"mobile_request_id", "mobile_request_hash", "mobile_original_id"} {
			if c.Fields.GetByName(name) == nil {
				c.Fields.Add(&core.TextField{Name: name, Hidden: true})
				changed = true
			}
		}
		hasIndex := false
		for _, index := range c.Indexes {
			if strings.Contains(index, "idx_media_mobile_request") {
				hasIndex = true
			}
		}
		if !hasIndex {
			c.AddIndex("idx_media_mobile_request", true, "mobile_request_id", "mobile_request_id != ''")
			changed = true
		}
		if changed {
			return tx.Save(c)
		}
		return nil
	})
}
func (s *mobileService) registerRoutes(e *core.ServeEvent) {
	e.Router.GET("/api/cwk/mobile/capabilities", func(e *core.RequestEvent) error {
		return e.JSON(200, map[string]any{"version": 1, "ownerId": s.ownerUserID, "maxFileBytes": mobileFileLimit, "originalFormats": []string{"heic", "heif", "jpeg", "png"}, "idempotency": true})
	}).Bind(requireOwner(s.ownerUserID))
	e.Router.POST("/api/cwk/mobile/media", s.upload).Unbind(apis.DefaultBodyLimitMiddlewareId).Bind(apis.BodyLimit(2*mobileFileLimit + 1024*1024)).Bind(requireOwner(s.ownerUserID))
}

func mobileHash(v any) string {
	b, _ := json.Marshal(v)
	h := sha256.Sum256(b)
	return hex.EncodeToString(h[:])
}
func validHEIF(b []byte) bool {
	if len(b) < 16 || string(b[4:8]) != "ftyp" {
		return false
	}
	// Only brands identifying HEIF still images, not arbitrary MP4 containers.
	for i := 8; i+4 <= len(b) && i < 64; i += 4 {
		switch string(b[i : i+4]) {
		case "heic", "heix", "hevc", "hevx", "mif1":
			return true
		}
	}
	return false
}
func (s *mobileService) upload(e *core.RequestEvent) error {
	if err := e.Request.ParseMultipartForm(1024 * 1024); err != nil {
		return e.BadRequestError("Invalid upload", err)
	}
	defer e.Request.MultipartForm.RemoveAll()
	requestID := e.Request.FormValue("requestId")
	if !mobileUUID.MatchString(requestID) {
		return e.BadRequestError("requestId must be a UUID", nil)
	}
	read := func(key string, required bool) ([]byte, error) {
		fs := e.Request.MultipartForm.File[key]
		if len(fs) == 0 && !required {
			return nil, nil
		}
		if len(fs) != 1 {
			return nil, fmt.Errorf("Expected one %s", key)
		}
		if fs[0].Size > mobileFileLimit {
			return nil, fmt.Errorf("%s too large", key)
		}
		f, err := fs[0].Open()
		if err != nil {
			return nil, err
		}
		defer f.Close()
		return io.ReadAll(io.LimitReader(f, mobileFileLimit+1))
	}
	display, err := read("file", true)
	if err != nil {
		return e.BadRequestError(err.Error(), nil)
	}
	cfg, format, err := image.DecodeConfig(bytes.NewReader(display))
	if err != nil || (format != "jpeg" && format != "png") || cfg.Width <= 0 || cfg.Height <= 0 || int64(cfg.Width)*int64(cfg.Height) > 100000000 {
		return e.BadRequestError("Expected a JPEG or PNG image up to 100 megapixels", nil)
	}
	original, err := read("original", false)
	if err != nil {
		return e.BadRequestError(err.Error(), nil)
	}
	originalExtension := "heic"
	if original != nil && !validHEIF(original) {
		originalConfig, originalFormat, originalErr := image.DecodeConfig(bytes.NewReader(original))
		if originalErr != nil || (originalFormat != "jpeg" && originalFormat != "png") || originalConfig.Width <= 0 || originalConfig.Height <= 0 || int64(originalConfig.Width)*int64(originalConfig.Height) > 100000000 {
			return e.BadRequestError("Expected HEIC, HEIF, JPEG or PNG original", nil)
		}
		originalExtension = originalFormat
	}
	displayHash, originalHash := sha256.Sum256(display), sha256.Sum256(original)
	hash := mobileHash([][32]byte{displayHash, originalHash})
	s.mu.Lock()
	defer s.mu.Unlock()
	var result *core.Record
	status := http.StatusCreated
	var newPaths []string
	err = s.app.RunInTransaction(func(tx core.App) error {
		existing, err := tx.FindFirstRecordByFilter("media", "mobile_request_id={:id}", dbx.Params{"id": requestID})
		if err == nil {
			if existing.GetString("mobile_request_hash") != hash {
				return errMobileConflict
			}
			result = existing
			status = http.StatusOK
			return nil
		}
		if !errors.Is(err, sql.ErrNoRows) {
			return err
		}
		c, err := tx.FindCollectionByNameOrId("media")
		if err != nil {
			return err
		}
		r := core.NewRecord(c)
		file, err := filesystem.NewFileFromBytes(display, "photo."+format)
		if err != nil {
			return err
		}
		r.Set("file", file)
		if original != nil {
			oc, err := tx.FindCollectionByNameOrId("mobile_originals")
			if err != nil {
				return err
			}
			raw := core.NewRecord(oc)
			recordsV2AssignID(raw)
			newPaths = append(newPaths, raw.BaseFilesPath()+"/")
			f, err := filesystem.NewFileFromBytes(original, "original."+originalExtension)
			if err != nil {
				return err
			}
			raw.Set("file", f)
			if err = tx.Save(raw); err != nil {
				return err
			}
			r.Set("mobile_original_id", raw.Id)
		}
		recordsV2AssignID(r)
		newPaths = append(newPaths, r.BaseFilesPath()+"/")
		r.Set("mobile_request_id", requestID)
		r.Set("mobile_request_hash", hash)
		if err = tx.Save(r); err != nil {
			return err
		}
		result = r
		return nil
	})
	if errors.Is(err, errMobileConflict) {
		return e.JSON(http.StatusConflict, map[string]string{"message": err.Error()})
	}
	if err != nil {
		// SQLite rollback cannot undo filesystem writes. Only paths allocated by this failed transaction are removed.
		if len(newPaths) > 0 {
			fs, fsErr := s.app.NewFilesystem()
			if fsErr == nil {
				for _, path := range newPaths {
					err = errors.Join(err, errors.Join(fs.DeletePrefix(path)...))
				}
				fs.Close()
			} else {
				err = errors.Join(err, fsErr)
			}
		}
		return e.BadRequestError("Photo could not be saved", err)
	}
	return mobileResponse(e, result, status)
}
func mobileResponse(e *core.RequestEvent, r *core.Record, status int) error {
	out := map[string]string{"id": r.Id, "collectionId": r.Collection().Id, "file": r.GetString("file"), "original_file": ""}
	if id := r.GetString("mobile_original_id"); id != "" {
		raw, err := e.App.FindRecordById("mobile_originals", id)
		if err != nil {
			return err
		}
		out["original_file"] = raw.GetString("file")
		out["original_collection"] = raw.Collection().Id
		out["original_id"] = raw.Id
	}
	return e.JSON(status, out)
}

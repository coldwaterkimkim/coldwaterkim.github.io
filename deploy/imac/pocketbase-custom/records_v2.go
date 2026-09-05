package main

import (
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
)

// V2 owns documents and references only. It never changes or deletes media files.
type recordsV2Service struct {
	app         core.App
	ownerUserID string
	writeMu     sync.Mutex
}
type recordsV2Attachment struct {
	PlaybackURL string         `json:"playbackUrl,omitempty"`
	PosterURL   string         `json:"posterUrl,omitempty"`
	ID          string         `json:"id"`
	MediaID     string         `json:"mediaId"`
	URL         string         `json:"url"`
	Name        string         `json:"name"`
	Mime        string         `json:"mime"`
	Kind        string         `json:"kind"`
	Crop        map[string]any `json:"crop"`
	Comment     string         `json:"comment"`
}
type recordsV2Embed struct {
	ID       string                `json:"id"`
	Type     string                `json:"type"`
	URL      string                `json:"url"`
	Snapshot *chatGptShareSnapshot `json:"snapshot,omitempty"`
}
type recordsV2Source struct {
	Title      string `json:"title,omitempty"`
	Slug       string `json:"slug,omitempty"`
	Collection string `json:"collection"`
	ID         string `json:"id"`
	URL        string `json:"url"`
}
type recordsV2Document struct {
	SchemaVersion    int                   `json:"schemaVersion"`
	ID               string                `json:"id"`
	Category         string                `json:"category"`
	Body             string                `json:"body"`
	Attachments      []recordsV2Attachment `json:"attachments"`
	Embeds           []recordsV2Embed      `json:"embeds"`
	LegacyHTML       string                `json:"legacyHtml,omitempty"`
	LegacySource     *recordsV2Source      `json:"legacySource,omitempty"`
	Status           string                `json:"status"`
	RecordDate       string                `json:"recordDate"`
	FirstPublishedAt string                `json:"firstPublishedAt"`
	Revision         int                   `json:"revision"`
	Created          string                `json:"created"`
	Updated          string                `json:"updated"`
	SourceUpdated    string                `json:"sourceUpdated,omitempty"`
}

func ensureRecordsV2(app core.App) error {
	return app.RunInTransaction(func(tx core.App) error {
		records, err := tx.FindCollectionByNameOrId("records_v2")
		if errors.Is(err, sql.ErrNoRows) {
			records = core.NewBaseCollection("records_v2")
			records.Fields.Add(&core.JSONField{Name: "document", MaxSize: 4 * 1024 * 1024}, &core.TextField{Name: "category", Required: true}, &core.TextField{Name: "status", Required: true}, &core.DateField{Name: "first_published_at"}, &core.NumberField{Name: "revision", OnlyInt: true}, &core.TextField{Name: "source_key"}, &core.AutodateField{Name: "created", OnCreate: true}, &core.AutodateField{Name: "updated", OnCreate: true, OnUpdate: true})
			records.AddIndex("idx_records_v2_feed", false, "status, category, first_published_at", "")
			records.AddIndex("idx_records_v2_source", true, "source_key", "source_key != ''")
			if err = tx.Save(records); err != nil {
				return err
			}
		} else if err != nil {
			return err
		}
		if _, err = tx.FindCollectionByNameOrId("records_v2_media"); errors.Is(err, sql.ErrNoRows) {
			refs := core.NewBaseCollection("records_v2_media")
			// Media IDs are explicit references, validated against media on every write.
			// A text key avoids cascade deletion from legacy media cleanup.
			refs.Fields.Add(&core.RelationField{Name: "record", CollectionId: records.Id, MaxSelect: 1, Required: true, CascadeDelete: true}, &core.TextField{Name: "media", Required: true}, &core.TextField{Name: "occurrence", Required: true})
			refs.AddIndex("idx_records_v2_occurrence", true, "record, occurrence", "")
			return tx.Save(refs)
		}
		return err
	})
}
func (s *recordsV2Service) registerRoutes(e *core.ServeEvent) {
	for _, collection := range []string{"posts", "daily_entries"} {
		protect := func(event *core.RecordRequestEvent) error {
			mapped, err := s.app.FindFirstRecordByFilter("records_v2", "source_key={:key}", dbx.Params{"key": event.Record.Collection().Name + ":" + event.Record.Id})
			if err == nil {
				return event.JSON(http.StatusConflict, map[string]string{"message": "이 기록은 새 작성기에서 수정해 줘.", "recordId": mapped.Id, "url": "/records/#record/" + mapped.Id})
			}
			if !errors.Is(err, sql.ErrNoRows) {
				return err
			}
			return event.Next()
		}
		s.app.OnRecordUpdateRequest(collection).BindFunc(protect)
		s.app.OnRecordDeleteRequest(collection).BindFunc(protect)
	}
	s.app.OnRecordDelete("media").BindFunc(func(event *core.RecordEvent) error {
		count, err := event.App.CountRecords("records_v2_media", dbx.HashExp{"media": event.Record.Id})
		if err != nil {
			return err
		}
		if count > 0 {
			return fmt.Errorf("Media is referenced by a V2 record")
		}
		return event.Next()
	})
	e.Router.DELETE("/api/cwk/records-v2/{id}", s.delete).Bind(requireOwner(s.ownerUserID))
	e.Router.GET("/api/cwk/records-v2", s.list)
	e.Router.GET("/api/cwk/records-v2/{id}", s.get)
	e.Router.POST("/api/cwk/records-v2", s.write).Unbind(apis.DefaultBodyLimitMiddlewareId).Bind(apis.BodyLimit(4 * 1024 * 1024)).Bind(requireOwner(s.ownerUserID))
	e.Router.PUT("/api/cwk/records-v2/{id}", s.write).Unbind(apis.DefaultBodyLimitMiddlewareId).Bind(apis.BodyLimit(4 * 1024 * 1024)).Bind(requireOwner(s.ownerUserID))
}
func (s *recordsV2Service) owner(e *core.RequestEvent) bool {
	return e.Auth != nil && (e.Auth.IsSuperuser() || (normalizedOwnerUserID(s.ownerUserID) != "" && e.Auth.Collection().Name == "users" && constantTimeStringEqual(e.Auth.Id, s.ownerUserID)))
}
func recordsV2Decode(r *core.Record) (recordsV2Document, error) {
	var d recordsV2Document
	err := json.Unmarshal([]byte(r.GetString("document")), &d)
	d.ID = r.Id
	d.Revision = r.GetInt("revision")
	d.FirstPublishedAt = r.GetString("first_published_at")
	d.Created = r.GetString("created")
	d.Updated = r.GetString("updated")
	return d, err
}
func (s *recordsV2Service) get(e *core.RequestEvent) error {
	d, err := s.document(e.Request.PathValue("id"))
	if errors.Is(err, sql.ErrNoRows) {
		return e.NotFoundError("Record not found", nil)
	}
	if err != nil {
		return err
	}
	if d.Status != "published" && !s.owner(e) {
		return e.NotFoundError("Record not found", nil)
	}
	return e.JSON(http.StatusOK, d)
}
func (s *recordsV2Service) list(e *core.RequestEvent) error {
	q := e.Request.URL.Query()
	status := "published"
	if q.Get("status") == "draft" {
		if !s.owner(e) {
			return e.ForbiddenError("OWNER required", nil)
		}
		status = "draft"
	}
	category := q.Get("category")
	if category != "" && category != "posts" && category != "daily" {
		return e.BadRequestError("Invalid category", nil)
	}
	page, _ := strconv.Atoi(q.Get("page"))
	if page < 1 {
		page = 1
	}
	if page > 100000 {
		page = 100000
	}
	size, _ := strconv.Atoi(q.Get("perPage"))
	if size < 1 {
		size = 20
	}
	if size > 100 {
		size = 100
	}
	items, more, err := s.unifiedList(status, category, size, (page-1)*size)
	if err != nil {
		return err
	}
	return e.JSON(http.StatusOK, map[string]any{"items": items, "page": page, "perPage": size, "hasMore": more})
}

func recordsV2SafeURL(raw string) bool {
	if len(raw) > 8192 {
		return false
	}
	u, err := url.Parse(raw)
	return err == nil && (u.Scheme == "https" || u.Scheme == "http") && u.Hostname() != "" && u.User == nil
}
func validateRecordsV2(d *recordsV2Document) error {
	if d.SchemaVersion != 0 && d.SchemaVersion != 1 {
		return fmt.Errorf("Unsupported schemaVersion")
	}
	d.SchemaVersion = 1
	if d.Category != "posts" && d.Category != "daily" {
		return fmt.Errorf("Invalid category")
	}
	if d.Status != "draft" && d.Status != "published" {
		return fmt.Errorf("Invalid status")
	}
	if _, err := time.Parse("2006-01-02", d.RecordDate); err != nil {
		return fmt.Errorf("Invalid recordDate")
	}
	if len(d.Body) > 500000 || len(d.LegacyHTML) > 2000000 || len(d.Attachments) > 100 || len(d.Embeds) > 20 {
		return fmt.Errorf("Record too large")
	}
	if d.Attachments == nil {
		d.Attachments = []recordsV2Attachment{}
	}
	if d.Embeds == nil {
		d.Embeds = []recordsV2Embed{}
	}
	seen := map[string]bool{}
	for _, a := range d.Attachments {
		if len(a.ID) < 1 || len(a.ID) > 128 || seen[a.ID] {
			return fmt.Errorf("Attachment IDs must be unique")
		}
		seen[a.ID] = true
		if !recordsV2SafeURL(a.URL) {
			return fmt.Errorf("Invalid attachment URL")
		}
		if (a.PlaybackURL != "" && !recordsV2SafeURL(a.PlaybackURL)) || (a.PosterURL != "" && !recordsV2SafeURL(a.PosterURL)) {
			return fmt.Errorf("Invalid attachment playback or poster URL")
		}

		if a.MediaID != "" && !isPocketBaseRecordID(a.MediaID) {
			return fmt.Errorf("Invalid media ID")
		}
		if a.Kind != "image" && a.Kind != "video" && a.Kind != "audio" && a.Kind != "file" {
			return fmt.Errorf("Invalid attachment kind")
		}
		if len(a.Comment) > 50000 || len(a.Name) > 1024 || len(a.Mime) > 128 {
			return fmt.Errorf("Attachment too large")
		}
		if a.Crop != nil {
			b, _ := json.Marshal(a.Crop)
			if len(b) > 2048 {
				return fmt.Errorf("Crop too large")
			}
			for key, value := range a.Crop {
				if key == "enabled" {
					if _, ok := value.(bool); !ok {
						return fmt.Errorf("Invalid crop enabled flag")
					}
					continue
				}
				n, ok := value.(float64)
				if !ok {
					return fmt.Errorf("Invalid crop value")
				}
				switch key {
				case "x", "y":
					if n < 0 || n >= 1 {
						return fmt.Errorf("Invalid crop position")
					}
				case "width", "height":
					if n <= 0 || n > 1 {
						return fmt.Errorf("Invalid crop size")
					}
				case "aspect", "pixelWidth":
					if n < 0 || n > 1000000 {
						return fmt.Errorf("Invalid crop dimensions")
					}
				default:
					return fmt.Errorf("Unknown crop property")
				}
			}
			for _, axis := range [][2]string{{"x", "width"}, {"y", "height"}} {
				position, _ := a.Crop[axis[0]].(float64)
				size, _ := a.Crop[axis[1]].(float64)
				if position+size > 1.000001 {
					return fmt.Errorf("Crop exceeds image")
				}
			}

		}
	}
	for _, b := range d.Embeds {
		if b.ID == "" || len(b.ID) > 128 || seen[b.ID] {
			return fmt.Errorf("Embed IDs must be unique")
		}
		seen[b.ID] = true
		if !recordsV2SafeURL(b.URL) {
			return fmt.Errorf("Invalid embed URL")
		}
		if b.Type == "chatgpt" {
			if _, err := normalizedChatGptShareURL(b.URL); err != nil {
				return err
			}
		} else if b.Type == "youtube" {
			u, _ := url.Parse(b.URL)
			h := strings.ToLower(u.Hostname())
			if h != "youtube.com" && h != "www.youtube.com" && h != "m.youtube.com" && h != "youtu.be" {
				return fmt.Errorf("Invalid YouTube URL")
			}
		} else {
			return fmt.Errorf("Invalid embed type")
		}
		if b.Snapshot != nil {
			if len(b.Snapshot.Title) > 1000 || len(b.Snapshot.Messages) > chatGptShareMessageMax {
				return fmt.Errorf("Snapshot too large")
			}
			total := 0
			for _, m := range b.Snapshot.Messages {
				if m.Role != "user" && m.Role != "assistant" {
					return fmt.Errorf("Invalid message role")
				}
				total += len(m.Text)
			}
			if total > chatGptShareTextMaxBytes {
				return fmt.Errorf("Snapshot too large")
			}
		}
	}
	if d.LegacySource != nil {
		if len(d.LegacySource.Title) > 4096 || len(d.LegacySource.Slug) > 2048 {
			return fmt.Errorf("Legacy source metadata too large")
		}
		if d.LegacySource.Collection != "posts" && d.LegacySource.Collection != "daily_entries" {
			return fmt.Errorf("Invalid legacy collection")
		}
		if !isPocketBaseRecordID(d.LegacySource.ID) || !recordsV2SafeURL(d.LegacySource.URL) {
			return fmt.Errorf("Invalid legacy source")
		}
	}
	return nil
}

var errRecordsV2Revision = errors.New("Record changed; reload before saving")

func (s *recordsV2Service) write(e *core.RequestEvent) error {
	s.writeMu.Lock()
	defer s.writeMu.Unlock()
	var d recordsV2Document
	if err := e.BindBody(&d); err != nil {
		return e.BadRequestError("Invalid record", err)
	}
	if err := validateRecordsV2(&d); err != nil {
		return e.BadRequestError(err.Error(), nil)
	}
	id := e.Request.PathValue("id")
	synthetic := strings.Contains(id, ":")
	if synthetic {
		original, err := s.document(id)
		if err != nil {
			return e.NotFoundError("Record not found", nil)
		}
		if original.ID != id {
			return e.JSON(http.StatusConflict, map[string]string{"message": errRecordsV2Revision.Error()})
		}
		if d.SourceUpdated == "" || d.SourceUpdated != original.SourceUpdated || d.Revision != 0 {
			return e.JSON(http.StatusConflict, map[string]string{"message": errRecordsV2Revision.Error()})
		}
		d.LegacySource = original.LegacySource
		id = ""
	}
	var saved *core.Record
	err := s.app.RunInTransaction(func(tx core.App) error {
		c, err := tx.FindCollectionByNameOrId("records_v2")
		if err != nil {
			return err
		}
		r := core.NewRecord(c)
		if id != "" {
			r, err = tx.FindRecordById(c, id)
			if err != nil {
				return err
			}
			if d.Revision != r.GetInt("revision") {
				return errRecordsV2Revision
			}
		} else if d.Revision != 0 {
			return errRecordsV2Revision
		}
		first := r.GetString("first_published_at")
		if r.IsNew() && d.LegacySource != nil {
			source, err := tx.FindRecordById(d.LegacySource.Collection, d.LegacySource.ID)
			if err != nil {
				return err
			}
			if synthetic && source.GetString("updated") != d.SourceUpdated {
				return errRecordsV2Revision
			}
			if !synthetic && source.GetString("status") != "published" {
				return fmt.Errorf("Only published legacy records can be imported")
			}
			authentic := recordsV2FromLegacy(source)
			d.LegacySource = authentic.LegacySource
			if synthetic {
				d.LegacyHTML = authentic.LegacyHTML
			}
			first = source.GetString("first_published_at")
			if first == "" && source.GetString("status") == "published" {
				return fmt.Errorf("Legacy record has no evidenced first publication timestamp")
			}
			if (d.LegacySource.Collection == "posts" && d.Category != "posts") || (d.LegacySource.Collection == "daily_entries" && d.Category != "daily") {
				return fmt.Errorf("Legacy category mismatch")
			}
		}
		if first == "" && d.Status == "published" {
			first = time.Now().UTC().Format("2006-01-02 15:04:05.000Z")
		}
		recordsV2AssignID(r)
		d.FirstPublishedAt = first
		d.Revision = r.GetInt("revision") + 1
		d.ID = r.Id
		d.Created = ""
		d.Updated = ""
		source := ""
		if d.LegacySource != nil {
			source = d.LegacySource.Collection + ":" + d.LegacySource.ID
		}
		if !r.IsNew() && r.GetString("source_key") != source {
			return fmt.Errorf("Legacy source cannot change")
		}
		if !r.IsNew() && r.GetString("category") != d.Category {
			return fmt.Errorf("Linked record category cannot change")
		}
		if err := s.projectLegacy(tx, r, &d); err != nil {
			return err
		}
		source = d.LegacySource.Collection + ":" + d.LegacySource.ID
		r.Set("document", d)
		r.Set("category", d.Category)
		r.Set("status", d.Status)
		r.Set("first_published_at", first)
		r.Set("revision", d.Revision)
		r.Set("source_key", source)
		if err = tx.Save(r); err != nil {
			return err
		}
		refs, err := tx.FindRecordsByFilter("records_v2_media", "record={:id}", "", 0, 0, dbx.Params{"id": r.Id})
		if err != nil {
			return err
		}
		for _, ref := range refs {
			if err = tx.Delete(ref); err != nil {
				return err
			}
		}
		rc, err := tx.FindCollectionByNameOrId("records_v2_media")
		if err != nil {
			return err
		}
		for _, a := range d.Attachments {
			if a.MediaID == "" {
				continue
			}
			if _, err = tx.FindRecordById("media", a.MediaID); err != nil {
				return fmt.Errorf("Referenced media does not exist: %s", a.MediaID)
			}
			ref := core.NewRecord(rc)
			ref.Set("record", r.Id)
			ref.Set("media", a.MediaID)
			ref.Set("occurrence", a.ID)
			if err = tx.Save(ref); err != nil {
				return err
			}
		}

		// Preserved rich HTML may contain media outside the new attachment rail.
		// Reference those original media records too, without rendering the HTML.
		if d.LegacyHTML != "" {
			mc, err := tx.FindCollectionByNameOrId("media")
			if err != nil {
				return err
			}
			seen := map[string]bool{}
			for _, match := range recordsV2LegacyMediaPattern.FindAllStringSubmatch(d.LegacyHTML, -1) {
				if match[1] != "media" && match[1] != mc.Id {
					continue
				}
				mediaID := match[2]
				if seen[mediaID] {
					continue
				}
				seen[mediaID] = true
				if _, err = tx.FindRecordById(mc, mediaID); errors.Is(err, sql.ErrNoRows) {
					continue
				} else if err != nil {
					return err
				}
				occurrence := "legacy:" + mediaID
				// Avoid accidental collisions with client occurrence IDs.
				for used := true; used; {
					used = false
					for _, a := range d.Attachments {
						if a.ID == occurrence {
							occurrence = "_" + occurrence
							used = true
						}
					}
				}
				ref := core.NewRecord(rc)
				ref.Set("record", r.Id)
				ref.Set("media", mediaID)
				ref.Set("occurrence", occurrence)
				if err = tx.Save(ref); err != nil {
					return err
				}
			}
		}
		saved = r
		return nil
	})
	if errors.Is(err, errRecordsV2Revision) {
		return e.JSON(http.StatusConflict, map[string]string{"message": err.Error()})
	}
	if errors.Is(err, sql.ErrNoRows) {
		return e.NotFoundError("Record not found", nil)
	}
	if err != nil {
		return e.BadRequestError("Record could not be saved", err)
	}
	out, err := recordsV2Decode(saved)
	if err != nil {
		return err
	}
	code := http.StatusOK
	if id == "" {
		code = http.StatusCreated
	}
	return e.JSON(code, out)
}

// Deleting a V2 record removes only its reference rows, never original files.
func (s *recordsV2Service) delete(e *core.RequestEvent) error {
	s.writeMu.Lock()
	defer s.writeMu.Unlock()
	revision, err := strconv.Atoi(e.Request.URL.Query().Get("revision"))
	if err != nil || revision < 1 {
		return e.BadRequestError("revision query parameter required", nil)
	}
	err = s.app.RunInTransaction(func(tx core.App) error {
		r, err := tx.FindRecordById("records_v2", e.Request.PathValue("id"))
		if err != nil {
			return err
		}
		if revision != r.GetInt("revision") {
			return errRecordsV2Revision
		}
		d, err := recordsV2Decode(r)
		if err != nil {
			return err
		}
		if d.LegacySource != nil {
			source, err := tx.FindRecordById(d.LegacySource.Collection, d.LegacySource.ID)
			if err != nil && !errors.Is(err, sql.ErrNoRows) {
				return err
			}
			if err == nil {
				if err = tx.Delete(source); err != nil {
					return err
				}
			}
		}
		return tx.Delete(r)
	})
	if errors.Is(err, errRecordsV2Revision) {
		return e.JSON(http.StatusConflict, map[string]string{"message": err.Error()})
	}
	if errors.Is(err, sql.ErrNoRows) {
		return e.NotFoundError("Record not found", nil)
	}
	if err != nil {
		return err
	}
	return e.NoContent(http.StatusNoContent)
}

var recordsV2LegacyMediaPattern = regexp.MustCompile(`/api/files/([a-zA-Z0-9_]+)/([a-z0-9]{15})/`)

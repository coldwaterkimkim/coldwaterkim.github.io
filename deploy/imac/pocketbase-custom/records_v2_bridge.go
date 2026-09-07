package main

import (
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/security"
	"html"
	"net/url"
	"strings"
)

// Structured documents are authoritative; legacy rows remain transactional projections.
func recordsV2FromLegacy(r *core.Record) recordsV2Document {
	c := r.Collection().Name
	if c == "nasajab" {
		return recordsV2FromNasajab(r)
	}
	category := "posts"
	day := r.GetString("day_key")
	if c == "daily_entries" {
		category = "daily"
	}
	if len(day) != 10 {
		day = firstNonEmpty(r.GetString("published_at"), r.GetString("first_published_at"), r.GetString("created"))
		if len(day) >= 10 {
			day = day[:10]
		}
	}
	link := siteOrigin + "/posts/" + url.PathEscape(r.GetString("slug")) + "/"
	if category == "daily" {
		link = siteOrigin + "/daily/" + day + "/"
	}
	return recordsV2Document{SchemaVersion: 1, ID: c + ":" + r.Id, Category: category, LegacyHTML: r.GetString("content"), LegacySource: &recordsV2Source{Collection: c, ID: r.Id, Title: r.GetString("title"), Slug: r.GetString("slug"), URL: link}, Status: r.GetString("status"), RecordDate: day, FirstPublishedAt: r.GetString("first_published_at"), Created: r.GetString("created"), Updated: r.GetString("updated"), SourceUpdated: r.GetString("updated"), Attachments: []recordsV2Attachment{}, Embeds: []recordsV2Embed{}}
}
func (s *recordsV2Service) document(id string) (recordsV2Document, error) {
	if c, key, ok := strings.Cut(id, ":"); ok {
		if (c != "posts" && c != "daily_entries" && c != "nasajab") || !isPocketBaseRecordID(key) {
			return recordsV2Document{}, sql.ErrNoRows
		}
		mapped, err := s.app.FindFirstRecordByFilter("records_v2", "source_key={:key}", dbx.Params{"key": id})
		if err == nil {
			return recordsV2Decode(mapped)
		}
		if !errors.Is(err, sql.ErrNoRows) {
			return recordsV2Document{}, err
		}
		r, err := s.app.FindRecordById(c, key)
		if err != nil {
			return recordsV2Document{}, err
		}
		return recordsV2FromLegacy(r), nil
	}
	r, err := s.app.FindRecordById("records_v2", id)
	if err != nil {
		return recordsV2Document{}, err
	}
	return recordsV2Decode(r)
}
func (s *recordsV2Service) unifiedList(status, category string, size, offset int) ([]recordsV2Document, bool, error) {
	order := "first_published_at"
	if status == "draft" {
		order = "updated"
	}
	clauses := []string{fmt.Sprintf("SELECT 'records_v2' AS kind,id,%s AS stamp FROM records_v2 WHERE status={:status} AND ({:category}='' OR category={:category})", order)}
	for _, c := range []string{"posts", "daily_entries", "nasajab"} {
		if _, err := s.app.FindCollectionByNameOrId(c); errors.Is(err, sql.ErrNoRows) {
			continue
		} else if err != nil {
			return nil, false, err
		}
		if c == "nasajab" {
			condition := "is_public = true"
			if status == "draft" {
				condition = "is_public = false"
			}
			stamp := "COALESCE(NULLIF(first_published_at,''),NULLIF(display_at,''),created)"
			if status == "draft" {
				stamp = "updated"
			}
			clauses = append(clauses, fmt.Sprintf("SELECT 'nasajab' AS kind,id,%s AS stamp FROM nasajab legacy WHERE %s AND ({:category}='' OR {:category}='nasajab') AND NOT EXISTS (SELECT 1 FROM records_v2 v WHERE v.source_key='nasajab:' || legacy.id)", stamp, condition))
			continue
		}
		kind := "posts"
		if c == "daily_entries" {
			kind = "daily"
		}
		clauses = append(clauses, fmt.Sprintf("SELECT '%s' AS kind,id,%s AS stamp FROM %s legacy WHERE status={:status} AND ({:category}='' OR {:category}='%s') AND NOT EXISTS (SELECT 1 FROM records_v2 v WHERE v.source_key='%s:' || legacy.id)", c, order, c, kind, c))
	}
	var rows []struct {
		Kind  string `db:"kind"`
		ID    string `db:"id"`
		Stamp string `db:"stamp"`
	}
	err := s.app.DB().NewQuery(strings.Join(clauses, " UNION ALL ") + " ORDER BY stamp DESC,id DESC,kind ASC LIMIT {:limit} OFFSET {:offset}").Bind(dbx.Params{"status": status, "category": category, "limit": size + 1, "offset": offset}).All(&rows)
	if err != nil {
		return nil, false, err
	}
	more := len(rows) > size
	if more {
		rows = rows[:size]
	}
	items := make([]recordsV2Document, 0, len(rows))
	seen := map[string]bool{}
	for _, row := range rows {
		id := row.ID
		if row.Kind != "records_v2" {
			id = row.Kind + ":" + id
		}
		d, err := s.document(id)
		if errors.Is(err, sql.ErrNoRows) {
			continue
		}
		if err != nil {
			return nil, false, err
		}
		if d.Status != status || (category != "" && d.Category != category) || seen[d.ID] {
			continue
		}
		seen[d.ID] = true
		items = append(items, d)
	}
	return items, more, nil
}
func (s *recordsV2Service) projectLegacy(tx core.App, r *core.Record, d *recordsV2Document) error {
	var source *core.Record
	var err error
	if d.LegacySource != nil {
		source, err = tx.FindRecordById(d.LegacySource.Collection, d.LegacySource.ID)
		if err != nil {
			return err
		}
		if d.SourceUpdated != "" && source.GetString("updated") != d.SourceUpdated {
			return errRecordsV2Revision
		}

	} else {
		name := "posts"
		if d.Category == "daily" {
			name = "daily_entries"
		}
		c, err := tx.FindCollectionByNameOrId(name)
		if err != nil {
			return err
		}
		source = core.NewRecord(c)
		title := strings.TrimSpace(strings.SplitN(d.Body, "\n", 2)[0])
		if title == "" {
			title = d.RecordDate + " 기록"
		}
		rr := []rune(title)
		if len(rr) > 100 {
			title = string(rr[:100])
		}
		source.Set("title", title)
		source.Set("slug", "record-"+r.Id)
	}
	if source.Collection().Name == "nasajab" {
		// The original file row and album key remain stable. Rich content is
		// projected into an additive field consumed by album discovery.
		source.Set("content", recordsV2CompatibilityHTML(*d))
		memo := []rune(d.Body)
		if len(memo) > 600 {
			memo = memo[:600]
		}
		source.Set("memo", string(memo))
		source.Set("is_public", d.Status == "published")
		if !strings.HasPrefix(source.GetString("display_at"), d.RecordDate) {
			source.Set("display_at", d.RecordDate+" 00:00:00.000Z")
		}
	} else {
		source.Set("content", recordsV2CompatibilityHTML(*d))
	}
	source.Set("status", d.Status)
	if source.Collection().Name == "daily_entries" {
		source.Set("day_key", d.RecordDate)
	}
	if source.GetString("first_published_at") == "" && d.FirstPublishedAt != "" {
		source.Set("first_published_at", d.FirstPublishedAt)
	}
	if source.GetString("published_at") == "" && d.Status == "published" {
		source.Set("published_at", d.FirstPublishedAt)
	}
	if err = tx.Save(source); err != nil {
		return err
	}
	original := recordsV2FromLegacy(source)
	d.LegacySource = original.LegacySource
	d.SourceUpdated = original.SourceUpdated
	return nil
}
func recordsV2CompatibilityHTML(d recordsV2Document) string {
	var b strings.Builder
	if d.Body != "" {
		b.WriteString("<p>" + strings.ReplaceAll(html.EscapeString(d.Body), "\n", "<br>") + "</p>")
	}
	b.WriteString(d.LegacyHTML)
	for _, a := range d.Attachments {
		src := html.EscapeString(a.URL)
		label := html.EscapeString(a.Name)
		b.WriteString("<figure>")
		switch a.Kind {
		case "image":
			crop := ""
			if a.Crop != nil && a.Crop["enabled"] == true {
				values := []string{}
				for _, key := range []string{"x", "y", "width", "height", "aspect", "pixelWidth"} {
					values = append(values, fmt.Sprint(a.Crop[key]))
				}
				crop = ` data-cwk-image-crop="` + html.EscapeString(strings.Join(values, ",")) + `"`
			}
			b.WriteString(`<img src="` + src + `" alt="` + label + `"` + crop + `>`)
		case "video":
			b.WriteString(`<video controls preload="metadata" playsinline src="` + src + `"></video>`)
		case "audio":
			b.WriteString(`<audio controls preload="metadata" src="` + src + `"></audio>`)
		default:
			b.WriteString(`<a href="` + src + `">` + label + `</a>`)
		}
		if a.Comment != "" {
			b.WriteString("<figcaption>" + strings.ReplaceAll(html.EscapeString(a.Comment), "\n", "<br>") + "</figcaption>")
		}
		b.WriteString("</figure>")
	}
	for _, e := range d.Embeds {
		link := html.EscapeString(e.URL)
		if e.Type == "chatgpt" {
			snapshot, _ := json.Marshal(e.Snapshot)
			b.WriteString(`<div class="cwk-chatgpt-embed" data-cwk-chatgpt-embed="true" data-cwk-chatgpt-snapshot="` + html.EscapeString(string(snapshot)) + `"><a data-cwk-chatgpt-link="true" href="` + link + `">ChatGPT 공유 대화</a>`)
			if e.Snapshot != nil {
				for _, m := range e.Snapshot.Messages {
					b.WriteString(`<p data-role="` + html.EscapeString(m.Role) + `">` + strings.ReplaceAll(html.EscapeString(m.Text), "\n", "<br>") + `</p>`)
				}
			}
			b.WriteString("</div>")
		} else {
			b.WriteString(`<video controls preload="none" src="` + link + `" title="YouTube"></video>`)
		}
	}
	return b.String()
}
func recordsV2AssignID(r *core.Record) {
	if r.Id == "" {
		r.Id = security.RandomStringWithAlphabet(15, "abcdefghijklmnopqrstuvwxyz0123456789")
	}
}

func recordsV2FromNasajab(r *core.Record) recordsV2Document {
	stamp := firstNonEmpty(r.GetString("first_published_at"), r.GetString("display_at"), r.GetString("created"))
	day := firstNonEmpty(r.GetString("display_at"), stamp)
	if len(day) >= 10 {
		day = day[:10]
	}
	status := "draft"
	first := r.GetString("first_published_at")
	if r.GetBool("is_public") {
		status = "published"
		first = stamp
	}
	attachments := []recordsV2Attachment{}
	if name := r.GetString("image"); name != "" {
		attachments = append(attachments, recordsV2Attachment{ID: "nasajab-" + r.Id, URL: siteOrigin + "/api/files/" + r.Collection().Id + "/" + r.Id + "/" + url.PathEscape(name), Name: name, Kind: "image"})
	}
	return recordsV2Document{SchemaVersion: 1, ID: "nasajab:" + r.Id, Category: "nasajab", Body: r.GetString("memo"), Status: status, RecordDate: day, FirstPublishedAt: first, Created: r.GetString("created"), Updated: r.GetString("updated"), SourceUpdated: r.GetString("updated"), Attachments: attachments, Embeds: []recordsV2Embed{}, LegacySource: &recordsV2Source{Collection: "nasajab", ID: r.Id, URL: siteOrigin + "/nasajab/#" + r.Id, SourceURL: r.GetString("source_url")}}
}

// Extend the existing recursive media index rather than replacing its ranking,
// tag IDs, original-image branch, or source identity rules.
func ensureRecordsV2Album(tx core.App) error {
	album, err := tx.FindCollectionByNameOrId("album_items")
	if errors.Is(err, sql.ErrNoRows) {
		return nil
	}
	if err != nil {
		return err
	}
	query := album.ViewQuery
	marker := "), refs("
	if strings.Contains(query, "n.content AS content") && strings.Contains(query, "cwk_native_image") {
		return nil
	}
	pos := strings.Index(query, marker)
	if pos < 0 {
		return fmt.Errorf("album_items sources CTE is unsupported; refusing to overwrite view")
	}
	if !strings.Contains(query, "n.content AS content") {
		query = query[:pos] + `
    UNION ALL
    SELECT 'nasajab' AS source_kind, n.id AS source_id, '' AS source_slug,
      n.memo AS source_title,
      COALESCE(NULLIF(n.first_published_at,''),NULLIF(n.display_at,''),n.created) AS source_published_at,
      n.updated AS source_updated_at, n.content AS content
    FROM nasajab n WHERE n.is_public = TRUE
    ` + query[pos:]
	}
	// Hide an original image from the album when its occurrence is removed,
	// without deleting the nasajab file or changing its tag identity.
	needle := "n.is_public = TRUE AND n.image != ''"
	if !strings.Contains(query, "cwk_native_image") {
		if !strings.Contains(query, needle) {
			return fmt.Errorf("album native image predicate unsupported")
		}
		query = strings.Replace(query, needle, needle+` AND (
          NOT EXISTS (SELECT 1 FROM records_v2 cwk_native_image WHERE source_key='nasajab:' || n.id)
          OR EXISTS (SELECT 1 FROM records_v2 cwk_native_image, json_each(cwk_native_image.document, '$.attachments') a
            WHERE cwk_native_image.source_key='nasajab:' || n.id AND cwk_native_image.status='published'
            AND json_extract(a.value,'$.url') LIKE '%/api/files/%/' || n.id || '/' || n.image)
        )`, 1)
	}
	album.ViewQuery = query
	return tx.Save(album)
}

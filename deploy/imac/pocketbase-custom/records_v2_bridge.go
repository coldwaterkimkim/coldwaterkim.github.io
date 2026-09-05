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
		if (c != "posts" && c != "daily_entries") || !isPocketBaseRecordID(key) {
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
	for _, c := range []string{"posts", "daily_entries"} {
		if _, err := s.app.FindCollectionByNameOrId(c); errors.Is(err, sql.ErrNoRows) {
			continue
		} else if err != nil {
			return nil, false, err
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
		expected := "posts"
		if d.LegacySource.Collection == "daily_entries" {
			expected = "daily"
		}
		if expected != d.Category {
			return fmt.Errorf("Linked record category cannot change")
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
	source.Set("content", recordsV2CompatibilityHTML(*d))
	source.Set("status", d.Status)
	if d.Category == "daily" {
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

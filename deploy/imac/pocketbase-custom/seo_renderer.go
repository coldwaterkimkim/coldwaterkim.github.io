package main

import (
	"encoding/json"
	"fmt"
	stdhtml "html"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
)

const siteOrigin = "https://coldwaterkim.com"

var (
	htmlTagPattern   = regexp.MustCompile(`(?s)<[^>]*>`)
	htmlSpacePattern = regexp.MustCompile(`\s+`)
	imageSrcPattern  = regexp.MustCompile(`(?i)<img[^>]+src=["']([^"']+)["']`)
)

type seoRenderer struct {
	app     core.App
	siteDir string
}

func newSEORenderer(app core.App, siteDir string) *seoRenderer {
	return &seoRenderer{app: app, siteDir: siteDir}
}

func (renderer *seoRenderer) registerRoutes(event *core.ServeEvent) {
	event.Router.GET("/posts/{slug}/", renderer.servePost)
	event.Router.GET("/daily/{day}/", renderer.serveDaily)
	event.Router.GET("/sitemap.xml", renderer.serveSitemap)
}

func (renderer *seoRenderer) servePost(event *core.RequestEvent) error {
	slug, err := url.PathUnescape(event.Request.PathValue("slug"))
	if err != nil || strings.TrimSpace(slug) == "" {
		return event.NotFoundError("Published post not found.", nil)
	}
	record, err := renderer.app.FindFirstRecordByFilter(
		"posts",
		"slug={:slug} && status='published'",
		dbx.Params{"slug": slug},
	)
	if err != nil {
		return event.NotFoundError("Published post not found.", nil)
	}

	template, err := renderer.readTemplate("posts", "view.html")
	if err != nil {
		return event.InternalServerError("Post template is unavailable.", err)
	}

	title := strings.TrimSpace(record.GetString("title"))
	if title == "" {
		title = "글방 기록"
	}
	content := record.GetString("content")
	canonical := siteOrigin + "/posts/" + url.PathEscape(slug) + "/"
	description := strings.TrimSpace(record.GetString("excerpt"))
	if description == "" {
		description = contentDescription(content, title)
	}
	published := firstNonEmpty(record.GetString("published_at"), record.GetString("created"))
	updated := firstNonEmpty(record.GetString("updated"), published)
	body := fmt.Sprintf(
		`<article class="timeline-post" data-post-id="%s"><div class="timeline-post-header"><h2 class="timeline-post-title">%s</h2><div class="timeline-post-meta">Published: %s</div></div><div class="post-content timeline-post-content ql-editor">%s</div></article>`,
		stdhtml.EscapeString(record.Id),
		stdhtml.EscapeString(title),
		stdhtml.EscapeString(published),
		content,
	)
	head := buildArticleHead(title, description, canonical, published, updated, firstImageURL(content))
	page := injectSEOPage(template, title+" — coldwaterkim", head, body)
	event.Response.Header().Set("Cache-Control", "public, max-age=60")
	return event.HTML(http.StatusOK, page)
}

func (renderer *seoRenderer) serveDaily(event *core.RequestEvent) error {
	day := event.Request.PathValue("day")
	if !regexp.MustCompile(`^\d{4}-\d{2}-\d{2}$`).MatchString(day) {
		return event.NotFoundError("Published daily entry not found.", nil)
	}
	records, err := renderer.app.FindRecordsByFilter(
		"daily_entries",
		"day_key={:day} && status='published'",
		"published_at,created,id",
		0,
		0,
		dbx.Params{"day": day},
	)
	if err != nil || len(records) == 0 {
		return renderer.serveDailyClientShell(event, day)
	}

	template, err := renderer.readTemplate("daily", "view.html")
	if err != nil {
		return event.InternalServerError("Daily template is unavailable.", err)
	}

	var body strings.Builder
	var plainContent strings.Builder
	published := ""
	updated := ""
	image := ""
	for _, record := range records {
		title := firstNonEmpty(strings.TrimSpace(record.GetString("title")), day+" 나으 하루")
		content := record.GetString("content")
		plainContent.WriteString(" ")
		plainContent.WriteString(content)
		if published == "" {
			published = firstNonEmpty(record.GetString("published_at"), record.GetString("created"))
		}
		if record.GetString("updated") > updated {
			updated = record.GetString("updated")
		}
		if image == "" {
			image = firstImageURL(content)
		}
		fmt.Fprintf(
			&body,
			`<article id="daily-%s" class="timeline-post" data-daily-id="%s"><div class="timeline-post-header"><h2 class="timeline-post-title">%s</h2><div class="timeline-post-meta">Time: %s</div></div><div class="post-content timeline-post-content ql-editor">%s</div></article>`,
			stdhtml.EscapeString(record.Id),
			stdhtml.EscapeString(record.Id),
			stdhtml.EscapeString(title),
			stdhtml.EscapeString(firstNonEmpty(record.GetString("published_at"), record.GetString("created"))),
			content,
		)
	}

	title := day + "의 하루"
	canonical := siteOrigin + "/daily/" + day + "/"
	description := contentDescription(plainContent.String(), title)
	head := buildArticleHead(title, description, canonical, published, firstNonEmpty(updated, published), image)
	page := injectSEOPage(template, title+" — coldwaterkim", head, body.String())
	event.Response.Header().Set("Cache-Control", "public, max-age=60")
	return event.HTML(http.StatusOK, page)
}

func (renderer *seoRenderer) serveDailyClientShell(event *core.RequestEvent, day string) error {
	template, err := renderer.readTemplate("daily", "view.html")
	if err != nil {
		return event.InternalServerError("Daily template is unavailable.", err)
	}

	page := injectClientShellTitle(template, day+"의 하루 — coldwaterkim")
	event.Response.Header().Set("Cache-Control", "private, no-store")
	event.Response.Header().Set("X-Robots-Tag", "noindex, follow")
	return event.HTML(http.StatusNotFound, page)
}

func (renderer *seoRenderer) serveSitemap(event *core.RequestEvent) error {
	posts, err := renderer.app.FindRecordsByFilter("posts", "status='published'", "-updated", 0, 0)
	if err != nil {
		return event.InternalServerError("Failed to build sitemap.", err)
	}
	daily, err := renderer.app.FindRecordsByFilter("daily_entries", "status='published'", "-day_key,-updated", 0, 0)
	if err != nil {
		return event.InternalServerError("Failed to build sitemap.", err)
	}

	entries := []sitemapEntry{
		{Location: siteOrigin + "/"},
		{Location: siteOrigin + "/posts/index.html"},
		{Location: siteOrigin + "/daily/index.html"},
		{Location: siteOrigin + "/album/index.html"},
		{Location: siteOrigin + "/programs/index.html"},
		{Location: siteOrigin + "/nasajab/index.html"},
		{Location: siteOrigin + "/about.html"},
	}
	for _, record := range posts {
		slug := strings.TrimSpace(record.GetString("slug"))
		if slug == "" {
			continue
		}
		entries = append(entries, sitemapEntry{
			Location: siteOrigin + "/posts/" + url.PathEscape(slug) + "/",
			LastMod:  sitemapDate(firstNonEmpty(record.GetString("updated"), record.GetString("published_at"))),
		})
	}
	days := map[string]string{}
	for _, record := range daily {
		day := strings.TrimSpace(record.GetString("day_key"))
		if day == "" {
			continue
		}
		updated := sitemapDate(firstNonEmpty(record.GetString("updated"), record.GetString("published_at")))
		if updated > days[day] {
			days[day] = updated
		}
	}
	dayKeys := make([]string, 0, len(days))
	for day := range days {
		dayKeys = append(dayKeys, day)
	}
	sort.Sort(sort.Reverse(sort.StringSlice(dayKeys)))
	for _, day := range dayKeys {
		entries = append(entries, sitemapEntry{Location: siteOrigin + "/daily/" + day + "/", LastMod: days[day]})
	}

	event.Response.Header().Set("Content-Type", "application/xml; charset=utf-8")
	event.Response.Header().Set("Cache-Control", "public, max-age=300")
	return event.String(http.StatusOK, buildSitemap(entries))
}

type sitemapEntry struct {
	Location string
	LastMod  string
}

func buildSitemap(entries []sitemapEntry) string {
	var result strings.Builder
	result.WriteString(`<?xml version="1.0" encoding="UTF-8"?>` + "\n")
	result.WriteString(`<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">` + "\n")
	for _, entry := range entries {
		result.WriteString("  <url><loc>" + stdhtml.EscapeString(entry.Location) + "</loc>")
		if entry.LastMod != "" {
			result.WriteString("<lastmod>" + stdhtml.EscapeString(entry.LastMod) + "</lastmod>")
		}
		result.WriteString("</url>\n")
	}
	result.WriteString("</urlset>\n")
	return result.String()
}

func (renderer *seoRenderer) readTemplate(parts ...string) (string, error) {
	data, err := os.ReadFile(filepath.Join(append([]string{renderer.siteDir}, parts...)...))
	return string(data), err
}

func injectSEOPage(template, title, head, body string) string {
	page := strings.Replace(template, "<title>Loading... — coldwaterkim</title>", "<title>"+stdhtml.EscapeString(title)+"</title>", 1)
	page = strings.Replace(page, "<!-- CWK:SEO_HEAD -->", head, 1)
	page = strings.Replace(page, `<meta name="robots" content="noindex,follow" data-legacy-viewer>`, "", 1)
	start := strings.Index(page, "<!-- CWK:SSR_CONTENT_START -->")
	end := strings.Index(page, "<!-- CWK:SSR_CONTENT_END -->")
	if start >= 0 && end > start {
		end += len("<!-- CWK:SSR_CONTENT_END -->")
		page = page[:start] + body + page[end:]
	}
	return page
}

func injectClientShellTitle(template, title string) string {
	return strings.Replace(template, "<title>Loading... — coldwaterkim</title>", "<title>"+stdhtml.EscapeString(title)+"</title>", 1)
}

func buildArticleHead(title, description, canonical, published, updated, image string) string {
	if image == "" {
		image = siteOrigin + "/assets/profile-crop.jpg"
	}
	data := map[string]any{
		"@context":      "https://schema.org",
		"@type":         "BlogPosting",
		"headline":      title,
		"description":   description,
		"url":           canonical,
		"datePublished": published,
		"dateModified":  updated,
		"inLanguage":    "ko-KR",
		"image":         image,
		"author": map[string]any{
			"@type": "Person",
			"name":  "김찬수",
			"url":   siteOrigin + "/about.html",
		},
	}
	jsonLD, _ := json.Marshal(data)
	escape := stdhtml.EscapeString
	return fmt.Sprintf(`
    <meta name="robots" content="index,follow,max-image-preview:large">
    <meta name="description" content="%s">
    <link rel="canonical" href="%s">
    <meta property="og:type" content="article">
    <meta property="og:title" content="%s">
    <meta property="og:description" content="%s">
    <meta property="og:url" content="%s">
    <meta property="og:image" content="%s">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="%s">
    <meta name="twitter:description" content="%s">
    <meta name="twitter:image" content="%s">
    <script type="application/ld+json">%s</script>`, escape(description), escape(canonical), escape(title), escape(description), escape(canonical), escape(image), escape(title), escape(description), escape(image), jsonLD)
}

func contentDescription(content, fallback string) string {
	plain := stdhtml.UnescapeString(htmlTagPattern.ReplaceAllString(content, " "))
	plain = strings.TrimSpace(htmlSpacePattern.ReplaceAllString(plain, " "))
	if plain == "" {
		plain = fallback
	}
	runes := []rune(plain)
	if len(runes) > 155 {
		plain = string(runes[:155]) + "…"
	}
	return plain
}

func firstImageURL(content string) string {
	match := imageSrcPattern.FindStringSubmatch(content)
	if len(match) < 2 {
		return ""
	}
	value := stdhtml.UnescapeString(match[1])
	if strings.HasPrefix(value, "/") {
		return siteOrigin + value
	}
	return value
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return value
		}
	}
	return ""
}

func sitemapDate(value string) string {
	if len(value) >= 10 {
		return value[:10]
	}
	return ""
}

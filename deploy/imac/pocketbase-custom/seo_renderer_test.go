package main

import (
	"strings"
	"testing"
)

func TestInjectSEOPage(t *testing.T) {
	template := `<head><title>Loading... — coldwaterkim</title><!-- CWK:SEO_HEAD --><meta name="robots" content="noindex,follow" data-legacy-viewer></head><main><!-- CWK:SSR_CONTENT_START --><p>loading</p><!-- CWK:SSR_CONTENT_END --></main>`
	result := injectSEOPage(template, "제목 — coldwaterkim", `<link rel="canonical" href="https://coldwaterkim.com/posts/test/">`, `<article>본문</article>`)
	for _, expected := range []string{"제목 — coldwaterkim", `rel="canonical"`, "<article>본문</article>"} {
		if !strings.Contains(result, expected) {
			t.Fatalf("missing %q in rendered page", expected)
		}
	}
	if strings.Contains(result, "data-legacy-viewer") || strings.Contains(result, "loading") {
		t.Fatal("legacy noindex and loading placeholder must be removed")
	}
}

func TestContentDescription(t *testing.T) {
	result := contentDescription(`<p>안녕 <b>세상</b></p>`, "fallback")
	if result != "안녕 세상" {
		t.Fatalf("unexpected description: %q", result)
	}
}

func TestBuildSitemap(t *testing.T) {
	result := buildSitemap([]sitemapEntry{{Location: "https://coldwaterkim.com/posts/a&b/", LastMod: "2026-08-12"}})
	if !strings.Contains(result, "a&amp;b") || !strings.Contains(result, "<lastmod>2026-08-12</lastmod>") {
		t.Fatalf("unexpected sitemap: %s", result)
	}
}

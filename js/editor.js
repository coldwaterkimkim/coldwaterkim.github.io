(function(){
  const TOKEN = () => window.cwkAuth?.getToken();
  const form = document.getElementById('postForm');
  const titleEl = document.getElementById('title');
  const slugEl  = document.getElementById('slug');
  const dateEl  = document.getElementById('date');
  const contentEl = document.getElementById('content');
  const useMarkdownEl = document.getElementById('useMarkdown');
  const previewEl = document.getElementById('preview');
  const result = document.getElementById('result');

  // --- helpers ---
  function today() { return new Date().toISOString().slice(0,10); }
  function slugify(s){
    return s.toLowerCase().trim()
      .replace(/[^a-z0-9\s\-가-힣]/g,'')
      .replace(/\s+/g,'-')
      .replace(/\-+/g,'-');
  }
  function renderPreview() {
    if (!previewEl) return;
    const raw = contentEl.value;
    if (useMarkdownEl?.checked) {
      // Markdown -> HTML (+ sanitize)
      const html = DOMPurify.sanitize(marked.parse(raw || ''), {USE_PROFILES: {html: true}});
      previewEl.innerHTML = html || '<i>(미리보기: 내용 없음)</i>';
    } else {
      // HTML 그대로 (sanitize만)
      const safe = DOMPurify.sanitize(raw || '');
      previewEl.innerHTML = safe || '<i>(미리보기: 내용 없음)</i>';
    }
  }

  // --- init: default date & slug auto-fill ---
  if (dateEl && !dateEl.value) dateEl.value = today();

  // 제목 입력 시 slug 자동 생성/동기화(사용자가 직접 수정하면 그 뒤로는 덮어쓰지 않음)
  let userTouchedSlug = false;
  if (slugEl) {
    slugEl.addEventListener('input', ()=> { userTouchedSlug = slugEl.value.trim().length > 0; });
  }
  if (titleEl) {
    titleEl.addEventListener('input', ()=>{
      if (!userTouchedSlug) slugEl.value = slugify(titleEl.value) || '';
    });
  }

  // 콘텐츠 입력/모드 전환 시 즉시 미리보기
  if (contentEl) contentEl.addEventListener('input', renderPreview);
  if (useMarkdownEl) useMarkdownEl.addEventListener('change', renderPreview);
  renderPreview();

  // --- submit ---
  if(form){
    form.addEventListener('submit', async (e)=>{
      e.preventDefault();
      const title = titleEl.value.trim();
      let slug = (slugEl.value || '').trim() || slugify(title) || `post-${Date.now()}`;
      const date = (dateEl.value || today());
      let contentRaw = contentEl.value;

      // 변환: Markdown 체크되어 있으면 HTML 변환
      let finalHtml = contentRaw;
      if (useMarkdownEl?.checked) {
        finalHtml = DOMPurify.sanitize(marked.parse(contentRaw), {USE_PROFILES: {html: true}});
      } else {
        finalHtml = DOMPurify.sanitize(contentRaw);
      }

      if (result) result.textContent = 'Publishing...';

      try {
        const r = await fetch(`${window.API_BASE}/publish`, {
          method:'POST',
          headers:{
            'Content-Type':'application/json',
            'Authorization': `Bearer ${TOKEN()}`
          },
          body: JSON.stringify({ title, slug, date, content: finalHtml })
        });
        const data = await r.json().catch(()=>({}));
        if (!r.ok) {
          if (result) result.textContent = `Failed: ${data.error||r.status}`;
          return;
        }
        if (result) result.innerHTML =
          `✅ Published: <a target="_blank" href="posts/${slug}.html">posts/${slug}.html</a>`;
      } catch (err) {
        if (result) result.textContent = 'Network error';
      }
    });
  }
})();

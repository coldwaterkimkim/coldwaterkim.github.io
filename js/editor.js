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
  // --- TAB/SHIFT+TAB in textarea: indent/outdent ---
  function handleTabIndent(e) {
    if (e.key !== 'Tab') return;
    const el = contentEl;
    const start = el.selectionStart;
    const end   = el.selectionEnd;
  
    // 선택된 텍스트
    const value = el.value;
    const selected = value.slice(start, end);
    const isMultiLine = selected.includes('\n');
    const INDENT = '\t'; // 탭 대신 공백 2칸(원하면 '\t')
  
    e.preventDefault();
  
    if (!isMultiLine) {
      // 단일 커서 또는 단일행 선택
      el.value = value.slice(0, start) + INDENT + value.slice(end);
      const pos = start + INDENT.length;
      el.setSelectionRange(pos, pos);
      renderPreview();
      return;
    }
  
    // 여러 줄 선택
    const lines = selected.split('\n');
    if (e.shiftKey) {
      // outdent
      const newLines = lines.map(line =>
        line.startsWith(INDENT) ? line.slice(INDENT.length) :
        line.startsWith('\t') ? line.slice(1) : line
      );
      const replaced = newLines.join('\n');
      el.value = value.slice(0, start) + replaced + value.slice(end);
  
      // 커서/선택 영역 보정
      const removedPerLine = lines.reduce((n, line) => n + (line.startsWith(INDENT) || line.startsWith('\t') ? 1 : 0), 0);
      const delta = removedPerLine * INDENT.length;
      el.setSelectionRange(start, start + replaced.length);
    } else {
      // indent
      const newLines = lines.map(line => INDENT + line);
      const replaced = newLines.join('\n');
      el.value = value.slice(0, start) + replaced + value.slice(end);
      el.setSelectionRange(start, start + replaced.length);
    }
    renderPreview();
  }

if (contentEl) contentEl.addEventListener('keydown', handleTabIndent);

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

(function(){
  const TOKEN = ()=> window.cwkAuth?.getToken();
  const form = document.getElementById('postForm');
  const result = document.getElementById('result');

  function slugify(s){
    return s.toLowerCase().trim()
      .replace(/[^a-z0-9\s-가-힣]/g,'')
      .replace(/\s+/g,'-')
      .replace(/-+/g,'-');
  }

  if(form){
    form.addEventListener('submit', async (e)=>{
      e.preventDefault();
      const title = document.getElementById('title').value.trim();
      let slug = document.getElementById('slug').value.trim();
      const date = document.getElementById('date').value || new Date().toISOString().slice(0,10);
      const content = document.getElementById('content').value;
      if(!slug) slug = slugify(title) || `post-${Date.now()}`;

      result.textContent = 'Publishing...';

      const r = await fetch(`${window.API_BASE}/publish`, {
        method:'POST', headers:{'Content-Type':'application/json', 'Authorization': `Bearer ${TOKEN()}`},
        body: JSON.stringify({ title, slug, date, content })
      });
      const data = await r.json().catch(()=>({}));
      if(!r.ok){ result.textContent = `Failed: ${data.error||r.status}`; return; }
      result.innerHTML = `✅ Published: <a target="_blank" href="posts/${slug}.html">posts/${slug}.html</a>`;
    });
  }
})();

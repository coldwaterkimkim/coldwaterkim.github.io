(function(){
  const TOKEN_KEY = 'cwk_admin_token';
  const loginPanel = document.getElementById('loginPanel');
  const editorPanel = document.getElementById('editorPanel');

  function hasToken(){ return !!localStorage.getItem(TOKEN_KEY); }
  function setToken(t){ localStorage.setItem(TOKEN_KEY, t); }
  function getToken(){ return localStorage.getItem(TOKEN_KEY); }

  window.cwkAuth = { hasToken, getToken };

  const form = document.getElementById('loginForm');
  if (form) {
    form.addEventListener('submit', async (e)=>{
      e.preventDefault();
      const password = document.getElementById('password').value;
      const r = await fetch(`${window.API_BASE}/login`, {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ password })
      });
      if(!r.ok){ alert('Login failed'); return; }
      const { token } = await r.json();
      setToken(token);
      loginPanel.style.display='none';
      editorPanel.style.display='block';
    });
  }

  // 초기 표시 전환
  if (hasToken()) {
    if(loginPanel) loginPanel.style.display='none';
    if(editorPanel) editorPanel.style.display='block';
  }
})();

// 90s 느낌 나는 방문자 카운터 (브라우저별 로컬)
(function() {
  var el = document.getElementById('hitCounter');
  if (!el) return;
  var key = 'cwk_hit_counter';
  var n = parseInt(localStorage.getItem(key) || '0', 10) + 1;
  localStorage.setItem(key, String(n));
  el.textContent = ("0000000" + n).slice(-7);
})();

// Guestbook 저장/로드 (localStorage)
function saveGuestbookEntry() {
  var name = document.getElementById('name').value.trim();
  var message = document.getElementById('message').value.trim();
  if (!name || !message) return false;
  var list = JSON.parse(localStorage.getItem('cwk_guestbook') || '[]');
  list.unshift({ name: name, message: message, ts: new Date().toISOString() });
  localStorage.setItem('cwk_guestbook', JSON.stringify(list));
  document.getElementById('guestbookForm').reset();
  renderGuestbook();
  return false; // prevent submit
}

function renderGuestbook() {
  var box = document.getElementById('guestbookEntries');
  if (!box) return;
  var list = JSON.parse(localStorage.getItem('cwk_guestbook') || '[]');
  if (list.length === 0) {
    box.innerHTML = '<p>No entries yet. Be the first!</p>';
    return;
  }
  box.innerHTML = list.map(function(e) {
    var d = new Date(e.ts);
    return '<div class="entry">\n' +
      '<div class="meta">[' + d.toLocaleString() + '] by <b>' + escapeHtml(e.name) + '</b></div>\n' +
      '<div>' + linkify(escapeHtml(e.message)) + '</div>\n' +
    '</div>';
  }).join('');
}

function escapeHtml(str) {
  return str.replace(/[&<>\"']/g, function(m) {
    return ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;','\'':'&#39;'}[m]);
  });
}

function linkify(str) {
  return str.replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank">$1</a>');
}

// 초기 렌더
renderGuestbook();

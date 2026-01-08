import { supabase } from './supabase.js';

// 90s 느낌 나는 방문자 카운터 (브라우저별 로컬)
(function () {
  var el = document.getElementById('hitCounter');
  if (!el) return;
  var key = 'cwk_hit_counter';
  var n = parseInt(localStorage.getItem(key) || '0', 10) + 1;
  localStorage.setItem(key, String(n));
  el.textContent = ("0000000" + n).slice(-7);
})();

// Guestbook Logic
const guestbookForm = document.getElementById('guestbookForm');
const guestbookEntries = document.getElementById('guestbookEntries');

if (guestbookForm) {
  guestbookForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('name').value.trim();
    const message = document.getElementById('message').value.trim();
    if (!name || !message) return;

    const { error } = await supabase.from('guestbook').insert({ name, message });
    if (error) {
      alert('Error signing guestbook: ' + error.message);
    } else {
      guestbookForm.reset();
      loadGuestbook();
    }
  });

  loadGuestbook();
}

async function loadGuestbook() {
  if (!guestbookEntries) return;
  guestbookEntries.innerHTML = 'Loading entries...';

  const { data, error } = await supabase
    .from('guestbook')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    guestbookEntries.innerHTML = 'Failed to load entries.';
    return;
  }

  if (!data || data.length === 0) {
    guestbookEntries.innerHTML = '<p>No entries yet. Be the first!</p>';
    return;
  }

  // Check if admin to show delete buttons
  const { data: { session } } = await supabase.auth.getSession();
  const isAdmin = !!session;

  guestbookEntries.innerHTML = data.map(e => {
    const d = new Date(e.created_at).toLocaleString();

    // Inline delete handler requires global function if not attaching listeners
    // Using delegation below instead.
    const del = isAdmin ? `<button class="del-btn" data-id="${e.id}" style="font-size:10px; color:red; border:1px solid red; background:white; cursor:pointer; margin-left:5px;">[del]</button>` : '';

    return `<div class="entry" style="margin-bottom:10px; border-bottom:1px dashed #ccc; padding-bottom:5px;">
      <div class="meta" style="font-size:12px; color:#555;">[${d}] by <b>${escapeHtml(e.name)}</b> ${del}</div>
      <div>${linkify(escapeHtml(e.message))}</div>
    </div>`;
  }).join('');

  // Attach delete handlers
  if (isAdmin) {
    document.querySelectorAll('.del-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('Delete this entry?')) return;
        const id = btn.getAttribute('data-id');
        const { error } = await supabase.from('guestbook').delete().eq('id', id);
        if (error) alert('Delete failed: ' + error.message);
        else loadGuestbook();
      });
    });
  }
}

// Recent Posts Logic (for index.html)
const recentPostsTable = document.getElementById('recent-posts-table');
if (recentPostsTable) {
  loadRecentPosts();
}

async function loadRecentPosts() {
  const { data, error } = await supabase
    .from('posts')
    .select('title, slug, date')
    .order('date', { ascending: false })
    .limit(3);

  if (data && data.length > 0) {
    // append rows
    data.forEach(p => {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td><a href="posts/view.html?slug=${p.slug}">${p.title}</a></td><td align="right">${p.date}</td>`;
      recentPostsTable.appendChild(tr);
    });

    // Add 'View All' link
    const trAll = document.createElement('tr');
    trAll.innerHTML = `<td><a href="posts/index.html">모든 글 보기</a></td><td align="right">→</td>`;
    recentPostsTable.appendChild(trAll);
  } else {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td colspan="2">No posts yet.</td>`;
    recentPostsTable.appendChild(tr);
  }
}

function escapeHtml(str) {
  return str.replace(/[&<>\"']/g, function (m) {
    return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '\"': '&quot;', '\'': '&#39;' }[m]);
  });
}

function linkify(str) {
  return str.replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank">$1</a>');
}

// Inline Editing Logic
(async function initInlineEditing() {
  const editableElements = document.querySelectorAll('[data-editable="true"]');
  if (editableElements.length === 0) return;

  // 1. Load saved settings
  const { data: settings } = await supabase.from('site_settings').select('key, value');
  if (settings) {
    settings.forEach(item => {
      const el = document.querySelector(`[data-key="${item.key}"]`);
      if (el) el.innerHTML = item.value; // Allow HTML in settings
    });
  }

  // 2. Check if admin
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return; // Not admin, stop here.

  // 3. Enable editing
  editableElements.forEach(el => {
    el.contentEditable = "true";
    el.style.border = "1px dashed red"; // Visual cue for admin
    el.title = "Click to edit";

    el.addEventListener('blur', async () => {
      const key = el.getAttribute('data-key');
      const value = el.innerHTML;

      // Save to DB
      const { error } = await supabase.from('site_settings').upsert({ key, value }, { onConflict: 'key' });
      if (error) {
        console.error('Failed to save setting', error);
        el.style.border = "1px solid red";
      } else {
        el.style.border = "1px dashed red"; // Saved
        const originalBg = el.style.backgroundColor;
        el.style.backgroundColor = '#ccffcc';
        setTimeout(() => el.style.backgroundColor = originalBg, 500);
      }
    });
  });
})();

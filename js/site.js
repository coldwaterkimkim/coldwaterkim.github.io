/**
 * coldwaterkim.com - Public Site JavaScript
 * PocketBase 연동 버전
 */

import { getPublishedPosts, getGuestbookEntries, addGuestbookEntry, getSetting, setSetting, isLoggedIn, deleteGuestbookEntry, guestbookDisplayDate, sortGuestbookEntriesForDisplay, postDisplayDate, recordVisitAndGetStats, setVisitorTodayMinimum, formatDate, escapeHtml, cmsErrorMessage } from './pb.js';

// ─────────────────────────────────────────────────────────
// BGM 자동 재생 시도
// ─────────────────────────────────────────────────────────
(function initBgm() {
  const audio = document.querySelector('[data-bgm]');
  if (!audio) return;

  const tryPlay = () => {
    audio.play().catch(() => {
      // 브라우저가 소리 있는 autoplay를 막으면 첫 사용자 입력 때 다시 시도한다.
    });
  };

  tryPlay();
  document.addEventListener('click', tryPlay, { once: true });
  document.addEventListener('keydown', tryPlay, { once: true });
})();

// ─────────────────────────────────────────────────────────
// 방문자 카운터 (PocketBase 30분 세션)
// ─────────────────────────────────────────────────────────
(async function initCounter() {
  const totalEl = document.getElementById('hitCounter');
  const todayEl = document.getElementById('todayCounter');
  if (!totalEl) return;

  const renderStats = (stats) => {
    totalEl.textContent = String(stats.total).padStart(7, '0');
    if (todayEl) {
      todayEl.textContent = String(stats.today).padStart(4, '0');
    }
  };

  const renderAdminControls = (stats) => {
    if (!todayEl || !isLoggedIn()) return;

    const controls = document.createElement('span');
    controls.className = 'counter-admin-controls';

    const makeButton = (label, delta) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'counter-admin-btn';
      button.textContent = label;
      button.title = `TODAY 표시값 ${delta > 0 ? '올리기' : '내리기'}`;

      button.addEventListener('click', async () => {
        const next = delta > 0
          ? stats.today + 1
          : Math.max(stats.realToday, stats.today - 1);

        controls.querySelectorAll('button').forEach(btn => {
          btn.disabled = true;
        });

        try {
          stats = await setVisitorTodayMinimum(stats.dayKey, next);
          renderStats(stats);
        } catch (e) {
          console.warn('Visitor counter edit failed:', cmsErrorMessage(e));
        } finally {
          controls.querySelectorAll('button').forEach(btn => {
            btn.disabled = false;
          });
        }
      });

      return button;
    };

    controls.append(' ');
    controls.append(makeButton('▲', 1));
    controls.append(makeButton('▼', -1));
    todayEl.insertAdjacentElement('afterend', controls);
  };

  try {
    const stats = await recordVisitAndGetStats();
    renderStats(stats);
    renderAdminControls(stats);
  } catch (e) {
    console.warn('Visitor counter failed:', cmsErrorMessage(e));
  }
})();

// ─────────────────────────────────────────────────────────
// 사이트 설정 로드 (인라인 편집 가능한 요소들)
// ─────────────────────────────────────────────────────────
(async function initSettings() {
  const editableElements = document.querySelectorAll('[data-editable="true"]');
  if (editableElements.length === 0) return;

  // 저장된 설정 불러오기
  for (const el of editableElements) {
    const key = el.getAttribute('data-key');
    if (!key) continue;

    try {
      const value = await getSetting(key);
      if (value) {
        el.innerHTML = value;
      }
    } catch (e) {
      // 설정이 없으면 기본값 유지
    }
  }

  // 관리자인 경우 인라인 편집 활성화
  if (!isLoggedIn()) return;

  editableElements.forEach(el => {
    el.contentEditable = 'true';
    el.title = '클릭해서 편집 (변경 후 포커스 아웃 시 저장)';

    el.addEventListener('blur', async () => {
      const key = el.getAttribute('data-key');
      const value = el.innerHTML;

      try {
        await setSetting(key, value);
        el.style.backgroundColor = '#ccffcc';
        setTimeout(() => el.style.backgroundColor = '', 500);
      } catch (e) {
        console.error('Setting save failed:', e);
        el.style.backgroundColor = '#ffcccc';
      }
    });
  });
})();

// ─────────────────────────────────────────────────────────
// 최근 글 목록 (index.html)
// ─────────────────────────────────────────────────────────
(async function initRecentPosts() {
  const table = document.getElementById('recent-posts-table');
  if (!table) return;

  try {
    const result = await getPublishedPosts(1, 3);

    if (result.items.length === 0) {
      const tr = document.createElement('tr');
      tr.innerHTML = '<td colspan="2">아직 글이 없습니다.</td>';
      table.appendChild(tr);
      return;
    }

    result.items.forEach(post => {
      const tr = document.createElement('tr');
      const date = postDisplayDate(post);
      tr.innerHTML = `
        <td><a href="posts/view.html?slug=${post.slug}">${escapeHtml(post.title)}</a></td>
        <td class="date-cell" align="right">${formatDate(date)}</td>
      `;
      table.appendChild(tr);
    });

    // 모든 글 보기 링크
    const trAll = document.createElement('tr');
    trAll.innerHTML = '<td><a href="posts/index.html">모든 글 보기</a></td><td class="date-cell" align="right">→</td>';
    table.appendChild(trAll);
  } catch (e) {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td colspan="2">${escapeHtml(cmsErrorMessage(e))}</td>`;
    table.appendChild(tr);
  }
})();

// ─────────────────────────────────────────────────────────
// 홈 방명록 미리보기 (index.html)
// ─────────────────────────────────────────────────────────
(async function initGuestbookPreview() {
  const table = document.getElementById('guestbook-preview-table');
  if (!table) return;

  try {
    const result = await getGuestbookEntries(1, 200);
    const entries = sortGuestbookEntriesForDisplay(result.items);
    const rows = Array.from(table.querySelectorAll('tr')).slice(1);
    rows.forEach(row => row.remove());

    if (entries.length === 0) {
      const tr = document.createElement('tr');
      tr.innerHTML = '<td colspan="2">아직 방명록이 없습니다. 첫 번째로 인사해주세요!</td>';
      table.appendChild(tr);
      return;
    }

    entries.slice(0, 5).forEach(entry => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><b>${escapeHtml(entry.name)}</b>: ${linkify(escapeHtml(entry.message))}</td>
        <td class="date-cell" align="right">${formatDate(guestbookDisplayDate(entry))}</td>
      `;
      table.appendChild(tr);
    });
  } catch (e) {
    const rows = Array.from(table.querySelectorAll('tr')).slice(1);
    rows.forEach(row => row.remove());
    const tr = document.createElement('tr');
    tr.innerHTML = `<td colspan="2">${escapeHtml(cmsErrorMessage(e))}</td>`;
    table.appendChild(tr);
  }
})();

// ─────────────────────────────────────────────────────────
// 방명록 (guestbook.html)
// ─────────────────────────────────────────────────────────
const guestbookForm = document.getElementById('guestbookForm');
const guestbookEntries = document.getElementById('guestbookEntries');

if (guestbookForm) {
  guestbookForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const nameEl = document.getElementById('guestName');
    const messageEl = document.getElementById('message');
    const typedName = nameEl?.value.trim() || '';
    const name = typedName || await nextGuestbookName();
    const message = messageEl.value.trim();

    if (!message) {
      alert('메시지를 입력해주세요.');
      return;
    }

    try {
      await addGuestbookEntry(name, message);
      guestbookForm.reset();
      loadGuestbook();
    } catch (e) {
      alert('방명록 작성 실패: ' + cmsErrorMessage(e));
    }
  });

  loadGuestbook();
}

async function loadGuestbook() {
  if (!guestbookEntries) return;
  guestbookEntries.innerHTML = '<p>불러오는 중...</p>';

  try {
    const result = await getGuestbookEntries(1, 200);
    const entries = sortGuestbookEntriesForDisplay(result.items);

    if (entries.length === 0) {
      guestbookEntries.innerHTML = '<p>아직 방명록이 없습니다. 첫 번째로 인사해주세요!</p>';
      return;
    }

    const isAdmin = isLoggedIn();

    guestbookEntries.innerHTML = entries.map(entry => {
      const dateLabel = formatDate(guestbookDisplayDate(entry));
      const metaPrefix = dateLabel ? `[${dateLabel}] ` : '';
      const deleteBtn = isAdmin
        ? `<button class="del-btn" data-id="${entry.id}" style="font-size:10px; color:red; border:1px solid red; background:white; cursor:pointer; margin-left:5px;">[삭제]</button>`
        : '';

      return `
        <div class="entry">
          <div class="meta">
            ${metaPrefix}by <b>${escapeHtml(entry.name)}</b>
            ${deleteBtn}
          </div>
          <div>${linkify(escapeHtml(entry.message))}</div>
        </div>
      `;
    }).join('');

    // 삭제 버튼 이벤트
    if (isAdmin) {
      document.querySelectorAll('.del-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
          if (!confirm('이 방명록을 삭제하시겠습니까?')) return;
          try {
            await deleteGuestbookEntry(btn.dataset.id);
            loadGuestbook();
          } catch (e) {
            alert('삭제 실패: ' + cmsErrorMessage(e));
          }
        });
      });
    }
  } catch (e) {
    guestbookEntries.innerHTML = `<p>${escapeHtml(cmsErrorMessage(e))}</p>`;
  }
}

async function nextGuestbookName() {
  const result = await getGuestbookEntries(1, 200);
  const maxNumber = result.items.reduce((max, entry) => {
    const match = String(entry.name || '').match(/^익명의 누군가(\d+)$/);
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);
  return `익명의 누군가${maxNumber + 1}`;
}

// URL 링크 변환
function linkify(str) {
  return str.replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank">$1</a>');
}

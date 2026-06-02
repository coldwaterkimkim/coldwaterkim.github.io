/**
 * coldwaterkim.com - Public Site JavaScript
 * PocketBase 연동 버전
 */

import { getPublishedPosts, getGuestbookEntries, addGuestbookEntry, getSetting, setSetting, isLoggedIn, deleteGuestbookEntry, guestbookDisplayDate, sortGuestbookEntriesForDisplay, postDisplayDate, recordVisitAndGetStats, setVisitorTodayMinimum, formatDate, escapeHtml, cmsErrorMessage, uploadMedia, getMediaUrl } from './pb.js';

// ─────────────────────────────────────────────────────────
// 프로필 사진 + BGM 설정
// ─────────────────────────────────────────────────────────
const PROFILE_PHOTO_SETTING_KEY = 'profile_photo_url';
const BGM_URL_SETTING_KEY = 'bgm_audio_url';
const BGM_TITLE_SETTING_KEY = 'bgm_audio_title';
let spaNavigationToken = 0;

(async function initProfileMedia() {
  const photo = document.querySelector('.profile-photo');
  const audio = document.querySelector('[data-bgm]');
  const player = audio?.closest('.mini-player');
  const trackTitle = ensureTrackTitle(player, audio);

  await loadProfileMediaSettings(photo, audio, trackTitle);

  if (audio) {
    initBgmAutoplay(audio);
  }

  if (!isLoggedIn()) return;

  initProfilePhotoUpload(photo);
  initBgmUpload(player, audio, trackTitle);
})();

initSpaRouter();
initDynamicContent();

async function loadProfileMediaSettings(photo, audio, trackTitle) {
  const tasks = [];

  if (photo) {
    tasks.push((async () => {
      const savedPhotoUrl = await getSetting(PROFILE_PHOTO_SETTING_KEY);
      if (savedPhotoUrl) {
        photo.src = savedPhotoUrl;
      }
    })());
  }

  if (audio) {
    tasks.push((async () => {
      const [savedBgmUrl, savedBgmTitle] = await Promise.all([
        getSetting(BGM_URL_SETTING_KEY),
        getSetting(BGM_TITLE_SETTING_KEY),
      ]);

      if (savedBgmUrl) {
        audio.src = savedBgmUrl;
        audio.load();
      }

      if (trackTitle) {
        trackTitle.textContent = savedBgmTitle || defaultBgmTitle(audio);
      }
    })());
  }

  try {
    await Promise.all(tasks);
  } catch (e) {
    console.warn('Profile media settings failed:', cmsErrorMessage(e));
  }
}

function ensureTrackTitle(player, audio) {
  if (!player || !audio) return null;

  let trackTitle = player.querySelector('[data-bgm-title]');
  if (!trackTitle) {
    const marquee = document.createElement('marquee');
    marquee.className = 'track-title-marquee';
    marquee.direction = 'left';
    marquee.scrollAmount = 2;
    marquee.setAttribute('aria-label', 'current background music');

    const prefix = document.createTextNode('♫ ');
    trackTitle = document.createElement('span');
    trackTitle.setAttribute('data-bgm-title', '');
    trackTitle.textContent = defaultBgmTitle(audio);
    const suffix = document.createTextNode(' ♫');

    marquee.append(prefix, trackTitle, suffix);
    player.insertBefore(marquee, audio);
  }

  return trackTitle;
}

function initBgmAutoplay(audio) {
  audio.autoplay = true;
  audio.loop = true;

  const tryPlay = () => {
    audio.play().catch(() => {
      // 브라우저가 소리 있는 autoplay를 막으면 첫 사용자 입력 때 다시 시도한다.
    });
  };

  tryPlay();
  if (audio.dataset.bgmAutoplayBound === 'true') return;

  audio.dataset.bgmAutoplayBound = 'true';
  document.addEventListener('click', tryPlay, { once: true });
  document.addEventListener('keydown', tryPlay, { once: true });
}

function initProfilePhotoUpload(photo) {
  if (!photo) return;

  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.hidden = true;
  document.body.appendChild(input);

  photo.classList.add('profile-photo--editable');
  photo.tabIndex = 0;
  photo.title = 'OWNER MODE: 클릭해서 프로필 사진 바꾸기';

  photo.addEventListener('click', () => input.click());
  photo.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      input.click();
    }
  });

  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('이미지 파일만 올릴 수 있어요.');
      return;
    }

    setMediaBusy(photo, true);
    try {
      const media = await uploadMedia(file, 'coldwaterkim profile photo', 'Profile photo');
      const url = getMediaUrl(media, media.file);
      await setSetting(PROFILE_PHOTO_SETTING_KEY, url);
      photo.src = url;
      flashSaved(photo);
    } catch (e) {
      alert('프로필 사진 저장 실패: ' + cmsErrorMessage(e));
    } finally {
      setMediaBusy(photo, false);
    }
  });
}

function initBgmUpload(player, audio, trackTitle) {
  if (!player || !audio) return;

  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'audio/mpeg,.mp3';
  input.hidden = true;
  document.body.appendChild(input);

  const ownerRow = document.createElement('div');
  ownerRow.className = 'bgm-owner-row';

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'owner-btn bgm-owner-btn';
  button.textContent = 'MP3 바꾸기';

  const status = document.createElement('span');
  status.className = 'bgm-upload-status';
  status.setAttribute('aria-live', 'polite');

  ownerRow.append(button, status);
  player.appendChild(ownerRow);

  button.addEventListener('click', () => input.click());

  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;

    if (!isMp3(file)) {
      alert('MP3 파일만 올릴 수 있어요.');
      return;
    }

    button.disabled = true;
    status.textContent = '업로드 중...';

    try {
      const media = await uploadMedia(file, file.name, 'Home BGM');
      const url = getMediaUrl(media, media.file);
      const title = file.name;

      await Promise.all([
        setSetting(BGM_URL_SETTING_KEY, url),
        setSetting(BGM_TITLE_SETTING_KEY, title),
      ]);

      audio.src = url;
      audio.load();
      if (trackTitle) {
        trackTitle.textContent = title;
      }
      initBgmAutoplay(audio);
      status.textContent = '저장됨';
      setTimeout(() => status.textContent = '', 1600);
    } catch (e) {
      status.textContent = '실패';
      alert('MP3 저장 실패: ' + cmsErrorMessage(e));
    } finally {
      button.disabled = false;
    }
  });
}

function defaultBgmTitle(audio) {
  const src = audio?.currentSrc || audio?.getAttribute('src') || audio?.querySelector('source')?.getAttribute('src') || 'bgm.mp3';
  return fileNameFromUrl(src) || 'bgm.mp3';
}

function fileNameFromUrl(value) {
  try {
    const url = new URL(value, window.location.href);
    return decodeURIComponent(url.pathname.split('/').pop() || '');
  } catch (e) {
    return String(value || '').split('/').pop() || '';
  }
}

function isMp3(file) {
  return file.type === 'audio/mpeg' || /\.mp3$/i.test(file.name);
}

function setMediaBusy(el, isBusy) {
  el.classList.toggle('is-media-uploading', isBusy);
}

function flashSaved(el) {
  el.classList.add('is-media-saved');
  setTimeout(() => el.classList.remove('is-media-saved'), 700);
}

// ─────────────────────────────────────────────────────────
// SPA-like 내부 라우팅: shell/BGM은 유지하고 오른쪽 content만 교체
// ─────────────────────────────────────────────────────────
function initSpaRouter() {
  if (window.__coldwaterkimSpaRouterReady) return;
  window.__coldwaterkimSpaRouterReady = true;

  document.addEventListener('click', (event) => {
    const link = event.target.closest('a[href]');
    if (!link || event.defaultPrevented || !shouldHandleSpaLink(link, event)) return;

    event.preventDefault();
    navigateSpa(link.href);
  });

  window.addEventListener('popstate', () => {
    navigateSpa(window.location.href, { historyMode: 'replace', restoreScroll: true });
  });
}

function shouldHandleSpaLink(link, event) {
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return false;
  if (link.target && link.target !== '_self') return false;
  if (link.hasAttribute('download')) return false;

  const rawHref = link.getAttribute('href') || '';
  if (!rawHref || rawHref.startsWith('#') || rawHref.startsWith('mailto:') || rawHref.startsWith('tel:')) return false;
  if (/^javascript:/i.test(rawHref)) return false;

  const url = new URL(link.href, window.location.href);
  if (url.origin !== window.location.origin) return false;
  if (url.pathname.startsWith('/admin/') || url.pathname.startsWith('/assets/')) return false;
  if (!url.pathname.endsWith('/') && !url.pathname.endsWith('.html')) return false;

  if (url.pathname === window.location.pathname && url.search === window.location.search) {
    return false;
  }

  return true;
}

async function navigateSpa(href, options = {}) {
  const token = ++spaNavigationToken;
  const url = new URL(href, window.location.href);
  const content = document.querySelector('.content');
  if (!content) {
    window.location.href = url.href;
    return;
  }

  content.classList.add('is-spa-loading');

  try {
    const response = await fetch(url.href, { credentials: 'same-origin' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const html = await response.text();
    if (token !== spaNavigationToken) return;

    const nextDoc = new DOMParser().parseFromString(html, 'text/html');
    const nextContent = nextDoc.querySelector('.content');
    if (!nextContent) throw new Error('content 영역을 찾을 수 없음');

    const historyMode = options.historyMode || 'push';
    if (historyMode === 'replace') {
      history.replaceState({}, '', url.href);
    } else {
      history.pushState({}, '', url.href);
    }

    document.title = nextDoc.title || document.title;
    document.body.className = nextDoc.body.className;
    updatePersistentShell(nextDoc);

    content.innerHTML = nextContent.innerHTML;
    await runPageModules(nextDoc, url);
    await initDynamicContent(content);

    if (!options.restoreScroll) {
      window.scrollTo(0, 0);
    }
  } catch (error) {
    console.warn('SPA navigation failed, falling back to full load:', error);
    window.location.href = url.href;
  } finally {
    content.classList.remove('is-spa-loading');
  }
}

function updatePersistentShell(nextDoc) {
  const currentLogin = document.querySelector('.secret-login');
  const nextLogin = nextDoc.querySelector('.secret-login');
  if (currentLogin && nextLogin) {
    currentLogin.href = nextLogin.href;
  }
}

async function runPageModules(nextDoc, url) {
  const scripts = Array.from(nextDoc.querySelectorAll('script[type="module"]'))
    .filter(script => shouldRunFetchedModule(script, url));

  for (const script of scripts) {
    await appendSpaModuleScript(script, url);
  }
}

function shouldRunFetchedModule(script, pageUrl) {
  const src = script.getAttribute('src') || '';
  if (!src) return true;

  const srcUrl = new URL(src, pageUrl);
  return !/\/js\/site\.js$|\/assets\/site-[\w-]+\.js$|\/assets\/pb-[\w-]+\.js$|pocketbase/i.test(srcUrl.pathname);
}

function appendSpaModuleScript(script, pageUrl) {
  return new Promise((resolve, reject) => {
    const nextScript = document.createElement('script');
    nextScript.type = 'module';

    if (script.src) {
      const srcUrl = new URL(script.getAttribute('src') || script.src, pageUrl);
      const cacheKey = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      if (srcUrl.searchParams.has('html-proxy')) {
        srcUrl.hash = `spa-${cacheKey}`;
      } else {
        srcUrl.searchParams.set('spa', cacheKey);
      }
      nextScript.src = srcUrl.href;
    } else {
      nextScript.textContent = script.textContent;
    }

    nextScript.addEventListener('load', resolve, { once: true });
    nextScript.addEventListener('error', () => reject(new Error(`module load failed: ${nextScript.src || 'inline'}`)), { once: true });
    document.body.appendChild(nextScript);

    if (!script.src) {
      requestAnimationFrame(() => {
        nextScript.remove();
        resolve();
      });
    } else {
      nextScript.addEventListener('load', () => nextScript.remove(), { once: true });
    }
  });
}

async function initDynamicContent(scope = document) {
  await Promise.all([
    initSettings(scope),
    initRecentPosts(scope),
    initGuestbookPreview(scope),
  ]);
  initGuestbookPage(scope);
}

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
async function initSettings(scope = document) {
  const editableElements = Array.from(scope.querySelectorAll('[data-editable="true"]'))
    .filter(el => el.dataset.settingsReady !== 'true');
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
    el.dataset.settingsReady = 'true';
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
}

// ─────────────────────────────────────────────────────────
// 최근 글 목록 (index.html)
// ─────────────────────────────────────────────────────────
async function initRecentPosts(scope = document) {
  const table = scope.querySelector('#recent-posts-table');
  if (!table) return;
  if (table.dataset.recentPostsReady === 'true') return;
  table.dataset.recentPostsReady = 'true';

  const rows = Array.from(table.querySelectorAll('tr')).slice(1);
  rows.forEach(row => row.remove());

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
}

// ─────────────────────────────────────────────────────────
// 홈 방명록 미리보기 (index.html)
// ─────────────────────────────────────────────────────────
async function initGuestbookPreview(scope = document) {
  const table = scope.querySelector('#guestbook-preview-table');
  if (!table) return;
  if (table.dataset.guestbookPreviewReady === 'true') return;
  table.dataset.guestbookPreviewReady = 'true';

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
}

// ─────────────────────────────────────────────────────────
// 방명록 (guestbook.html)
// ─────────────────────────────────────────────────────────
function initGuestbookPage(scope = document) {
  const guestbookForm = scope.querySelector('#guestbookForm');
  const guestbookEntries = scope.querySelector('#guestbookEntries');
  if (!guestbookForm || !guestbookEntries) return;
  if (guestbookForm.dataset.guestbookReady === 'true') return;
  guestbookForm.dataset.guestbookReady = 'true';

  guestbookForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const nameEl = guestbookForm.querySelector('#guestName');
    const messageEl = guestbookForm.querySelector('#message');
    const typedName = nameEl?.value.trim() || '';
    const name = typedName || await nextGuestbookName();
    const message = messageEl?.value.trim() || '';

    if (!message) {
      alert('메시지를 입력해주세요.');
      return;
    }

    try {
      await addGuestbookEntry(name, message);
      guestbookForm.reset();
      loadGuestbook(guestbookEntries);
    } catch (e) {
      alert('방명록 작성 실패: ' + cmsErrorMessage(e));
    }
  });

  loadGuestbook(guestbookEntries);
}

async function loadGuestbook(guestbookEntries) {
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
      guestbookEntries.querySelectorAll('.del-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
          if (!confirm('이 방명록을 삭제하시겠습니까?')) return;
          try {
            await deleteGuestbookEntry(btn.dataset.id);
            loadGuestbook(guestbookEntries);
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

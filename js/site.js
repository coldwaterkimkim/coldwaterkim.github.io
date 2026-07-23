/**
 * coldwaterkim.com - Public Site JavaScript
 * PocketBase 연동 버전
 */

import {
  getPublishedPosts,
  getPublishedPostTimeline,
  getPublishedDailyTimeline,
  getPublishedPrograms,
  getPublishedProgramTimeline,
  getPublishedNasajab,
  getPublishedNasajabTimeline,
  getGuestbookEntries,
  addGuestbookEntry,
  getSetting,
  setSetting,
  isLoggedIn,
  deleteGuestbookEntry,
  guestbookDisplayDate,
  sortGuestbookEntriesForDisplay,
  postDisplayDate,
  dailyEntryDayKey,
  dailyEntryDisplayDate,
  programDisplayDate,
  nasajabDisplayDate,
  getKstDateKey,
  recordVisitAndGetStats,
  excludeCurrentVisitorSession,
  getVisitorDisplayStats,
  setVisitorTodayMinimum,
  formatDate,
  escapeHtml,
  cmsErrorMessage,
  uploadMedia,
  getMediaUrl
} from './pb.js';
import {
  defaultSidebarProfileRows,
  renderProfileDetailTables,
  sidebarProfileRowsFromDocument
} from './profile-data.js';
import {
  ENTRY_LAST_ADMITTED_STORAGE_KEY,
  ENTRY_SESSION_ADMITTED_STORAGE_KEY,
  entryWebmasterLineKey,
  normalizeEntryLastAdmittedAt,
  summarizeEntryUpdates,
} from './entry-gate-logic.mjs';

const SITE_VERSION = typeof __SITE_VERSION__ !== 'undefined' ? __SITE_VERSION__ : 'dev';
const VERSION_MANIFEST_PATH = '/site-version.json';
const VERSION_CHECK_INTERVAL_MS = 60 * 1000;
const VERSION_CHECK_THROTTLE_MS = 10 * 1000;
let lastVersionCheckAt = 0;

// ─────────────────────────────────────────────────────────
// 프로필 사진 + BGM 설정
// ─────────────────────────────────────────────────────────
const PROFILE_PHOTO_SETTING_KEY = 'profile_photo_url';
const BGM_URL_SETTING_KEY = 'bgm_audio_url';
const BGM_TITLE_SETTING_KEY = 'bgm_audio_title';
const BGM_PLAYLIST_SETTING_KEY = 'bgm_playlist';
const ABOUT_DOCUMENT_SETTING_KEY = 'about_wiki_document';
let spaNavigationToken = 0;
let activeSidebarProfileRows = defaultSidebarProfileRows();
const entryGateController = initEntryGate();

(async function initProfileMedia() {
  const photo = document.querySelector('.profile-photo');
  const audio = document.querySelector('[data-bgm]');
  const player = audio?.closest('.mini-player');
  const trackTitle = ensureTrackTitle(player, audio);

  await loadProfileMediaSettings(photo, audio, trackTitle);

  if (audio && entryGateController) {
    entryGateController.connectAudio(audio, getBgmPlaylist(audio));
  } else if (audio) {
    initBgmAutoplay(audio);
  }

  if (!isLoggedIn()) return;

  initProfilePhotoUpload(photo);
  initBgmUpload(player, audio, trackTitle);
})();

initSpaRouter();
initSiteVersionRefresh();
initSharedProfileDetails();
initDynamicContent();

window.addEventListener('coldwaterkim:profile-data-updated', (event) => {
  const doc = event.detail?.document;
  if (!doc) return;
  renderSidebarProfileRows(sidebarProfileRowsFromDocument(doc));
});

window.addEventListener('coldwaterkim:content-ready', () => {
  renderProfileDetailTables(document, activeSidebarProfileRows);
});

// ─────────────────────────────────────────────────────────
// 필수 BGM 입장 게이트
// ─────────────────────────────────────────────────────────
function initEntryGate() {
  const root = document.documentElement;
  if (!root.classList.contains('entry-gate-pending')) return null;

  const siteShell = Array.from(document.body.children)
    .find(element => element.tagName === 'CENTER');
  const gate = document.createElement('main');
  gate.id = 'entryGate';
  gate.className = 'entry-gate';
  gate.setAttribute('aria-labelledby', 'entryGateTitle');
  gate.innerHTML = `
    <marquee class="entry-gate-marquee" behavior="alternate" scrollamount="3">
      ★ YOU HAVE REACHED coldwaterkim's HOME PAGE ★
    </marquee>
    <table class="entry-gate-table" border="1" cellspacing="0" cellpadding="0">
      <tr>
        <th class="entry-gate-banner">WELCOME, STRANGER! · MUSIC REQUIRED</th>
      </tr>
      <tr>
        <td class="entry-gate-content">
          <h1 id="entryGateTitle">coldwaterkim's HOME PAGE</h1>

          <table class="entry-gate-info-table" cellspacing="0" cellpadding="0">
            <tr>
              <td class="entry-gate-bgm-row">
                <img src="/assets/entry-speaker.png" class="entry-gate-speaker" width="32" height="32" alt="">
                <span class="entry-gate-label">TODAY'S BGM:</span>
                <span data-entry-bgm-title>BGM 불러오는 중...</span>
              </td>
            </tr>
            <tr>
              <td class="entry-gate-webmaster-row">
                <span class="entry-gate-label">WEBMASTER SAYS:</span>
                <span class="entry-gate-day" data-entry-day></span>
                <strong data-entry-webmaster-line>오늘의 한 줄 불러오는 중...</strong>
                <span class="entry-gate-owner-tools" data-entry-owner-tools hidden>
                  <button type="button" class="owner-btn" data-entry-edit-line>[오늘 한 줄 수정]</button>
                  <span data-entry-owner-status></span>
                </span>
              </td>
            </tr>
            <tr>
              <td class="entry-gate-update-row">
                <strong class="entry-gate-update-heading" data-entry-update-heading>UPDATE CHECKING...</strong>
                <a href="/" data-entry-update-link hidden></a>
                <span data-entry-update-text>새 소식 확인 중...</span>
              </td>
            </tr>
          </table>

          <div class="entry-gate-action">
            <button type="button" class="entry-gate-enter" data-entry-enter disabled>
              [ BGM 준비 중... ]
            </button>
            <p class="entry-gate-status" data-entry-status role="status" aria-live="polite">
              음악 연결을 확인하고 있음.
            </p>
            <p class="entry-gate-warning">
              ※ 음악을 원하지 않으면 브라우저의 뒤로가기를 누르시오.
            </p>
          </div>

          <p class="entry-gate-footer">© coldwaterkim — no silence beyond this point</p>
        </td>
      </tr>
    </table>
  `;
  document.body.insertBefore(gate, document.body.firstChild);
  root.classList.remove('entry-gate-pending');
  root.classList.add('entry-gate-open');

  if (siteShell) {
    siteShell.inert = true;
    siteShell.setAttribute('aria-hidden', 'true');
  }

  const state = {
    audio: null,
    tracks: [],
    entering: false,
    admittedInThisTab: entrySessionGet(ENTRY_SESSION_ADMITTED_STORAGE_KEY) === '1',
    previousAdmittedAt: normalizeEntryLastAdmittedAt(entryStorageGet(ENTRY_LAST_ADMITTED_STORAGE_KEY)),
  };
  const enterButton = gate.querySelector('[data-entry-enter]');
  const status = gate.querySelector('[data-entry-status]');
  const bgmTitle = gate.querySelector('[data-entry-bgm-title]');
  const updateLink = gate.querySelector('[data-entry-update-link]');

  const completeEntry = (destination = '') => {
    const admittedAt = new Date().toISOString();
    entryStorageSet(ENTRY_LAST_ADMITTED_STORAGE_KEY, admittedAt);
    entrySessionSet(ENTRY_SESSION_ADMITTED_STORAGE_KEY, '1');
    window.__coldwaterkimEntryAdmitted = true;
    root.dataset.entryAdmitted = 'true';
    root.classList.remove('entry-gate-open');

    if (siteShell) {
      siteShell.inert = false;
      siteShell.removeAttribute('aria-hidden');
    }

    gate.remove();
    if (!destination) {
      window.scrollTo(0, 0);
    }
    initBgmAutoplay(state.audio);
    window.dispatchEvent(new CustomEvent('coldwaterkim:entry-admitted', {
      detail: { admittedAt },
    }));

    if (destination) {
      navigateSpa(destination);
    }
  };

  const beginEntry = async (destination = '') => {
    if (state.entering || !state.audio || state.tracks.length === 0) return;

    state.entering = true;
    enterButton.disabled = true;
    enterButton.textContent = '[ BGM 연결 중... ]';
    status.textContent = '음악이 실제로 재생되면 문이 열림.';

    try {
      const playback = state.audio.play();
      await playback;
      completeEntry(destination);
    } catch (error) {
      state.entering = false;
      enterButton.disabled = false;
      enterButton.textContent = '[ ENTER — BGM WILL PLAY ]';
      status.textContent = 'BGM 재생 실패. 버튼을 다시 누르시오.';
    }
  };

  enterButton.addEventListener('click', () => {
    beginEntry();
  });

  updateLink.addEventListener('click', (event) => {
    event.preventDefault();
    beginEntry(updateLink.href);
  });

  initEntryGateDailyLine(gate);
  initEntryGateUpdates(gate, state.previousAdmittedAt);

  return {
    async connectAudio(audio, tracks) {
      state.audio = audio;
      state.tracks = Array.isArray(tracks) ? tracks : [];
      const firstTrack = state.tracks[0];

      if (!firstTrack || !audio?.src) {
        bgmTitle.textContent = 'BGM 준비 실패';
        enterButton.disabled = true;
        enterButton.textContent = '[ 입장 불가 ]';
        status.textContent = '필수 BGM을 불러오지 못했음. 새로고침하시오.';
        return;
      }

      bgmTitle.textContent = entryBgmDisplayTitle(firstTrack.title || defaultBgmTitle(audio));
      enterButton.disabled = false;
      enterButton.textContent = state.admittedInThisTab
        ? '[ RESUME — BGM WILL PLAY ]'
        : '[ ENTER — BGM WILL PLAY ]';
      status.textContent = state.admittedInThisTab
        ? '이 탭에서 입장한 기록 확인. BGM 재연결 중...'
        : '입장 버튼을 누르면 음악이 즉시 시작됨.';

      if (!state.admittedInThisTab) {
        enterButton.focus({ preventScroll: true });
        return;
      }

      try {
        const playback = audio.play();
        await playback;
        completeEntry();
      } catch (error) {
        status.textContent = '새로고침으로 BGM이 멈췄음. RESUME을 누르시오.';
        enterButton.focus({ preventScroll: true });
      }
    },
  };
}

async function initEntryGateDailyLine(gate) {
  const dayKey = getKstDateKey();
  const settingKey = entryWebmasterLineKey(dayKey);
  const dayEl = gate.querySelector('[data-entry-day]');
  const lineEl = gate.querySelector('[data-entry-webmaster-line]');
  const ownerTools = gate.querySelector('[data-entry-owner-tools]');
  const editButton = gate.querySelector('[data-entry-edit-line]');
  const ownerStatus = gate.querySelector('[data-entry-owner-status]');
  dayEl.textContent = `(${dayKey.replaceAll('-', '.')})`;

  const [dailyLine, fallbackLine] = await Promise.all([
    getSetting(settingKey),
    getSetting('profile_today'),
  ]);
  lineEl.textContent = plainSettingText(dailyLine || fallbackLine) || '오늘의 한 줄은 아직 없음.';

  if (!isLoggedIn()) return;
  ownerTools.hidden = false;
  editButton.addEventListener('click', async () => {
    const nextLine = window.prompt('오늘의 한 줄', lineEl.textContent)?.trim();
    if (!nextLine) return;

    editButton.disabled = true;
    ownerStatus.textContent = ' 저장 중...';
    try {
      await setSetting(settingKey, nextLine);
      lineEl.textContent = nextLine;
      ownerStatus.textContent = ' 저장됨';
    } catch (error) {
      ownerStatus.textContent = ' 저장 실패';
    } finally {
      editButton.disabled = false;
    }
  });
}

async function initEntryGateUpdates(gate, lastAdmittedAt) {
  const heading = gate.querySelector('[data-entry-update-heading]');
  const link = gate.querySelector('[data-entry-update-link]');
  const text = gate.querySelector('[data-entry-update-text]');

  try {
    const [posts, dailyEntries, programs, nasajabItems] = await Promise.all([
      getPublishedPostTimeline(),
      getPublishedDailyTimeline(),
      getPublishedProgramTimeline(),
      getPublishedNasajabTimeline(),
    ]);
    const summary = summarizeEntryUpdates([
      {
        label: '글방',
        unit: '개',
        items: posts.map(post => ({
          title: post.title || '(제목 없음)',
          href: `/posts/view.html?slug=${encodeURIComponent(post.slug || '')}`,
          updatedAt: post.updated || postDisplayDate(post),
        })),
      },
      {
        label: '나으 하루',
        unit: '개',
        items: dailyEntries.map(entry => ({
          title: `${formatDate(dailyEntryDayKey(entry))}의 하루`,
          href: `/daily/view.html?day=${encodeURIComponent(dailyEntryDayKey(entry))}`,
          updatedAt: entry.updated || dailyEntryDisplayDate(entry),
        })),
      },
      {
        label: '프로그램실',
        unit: '개',
        items: programs.map(program => ({
          title: program.title || '(이름 없음)',
          href: `/programs/view.html?slug=${encodeURIComponent(program.slug || '')}`,
          updatedAt: program.updated || programDisplayDate(program),
        })),
      },
      {
        label: '나사잡',
        unit: '개',
        items: nasajabItems.map(item => ({
          title: item.title || item.caption || item.memo || '(제목 없음)',
          href: item.id ? `/nasajab/index.html#${encodeURIComponent(item.id)}` : '/nasajab/index.html',
          updatedAt: item.updated || nasajabDisplayDate(item),
        })),
      },
    ], lastAdmittedAt);

    heading.textContent = summary.heading;
    if (summary.href) {
      link.href = summary.href;
      link.textContent = summary.text;
      link.hidden = false;
      text.hidden = true;
    } else {
      text.textContent = summary.text;
      text.hidden = false;
      link.hidden = true;
    }
  } catch (error) {
    heading.textContent = 'UPDATE CHECK FAILED';
    text.textContent = '새 소식 확인 실패. 그래도 BGM은 준비 중.';
    text.hidden = false;
    link.hidden = true;
  }
}

function plainSettingText(value) {
  const container = document.createElement('div');
  container.innerHTML = String(value || '');
  return (container.textContent || '').trim();
}

function entryStorageGet(key) {
  try {
    return localStorage.getItem(key);
  } catch (error) {
    return null;
  }
}

function entryStorageSet(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch (error) {
    // 저장소가 막혀도 이번 입장은 계속 허용한다.
  }
}

function entrySessionGet(key) {
  try {
    return sessionStorage.getItem(key);
  } catch (error) {
    return null;
  }
}

function entrySessionSet(key, value) {
  try {
    sessionStorage.setItem(key, value);
  } catch (error) {
    // 저장소가 막히면 다음 전체 로드에서 다시 입장 게이트를 보여준다.
  }
}

function initSiteVersionRefresh() {
  if (window.__coldwaterkimVersionRefreshReady) return;
  window.__coldwaterkimVersionRefreshReady = true;
  if (!window.location.origin || window.location.protocol === 'file:') return;

  window.setTimeout(() => {
    checkSiteVersionAndRefresh('load');
  }, 2500);

  window.setInterval(() => {
    checkSiteVersionAndRefresh('interval');
  }, VERSION_CHECK_INTERVAL_MS);

  window.addEventListener('focus', () => {
    checkSiteVersionAndRefresh('focus');
  });

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      checkSiteVersionAndRefresh('visibility');
    }
  });

  window.addEventListener('pageshow', (event) => {
    if (event.persisted) {
      checkSiteVersionAndRefresh('pageshow');
    }
  });
}

async function checkSiteVersionAndRefresh(reason = 'manual') {
  const now = Date.now();
  if (reason !== 'interval' && now - lastVersionCheckAt < VERSION_CHECK_THROTTLE_MS) return;
  lastVersionCheckAt = now;

  try {
    const manifestUrl = new URL(VERSION_MANIFEST_PATH, window.location.origin);
    manifestUrl.searchParams.set('t', String(now));

    const response = await fetch(manifestUrl.href, {
      cache: 'no-store',
      credentials: 'same-origin',
    });
    if (!response.ok) return;

    const manifest = await response.json();
    const latestVersion = String(manifest?.version || '').trim();
    if (!latestVersion || latestVersion === SITE_VERSION) return;

    refreshForSiteVersion(latestVersion);
  } catch (e) {
    // 버전 확인은 편의 기능이다. 실패해도 기존 페이지 읽기는 막지 않는다.
  }
}

function refreshForSiteVersion(latestVersion) {
  const refreshKey = `cwk-version-refresh:${SITE_VERSION}->${latestVersion}`;
  try {
    if (sessionStorage.getItem(refreshKey) === '1') return;
    sessionStorage.setItem(refreshKey, '1');
  } catch (e) {
    // sessionStorage가 막힌 브라우저에서도 한 번은 새 URL로 이동한다.
  }

  const nextUrl = new URL(window.location.href);
  if (nextUrl.searchParams.get('v') === latestVersion) return;
  nextUrl.searchParams.set('v', latestVersion);
  window.location.replace(nextUrl.href);
}

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
      const playlist = await getSavedBgmPlaylist(audio);
      setBgmPlaylist(audio, trackTitle, playlist, 0);
    })());
  }

  try {
    await Promise.all(tasks);
  } catch (e) {
    console.warn('Profile media settings failed:', cmsErrorMessage(e));
  }
}

async function initSharedProfileDetails() {
  renderSidebarProfileRows(defaultSidebarProfileRows());

  try {
    const saved = await getSetting(ABOUT_DOCUMENT_SETTING_KEY);
    const doc = parseProfileDocument(saved);
    if (doc) {
      renderSidebarProfileRows(sidebarProfileRowsFromDocument(doc));
    }
  } catch (e) {
    console.warn('Shared profile data failed:', cmsErrorMessage(e));
  }
}

function parseProfileDocument(value) {
  if (!value) return null;

  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch (e) {
    console.warn('Profile document parse failed:', e);
    return null;
  }
}

function renderSidebarProfileRows(rows) {
  activeSidebarProfileRows = rows;
  renderProfileDetailTables(document, rows);
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
  audio.loop = getBgmPlaylist(audio).length <= 1;
  const player = audio.closest('.mini-player');
  const prompt = ensureBgmPrompt(player, audio);

  const tryPlay = async () => {
    if (!audio.currentSrc && !audio.src) return;

    try {
      await audio.play();
      setBgmPromptVisible(prompt, false);
    } catch (e) {
      // 브라우저가 소리 있는 autoplay를 막으면 버튼과 첫 사용자 입력으로 다시 시도한다.
      setBgmPromptVisible(prompt, true);
    }
  };

  tryPlay();
  if (audio.dataset.bgmAutoplayBound === 'true') return;

  audio.dataset.bgmAutoplayBound = 'true';
  document.addEventListener('pointerdown', tryPlay, { once: true });
  document.addEventListener('keydown', tryPlay, { once: true });
}

function ensureBgmPrompt(player, audio) {
  if (!player || !audio) return null;

  let prompt = player.querySelector('[data-bgm-prompt]');
  if (!prompt) {
    prompt = document.createElement('div');
    prompt.className = 'bgm-start-row';
    prompt.hidden = true;
    prompt.setAttribute('data-bgm-prompt', '');

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'bgm-start-btn';
    button.textContent = 'BGM ON';

    const note = document.createElement('span');
    note.className = 'bgm-start-note';
    note.textContent = ' 브라우저가 자동재생을 막았음';

    prompt.append(button, note);
    player.appendChild(prompt);
  }

  const button = prompt.querySelector('button');
  if (button && button.dataset.bgmPromptReady !== 'true') {
    button.dataset.bgmPromptReady = 'true';
    button.addEventListener('click', async () => {
      try {
        await audio.play();
        setBgmPromptVisible(prompt, false);
      } catch (e) {
        setBgmPromptVisible(prompt, true);
      }
    });
  }

  return prompt;
}

function setBgmPromptVisible(prompt, isVisible) {
  if (!prompt) return;
  prompt.hidden = !isVisible;
}

async function getSavedBgmPlaylist(audio) {
  const [savedBgmPlaylist, savedBgmUrl, savedBgmTitle] = await Promise.all([
    getSetting(BGM_PLAYLIST_SETTING_KEY),
    getSetting(BGM_URL_SETTING_KEY),
    getSetting(BGM_TITLE_SETTING_KEY),
  ]);

  return normalizeBgmPlaylist(savedBgmPlaylist, savedBgmUrl, savedBgmTitle, audio);
}

function normalizeBgmPlaylist(rawPlaylist, legacyUrl, legacyTitle, audio) {
  const playlist = parseBgmPlaylist(rawPlaylist);
  const legacyTrack = normalizeBgmTrack({
    url: legacyUrl,
    title: legacyTitle || fileNameFromUrl(legacyUrl || ''),
  });

  if (playlist.length > 0) {
    return legacyTrack && !playlist.some(track => bgmTrackKey(track) === bgmTrackKey(legacyTrack))
      ? dedupeBgmTracks([legacyTrack, ...playlist])
      : playlist;
  }

  if (legacyTrack) {
    return [legacyTrack];
  }

  const fallbackSrc = audio?.currentSrc || audio?.getAttribute('src') || audio?.querySelector('source')?.getAttribute('src') || '';
  return normalizeBgmTracks([{
    url: fallbackSrc,
    title: fileNameFromUrl(fallbackSrc),
  }]);
}

function parseBgmPlaylist(rawPlaylist) {
  if (!rawPlaylist) return [];

  try {
    const parsed = JSON.parse(rawPlaylist);
    return normalizeBgmTracks(Array.isArray(parsed) ? parsed : []);
  } catch (e) {
    console.warn('BGM playlist parse failed:', e);
    return [];
  }
}

function normalizeBgmTracks(values = []) {
  return dedupeBgmTracks(values.map(normalizeBgmTrack).filter(Boolean));
}

function normalizeBgmTrack(value) {
  if (!value) return null;

  if (typeof value === 'string') {
    const url = value.trim();
    return url ? {
      url,
      title: fileNameFromUrl(url) || 'bgm.mp3',
      uploadedAt: '',
    } : null;
  }

  const url = String(value.url || value.src || '').trim();
  if (!url) return null;

  return {
    url,
    title: String(value.title || fileNameFromUrl(url) || 'bgm.mp3').trim(),
    uploadedAt: String(value.uploadedAt || value.created || '').trim(),
  };
}

function dedupeBgmTracks(tracks = []) {
  const seen = new Set();
  const result = [];

  tracks.forEach((track) => {
    const key = bgmTrackKey(track);
    if (!key || seen.has(key)) return;
    seen.add(key);
    result.push(track);
  });

  return result;
}

function bgmTrackKey(track) {
  try {
    return new URL(track?.url || '', window.location.href).href;
  } catch (e) {
    return String(track?.url || '');
  }
}

function getBgmPlaylist(audio) {
  return Array.isArray(audio?._bgmPlaylist) ? audio._bgmPlaylist : [];
}

function setBgmPlaylist(audio, trackTitle, playlist, startIndex = 0) {
  if (!audio) return;

  const tracks = normalizeBgmTracks(playlist);
  const index = Math.max(0, Math.min(startIndex, tracks.length - 1));
  audio._bgmPlaylist = tracks;
  audio._bgmTrackTitle = trackTitle || null;
  audio.loop = tracks.length <= 1;

  bindBgmPlaylist(audio);

  if (tracks.length > 0) {
    loadBgmTrack(audio, index);
    return;
  }

  if (trackTitle) {
    trackTitle.textContent = defaultBgmTitle(audio);
  }
}

function bindBgmPlaylist(audio) {
  if (!audio || audio.dataset.bgmPlaylistBound === 'true') return;

  audio.dataset.bgmPlaylistBound = 'true';
  audio.addEventListener('ended', () => {
    advanceBgmTrack(audio);
  });
}

function loadBgmTrack(audio, index) {
  const playlist = getBgmPlaylist(audio);
  const track = playlist[index];
  if (!track) return;

  audio._bgmTrackIndex = index;
  const nextUrl = track.url;
  const currentUrl = audio.currentSrc || audio.src || '';

  if (bgmTrackKey({ url: currentUrl }) !== bgmTrackKey(track)) {
    audio.src = nextUrl;
    audio.load();
  }

  if (audio._bgmTrackTitle) {
    audio._bgmTrackTitle.textContent = track.title || defaultBgmTitle(audio);
  }
}

async function advanceBgmTrack(audio) {
  const playlist = getBgmPlaylist(audio);
  if (playlist.length <= 1) return;

  const nextIndex = ((audio._bgmTrackIndex || 0) + 1) % playlist.length;
  loadBgmTrack(audio, nextIndex);

  const prompt = ensureBgmPrompt(audio.closest('.mini-player'), audio);
  try {
    await audio.play();
    setBgmPromptVisible(prompt, false);
  } catch (e) {
    setBgmPromptVisible(prompt, true);
  }
}

function prependBgmTrack(track, playlist) {
  return dedupeBgmTracks([track, ...normalizeBgmTracks(playlist)]);
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
  button.textContent = 'MP3 추가';

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
      const newTrack = {
        url,
        title: file.name,
        uploadedAt: new Date().toISOString(),
      };
      const savedPlaylist = await getSavedBgmPlaylist(audio);
      const nextPlaylist = prependBgmTrack(newTrack, savedPlaylist.length > 0 ? savedPlaylist : getBgmPlaylist(audio));

      await Promise.all([
        setSetting(BGM_PLAYLIST_SETTING_KEY, JSON.stringify(nextPlaylist)),
        setSetting(BGM_URL_SETTING_KEY, url),
        setSetting(BGM_TITLE_SETTING_KEY, newTrack.title),
      ]);

      setBgmPlaylist(audio, trackTitle, nextPlaylist, 0);
      initBgmAutoplay(audio);
      status.textContent = `추가됨 (${nextPlaylist.length}곡)`;
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

function entryBgmDisplayTitle(value) {
  return String(value || '').replace(/\.(mp3|m4a|aac|ogg|wav)$/i, '');
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
    const fetchUrl = new URL(url.href);
    fetchUrl.searchParams.set('spa', SITE_VERSION);

    const response = await fetch(fetchUrl.href, {
      credentials: 'same-origin',
      cache: 'no-store',
    });
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
  initHomeOwnerTools(scope);
  initGuestbookPage(scope);
}

function initHomeOwnerTools(scope = document) {
  const tools = scope.querySelector('#homeOwnerTools');
  if (!tools || tools.dataset.ownerToolsReady === 'true') return;
  tools.dataset.ownerToolsReady = 'true';

  if (!isLoggedIn()) {
    tools.replaceChildren();
    return;
  }

  tools.innerHTML = `
    <div class="owner-bar home-owner-bar">
      <b>OWNER MODE</b> ·
      <a class="owner-btn home-write-btn" href="/admin/write.html">통합 글쓰기</a>
      <span class="note">글방 / 나으 하루 / 프로그램실 중 골라서 발행</span>
    </div>
  `;
}

// ─────────────────────────────────────────────────────────
// 방문자 카운터 (PocketBase 30분 세션)
// ─────────────────────────────────────────────────────────
(async function initCounter() {
  const bannerStatusEl = document.getElementById('visitorBannerStatus');
  let totalEl = document.getElementById('hitCounter');
  let todayEl = document.getElementById('todayCounter');
  if (!bannerStatusEl && !totalEl) return;

  const isOwnerMode = isLoggedIn();
  if (!isOwnerMode) {
    try {
      await recordVisitAndGetStats();
    } catch (e) {
      console.warn('Visitor counter failed:', cmsErrorMessage(e));
    }
    return;
  }

  if (bannerStatusEl && !totalEl) {
    bannerStatusEl.innerHTML = `
      <span class="hit">VISITORS:</span>
      TOTAL <span id="hitCounter" class="counter-digits">0000000</span>
      TODAY <span id="todayCounter" class="counter-digits counter-digits--today">0000</span>
    `;
    totalEl = document.getElementById('hitCounter');
    todayEl = document.getElementById('todayCounter');
  }

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
    await excludeCurrentVisitorSession();
  } catch (e) {
    console.warn('Owner visitor session cleanup failed:', cmsErrorMessage(e));
  }

  try {
    const stats = await getVisitorDisplayStats();
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
  const tables = [
    {
      selector: '#recent-posts-table',
      readyKey: 'recentPostsReady',
      empty: '아직 글방 글이 없습니다.',
      load: () => getPublishedPosts(1, 3),
      toRow: post => ({
        title: post.title || '(제목 없음)',
        url: `posts/view.html?slug=${encodeURIComponent(post.slug || '')}`,
        date: postDisplayDate(post)
      })
    },
    {
      selector: '#recent-daily-table',
      readyKey: 'recentDailyReady',
      empty: '아직 나으 하루가 없습니다.',
      load: async () => ({
        items: groupDailyEntriesByDay(await getPublishedDailyTimeline()).slice(0, 3)
      }),
      toRow: day => ({
        title: dailyPreviewTitle(day),
        url: `daily/view.html?day=${encodeURIComponent(day.dayKey)}`,
        date: day.dayKey
      })
    },
    {
      selector: '#recent-programs-table',
      readyKey: 'recentProgramsReady',
      empty: '아직 프로그램이 없습니다.',
      load: () => getPublishedPrograms(1, 3),
      toRow: program => ({
        title: program.title || '(이름 없음)',
        url: `programs/view.html?slug=${encodeURIComponent(program.slug || '')}`,
        date: programDisplayDate(program)
      })
    },
    {
      selector: '#recent-nasajab-table',
      readyKey: 'recentNasajabReady',
      empty: '아직 나사잡 항목이 없습니다.',
      load: () => getPublishedNasajab(1, 3),
      toRow: item => ({
        title: item.title || item.caption || item.memo || '(제목 없음)',
        url: item.id ? `nasajab/index.html#${encodeURIComponent(item.id)}` : 'nasajab/index.html',
        date: nasajabDisplayDate(item)
      })
    }
  ];

  await Promise.all(tables.map(config => initRecentTable(scope, config)));
}

function groupDailyEntriesByDay(entries = []) {
  const groups = new Map();

  entries.forEach(entry => {
    const dayKey = dailyEntryDayKey(entry);
    if (!groups.has(dayKey)) {
      groups.set(dayKey, {
        dayKey,
        entries: [],
        latestDate: dailyEntryDisplayDate(entry)
      });
    }

    const group = groups.get(dayKey);
    group.entries.push(entry);
    if (dateTimestamp(dailyEntryDisplayDate(entry)) > dateTimestamp(group.latestDate)) {
      group.latestDate = dailyEntryDisplayDate(entry);
    }
  });

  return Array.from(groups.values()).sort((a, b) => {
    const byDay = String(b.dayKey).localeCompare(String(a.dayKey));
    if (byDay !== 0) return byDay;
    return dateTimestamp(b.latestDate) - dateTimestamp(a.latestDate);
  });
}

function dailyPreviewTitle(day) {
  const count = day.entries.length;
  return `${formatDate(day.dayKey)}의 하루${count > 1 ? ` (${count}개)` : ''}`;
}

function dateTimestamp(value) {
  const n = Date.parse(value || '');
  return Number.isFinite(n) ? n : 0;
}

async function initRecentTable(scope, config) {
  const table = scope.querySelector(config.selector);
  if (!table) return;
  if (table.dataset[config.readyKey] === 'true') return;
  table.dataset[config.readyKey] = 'true';

  const rows = Array.from(table.querySelectorAll('tr')).slice(1);
  rows.forEach(row => row.remove());

  try {
    const result = await config.load();
    const items = result.items || [];

    if (items.length === 0) {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td colspan="2">${escapeHtml(config.empty)}</td>`;
      table.appendChild(tr);
      return;
    }

    items.slice(0, 3).forEach(item => {
      const row = config.toRow(item);
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><a href="${escapeAttribute(row.url)}">${escapeHtml(row.title)}</a></td>
        <td class="date-cell" align="right">${formatDate(row.date)}</td>
      `;
      table.appendChild(tr);
    });
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

function escapeAttribute(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// URL 링크 변환
function linkify(str) {
  return str.replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank">$1</a>');
}

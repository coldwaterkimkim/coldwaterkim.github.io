/**
 * coldwaterkim.com - Public Site JavaScript
 * PocketBase 연동 버전
 */

import {
  getPublishedPostSummaryTimeline,
  getPublishedDailySummaryTimeline,
  getPublishedNasajabSummaryTimeline,
  getAnsweredGuestbookSummaryTimeline,
  getAlbumItemTimeline,
  getGuestbookEntries,
  addGuestbookEntry,
  saveGuestbookReply,
  clearGuestbookReply,
  getSetting,
  getSettingStrict,
  setSetting,
  isLoggedIn,
  deleteGuestbookEntry,
  guestbookDisplayDate,
  sortGuestbookEntriesForDisplay,
  postDisplayDate,
  dailyEntryDayKey,
  dailyEntryDisplayDate,
  nasajabDisplayDate,
  getKstDateKey,
  recordVisitAndGetStats,
  initAnonymousAnalytics,
  trackAnalyticsEvent,
  analyticsPageKey,
  excludeCurrentVisitorSession,
  getVisitorDisplayStats,
  setVisitorTodayMinimum,
  formatDate,
  escapeHtml,
  cmsErrorMessage,
  uploadMedia,
  trimBgmMedia,
  getMediaUrl,
  deleteMediaIfUnreferenced
} from './pb.js';
import { buildArchiveEntries } from './archive-logic.mjs';
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
import {
  BGM_TIME_ZONE,
  activeBgmTimeSlot,
  bgmMediaRecordId,
  bgmMinuteInTimeZone,
  bgmSlotEndMinute,
  formatBgmMinute,
  normalizeBgmSchedule,
  remapBgmScheduleTrack,
  randomBgmCandidateIndex,
  scheduledBgmTrackIndexes,
} from './bgm-playlist-logic.mjs';
import { initHomeAlbumPreview } from './album.js';
import { publicContentKeyFromLocation } from './content-urls.mjs';
import {
  buildWebRingCategories,
  interleaveWebRingCategories,
  randomWebRingItem,
  webRingNeighbors,
} from './webring-logic.mjs';

const SITE_VERSION = typeof __SITE_VERSION__ !== 'undefined' ? __SITE_VERSION__ : 'dev';
const VERSION_MANIFEST_PATH = '/site-version.json';
const VERSION_CHECK_INTERVAL_MS = 60 * 1000;
const VERSION_CHECK_THROTTLE_MS = 10 * 1000;
let lastVersionCheckAt = 0;
let webRingDataPromise = null;

// ─────────────────────────────────────────────────────────
// 프로필 사진 + BGM 설정
// ─────────────────────────────────────────────────────────
const PROFILE_PHOTO_SETTING_KEY = 'profile_photo_url';
const BGM_URL_SETTING_KEY = 'bgm_audio_url';
const BGM_TITLE_SETTING_KEY = 'bgm_audio_title';
const BGM_PLAYLIST_SETTING_KEY = 'bgm_playlist';
const BGM_SCHEDULE_SETTING_KEY = 'bgm_schedule';
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
  initBgmOwnerTools(player, audio, trackTitle);
})();

initSpaRouter();
initWebRing();
initContentContinuationTracking();
initSiteVersionRefresh();
initSharedProfileDetails();
initDynamicContent();
initAnonymousAnalytics().catch(error => console.warn('Anonymous analytics failed:', cmsErrorMessage(error)));

window.addEventListener('coldwaterkim:profile-data-updated', (event) => {
  const doc = event.detail?.document;
  if (!doc) return;
  renderSidebarProfileRows(sidebarProfileRowsFromDocument(doc));
});

window.addEventListener('coldwaterkim:content-ready', () => {
  renderProfileDetailTables(document, activeSidebarProfileRows);
});

window.addEventListener('beforeunload', event => {
  if (!document.querySelector('[data-bgm-schedule-editor][data-bgm-editor-dirty="true"]')) return;
  event.preventDefault();
  event.returnValue = '';
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
      const currentTrack = state.tracks[audio?._bgmTrackIndex] || state.tracks[0];

      if (!currentTrack || !audio?.src) {
        bgmTitle.textContent = 'BGM 준비 실패';
        enterButton.disabled = true;
        enterButton.textContent = '[ 입장 불가 ]';
        status.textContent = '필수 BGM을 불러오지 못했음. 새로고침하시오.';
        return;
      }

      bgmTitle.textContent = entryBgmDisplayTitle(currentTrack.title || defaultBgmTitle(audio));
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
    const [posts, dailyEntries, nasajabItems] = await Promise.all([
      getPublishedPostSummaryTimeline(),
      getPublishedDailySummaryTimeline(),
      getPublishedNasajabSummaryTimeline(),
    ]);
    const summary = summarizeEntryUpdates([
      {
        label: '글방',
        unit: '개',
        items: posts.map(post => ({
          title: post.title || '(제목 없음)',
          href: `/posts/${encodeURIComponent(post.slug || '')}/`,
          updatedAt: post.updated || postDisplayDate(post),
        })),
      },
      {
        label: '나으 하루',
        unit: '개',
        items: dailyEntries.map(entry => ({
          title: `${formatDate(dailyEntryDayKey(entry))}의 하루`,
          href: `/daily/${encodeURIComponent(dailyEntryDayKey(entry))}/`,
          updatedAt: entry.updated || dailyEntryDisplayDate(entry),
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
  if (document.querySelector('[data-version-refresh-block="true"]')) return;

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
      const schedule = await getSavedBgmSchedule(playlist);
      setBgmSchedule(audio, schedule, playlist);
      const startIndex = randomBgmCandidateIndex(scheduledBgmTrackIndexes(
        bgmTrackKeys(playlist),
        schedule,
        bgmMinuteInTimeZone(new Date(), BGM_TIME_ZONE),
      ));
      setBgmPlaylist(audio, trackTitle, playlist, startIndex);
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

async function getSavedBgmSchedule(playlist) {
  const savedSchedule = await getSetting(BGM_SCHEDULE_SETTING_KEY);
  return normalizeBgmSchedule(savedSchedule, bgmTrackKeys(playlist));
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
    mediaId: bgmMediaRecordId(url),
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
  const value = String(track?.url || '').trim();
  if (!value) return '';
  try {
    return new URL(value, window.location.href).href;
  } catch (e) {
    return value;
  }
}

function getBgmPlaylist(audio) {
  return Array.isArray(audio?._bgmPlaylist) ? audio._bgmPlaylist : [];
}

function bgmTrackKeys(playlist) {
  return normalizeBgmTracks(playlist).map(track => bgmTrackKey(track));
}

function setBgmSchedule(audio, schedule, playlist = getBgmPlaylist(audio)) {
  if (!audio) return;
  audio._bgmSchedule = normalizeBgmSchedule(schedule, bgmTrackKeys(playlist));
}

function getBgmSchedule(audio) {
  return normalizeBgmSchedule(audio?._bgmSchedule, bgmTrackKeys(getBgmPlaylist(audio)));
}

function scheduledBgmIndexes(audio, date = new Date()) {
  const playlist = getBgmPlaylist(audio);
  return scheduledBgmTrackIndexes(
    bgmTrackKeys(playlist),
    getBgmSchedule(audio),
    bgmMinuteInTimeZone(date, BGM_TIME_ZONE),
  );
}

function randomScheduledBgmTrackIndex(audio, currentIndex = -1, date = new Date()) {
  return randomBgmCandidateIndex(scheduledBgmIndexes(audio, date), currentIndex);
}

function setBgmPlaylist(audio, trackTitle, playlist, startIndex = 0) {
  if (!audio) return;

  const tracks = normalizeBgmTracks(playlist);
  const index = Math.max(0, Math.min(startIndex, tracks.length - 1));
  audio._bgmPlaylist = tracks;
  audio._bgmTrackTitle = trackTitle || null;
  setBgmSchedule(audio, audio._bgmSchedule, tracks);
  audio.loop = tracks.length <= 1;

  bindBgmPlaylist(audio);

  if (tracks.length > 0) {
    loadBgmTrack(audio, index);
    return;
  }

  audio.pause();
  audio.removeAttribute('src');
  audio.load();
  audio._bgmTrackIndex = -1;
  if (trackTitle) trackTitle.textContent = '등록된 BGM 없음';
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
  } else if (audio.ended) {
    audio.currentTime = 0;
  }

  if (audio._bgmTrackTitle) {
    audio._bgmTrackTitle.textContent = track.title || defaultBgmTitle(audio);
  }
}

async function advanceBgmTrack(audio) {
  const playlist = getBgmPlaylist(audio);
  if (playlist.length === 0) return;

  const nextIndex = randomScheduledBgmTrackIndex(audio, audio._bgmTrackIndex);
  if (nextIndex < 0) return;
  loadBgmTrack(audio, nextIndex);

  const prompt = ensureBgmPrompt(audio.closest('.mini-player'), audio);
  try {
    await audio.play();
    setBgmPromptVisible(prompt, false);
  } catch (e) {
    setBgmPromptVisible(prompt, true);
  }
}

function prependBgmTracks(tracks, playlist) {
  return dedupeBgmTracks([...normalizeBgmTracks(tracks), ...normalizeBgmTracks(playlist)]);
}

async function getBgmLibrarySettingSnapshot() {
  const values = await Promise.all([
    getSettingStrict(BGM_URL_SETTING_KEY),
    getSettingStrict(BGM_TITLE_SETTING_KEY),
    getSettingStrict(BGM_SCHEDULE_SETTING_KEY),
    getSettingStrict(BGM_PLAYLIST_SETTING_KEY),
  ]);
  return values.map(value => value || '');
}

async function restoreBgmLibrarySettings(snapshot) {
  const keys = [
    BGM_URL_SETTING_KEY,
    BGM_TITLE_SETTING_KEY,
    BGM_SCHEDULE_SETTING_KEY,
    BGM_PLAYLIST_SETTING_KEY,
  ];
  const results = await Promise.allSettled(keys.map((key, index) => setSetting(key, snapshot[index] || '')));
  return results.every(result => result.status === 'fulfilled');
}

async function saveBgmLibrarySettings(playlist, schedule) {
  const snapshot = await getBgmLibrarySettingSnapshot();
  const latestTrack = playlist[0] || null;
  const values = [
    latestTrack?.url || '',
    latestTrack?.title || '',
    JSON.stringify(schedule),
    JSON.stringify(playlist),
  ];
  const keys = [
    BGM_URL_SETTING_KEY,
    BGM_TITLE_SETTING_KEY,
    BGM_SCHEDULE_SETTING_KEY,
    BGM_PLAYLIST_SETTING_KEY,
  ];

  try {
    for (let index = 0; index < keys.length; index += 1) {
      await setSetting(keys[index], values[index]);
    }
  } catch (error) {
    const restored = await restoreBgmLibrarySettings(snapshot);
    if (!restored) error.bgmRollbackFailed = true;
    throw error;
  }

  return snapshot;
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

function initBgmOwnerTools(player, audio, trackTitle) {
  if (!player || !audio) return;

  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'audio/mpeg,.mp3';
  input.multiple = true;
  input.hidden = true;
  document.body.appendChild(input);

  const ownerRow = document.createElement('div');
  ownerRow.className = 'bgm-owner-row';

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'owner-btn bgm-owner-btn';
  button.textContent = 'MP3 추가';
  button.setAttribute('data-bgm-upload', '');

  const scheduleButton = document.createElement('button');
  scheduleButton.type = 'button';
  scheduleButton.className = 'owner-btn bgm-owner-btn';
  scheduleButton.textContent = 'BGM 편성표';

  const status = document.createElement('span');
  status.className = 'bgm-upload-status';
  status.setAttribute('aria-live', 'polite');

  ownerRow.append(button, ' ', scheduleButton, status);
  player.appendChild(ownerRow);

  button.addEventListener('click', () => input.click());
  scheduleButton.addEventListener('click', () => toggleBgmScheduleEditor(audio, button));

  input.addEventListener('change', async () => {
    const files = Array.from(input.files || []);
    input.value = '';
    if (files.length === 0) return;

    const openEditor = document.querySelector('[data-bgm-schedule-editor]');
    if (isBgmScheduleEditorDirty(openEditor)) {
      alert('먼저 편성 저장을 눌러 변경 내용을 저장한 뒤 MP3를 추가해줘.');
      return;
    }

    const invalidFiles = files.filter(file => !isMp3(file));
    if (invalidFiles.length > 0) {
      alert(`MP3 파일만 올릴 수 있어요.\n\n확인할 파일: ${invalidFiles.map(file => file.name).join(', ')}`);
      return;
    }

    button.disabled = true;
    setBgmScheduleEditorBusy(openEditor, true);
    status.textContent = `업로드 준비 중 (총 ${files.length}곡)`;
    const uploadedTracks = [];
    const failedFiles = [];

    try {
      for (let index = 0; index < files.length; index += 1) {
        const file = files[index];
        status.textContent = `업로드 중 (${index + 1}/${files.length}) ${file.name}`;
        try {
          const media = await uploadMedia(file, file.name, 'Home BGM');
          uploadedTracks.push({
            url: getMediaUrl(media, media.file),
            title: file.name,
            uploadedAt: new Date().toISOString(),
            mediaId: media.id,
          });
        } catch (error) {
          failedFiles.push({ file, error });
        }
      }

      if (uploadedTracks.length === 0) {
        throw failedFiles[0]?.error || new Error('올라간 MP3가 없음');
      }

      const savedPlaylist = await getSavedBgmPlaylist(audio);
      const nextPlaylist = prependBgmTracks(uploadedTracks, savedPlaylist.length > 0 ? savedPlaylist : getBgmPlaylist(audio));
      const nextSchedule = normalizeBgmSchedule(getBgmSchedule(audio), bgmTrackKeys(nextPlaylist));

      await saveBgmLibrarySettings(nextPlaylist, nextSchedule);

      setBgmSchedule(audio, nextSchedule, nextPlaylist);
      setBgmPlaylist(audio, trackTitle, nextPlaylist, 0);
      initBgmAutoplay(audio);
      status.textContent = failedFiles.length > 0
        ? `${uploadedTracks.length}곡 추가 / ${failedFiles.length}곡 실패`
        : `${uploadedTracks.length}곡 추가됨 (총 ${nextPlaylist.length}곡)`;
      const editor = document.querySelector('[data-bgm-schedule-editor]');
      if (editor) {
        openBgmScheduleEditor(audio, button, {
          replace: true,
          message: `새 MP3 ${uploadedTracks.length}곡을 모든 시간대에 추가했음. 원하는 시간대만 남기시오.`,
        });
      }
      if (failedFiles.length > 0) {
        alert(`일부 MP3 업로드 실패 (${failedFiles.length}곡)\n\n${failedFiles.map(item => `${item.file.name}: ${cmsErrorMessage(item.error)}`).join('\n')}`);
      }
      setTimeout(() => status.textContent = '', 1600);
    } catch (e) {
      await Promise.allSettled(uploadedTracks.map(track => deleteMediaIfUnreferenced(track.mediaId)));
      status.textContent = '실패';
      const rollbackNote = e.bgmRollbackFailed ? '\n설정 복구도 끝나지 않았으니 다시 열어 상태를 확인해줘.' : '';
      alert('MP3 묶음 저장 실패: ' + cmsErrorMessage(e) + rollbackNote);
    } finally {
      button.disabled = false;
      setBgmScheduleEditorBusy(openEditor, false);
    }
  });
}

function toggleBgmScheduleEditor(audio, uploadButton) {
  const existing = document.querySelector('[data-bgm-schedule-editor]');
  if (existing) {
    if (isBgmScheduleEditorDirty(existing) && !confirm('저장하지 않은 BGM 편성이 있어. 닫을까?')) return;
		removeBgmScheduleEditor(existing, audio);
    return;
  }

  openBgmScheduleEditor(audio, uploadButton);
}

function openBgmScheduleEditor(audio, uploadButton, options = {}) {
  const content = document.querySelector('.content');
  if (!content || !audio) return;

  const existing = document.querySelector('[data-bgm-schedule-editor]');
  if (existing) {
    if (!options.replace && isBgmScheduleEditorDirty(existing)) return;
		removeBgmScheduleEditor(existing, audio);
  }

  const playlist = getBgmPlaylist(audio);
  const schedule = getBgmSchedule(audio);
  const currentMinute = bgmMinuteInTimeZone(new Date(), BGM_TIME_ZONE);
  const activeSlot = activeBgmTimeSlot(schedule.slots, currentMinute);
  const panel = document.createElement('section');
  panel.className = 'bgm-schedule-editor';
  panel.setAttribute('data-bgm-schedule-editor', '');
  panel.setAttribute('aria-labelledby', 'bgmScheduleTitle');

  const slotHeaders = schedule.slots.map((slot, index) => `
    <th class="bgm-schedule-slot${slot.id === activeSlot.id ? ' is-active' : ''}" scope="col">
      ${escapeHtml(slot.label)}<br>
      <span>${formatBgmMinute(slot.startMinute)}–${formatBgmMinute(bgmSlotEndMinute(schedule.slots, index))}</span><br>
      <small>${playlist.filter(track => schedule.assignments[bgmTrackKey(track)]?.includes(slot.id)).length}곡</small>
    </th>
  `).join('');

  const trackRows = playlist.map((track, trackIndex) => {
    const trackKey = bgmTrackKey(track);
    const assignedSlotIds = schedule.assignments[trackKey] || [];
    const assignmentCells = schedule.slots.map(slot => `
      <td class="${slot.id === activeSlot.id ? 'is-active' : ''}">
        <input type="checkbox" data-bgm-assignment data-track-index="${trackIndex}" data-slot-id="${slot.id}"
          aria-label="${escapeHtml(track.title)} ${escapeHtml(slot.label)} 시간대"
          ${assignedSlotIds.includes(slot.id) ? 'checked' : ''}>
      </td>
    `).join('');
    const unassigned = assignedSlotIds.length === 0 ? '<small class="bgm-unassigned">미배정</small>' : '';
	const mediaId = track.mediaId || bgmMediaRecordId(track.url);

    return `
      <tr>
        <th scope="row" class="bgm-schedule-track">
          <span class="bgm-track-actions">
            <button type="button" class="owner-btn bgm-preview-btn" data-bgm-preview="${trackIndex}" title="이 곡 미리듣기">▶</button>
			<button type="button" class="owner-btn bgm-trim-btn" data-bgm-trim="${trackIndex}"
			  aria-label="${escapeHtml(track.title)} 자르기"
			  ${mediaId ? '' : 'disabled title="PocketBase에 올린 MP3만 자를 수 있음"'}>자르기</button>
            <button type="button" class="owner-btn owner-btn-danger bgm-delete-btn" data-bgm-delete="${trackIndex}"
			  ${mediaId ? '' : 'disabled title="PocketBase에 올린 MP3만 삭제할 수 있음"'}>삭제</button>
          </span>
          <span>${escapeHtml(track.title || defaultBgmTitle(audio))}</span>
          ${unassigned}
        </th>
        ${assignmentCells}
      </tr>
	  <tr class="bgm-trim-row" data-bgm-trim-row="${trackIndex}" hidden>
		<td colspan="${schedule.slots.length + 1}"></td>
	  </tr>
    `;
  }).join('');

  const timeRows = schedule.slots.map((slot, index) => `
    <tr>
      <th scope="row">${index + 1}</th>
      <td><input type="text" maxlength="20" value="${escapeHtml(slot.label)}" data-bgm-slot-label="${slot.id}" aria-label="${escapeHtml(slot.label)} 이름"></td>
      <td><input type="time" value="${formatBgmMinute(slot.startMinute)}" data-bgm-slot-start="${slot.id}" ${index === 0 ? 'disabled' : ''}></td>
      <td>${formatBgmMinute(bgmSlotEndMinute(schedule.slots, index))}</td>
    </tr>
  `).join('');

  panel.innerHTML = `
    <div class="bgm-schedule-heading">
      <div>
        <b id="bgmScheduleTitle">★ BGM TIME TABLE</b>
        <span class="note">한국 시간 기준 · 현재 ${formatBgmMinute(currentMinute)} / ${escapeHtml(activeSlot.label)}</span>
      </div>
      <button type="button" class="owner-btn" data-bgm-editor-close>편집 닫기</button>
    </div>
    <p class="bgm-schedule-help">곡을 여러 시간대에 중복 체크할 수 있음. 현재 곡은 끊지 않고 다음 곡부터 새 편성을 적용함.</p>
    <div class="bgm-schedule-table-wrap">
      <table class="bgm-schedule-table" border="1" cellspacing="0" cellpadding="4">
        <thead><tr><th scope="col">곡 / 시간대</th>${slotHeaders}</tr></thead>
        <tbody>${trackRows || '<tr><td colspan="6">등록된 MP3가 없음.</td></tr>'}</tbody>
      </table>
    </div>
    <div class="bgm-time-settings" data-bgm-time-settings hidden>
      <b>시간대 설정</b>
      <span class="note">시작 시각만 수정하면 앞 시간대의 종료 시각도 함께 바뀜.</span>
      <table border="1" cellspacing="0" cellpadding="4">
        <thead><tr><th>No.</th><th>이름</th><th>시작</th><th>종료</th></tr></thead>
        <tbody>${timeRows}</tbody>
      </table>
    </div>
    <div class="bgm-schedule-actions">
      <button type="button" class="owner-btn" data-bgm-editor-upload>+ MP3 추가</button>
      <button type="button" class="owner-btn" data-bgm-time-toggle>시간대 설정</button>
      <button type="button" class="owner-btn" data-bgm-editor-save>편성 저장</button>
      <span class="bgm-schedule-status" data-bgm-editor-status aria-live="polite">${escapeHtml(options.message || '')}</span>
    </div>
  `;

  const anchor = content.querySelector('#homeOwnerTools') || content.querySelector('.top-nav')?.parentElement;
  if (anchor) anchor.insertAdjacentElement('afterend', panel);
  else content.prepend(panel);

  bindBgmScheduleEditor(panel, audio, uploadButton);
  panel.scrollIntoView({ block: 'start' });
}

function bindBgmScheduleEditor(panel, audio, uploadButton) {
  const status = panel.querySelector('[data-bgm-editor-status]');
  const saveButton = panel.querySelector('[data-bgm-editor-save]');

  panel.querySelector('[data-bgm-editor-close]')?.addEventListener('click', () => {
    if (isBgmScheduleEditorDirty(panel) && !confirm('저장하지 않은 BGM 편성이 있어. 닫을까?')) return;
		removeBgmScheduleEditor(panel, audio);
  });
  panel.querySelector('[data-bgm-editor-upload]')?.addEventListener('click', () => uploadButton?.click());
  panel.querySelector('[data-bgm-time-toggle]')?.addEventListener('click', event => {
    const settings = panel.querySelector('[data-bgm-time-settings]');
    settings.hidden = !settings.hidden;
    event.currentTarget.textContent = settings.hidden ? '시간대 설정' : '시간대 설정 닫기';
  });

  panel.querySelectorAll('[data-bgm-preview]').forEach(button => {
    button.addEventListener('click', async () => {
      const trackIndex = Number(button.dataset.bgmPreview);
      loadBgmTrack(audio, trackIndex);
      try {
        await audio.play();
        status.textContent = '미리듣기 재생 중';
      } catch (error) {
        status.textContent = '미리듣기 실패. BGM ON을 눌러보시오.';
      }
    });
  });

	panel.querySelectorAll('[data-bgm-trim]').forEach(button => {
		button.addEventListener('click', () => openBgmTrimEditor(panel, audio, uploadButton, button));
	});

  panel.querySelectorAll('[data-bgm-delete]').forEach(button => {
    button.addEventListener('click', async () => {
      if (isBgmScheduleEditorDirty(panel)) {
        alert('먼저 편성 저장을 눌러 변경 내용을 저장한 뒤 삭제해줘.');
        return;
      }

      const playlist = getBgmPlaylist(audio);
      const trackIndex = Number(button.dataset.bgmDelete);
      const track = playlist[trackIndex];
      const mediaId = track?.mediaId || bgmMediaRecordId(track?.url);
      if (!track || !mediaId) return;
      if (!confirm(`“${track.title || defaultBgmTitle(audio)}” MP3를 BGM에서 삭제할까?\n\n다른 글에서 쓰지 않는 파일이면 서버에서도 영구 삭제됨.`)) return;

      setBgmScheduleEditorBusy(panel, true);
      status.classList.remove('is-error');
      status.textContent = 'MP3 삭제 중...';
      const currentTrackKey = bgmTrackKey(playlist[audio._bgmTrackIndex]);
      const nextPlaylist = playlist.filter((_, index) => index !== trackIndex);
      const nextSchedule = normalizeBgmSchedule(getBgmSchedule(audio), bgmTrackKeys(nextPlaylist));

      try {
        await saveBgmLibrarySettings(nextPlaylist, nextSchedule);
        let deleted = false;
        let cleanupFailed = false;
        try {
          deleted = await deleteMediaIfUnreferenced(mediaId);
        } catch (error) {
          cleanupFailed = true;
          console.warn('BGM media cleanup failed:', cmsErrorMessage(error));
        }

        setBgmSchedule(audio, nextSchedule, nextPlaylist);
        const retainedIndex = nextPlaylist.findIndex(item => bgmTrackKey(item) === currentTrackKey);
        setBgmPlaylist(audio, audio._bgmTrackTitle, nextPlaylist, Math.max(0, retainedIndex));
        if (nextPlaylist.length > 0 && currentTrackKey === bgmTrackKey(track)) initBgmAutoplay(audio);
        openBgmScheduleEditor(audio, uploadButton, {
          replace: true,
          message: cleanupFailed
            ? `“${track.title}”을 BGM에서 제거함. 서버 파일 정리 여부는 확인하지 못했음.`
            : deleted
            ? `“${track.title}” 삭제 완료.`
            : `“${track.title}”을 BGM에서 제거함. 다른 콘텐츠에서 사용 중인 원본 파일은 보존했음.`,
        });
      } catch (error) {
        status.textContent = `삭제 실패: ${cmsErrorMessage(error)}`;
        if (error.bgmRollbackFailed) status.textContent += ' · 설정 복구 상태 확인 필요';
        status.classList.add('is-error');
        setBgmScheduleEditorBusy(panel, false);
      }
    });
  });

  panel.addEventListener('input', event => {
    if (!event.target.matches('[data-bgm-assignment], [data-bgm-slot-label], [data-bgm-slot-start]')) return;
    setBgmScheduleEditorDirty(panel, true);
    status.textContent = '저장 안 됨';
  });

  saveButton?.addEventListener('click', async () => {
    let nextSchedule;
    try {
      nextSchedule = collectBgmScheduleEditorValue(panel, audio, getBgmPlaylist(audio));
    } catch (error) {
      status.textContent = error.message;
      status.classList.add('is-error');
      return;
    }

    saveButton.disabled = true;
    status.classList.remove('is-error');
    status.textContent = '저장 중...';
    try {
      await setSetting(BGM_SCHEDULE_SETTING_KEY, JSON.stringify(nextSchedule));
      setBgmSchedule(audio, nextSchedule);
      setBgmScheduleEditorDirty(panel, false);
      openBgmScheduleEditor(audio, uploadButton, { replace: true, message: '편성 저장 완료.' });
    } catch (error) {
      status.textContent = `저장 실패: ${cmsErrorMessage(error)}`;
      status.classList.add('is-error');
      saveButton.disabled = false;
    }
  });
}

async function openBgmTrimEditor(panel, audio, uploadButton, triggerButton) {
	const trackIndex = Number(triggerButton.dataset.bgmTrim);
	const playlist = getBgmPlaylist(audio);
	const track = playlist[trackIndex];
	const mediaId = track?.mediaId || bgmMediaRecordId(track?.url);
	const row = panel.querySelector(`[data-bgm-trim-row="${trackIndex}"]`);
	const cell = row?.querySelector('td');
	if (!track || !mediaId || !row || !cell) return;

	const openRow = panel.querySelector('[data-bgm-trim-row]:not([hidden])');
	if (openRow && openRow !== row) closeBgmTrimEditor(openRow, audio, false);
	if (!row.hidden) {
		closeBgmTrimEditor(row, audio, true);
		return;
	}

	row.hidden = false;
	cell.innerHTML = `
		<div class="bgm-trim-editor" data-bgm-trim-editor>
			<div class="bgm-trim-heading">
				<b>✂ ${escapeHtml(track.title)} 자르기</b>
				<button type="button" class="owner-btn" data-bgm-trim-close>닫기</button>
			</div>
			<div class="bgm-trim-waveform" data-bgm-trim-waveform aria-label="${escapeHtml(track.title)} 파형"></div>
			<div class="bgm-trim-fields">
				<label>시작(초) <input type="number" min="0" step="0.01" value="0" data-bgm-trim-start></label>
				<label>끝(초) <input type="number" min="0.25" step="0.01" value="" data-bgm-trim-end></label>
				<span class="note" data-bgm-trim-length>파형 불러오는 중...</span>
			</div>
			<div class="bgm-trim-actions">
				<button type="button" class="owner-btn" data-bgm-trim-preview disabled>▶ 선택 구간</button>
				<button type="button" class="owner-btn" data-bgm-trim-replace disabled>이 구간으로 교체</button>
				<span class="bgm-schedule-status" data-bgm-trim-status aria-live="polite">곡 하나만 불러오는 중...</span>
			</div>
		</div>
	`;
	const editor = cell.querySelector('[data-bgm-trim-editor]');
	const waveform = editor.querySelector('[data-bgm-trim-waveform]');
	const startInput = editor.querySelector('[data-bgm-trim-start]');
	const endInput = editor.querySelector('[data-bgm-trim-end]');
	const length = editor.querySelector('[data-bgm-trim-length]');
	const previewButton = editor.querySelector('[data-bgm-trim-preview]');
	const replaceButton = editor.querySelector('[data-bgm-trim-replace]');
	const trimStatus = editor.querySelector('[data-bgm-trim-status]');
	let region = null;
	let duration = 0;
	let resumeMainAudio = false;
	let trimRequestId = '';

	const updateFields = (start, end, updateInputs = true) => {
		const safeStart = Math.max(0, Math.min(Number(start) || 0, duration));
		const safeEnd = Math.max(safeStart, Math.min(Number(end) || 0, duration));
		if (updateInputs) {
			startInput.value = safeStart.toFixed(2);
			endInput.value = safeEnd.toFixed(2);
		}
		length.textContent = `전체 ${formatBgmDuration(duration)} · 선택 ${formatBgmDuration(safeEnd - safeStart)}`;
	};

	try {
		const [{ default: WaveSurfer }, { default: RegionsPlugin }] = await Promise.all([
			import('wavesurfer.js'),
			import('wavesurfer.js/dist/plugins/regions.esm.js'),
		]);
		if (!row.isConnected || row.hidden) return;
		const regions = RegionsPlugin.create();
		const waveSurfer = WaveSurfer.create({
			container: waveform,
			url: track.url,
			height: 72,
			waveColor: '#777777',
			progressColor: '#000080',
			cursorColor: '#cc0000',
			barWidth: 2,
			barGap: 1,
			plugins: [regions],
		});
		row._bgmWaveSurfer = waveSurfer;
		row._bgmResumeMainAudio = () => resumeMainAudio;

		waveSurfer.on('decode', decodedDuration => {
			duration = decodedDuration;
			endInput.max = duration.toFixed(3);
			startInput.max = Math.max(0, duration - 0.25).toFixed(3);
			region = regions.addRegion({
				start: 0,
				end: duration,
				drag: true,
				resize: true,
				minLength: 0.25,
				color: 'rgba(255, 233, 122, 0.45)',
			});
			updateFields(0, duration);
			previewButton.disabled = false;
			replaceButton.disabled = false;
			trimStatus.textContent = '노란 구간 양끝을 끌거나 초 단위 값을 입력하시오.';
		});
		waveSurfer.on('error', error => {
			trimStatus.textContent = `파형 로딩 실패: ${cmsErrorMessage(error)}`;
			trimStatus.classList.add('is-error');
		});
		regions.on('region-updated', nextRegion => {
			if (nextRegion !== region) return;
			updateFields(region.start, region.end);
		});
		const applyInputsToRegion = () => {
			if (!region || duration <= 0) return;
			const start = Number(startInput.value);
			const end = Number(endInput.value);
			if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end - start < 0.25 || end > duration + 0.01) {
				trimStatus.textContent = '시작보다 최소 0.25초 뒤의 끝 지점을 골라줘.';
				trimStatus.classList.add('is-error');
				previewButton.disabled = true;
				replaceButton.disabled = true;
				return false;
			}
			trimStatus.classList.remove('is-error');
			region.setOptions({ start, end });
			updateFields(start, end);
			previewButton.disabled = false;
			replaceButton.disabled = false;
			return true;
		};
		startInput.addEventListener('input', applyInputsToRegion);
		endInput.addEventListener('input', applyInputsToRegion);

		previewButton.addEventListener('click', () => {
			if (!region) return;
			if (!audio.paused) {
				resumeMainAudio = true;
				audio.pause();
			}
			region.play(true);
		});

		replaceButton.addEventListener('click', async () => {
			if (isBgmScheduleEditorDirty(panel)) {
				alert('먼저 편성 저장을 눌러 변경 내용을 저장한 뒤 MP3를 잘라줘.');
				return;
			}
			if (!region || duration <= 0 || applyInputsToRegion() === false || region.end - region.start < 0.25) return;
			if (region.start < 0.01 && Math.abs(region.end - duration) < 0.01) {
				alert('곡 전체가 선택되어 있어. 앞이나 뒤를 줄인 다음 교체해줘.');
				return;
			}
			if (!confirm(`“${track.title}”을 ${formatBgmDuration(region.start)} ~ ${formatBgmDuration(region.end)} 구간으로 교체할까?\n\n교체 성공 뒤 이전 파일은 다른 콘텐츠에서 쓰지 않을 때 서버에서도 삭제됨.`)) return;

			waveSurfer.pause();
			setBgmScheduleEditorBusy(panel, true);
			trimStatus.classList.remove('is-error');
			trimStatus.textContent = 'iMac에서 MP3 자르는 중...';
			let newMediaId = '';
			try {
				trimRequestId ||= crypto.randomUUID();
				const result = await trimBgmMedia(mediaId, region.start, region.end, trimRequestId);
				const media = result.media;
				newMediaId = media.id;
				const replacement = {
					url: getMediaUrl(media, media.file),
					title: track.title,
					uploadedAt: new Date().toISOString(),
					mediaId: media.id,
				};
				const currentPlaylist = getBgmPlaylist(audio);
				const oldKey = bgmTrackKey(track);
				const currentKey = bgmTrackKey(currentPlaylist[audio._bgmTrackIndex]);
				const wasPlaying = !audio.paused || resumeMainAudio;
				const nextPlaylist = currentPlaylist.map((item, index) => index === trackIndex ? replacement : item);
				const nextSchedule = remapBgmScheduleTrack(
					getBgmSchedule(audio),
					oldKey,
					bgmTrackKey(replacement),
					bgmTrackKeys(nextPlaylist),
				);
				await saveBgmLibrarySettings(nextPlaylist, nextSchedule);

				setBgmSchedule(audio, nextSchedule, nextPlaylist);
				const nextIndex = currentKey === oldKey
					? trackIndex
					: Math.max(0, nextPlaylist.findIndex(item => bgmTrackKey(item) === currentKey));
				setBgmPlaylist(audio, audio._bgmTrackTitle, nextPlaylist, nextIndex);
				if (wasPlaying) audio.play().catch(() => setBgmPromptVisible(ensureBgmPrompt(audio.closest('.mini-player'), audio), true));

				let cleanupFailed = false;
				try {
					await deleteMediaIfUnreferenced(mediaId);
				} catch (error) {
					cleanupFailed = true;
					console.warn('Previous BGM cleanup failed:', cmsErrorMessage(error));
				}
				closeBgmTrimEditor(row, audio, false);
				openBgmScheduleEditor(audio, uploadButton, {
					replace: true,
					message: cleanupFailed
						? `“${track.title}” 교체 완료. 이전 파일 정리 여부는 확인하지 못했음.`
						: `“${track.title}”을 ${formatBgmDuration(result.duration_seconds || (region.end - region.start))} 길이로 교체 완료.`,
				});
			} catch (error) {
				if (newMediaId) await deleteMediaIfUnreferenced(newMediaId).catch(() => {});
				trimStatus.textContent = `교체 실패: ${cmsErrorMessage(error)}`;
				if (error.bgmRollbackFailed) trimStatus.textContent += ' · 설정 복구 상태 확인 필요';
				trimStatus.classList.add('is-error');
				setBgmScheduleEditorBusy(panel, false);
			}
		});
	} catch (error) {
		trimStatus.textContent = `파형 준비 실패: ${cmsErrorMessage(error)}`;
		trimStatus.classList.add('is-error');
	}

	editor.querySelector('[data-bgm-trim-close]')?.addEventListener('click', () => closeBgmTrimEditor(row, audio, true));
	row.scrollIntoView({ block: 'nearest' });
}

function removeBgmScheduleEditor(panel, audio) {
	const openTrimRow = panel.querySelector('[data-bgm-trim-row]:not([hidden])');
	if (openTrimRow) closeBgmTrimEditor(openTrimRow, audio, false);
	panel.remove();
}

function closeBgmTrimEditor(row, audio, restoreFocus) {
	const triggerIndex = row.dataset.bgmTrimRow;
	const shouldResume = row._bgmResumeMainAudio?.() === true;
	row._bgmWaveSurfer?.destroy();
	delete row._bgmWaveSurfer;
	delete row._bgmResumeMainAudio;
	row.hidden = true;
	row.querySelector('td')?.replaceChildren();
	if (shouldResume) audio.play().catch(() => {});
	if (restoreFocus) row.closest('[data-bgm-schedule-editor]')?.querySelector(`[data-bgm-trim="${triggerIndex}"]`)?.focus();
}

function formatBgmDuration(value) {
	const total = Math.max(0, Number(value) || 0);
	const minutes = Math.floor(total / 60);
	const seconds = total - (minutes * 60);
	return `${minutes}:${seconds.toFixed(2).padStart(5, '0')}`;
}

function collectBgmScheduleEditorValue(panel, audio, playlist) {
  const current = getBgmSchedule(audio);
  const slots = current.slots.map((slot, index) => {
    const label = panel.querySelector(`[data-bgm-slot-label="${slot.id}"]`)?.value.trim() || slot.label;
    const timeValue = panel.querySelector(`[data-bgm-slot-start="${slot.id}"]`)?.value || '00:00';
    const [hour, minute] = timeValue.split(':').map(Number);
    return {
      id: slot.id,
      label,
      startMinute: index === 0 ? 0 : (hour * 60) + minute,
    };
  });

  if (slots.some((slot, index) => index > 0 && slot.startMinute <= slots[index - 1].startMinute)) {
    throw new Error('시간대 시작 시각은 앞 시간대보다 늦어야 함.');
  }

  const assignments = {};
  playlist.forEach((track, trackIndex) => {
    assignments[bgmTrackKey(track)] = slots
      .filter(slot => panel.querySelector(`[data-bgm-assignment][data-track-index="${trackIndex}"][data-slot-id="${slot.id}"]`)?.checked)
      .map(slot => slot.id);
  });

  return normalizeBgmSchedule({ version: 1, timezone: BGM_TIME_ZONE, slots, assignments }, bgmTrackKeys(playlist));
}

function setBgmScheduleEditorDirty(panel, isDirty) {
  panel.dataset.bgmEditorDirty = isDirty ? 'true' : 'false';
  panel.setAttribute('data-version-refresh-block', isDirty ? 'true' : 'false');
}

function setBgmScheduleEditorBusy(panel, isBusy) {
  if (!panel) return;
  panel.setAttribute('aria-busy', isBusy ? 'true' : 'false');
  panel.querySelectorAll('button, input').forEach(control => {
    if (isBusy) {
      control.dataset.bgmWasDisabled = control.disabled ? 'true' : 'false';
      control.disabled = true;
      return;
    }

    control.disabled = control.dataset.bgmWasDisabled === 'true';
    delete control.dataset.bgmWasDisabled;
  });
}

function isBgmScheduleEditorDirty(panel) {
  return panel?.dataset.bgmEditorDirty === 'true';
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
    const dirtyBgmEditor = document.querySelector('[data-bgm-schedule-editor][data-bgm-editor-dirty="true"]');
    if (dirtyBgmEditor && !confirm('저장하지 않은 BGM 편성이 있어. 다른 페이지로 이동할까?')) return;
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

    syncDocumentBase(nextDoc);
    document.title = nextDoc.title || document.title;
    document.body.className = nextDoc.body.className;
    updatePersistentShell(nextDoc);

    content.innerHTML = nextContent.innerHTML;
    await runPageModules(nextDoc, url);
    await initDynamicContent(content);
    refreshWebRingLinks();
    initAnonymousAnalytics(url).catch(error => console.warn('Anonymous analytics failed:', cmsErrorMessage(error)));

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

function syncDocumentBase(nextDoc) {
  const nextBase = nextDoc.querySelector('base[href]');
  const currentBase = document.querySelector('base[href]');

  if (!nextBase) {
    currentBase?.remove();
    return;
  }

  const href = nextBase.getAttribute('href');
  if (currentBase) {
    currentBase.setAttribute('href', href);
    return;
  }

  const base = document.createElement('base');
  base.setAttribute('href', href);
  document.head.prepend(base);
}

// ─────────────────────────────────────────────────────────
// My WebRing: 공개 콘텐츠 전체 탐험
// ─────────────────────────────────────────────────────────
function initWebRing() {
  const links = Array.from(document.querySelectorAll('.webring a')).slice(0, 3);
  if (links.length !== 3) return;
  ['prev', 'random', 'next'].forEach((action, index) => {
    links[index].dataset.webringAction = action;
    links[index].setAttribute('aria-disabled', 'true');
    links[index].removeAttribute('href');
  });

  document.addEventListener('click', event => {
    const link = event.target.closest('[data-webring-action]');
    if (!link?.href || link.getAttribute('aria-disabled') === 'true') {
      if (link) event.preventDefault();
      return;
    }
    trackAnalyticsEvent('webring_click', {
      pageKey: analyticsPageKey(),
      action: link.dataset.webringAction,
      targetKey: link.dataset.webringTargetKey || ''
    }).catch(error => console.warn('WebRing analytics failed:', cmsErrorMessage(error)));
  }, true);

  window.addEventListener('hashchange', refreshWebRingLinks);
  refreshWebRingLinks();
}

async function loadWebRingData() {
  if (!webRingDataPromise) {
    webRingDataPromise = Promise.all([
      getPublishedPostSummaryTimeline(),
      getPublishedDailySummaryTimeline(),
      getAlbumItemTimeline(),
      getPublishedNasajabSummaryTimeline(),
    ]).then(([posts, daily, album, nasajab]) => {
      const categories = buildWebRingCategories({ posts, daily, album, nasajab });
      return { categories, deck: interleaveWebRingCategories(categories) };
    }).catch(error => {
      webRingDataPromise = null;
      throw error;
    });
  }
  return await webRingDataPromise;
}

async function refreshWebRingLinks() {
  const links = Array.from(document.querySelectorAll('[data-webring-action]'));
  if (!links.length) return;
  try {
    const { categories, deck } = await loadWebRingData();
    const currentKey = publicContentKeyFromLocation(window.location);
    const neighbors = webRingNeighbors(deck, currentKey);
    const targets = {
      prev: neighbors.prev,
      random: randomWebRingItem(categories, currentKey),
      next: neighbors.next,
    };
    links.forEach(link => setWebRingTarget(link, targets[link.dataset.webringAction]));
  } catch (error) {
    links.forEach(link => setWebRingTarget(link, null));
    console.warn('WebRing load failed:', cmsErrorMessage(error));
  }
}

function setWebRingTarget(link, target) {
  if (!target?.url) {
    link.removeAttribute('href');
    link.setAttribute('aria-disabled', 'true');
    delete link.dataset.webringTargetKey;
    return;
  }
  link.href = target.url;
  link.title = target.label || '다른 공개 기록으로 이동';
  link.setAttribute('aria-disabled', 'false');
  link.dataset.webringTargetKey = target.key;
}

function initContentContinuationTracking() {
  document.addEventListener('click', event => {
    const link = event.target.closest('.content a[href]');
    if (!link || link.hasAttribute('download')) return;
    let targetUrl;
    try {
      targetUrl = new URL(link.href, location.href);
    } catch (_error) {
      return;
    }
    if (targetUrl.origin !== location.origin) return;
    const pageKey = analyticsPageKey();
    const targetKey = analyticsPageKey(targetUrl);
    if (!/^(post|daily|album|nasajab):/.test(pageKey) || targetKey === pageKey) return;
    trackAnalyticsEvent('content_continue', { pageKey, action: 'internal', targetKey })
      .catch(error => console.warn('Continuation analytics failed:', cmsErrorMessage(error)));
  }, true);
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
  scheduleHomeAlbumPreview(scope);
}

function scheduleHomeAlbumPreview(scope = document) {
  const grid = scope.querySelector?.('#home-album-grid');
  if (!grid || grid.dataset.albumScheduled === 'true') return;
  grid.dataset.albumScheduled = 'true';
  const load = () => {
    if (!grid.isConnected) return;
    initHomeAlbumPreview(scope);
  };
  if (typeof requestIdleCallback === 'function') {
    requestIdleCallback(load, { timeout: 1200 });
  } else {
    setTimeout(load, 0);
  }
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
      <span class="note">글방 / 나으 하루 중 골라서 발행</span>
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
  const table = scope.querySelector('#recent-all-table');
  if (!table || table.dataset.recentAllReady === 'true') return;
  table.dataset.recentAllReady = 'true';

  const tbody = table.querySelector('tbody') || table.createTBody();
  tbody.innerHTML = '<tr><td colspan="3">불러오는 중...</td></tr>';

  try {
    const [posts, daily, nasajab, guestbook] = await Promise.all([
      getPublishedPostSummaryTimeline(),
      getPublishedDailySummaryTimeline(),
      getPublishedNasajabSummaryTimeline(),
      getAnsweredGuestbookSummaryTimeline(),
    ]);
    const entries = buildArchiveEntries({
      posts,
      daily,
      nasajab,
      guestbook,
    }).slice(0, 8);

    if (!entries.length) {
      tbody.innerHTML = '<tr><td colspan="3">아직 공개된 글이 없습니다.</td></tr>';
      return;
    }

    tbody.innerHTML = entries.map(entry => `
      <tr>
        <td><a href="${escapeAttribute(entry.url)}">${escapeHtml(entry.title)}</a></td>
        <td class="archive-category-cell">${escapeHtml(entry.categoryLabel)}</td>
        <td class="date-cell" align="right">${formatDate(entry.date)}</td>
      </tr>
    `).join('');
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="3">${escapeHtml(cmsErrorMessage(e))}</td></tr>`;
  }
}

function dateTimestamp(value) {
  const n = Date.parse(value || '');
  return Number.isFinite(n) ? n : 0;
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
      const ownerReply = String(entry.owner_reply || '').trim();
      const ownerReplyHtml = ownerReply
        ? `<span class="guestbook-preview-reply">↳ <b>주인장:</b> ${escapeHtml(ownerReply)}</span>`
        : '';
      tr.innerHTML = `
        <td class="guestbook-preview-message"><b>${escapeHtml(entry.name)}</b>: ${linkify(escapeHtml(entry.message))}${ownerReplyHtml}</td>
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
  const submitButton = guestbookForm.querySelector('button[type="submit"]');
  const submitStatus = guestbookForm.querySelector('#guestbookSubmitStatus');

  function setGuestbookSubmitting(isSubmitting) {
    guestbookForm.dataset.guestbookSubmitting = String(isSubmitting);
    guestbookForm.setAttribute('aria-busy', String(isSubmitting));
    guestbookForm.querySelectorAll('button, input, select, textarea').forEach(control => {
      control.disabled = isSubmitting;
    });
    if (submitButton) {
      submitButton.setAttribute('aria-busy', String(isSubmitting));
    }
  }

  function setGuestbookSubmitStatus(message = '') {
    if (submitStatus) submitStatus.textContent = message;
  }

  guestbookForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (guestbookForm.dataset.guestbookSubmitting === 'true') return;

    const nameEl = guestbookForm.querySelector('#guestName');
    const messageEl = guestbookForm.querySelector('#message');
    const message = messageEl?.value.trim() || '';

    if (!message) {
      alert('메시지를 입력해주세요.');
      return;
    }

    setGuestbookSubmitting(true);
    setGuestbookSubmitStatus('방명록을 남기는 중...');

    try {
      const typedName = nameEl?.value.trim() || '';
      const name = typedName || await nextGuestbookName();
      await addGuestbookEntry(name, message);
      trackAnalyticsEvent('guestbook_complete', {
        pageKey: analyticsPageKey(),
        action: 'submit'
      }).catch(error => console.warn('Anonymous analytics failed:', cmsErrorMessage(error)));
      guestbookForm.reset();
      await loadGuestbook(guestbookEntries);
      setGuestbookSubmitStatus('방명록을 남겼습니다.');
    } catch (e) {
      setGuestbookSubmitStatus('작성에 실패했습니다. 다시 시도해주세요.');
      alert('방명록 작성 실패: ' + cmsErrorMessage(e));
    } finally {
      setGuestbookSubmitting(false);
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
      const replyMessage = String(entry.owner_reply || '').trim();
      const replyDate = formatDate(entry.owner_replied_at);
      const deleteBtn = isAdmin
        ? `<button class="del-btn" data-id="${entry.id}" style="font-size:10px; color:red; border:1px solid red; background:white; cursor:pointer; margin-left:5px;">[삭제]</button>`
        : '';
      const replyBlock = replyMessage
        ? `
          <div class="guestbook-owner-reply">
            <div class="guestbook-owner-reply-meta">↳ <b>coldwaterkim의 답글</b>${replyDate ? ` · ${replyDate}` : ''}</div>
            <div>${linkify(escapeHtml(replyMessage))}</div>
            ${isAdmin ? `
              <div class="guestbook-reply-actions">
                <button type="button" class="reply-toggle-btn">[답글 수정]</button>
                <button type="button" class="reply-delete-btn" data-id="${entry.id}">[답글 삭제]</button>
              </div>
            ` : ''}
          </div>
        `
        : isAdmin
          ? '<div class="guestbook-reply-actions"><button type="button" class="reply-toggle-btn">[답글 달기]</button></div>'
          : '';
      const replyForm = isAdmin
        ? `
          <form class="guestbook-reply-form" data-id="${entry.id}" hidden>
            <label><b>coldwaterkim의 답글</b></label>
            <textarea rows="3" maxlength="1000" required>${escapeHtml(replyMessage)}</textarea>
            <div>
              <button type="submit">[저장]</button>
              <button type="button" class="reply-cancel-btn">[취소]</button>
            </div>
          </form>
        `
        : '';

      return `
        <div class="entry" data-guestbook-entry-id="${entry.id}">
          <div class="meta">
            ${metaPrefix}by <b>${escapeHtml(entry.name)}</b>
            ${deleteBtn}
          </div>
          <div>${linkify(escapeHtml(entry.message))}</div>
          ${replyBlock}
          ${replyForm}
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

      guestbookEntries.querySelectorAll('.reply-toggle-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const form = btn.closest('.entry')?.querySelector('.guestbook-reply-form');
          if (!form) return;
          form.hidden = !form.hidden;
          if (!form.hidden) form.querySelector('textarea')?.focus();
        });
      });

      guestbookEntries.querySelectorAll('.reply-cancel-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const form = btn.closest('.guestbook-reply-form');
          if (form) form.hidden = true;
        });
      });

      guestbookEntries.querySelectorAll('.guestbook-reply-form').forEach(form => {
        form.addEventListener('submit', async (event) => {
          event.preventDefault();
          const textarea = form.querySelector('textarea');
          const submitBtn = form.querySelector('button[type="submit"]');
          const message = textarea?.value.trim() || '';
          if (!message) {
            alert('답글 내용을 입력해주세요.');
            return;
          }

          if (submitBtn) submitBtn.disabled = true;
          try {
            await saveGuestbookReply(form.dataset.id, message);
            loadGuestbook(guestbookEntries);
          } catch (e) {
            alert('답글 저장 실패: ' + cmsErrorMessage(e));
            if (submitBtn) submitBtn.disabled = false;
          }
        });
      });

      guestbookEntries.querySelectorAll('.reply-delete-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
          if (!confirm('이 답글을 삭제하시겠습니까?')) return;
          btn.disabled = true;
          try {
            await clearGuestbookReply(btn.dataset.id);
            loadGuestbook(guestbookEntries);
          } catch (e) {
            alert('답글 삭제 실패: ' + cmsErrorMessage(e));
            btn.disabled = false;
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

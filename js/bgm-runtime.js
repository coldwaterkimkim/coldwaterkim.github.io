import {getSetting,getSettingStrict,setSetting,isLoggedIn,cmsErrorMessage,uploadMedia,trimBgmMedia,getMediaUrl,deleteMediaIfUnreferenced,escapeHtml} from './pb.js';
import {bgmAllowed,initBgmConsent,requestBgmPlay,pauseBgmInternally} from './bgm-consent.js';
import {reviewMediaValue} from './review-media.js';
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
const BGM_URL_SETTING_KEY = 'bgm_audio_url';
const BGM_TITLE_SETTING_KEY = 'bgm_audio_title';
const BGM_PLAYLIST_SETTING_KEY = 'bgm_playlist';
const BGM_SCHEDULE_SETTING_KEY = 'bgm_schedule';
function restoreNavigationBgm(audio) {
  if (!audio) return;
  let saved; try { saved=JSON.parse(sessionStorage.getItem('cwk:bgm:navigation')||'null'); } catch {}
  if(!saved || Date.now()-saved.at>120000) return;
  const tracks=getBgmPlaylist(audio);
  const index=tracks.findIndex(track=>reviewMediaValue(track.url)===saved.src);
  if(index<0) return;
  playBgmTrackForNavigation(audio,index,saved);
}
function playBgmTrackForNavigation(audio,index,saved) {
  const tracks=getBgmPlaylist(audio);
  pauseBgmInternally(audio);
  audio._bgmTrackIndex=index; audio.src=reviewMediaValue(tracks[index].url);
  if(audio._bgmTrackTitle) audio._bgmTrackTitle.textContent=tracks[index].title || defaultBgmTitle(audio);
  audio.autoplay=false;
  const seek=()=>{if(Number.isFinite(saved.time))audio.currentTime=saved.time;};
  audio.addEventListener('loadedmetadata',seek,{once:true});
}
window.addEventListener('pagehide',()=>{
  const audio=document.querySelector('[data-bgm]');
  if(!audio)return;
  try { sessionStorage.setItem('cwk:bgm:navigation',JSON.stringify({src:audio.currentSrc||audio.src,time:audio.currentTime,paused:audio.paused,at:Date.now()})); } catch {}
});
function initBgmAutoplay(audio) {
  audio.autoplay = false;
  audio.loop = getBgmPlaylist(audio).length <= 1;
  const prompt = ensureBgmPrompt(audio.closest('.mini-player'), audio);
  if (!bgmAllowed()) return;
  requestBgmPlay(audio).then(() => setBgmPromptVisible(prompt, false))
    .catch(() => setBgmPromptVisible(prompt, true));
}

function ensureBgmPrompt(player, audio) {
  player=document.querySelector('.sketch-home-view .sk-player') || document.querySelector('.sk-music-dock');
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
        await requestBgmPlay(audio, true);
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

export async function getSavedBgmPlaylist(audio) {
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
  audio.dispatchEvent(new Event('bgm-playlist-changed'));

  bindBgmPlaylist(audio);

  if (tracks.length > 0) {
    loadBgmTrack(audio, index);
    return;
  }

  pauseBgmInternally(audio);
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
    pauseBgmInternally(audio);
    audio.src = reviewMediaValue(nextUrl);
    audio.load();
  } else if (audio.ended) {
    audio.currentTime = 0;
  }

  if (audio._bgmTrackTitle) {
    audio._bgmTrackTitle.textContent = track.title || defaultBgmTitle(audio);
    audio.dispatchEvent(new Event('bgm-track-changed'));
  }
}

async function advanceBgmTrack(audio, explicit = false) {
  if (!explicit && !bgmAllowed()) return;
  const playlist = getBgmPlaylist(audio);
  if (playlist.length === 0) return;

  const nextIndex = randomScheduledBgmTrackIndex(audio, audio._bgmTrackIndex);
  if (nextIndex < 0) return;
  loadBgmTrack(audio, nextIndex);

  const prompt = ensureBgmPrompt(audio.closest('.mini-player'), audio);
  try {
    await requestBgmPlay(audio, explicit);
    setBgmPromptVisible(prompt, false);
  } catch (e) {
    setBgmPromptVisible(prompt, true);
    if (explicit) throw e;
  }
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

export { initBgmAutoplay, ensureBgmPrompt, setBgmPromptVisible, getBgmPlaylist, bgmTrackKeys, getBgmSchedule, setBgmSchedule, setBgmPlaylist, normalizeBgmTracks, dedupeBgmTracks, bgmTrackKey, loadBgmTrack, advanceBgmTrack, defaultBgmTitle, fileNameFromUrl };

let initialization;
export function initBgmRuntime(audio = document.querySelector('[data-bgm]')) {
  if (!audio) return Promise.resolve();
  if (initialization) return initialization;
  initialization = (async () => {
    initBgmConsent(audio);
    const trackTitle = document.createElement('span');
    trackTitle.textContent = defaultBgmTitle(audio);
    const playlist = await getSavedBgmPlaylist(audio);
    const schedule = await getSavedBgmSchedule(playlist);
    setBgmSchedule(audio, schedule, playlist);
    const startIndex = randomBgmCandidateIndex(scheduledBgmTrackIndexes(
      bgmTrackKeys(playlist), schedule, bgmMinuteInTimeZone(new Date(), BGM_TIME_ZONE),
    ));
    setBgmPlaylist(audio, trackTitle, playlist, startIndex);
    restoreNavigationBgm(audio);
    initBgmAutoplay(audio);
    if (isLoggedIn()) {
      const { mountBgmOwnerTools } = await import('./bgm-owner.js');
      mountBgmOwnerTools(audio, trackTitle);
    }
  })().catch(error => {
    audio.dispatchEvent(new CustomEvent('bgm-error', {detail:cmsErrorMessage(error)}));
    console.warn('BGM initialization failed:', cmsErrorMessage(error));
  });
  return initialization;
}

import assert from 'node:assert/strict';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import * as logic from '../js/bgm-playlist-logic.mjs';

// No backend modules are imported: every setting/media operation is an in-memory spy.
const parserPath = process.env.CWK_DOM_PARSER_MODULE;
assert.ok(parserPath, 'Set CWK_DOM_PARSER_MODULE to an installed linkedom ESM entry.');
const { parseHTML } = await import(pathToFileURL(parserPath).href);
const { window, document } = parseHTML('<html><body><main class="sketch-content"></main><aside class="sk-music-dock"></aside></body></html>');
Object.assign(globalThis, { window, document, alert: message => { throw new Error(message); }, confirm: () => true });
window.HTMLElement.prototype.scrollIntoView = () => {};
const writes = [], uploads = [], deletes = [];
const savedTrack = { url: 'https://example.invalid/old.mp3', title: 'old.mp3', mediaId: 'old' };
let playlist = [savedTrack], savedReads = 0, autoplay = 0;
const keys = list => list.map(track => track.url);
let schedule = logic.normalizeBgmSchedule(null, keys(playlist));
const pb = {
  getSetting: async () => '', getSettingStrict: async () => '',
  setSetting: async (key, value) => { writes.push([key, value]); },
  isLoggedIn: () => true, cmsErrorMessage: error => error.message,
  uploadMedia: async file => { uploads.push(file.name); return { id: 'new', file: file.name }; },
  trimBgmMedia: async () => { throw new Error('Unexpected trim call'); },
  getMediaUrl: media => `https://example.invalid/${media.file}`,
  deleteMediaIfUnreferenced: async id => { deletes.push(id); },
  escapeHtml: value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;'),
};
const runtime = {
  getSavedBgmPlaylist: async () => { savedReads++; return [savedTrack]; },
  initBgmAutoplay: () => { autoplay++; }, ensureBgmPrompt: () => null, setBgmPromptVisible: () => {},
  getBgmPlaylist: () => playlist, bgmTrackKeys: keys, getBgmSchedule: () => schedule,
  setBgmSchedule: (_audio, value) => { schedule = value; },
  setBgmPlaylist: (_audio, _title, value) => { playlist = value; },
  normalizeBgmTracks: values => values,
  dedupeBgmTracks: values => [...new Map(values.map(track => [track.url, track])).values()],
  bgmTrackKey: track => track?.url || '', loadBgmTrack: () => {}, advanceBgmTrack: () => {},
  defaultBgmTitle: () => 'music', fileNameFromUrl: value => value.split('/').pop(),
};
globalThis.__bgmOwnerQa = {
  './pb.js': pb,
  './bgm-consent.js': { pauseBgmInternally: () => {}, requestBgmPlay: async () => {} },
  './review-media.js': { reviewMediaValue: value => value },
  './bgm-runtime.js': runtime,
  './bgm-playlist-logic.mjs': logic,
};
const source = fs.readFileSync(new URL('../js/bgm-owner.js', import.meta.url), 'utf8');
const substituted = source.replace(/import\s*\{([^}]+)\}\s*from\s*'([^']+)';/g,
  (_match, names, module) => `const {${names}} = globalThis.__bgmOwnerQa[${JSON.stringify(module)}];`);
assert.doesNotMatch(substituted, /^import /m, 'all static I/O imports must be mocked');
// Ensure the real module boundary exports each mocked runtime dependency.
const runtimeSource = fs.readFileSync(new URL('../js/bgm-runtime.js', import.meta.url), 'utf8');
const runtimeImports = source.match(/import\s*\{([^}]+)\}\s*from\s*'\.\/bgm-runtime.js'/)[1].split(',').map(name => name.trim());
const exportNames = new Set([
  ...[...runtimeSource.matchAll(/export\s+(?:async\s+)?function\s+(\w+)/g)].map(match => match[1]),
  ...[...runtimeSource.matchAll(/export\s*\{([^}]+)\}/g)].flatMap(match => match[1].split(',').map(name => name.trim())),
]);
for (const name of runtimeImports) assert.ok(exportNames.has(name), `runtime must export ${name}`);
const { mountBgmOwnerTools } = await import(`data:text/javascript;base64,${Buffer.from(substituted).toString('base64')}`);
const audio = { _bgmTrackIndex: 0, paused: true };
mountBgmOwnerTools(audio, document.createElement('span'));
mountBgmOwnerTools(audio, document.createElement('span'));
assert.equal(document.querySelectorAll('.sk-owner-music').length, 1, 'mount is idempotent');
const input = document.querySelector('input[type="file"]');
input.files = [{ name: 'new.mp3', type: 'audio/mpeg' }];
input.dispatchEvent(new window.Event('change'));
for (let i = 0; i < 30 && document.querySelector('[data-bgm-upload]').disabled; i++) await new Promise(resolve => setTimeout(resolve, 5));
assert.equal(document.querySelector('[data-bgm-upload]').disabled, false, 'upload handler settles');
assert.deepEqual(uploads, ['new.mp3']);
assert.equal(savedReads, 1, 'upload must reload the existing saved playlist');
assert.deepEqual(playlist.map(track => track.title), ['new.mp3', 'old.mp3'], 'new track prepends without losing existing tracks');
assert.deepEqual(writes.map(([key]) => key), ['bgm_audio_url', 'bgm_audio_title', 'bgm_schedule', 'bgm_playlist']);
assert.deepEqual(deletes, [], 'successful upload must not trigger error cleanup');
assert.equal(autoplay, 1);
assert.match(document.querySelector('.bgm-upload-status').textContent, /1곡 추가됨/);
const openButton = [...document.querySelectorAll('.bgm-owner-row button')].find(button => button.textContent === 'BGM 편성표');
openButton.click();
const panel = document.querySelector('[data-bgm-schedule-editor]');
assert.ok(panel, 'schedule editor opens in the new main surface');
assert.equal(panel.querySelectorAll('[data-bgm-preview]').length, 2);
assert.equal(panel.querySelectorAll('[data-bgm-trim]').length, 2);
assert.ok(panel.querySelectorAll('[data-bgm-assignment]').length >= 2, 'schedule assignment controls are populated');
panel.querySelector('[data-bgm-editor-close]').click();
assert.equal(document.querySelector('[data-bgm-schedule-editor]'), null);
console.log('BGM owner runtime mock upload and schedule checks passed. No backend I/O performed.');

import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../js/bgm-consent.js', import.meta.url), 'utf8');
const storage = new Map([['cwk:bgm:preference', 'off']]);
globalThis.localStorage = { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) };
globalThis.window = new EventTarget();
const policy = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
class Audio extends EventTarget {
  paused = true;
  ended = false;
  src = '/test.wav';
  readyState = 0;
  plays = 0;
  play() { this.paused = false; this.plays++; this.dispatchEvent(new Event('play')); return Promise.resolve(); }
  pause() { if (this.paused) return; this.paused = true; queueMicrotask(() => this.dispatchEvent(new Event('pause'))); }
}
const audio = new Audio();
policy.initBgmConsent(audio);
assert.equal(audio.autoplay, false);
await policy.requestBgmPlay(audio);
assert.equal(audio.plays, 0, 'stored silence blocks automatic playback');
await policy.requestBgmPlay(audio, true);
assert.equal(policy.bgmAllowed(), true);
audio.pause();
await Promise.resolve();
assert.equal(policy.bgmAllowed(), false, 'pause while still loading persists silence');
await policy.requestBgmPlay(audio);
assert.equal(audio.plays, 1, 'later automatic retry respects pause');
await policy.requestBgmPlay(audio, true);
policy.pauseBgmInternally(audio);
await Promise.resolve();
assert.equal(policy.bgmAllowed(), true, 'internal track or DOM move pause preserves intent');
await policy.requestBgmPlay(audio);
assert.equal(audio.paused, false);
audio.ended = true;
audio.pause();
await Promise.resolve();
assert.equal(policy.bgmAllowed(), true, 'natural end permits next track');
audio.ended = false;
await policy.requestBgmPlay(audio);
window.dispatchEvent(Object.assign(new Event('storage'), { key: 'cwk:bgm:preference', newValue: 'off' }));
await Promise.resolve();
assert.equal(audio.paused, true, 'silence in another tab stops current playback');
assert.equal(policy.bgmAllowed(), false);
for (const file of ['index.html', 'records/index.html', 'album/index.html', 'all/view.html', 'guestbook.html', 'about.html']) {
  const html = fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
  assert.doesNotMatch(html.match(/<audio[^>]*data-bgm[^>]*>/)?.[0] || '', /autoplay/);
}
console.log('BGM consent QA passed: silence, loading pause, resume, internal pause, natural end, cross-tab stop, HTML defaults.');

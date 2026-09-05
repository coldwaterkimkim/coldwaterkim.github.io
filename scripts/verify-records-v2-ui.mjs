// Isolated DOM integration: executes the actual app handlers with injected I/O.
// Run with CWK_DOM_PARSER_MODULE pointing to an installed linkedom ESM entry.
// No HTTP requests, browser, PocketBase session, uploads, or saved records.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { sanitizeLegacyHtml } from '../js/records-v2-model.mjs';
import { imageCropStyle } from '../js/image-crop.mjs';
import { normalizeChatGptSnapshot, chatGptShareInfo } from '../js/chatgpt-embeds.mjs';
import { renderChatGptMarkdown, decorateChatGptMarkdown } from '../js/chatgpt-markdown.mjs';
import { enhanceEmbeddedMedia } from '../js/media-embeds.js';

assert.ok(process.env.CWK_DOM_PARSER_MODULE, 'Set CWK_DOM_PARSER_MODULE to an installed linkedom ESM entry; this suite must not silently skip.');
const { parseHTML, DOMParser } = await import(process.env.CWK_DOM_PARSER_MODULE);
const { document, window } = parseHTML('<!doctype html><html><body><div id="records-app"></div></body></html>');
// Linkedom does not implement Range.setStart or DocumentFragment.textContent.
// Supply only the element-boundary range used by the app, with explicit guards;
// this is DOM emulation, not a claim to test a browser's Range implementation.
Object.defineProperty(window.DocumentFragment.prototype, 'textContent', {
  configurable: true, get() { return [...this.childNodes].map(node => node.textContent || '').join(''); },
});
document.createRange = () => {
  let container, boundary;
  return {
    setStart(node, offset) { assert.equal(offset, 0, 'Harness supports element start only'); container = node; },
    setEndBefore(node) { boundary = node; },
    cloneContents() {
      assert.ok(container.contains(boundary), 'Range boundary must be inside its container');
      const output = document.createDocumentFragment();
      let reached = false;
      const copy = (source, target) => {
        for (const child of source.childNodes) {
          if (child === boundary) { reached = true; break; }
          if (child.contains?.(boundary)) {
            const partial = child.cloneNode(false); target.append(partial); copy(child, partial);
          } else target.append(child.cloneNode(true));
          if (reached) break;
        }
      };
      copy(container, output);
      return output;
    },
  };
};
const rangeFixture = document.createElement('div');
rangeFixture.innerHTML = '<p>앞</p><figure><span>안쪽 앞</span><img src="/x.jpg"><span>뒤</span></figure><p>마지막</p>';
const fixtureRange = document.createRange(); fixtureRange.setStart(rangeFixture, 0); fixtureRange.setEndBefore(rangeFixture.querySelector('img'));
assert.equal(fixtureRange.cloneContents().cloneNode(true).textContent, '앞안쪽 앞', 'Nested range adapter must stop before media and omit subsequent text');
class HTMLParser {
  parseFromString(html) { return new DOMParser().parseFromString(`<!doctype html><html><body>${html}</body></html>`, 'text/html'); }
}
const location = { origin: 'http://127.0.0.1:5196', href: 'http://127.0.0.1:5196/records/#home', hash: '#home' };
Object.assign(globalThis, { document, DOMParser: HTMLParser });
let networkAttempts = 0;
globalThis.fetch = () => { networkAttempts++; throw new Error('Network access is forbidden in Records UI tests'); };
window.scrollTo = () => {};
const history = { pushState(_a, _b, hash) { location.hash = hash; }, replaceState(_a, _b, hash) { location.hash = hash; } };
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
let uploadJob, shareJob, saveJob;
let uploads = 0, saves = 0;
const service = {
  isOwner: () => true,
  uploadFiles: () => { uploads++; return uploadJob.promise; },
  resolveChatGptShare: () => shareJob.promise,
  saveRecord: () => { saves++; return saveJob.promise; },
};
const dependencies = {
  document, window, Node: window.Node, location, history, service,
  requestAnimationFrame: callback => callback(), matchMedia: () => ({ matches: false }),
  confirm: () => true, prompt: () => null,
  sanitizeLegacyHtml, imageCropStyle, normalizeChatGptSnapshot, chatGptShareInfo,
  renderChatGptMarkdown, decorateChatGptMarkdown,
  // Real media decoration. Fixtures have no PocketBase video paths, and fetch
  // is forbidden above so derivative hydration cannot contact a live server.
  enhanceEmbeddedMedia,
  observeEditorMediaDuringUploads: () => ({ sync() {}, destroy() {} }),
  openPhotoEditor: async () => null,
  getSetting: async () => '',
};
const source = await readFile(new URL('../js/records-v2-app.js', import.meta.url), 'utf8');
const bootstrap = 'try{await service.initSession();';
assert.equal(source.split(bootstrap).length, 2, 'App startup boundary changed: review the harness before running it.');
const handlers = source.slice(0, source.indexOf(bootstrap)).replace(/^import[^\n]+;\n/gm, '');
assert.doesNotMatch(handlers, /^import\b/m, 'New multiline imports need explicit test dependency injection.');
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const app = await new AsyncFunction(...Object.keys(dependencies), `${handlers}\nreturn { openEditor, attachFiles, entry, legacyView };`)(...Object.values(dependencies));
const root = document.querySelector('#records-app');
const tick = () => new Promise(resolve => setImmediate(resolve));
const event = (node, type) => node.dispatchEvent(new window.Event(type, { bubbles: true, cancelable: true }));
const click = node => { assert.ok(node, 'Expected UI control'); assert.ok(!node.disabled, 'Cannot click disabled control'); event(node, 'click'); };
const byText = (text, scope = root) => [...scope.querySelectorAll('button')].find(node => node.textContent === text);
const publish = () => root.querySelector('[data-save="published"]');
const write = value => { const node = root.querySelector('textarea.rv-compose-body'); node.value = value; event(node, 'input'); };
const attachment = (id, comment = '') => ({ id, mediaId: id, kind: 'image', name: `${id}.jpg`, url: `https://example.test/${id}.jpg`, comment, crop: null });

await app.openEditor();
assert.equal(publish().disabled, true, 'Empty composer must disable publishing');
assert.equal(root.querySelector('.rv-attachment-help').hidden, true);
write('  \n '); assert.equal(publish().disabled, true, 'Whitespace cannot enable publishing');
write('# Plain **text**'); assert.equal(publish().disabled, false);
const date = root.querySelector('input[type="date"]');
const validDate = date.value;
date.value = ''; event(date, 'change'); assert.equal(publish().disabled, true, 'Missing record date disables save');
date.value = validDate; event(date, 'change'); assert.equal(publish().disabled, false);
write(''); assert.equal(publish().disabled, true, 'Clearing the last content disables publishing');

// Real link-form handlers: deferred ChatGPT response, saved snapshot and remove.
click(byText('링크'));
shareJob = deferred();
root.querySelector('#rv-link-form input').value = 'https://chatgpt.com/share/6a901ff4-0b9c-83e9-b058-8ecd80b68701';
event(root.querySelector('#rv-link-form'), 'submit');
assert.equal(publish().disabled, true);
shareJob.resolve({ snapshot: { title: '대화', messages: [{ role: 'user', text: '질문 **원문**' }, { role: 'assistant', text: '답변\n\n|열|\n|--|\n|값|' }] } });
await tick();
assert.equal(publish().disabled, false, 'A completed embed enables publishing');
assert.equal(root.querySelectorAll('.rv-message').length, 2);
assert.equal(root.querySelector('.rv-message strong + div strong').textContent, '원문');
assert.ok(root.querySelector('.rv-message table'), 'Saved conversation formatting survives');
click(byText('첨부에서 빼기')); assert.equal(publish().disabled, true, 'Removing the last embed disables publishing');

// An unsuccessful link lookup unlocks controls but cannot enable an empty post.
click(byText('링크')); shareJob = deferred();
root.querySelector('#rv-link-form input').value = 'https://chatgpt.com/share/6a901ff4-0b9c-83e9-b058-8ecd80b68701';
event(root.querySelector('#rv-link-form'), 'submit');
shareJob.reject(new Error('test preview failure')); await tick();
assert.match(root.querySelector('#rv-link-form').textContent, /test preview failure/);
assert.equal(publish().disabled, true); assert.equal(byText('사진 · 영상').disabled, false);
click(byText('닫기', root.querySelector('#rv-link-form')));

// Upload runs through the real busy/finish/error handlers with only I/O stubbed.
uploadJob = deferred(); const upload = app.attachFiles([{ name: 'one.jpg' }]);
assert.equal(byText('닫기').disabled, true);
assert.equal(publish().disabled, true);
assert.equal(root.querySelector('textarea').disabled, false, 'Writing may continue during transfer');
write('업로드 중 쓴 글'); assert.equal(publish().disabled, true, 'Input cannot override upload lock');
await app.attachFiles([{ name: 'duplicate.jpg' }]); assert.equal(uploads, 1, 'Busy guard prevents concurrent attachment batches');
uploadJob.resolve([attachment('one')]); await upload;
assert.equal(publish().disabled, false); assert.equal(byText('닫기').disabled, false);
assert.equal(root.querySelector('.rv-attachment-help').hidden, false);
write(''); assert.equal(publish().disabled, false, 'Photo-only records remain valid');
click(root.querySelector('[aria-label="1번째 첨부에서 빼기"]'));
assert.equal(publish().disabled, true); assert.equal(root.querySelector('.rv-attachment-help').hidden, true);
uploadJob = deferred(); const failedUpload = app.attachFiles([{ name: 'broken.jpg' }]);
uploadJob.reject(new Error('test upload failure')); await failedUpload;
assert.match(root.querySelector('.rv-status').textContent, /test upload failure/);
assert.equal(publish().disabled, true); assert.equal(byText('닫기').disabled, false);

// Save failures preserve text and restore editability; no record is written.
write('보존할 초안'); saveJob = deferred(); click(root.querySelector('[data-save="draft"]'));
assert.equal(root.querySelector('textarea').disabled, true);
saveJob.reject(new Error('test revision conflict')); await tick();
assert.equal(saves, 1); assert.equal(root.querySelector('textarea').value, '보존할 초안');
assert.equal(root.querySelector('textarea').disabled, false); assert.equal(publish().disabled, false);

// A complete first cropped photo in the excerpt, then every original media item.
const crop = '0.1,0.2,0.4,0.5,1,1200';
const html = `<p>${'원문 내용 '.repeat(90)}</p><figure><img src="https://example.test/first.jpg" data-cwk-image-crop="${crop}"><figcaption>첫 사진 설명</figcaption></figure><p>사진 사이 문장</p><img src="https://example.test/second.jpg"><video src="https://example.test/video.mp4"></video><p>마지막 원문</p>`;
const legacyRecord = { legacyHtml: html };
const legacy = app.legacyView(legacyRecord, false, true); root.replaceChildren(legacy);
assert.equal(legacy.querySelectorAll('button').length, 1);
assert.equal(legacy.querySelectorAll('img').length, 1);
assert.ok(legacy.querySelector('.cwk-media-crop-frame'), 'First photo must retain its actual crop decoration');
assert.equal(legacy.querySelector('img').getAttribute('data-cwk-image-crop'), crop);
assert.ok(legacy.querySelector('.rv-legacy-excerpt .rv-body').textContent.length <= 361);
click(byText('더 보기', legacy));
assert.equal(legacy.querySelectorAll('button').length, 0);
assert.equal(legacy.querySelectorAll('img').length, 2); assert.equal(legacy.querySelectorAll('video').length, 1);
assert.match(legacy.textContent, /사진 사이 문장/); assert.match(legacy.textContent, /마지막 원문/);
assert.equal(legacyRecord.legacyHtml, html, 'Excerpt and expansion must never mutate stored source');

// Actual carousel scroll/keyboard handlers: count, dot, comment and fallback.
const record = { id: 'test-record', category: 'daily', body: '공통 본문', attachments: [attachment('a', '첫 사진 코멘트'), attachment('b', ' \n ')], embeds: [] };
const article = app.entry(record); root.replaceChildren(article);
const slides = article.querySelector('.rv-slides');
Object.defineProperty(slides, 'clientWidth', { value: 390 });
slides.scrollBy = ({ left }) => { slides.scrollLeft += left; event(slides, 'scroll'); };
slides.scrollLeft = 0;
assert.equal(article.querySelector('.rv-body').textContent, '첫 사진 코멘트');
slides.scrollLeft = 390; event(slides, 'scroll');
assert.equal(article.querySelector('.rv-body').textContent, '공통 본문');
assert.equal(article.querySelector('.rv-count').textContent, '2 / 2');
assert.equal(article.querySelectorAll('.rv-dot')[1].getAttribute('aria-current'), 'true');
const key = new window.Event('keydown', { bubbles: true, cancelable: true }); key.key = 'ArrowLeft'; slides.dispatchEvent(key);
assert.equal(article.querySelector('.rv-body').textContent, '첫 사진 코멘트');
assert.equal(article.querySelector('.rv-count').textContent, '1 / 2');

// Non-photo attachments and embeds are preserved by the same entry renderer.
const mixed = app.entry({ ...record, attachments: [
  { id: 'video', kind: 'video', url: 'https://example.test/original.mp4', playbackUrl: 'https://example.test/playback.mp4', posterUrl: 'https://example.test/poster.jpg' },
  { id: 'audio', kind: 'audio', url: 'https://example.test/song.mp3', name: 'song.mp3' },
  { id: 'file', kind: 'file', url: 'https://example.test/document.pdf', name: 'document.pdf' },
], embeds: [{ id: 'youtube', type: 'youtube', url: 'https://www.youtube.com/watch?v=Abcdef12345&t=1m2s' }] });
root.replaceChildren(mixed);
assert.equal(mixed.querySelector('video').getAttribute('src'), 'https://example.test/playback.mp4');
assert.equal(mixed.querySelector('video').getAttribute('poster'), 'https://example.test/poster.jpg');
assert.equal(mixed.querySelector('video').getAttribute('preload'), 'none');
assert.equal(mixed.querySelector('audio').getAttribute('src'), 'https://example.test/song.mp3');
assert.equal(mixed.querySelector('a[href="https://example.test/document.pdf"]').textContent, 'document.pdf');
assert.equal(mixed.querySelector('iframe'), null, 'YouTube must wait for the play action');
click(byText('영상 재생', mixed));
assert.equal(mixed.querySelector('iframe').getAttribute('src'), 'https://www.youtube-nocookie.com/embed/Abcdef12345?start=62');
assert.equal(uploads, 2, 'Only the two explicitly stubbed upload attempts occurred');
assert.equal(networkAttempts, 0, 'Even caught network attempts must fail this isolated suite');

// Metadata may come from the isolated clone, while every media file still uses
// its original source origin. Fetch is replaced by an in-memory fixture here.
const metadataRequests = [];
globalThis.fetch = async url => {
  metadataRequests.push(new URL(url));
  return { ok: true, json: async () => ({ items: [{ id: 'testvideoid0001', collectionId: 'media', video_status: 'ready', web_video: 'web.mp4', video_poster: 'poster.jpg' }] }) };
};
const originalVideo = 'https://coldwaterkim.com/api/files/media/testvideoid0001/original.mp4';
const videoFixture = () => {
  const element = document.createElement('section'); element.innerHTML = `<video src="${originalVideo}"></video>`;
  const video = element.querySelector('video'); video.paused = true; video.currentTime = 0; video.seeking = false; video.load = () => {};
  return element;
};
const defaultVideo = videoFixture(); enhanceEmbeddedMedia(defaultVideo); await tick();
assert.equal(metadataRequests[0].origin, 'https://coldwaterkim.com', 'Default production metadata origin is unchanged');
const previewVideo = videoFixture(); enhanceEmbeddedMedia(previewVideo, { videoMetadataOrigin: location.origin }); await tick();
assert.equal(metadataRequests.length, 2);
assert.equal(metadataRequests[1].origin, location.origin, 'Preview metadata request stays same origin');
assert.equal(metadataRequests[1].pathname, '/api/collections/media/records');
assert.equal(previewVideo.querySelector('video').getAttribute('src'), 'https://coldwaterkim.com/api/files/media/testvideoid0001/web.mp4');
assert.equal(previewVideo.querySelector('video').getAttribute('poster'), 'https://coldwaterkim.com/api/files/media/testvideoid0001/poster.jpg');
event(previewVideo.querySelector('video'), 'error');
assert.equal(previewVideo.querySelector('video').getAttribute('src'), originalVideo, 'Derivative error falls back to unchanged original media URL');
console.log('Records V2 actual DOM handlers passed: reactive save state, embed fidelity/removal, upload and save failure recovery, legacy excerpt/full source/crop, carousel comment fallback.');
console.log('Scope: DOM events with injected I/O; no layout, touch physics, real crop pointer gestures, network transfer, or persistence claims.');

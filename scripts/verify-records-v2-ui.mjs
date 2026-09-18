import { chatGptPreviewHtml } from '../js/chatgpt-preview.js';
import { displayDate } from '../js/display-date.mjs';
// Isolated DOM integration: executes the actual app handlers with injected I/O.
// Run with CWK_DOM_PARSER_MODULE pointing to an installed linkedom ESM entry.
// No HTTP requests, browser, PocketBase session, uploads, or saved records.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { orderedRecordContent, recordTitle, sanitizeLegacyHtml } from '../js/records-v2-model.mjs';
import { imageCropStyle } from '../js/image-crop.mjs';
import { normalizeChatGptSnapshot, chatGptShareInfo } from '../js/chatgpt-embeds.mjs';
import { renderChatGptMarkdown, decorateChatGptMarkdown } from '../js/chatgpt-markdown.mjs';
import { enhanceEmbeddedMedia } from '../js/media-embeds.js';
import { installPhotoCarousel } from '../js/photo-carousel.js';
import { documentRecordHtml, documentHasContent } from '../js/document-record-content.js';

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
Object.assign(globalThis, { document, window, DOMParser: HTMLParser, requestAnimationFrame: callback => {callback();return 0;}, cancelAnimationFrame: () => {} });
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
const sessionValues = new Map();
const sessionStorage = {getItem:key=>sessionValues.get(key)||null};
const dependencies = {
  chatGptPreviewHtml,
  displayDate,
  sessionStorage,
  reviewMediaValue:value=>value,
  getContentScroller:()=>null,readContentScroll:()=>0,scrollContentTo:()=>{},scrollContentIntoView:()=>{},
  document, window, Node: window.Node, location, history, service,
  requestAnimationFrame: callback => callback(), matchMedia: () => ({ matches: false }),
  confirm: () => true, prompt: () => null,
  orderedRecordContent, recordTitle, sanitizeLegacyHtml, imageCropStyle, normalizeChatGptSnapshot, chatGptShareInfo,
  renderChatGptMarkdown, decorateChatGptMarkdown,
  // Real media decoration. Fixtures have no PocketBase video paths, and fetch
  // is forbidden above so derivative hydration cannot contact a live server.
  enhanceEmbeddedMedia,
  installPhotoCarousel,
  documentRecordHtml, documentHasContent,
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
const app = await new AsyncFunction(...Object.keys(dependencies), `${handlers}\nreturn { entry, legacyView, detailBackLink, recordLoadError, setRoute:value=>{route=value;} };`)(...Object.values(dependencies));
const root = document.querySelector('#records-app');
const documentSource={body:'첫 문단\n다음 문단',legacyHtml:'<h2>기존 소제목</h2>',attachments:[{kind:'image',url:'https://example.test/photo.jpg',name:'사진',comment:'사진 설명',crop:{enabled:true,x:0,y:0,width:.5,height:1,aspect:.5,pixelWidth:600}},{kind:'file',url:'https://example.test/file.pdf',name:'자료.pdf'}],embeds:[{type:'chatgpt',url:'https://chatgpt.com/share/6a901ff4-0b9c-83e9-b058-8ecd80b68701',snapshot:{title:'대화',messages:[{role:'user',text:'원문'}]}}]};
const documentBefore=JSON.stringify(documentSource);
const documentHtml=documentRecordHtml(documentSource);
assert.equal(JSON.stringify(documentSource),documentBefore,'Composing the document must not mutate its source');
assert.ok(documentHtml.includes('data-cwk-image-crop')&&documentHtml.includes('file.pdf')&&documentHtml.includes('data-cwk-chatgpt-snapshot'),'Document conversion retains crop, file and saved conversation');
assert.ok(documentHtml.indexOf('첫 문단')<documentHtml.indexOf('photo.jpg')&&documentHtml.indexOf('photo.jpg')<documentHtml.indexOf('사진 설명'),'Document preserves text/media/comment ordering');
assert.equal(documentHasContent('<p><br></p>'),false);
assert.equal(documentHasContent(documentHtml),true);
const orderedSource={...documentSource,title:'선택 제목',attachments:documentSource.attachments.map((item,index)=>({...item,id:`media-${index}`})),embeds:documentSource.embeds.map(item=>({...item,id:'chat',comment:'대화에 대한 감상'})),contentOrder:['chat','media-1','media-0']};
const orderedHtml=documentRecordHtml(orderedSource);
assert.match(orderedHtml,/<h1>선택 제목<\/h1>/);
assert.ok(orderedHtml.indexOf('data-cwk-chatgpt-embed')<orderedHtml.indexOf('대화에 대한 감상')&&orderedHtml.indexOf('대화에 대한 감상')<orderedHtml.indexOf('file.pdf')&&orderedHtml.indexOf('file.pdf')<orderedHtml.indexOf('photo.jpg'),'Document conversion keeps mixed order and embed comments');
assert.equal(orderedRecordContent(documentSource).length,3,'Unnormalized legacy objects must not lose id-less content');
const legacyTitleRecord={legacySource:{title:'옛 제목'},legacyHtml:'<p>원래 본문</p>'};
assert.match(documentRecordHtml(legacyTitleRecord),/<h1>옛 제목<\/h1>/,'Document editing imports the existing legacy title');
const convertedTitleRecord={...legacyTitleRecord,title:'',titleExplicit:true,legacyHtml:'<!--cwk-document--><h1>옛 제목</h1><p>수정 본문</p>'};
assert.equal((documentRecordHtml(convertedTitleRecord).match(/옛 제목/g)||[]).length,1,'Reopening a document must not duplicate its title');
for(const legacyTitle of ['삭제한 제목','2026-09-18 기록']){
 const untitled={id:'cleared-title',category:'daily',title:'',titleExplicit:true,legacySource:{title:legacyTitle},body:'본문',attachments:[],embeds:[]};
 assert.equal(app.entry(untitled).querySelector('.rv-record-title'),null,'Explicitly empty titles never use compatibility titles');
}
assert.equal(recordTitle(legacyTitleRecord),'옛 제목','Untouched legacy source titles remain visible');


const tick = () => new Promise(resolve => setImmediate(resolve));
const event = (node, type) => node.dispatchEvent(new window.Event(type, { bubbles: true, cancelable: true }));
const click = node => { assert.ok(node, 'Expected UI control'); assert.ok(!node.disabled, 'Cannot click disabled control'); event(node, 'click'); };
const byText = (text, scope = root) => [...scope.querySelectorAll('button')].find(node => node.textContent === text);
const attachment = (id, comment = '') => ({ id, mediaId: id, kind: 'image', name: `${id}.jpg`, url: `https://example.test/${id}.jpg`, comment, crop: null });

app.setRoute('#record/test/media%3Atest');
sessionValues.set('cwk:album:return',JSON.stringify({recordHash:'#record/test/media%3Atest',url:'/album/?tag=food&page=3',at:Date.now()}));
assert.equal(app.detailBackLink().getAttribute('href'),'/album/?tag=food&page=3');
assert.equal(app.detailBackLink().textContent,'← 앨범으로');
sessionValues.set('cwk:album:return',JSON.stringify({recordHash:'#record/other',url:'/album/',at:Date.now()}));
assert.equal(app.detailBackLink().textContent,'← 피드로');
sessionValues.set('cwk:album:return',JSON.stringify({recordHash:'#record/test/media%3Atest',url:'https://elsewhere.test/album/',at:Date.now()}));
assert.equal(app.detailBackLink().textContent,'← 피드로');
assert.match(app.recordLoadError({status:404,message:'Record not found'}),/이 기록을 찾을 수 없어/);
assert.doesNotMatch(app.recordLoadError({message:'Internal SQL error'}),/SQL/);
app.setRoute('#home');
// A complete first cropped photo in the excerpt, then every original media item.
const crop = '0.1,0.2,0.4,0.5,1,1200';
const html = `<p>${'원문 내용 '.repeat(90)}</p><figure><img src="https://example.test/first.jpg" data-cwk-image-crop="${crop}"><figcaption>첫 사진 설명</figcaption></figure><p>사진 사이 문장</p><img src="https://example.test/second.jpg"><video src="https://example.test/video.mp4"></video><p>마지막 원문</p>`;
const legacyRecord = { legacyHtml: html };
const legacy = app.legacyView(legacyRecord, false, true); root.replaceChildren(legacy);
assert.equal(legacy.querySelectorAll('button').length, 1);
assert.equal(legacy.querySelectorAll('img').length, 1);
assert.ok(legacy.querySelector('.cwk-media-crop-frame'), 'First photo must retain its actual crop decoration');
assert.ok(legacy.querySelector('.rv-square-photo .cwk-media-crop-frame'), 'Saved crop fits inside the square letterbox');
assert.equal(legacy.querySelector('img').getAttribute('data-cwk-image-crop'), crop);
assert.ok(legacy.querySelector('.rv-legacy-excerpt .rv-body').textContent.length <= 361);
click(byText('더 보기', legacy));
assert.equal(legacy.querySelectorAll('button').length, 1);
assert.equal(byText('접기', legacy).getAttribute('aria-expanded'), 'true');
assert.equal(legacy.querySelectorAll('img').length, 2); assert.equal(legacy.querySelectorAll('video').length, 1);
assert.match(legacy.textContent, /사진 사이 문장/); assert.match(legacy.textContent, /마지막 원문/);
assert.equal(legacyRecord.legacyHtml, html, 'Excerpt and expansion must never mutate stored source');
legacy.querySelectorAll('video,audio').forEach(media=>{media.pause=()=>{};});
click(byText('접기', legacy));
assert.equal(legacy.querySelectorAll('img').length, 1);
assert.equal(byText('더 보기', legacy).getAttribute('aria-expanded'), 'false');
click(byText('더 보기', legacy));
assert.equal(legacy.querySelectorAll('img').length, 2);
const unnamed=app.entry({id:'untitled',category:'daily',body:'오늘의 기록',attachments:[attachment('IMG_1234')]});
assert.equal(unnamed.querySelector('.rv-record-open'),null,'Untitled records omit the redundant open link');
assert.ok(unnamed.querySelector('.rv-meta a[href="#record/untitled"]'),'The record date retains detail access');
assert.equal(unnamed.querySelector('.rv-slide img').alt,'오늘의 기록 · 첨부 사진 1');
assert.ok(unnamed.querySelector('.rv-square-photo img'), 'Uncropped attachment uses the square contain frame');
const filenameAlt=app.legacyView({category:'daily',legacyHtml:'<img src="https://example.test/test.jpg" alt="IMG_1234.jpg">'});
assert.equal(filenameAlt.querySelector('img').alt,'나으 하루 · 첨부 사진 1');
for(const originalAlt of ['IMG_8210','DSC_0123','image','9d12f1e0-182a-43c7-9e70-b952cd22bcf5']){
  const source={legacySource:{title:'주말 산책'},legacyHtml:`<img src="https://example.test/test.jpg" alt="${originalAlt}">`};
  const rendered=app.legacyView(source);
  assert.equal(rendered.querySelector('img').alt,'주말 산책 · 첨부 사진 1');
  assert.ok(source.legacyHtml.includes(originalAlt),'Saved source alt must remain untouched');
}
const descriptiveAlt=app.legacyView({legacyHtml:'<img src="https://example.test/test.jpg" alt="공원에서 만난 고양이">'});
assert.equal(descriptiveAlt.querySelector('img').alt,'공원에서 만난 고양이');


// Actual carousel scroll/keyboard handlers: count, dot, comment and fallback.
const record = { id: 'test-record', category: 'daily', body: '공통 본문', attachments: [attachment('a', '첫 사진 코멘트'), attachment('b', ' \n ')], embeds: [] };
const article = app.entry(record); root.replaceChildren(article);
const slides = article.querySelector('.rv-slides');
Object.defineProperty(slides, 'clientWidth', { value: 390 });
slides.scrollBy = ({ left }) => { slides.scrollLeft += left; event(slides, 'scroll'); };
slides.scrollTo = ({ left }) => { slides.scrollLeft = left; event(slides, 'scroll'); };
slides.scrollLeft = 0;
assert.equal(article.querySelector('.rv-photo-comment').textContent, '첫 사진 코멘트');
slides.scrollLeft = 390; event(slides, 'scroll');
assert.equal(article.querySelector('.rv-photo-comment').textContent, '');
assert.equal(article.querySelector('.rv-count').textContent, '2 / 2');
assert.equal(article.querySelectorAll('.rv-dot')[1].getAttribute('aria-current'), 'true');
const key = new window.Event('keydown', { bubbles: true, cancelable: true }); key.key = 'ArrowLeft'; slides.dispatchEvent(key);
assert.equal(article.querySelector('.rv-photo-comment').textContent, '첫 사진 코멘트');
assert.equal(article.querySelector('.rv-count').textContent, '1 / 2');

assert.equal(article.querySelector('.rv-global-comment').textContent, '공통 본문');
assert.ok(article.querySelector('.rv-image-link img'));
assert.equal(article.querySelector('.rv-slide-original'),null);
const single=app.entry({...record,attachments:[attachment('single')]});
assert.ok(!single.textContent.includes('null'));
assert.equal(single.querySelector('.rv-photo-comment').textContent,'');

const orderedArticle=app.entry({id:'mixed-order',category:'daily',title:'명시한 제목',body:'본문',attachments:[attachment('last')],embeds:[{id:'first',type:'chatgpt',url:'https://chatgpt.com/share/6a901ff4-0b9c-83e9-b058-8ecd80b68701',comment:'대화 감상',snapshot:{title:'공유 대화',messages:[{role:'user',text:'질문'}]}}],contentOrder:['first','last']});
assert.equal(orderedArticle.querySelector('.rv-record-title').textContent,'명시한 제목');
assert.ok(orderedArticle.querySelector('.rv-slide').querySelector('.rv-chat-preview'),'Mixed content starts with selected link occurrence');
assert.equal(orderedArticle.querySelector('.rv-photo-comment').textContent,'대화 감상','Embed caption follows same carousel contract as photo');
const orderedSlides=orderedArticle.querySelector('.rv-slides');
Object.defineProperty(orderedSlides,'clientWidth',{value:390});orderedSlides.scrollLeft=390;event(orderedSlides,'scroll');
assert.equal(orderedArticle.querySelector('.rv-photo-comment').textContent,'');
assert.equal(orderedArticle.querySelector('.rv-count').textContent,'2 / 2');

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
assert.equal(uploads, 0, 'Public rendering never uploads media');
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
console.log('Records V2 actual DOM handlers passed: public title/mixed order/embed captions, document conversion, legacy excerpt/full source/crop, media carousel and video metadata.');
console.log('Scope: DOM events with injected I/O; no layout, touch physics, real crop pointer gestures, network transfer, or persistence claims.');

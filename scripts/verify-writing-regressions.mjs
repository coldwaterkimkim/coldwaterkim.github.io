import assert from 'node:assert/strict';
import fs from 'node:fs';
import { preferredTransferFiles, preferredTransferImageFiles, uniqueSupportedFiles, uniqueTransferFiles } from '../js/editor-file-transfer.mjs';
import { createEditorUploadCoordinator, editorFileFingerprint } from '../js/editor-upload-coordinator.mjs';
import {
  createPendingMediaTracker,
  normalizePendingMediaIds,
  planPublishedMediaCleanup,
} from '../js/editor-pending-media.mjs';
import {
  isSameOriginMediaUrl,
  observeEditorMediaDuringUploads,
} from '../js/editor-media-quiescence.mjs';
import { postListEntryUrl, publishedEntryViewerUrl } from '../js/editor-publish-navigation.mjs';
import { chatGptShareInfo, normalizeChatGptSnapshot, serializeChatGptSnapshot } from '../js/chatgpt-embeds.mjs';
import { renderChatGptMarkdown } from '../js/chatgpt-markdown.mjs';
import {
  cropAspectFromRect,
  fitImageCropToAspect,
  imageCropStyle,
  parseImageCrop,
  serializeImageCrop,
} from '../js/image-crop.mjs';

const chatGptShare = chatGptShareInfo('https://chatgpt.com/share/6a901ff4-0b9c-83e9-b058-8ecd80b68701?utm_source=test#ignored');
assert.deepEqual(
  chatGptShare,
  {
    id: '6a901ff4-0b9c-83e9-b058-8ecd80b68701',
    url: 'https://chatgpt.com/share/6a901ff4-0b9c-83e9-b058-8ecd80b68701',
  },
  'ChatGPT share links must normalize to a stable embed URL',
);
assert.equal(chatGptShareInfo('http://chatgpt.com/share/6a901ff4-0b9c-83e9-b058-8ecd80b68701'), null, 'ChatGPT embeds must require HTTPS');
assert.equal(chatGptShareInfo('https://evil.example/share/6a901ff4-0b9c-83e9-b058-8ecd80b68701'), null, 'ChatGPT embeds must reject untrusted hosts');
assert.equal(chatGptShareInfo('https://chatgpt.com/g/g-malicious'), null, 'ChatGPT embeds must only accept shared conversations');
const chatGptSnapshot = normalizeChatGptSnapshot({
  title: ' 공유 대화 ',
  messages: [
    { role: 'system', text: 'hidden' },
    { role: 'user', text: ' 질문 ' },
    { role: 'assistant', text: ' 답변 ' },
  ],
});
assert.deepEqual(
  chatGptSnapshot,
  { title: '공유 대화', messages: [{ role: 'user', text: '질문' }, { role: 'assistant', text: '답변' }] },
  'ChatGPT snapshots must keep only visible user and assistant messages',
);
assert.deepEqual(normalizeChatGptSnapshot(serializeChatGptSnapshot(chatGptSnapshot)), chatGptSnapshot, 'ChatGPT snapshots must survive the saved HTML round trip');
const chatGptMarkdown = renderChatGptMarkdown(`# 제목

**굵게**와 [링크](https://example.com), \`코드\`

- 첫째
- 둘째

| 열 A | 열 B |
| --- | --- |
| 값 A | 값 B |

\`\`\`html
<script>alert('nope')</script>
\`\`\`

<script>alert('raw html')</script>

[위험](javascript:alert('nope'))

![추적 이미지](https://tracker.example/pixel.gif)`);
assert.match(chatGptMarkdown, /<h1>제목<\/h1>/, 'ChatGPT Markdown must render headings');
assert.match(chatGptMarkdown, /<strong>굵게<\/strong>/, 'ChatGPT Markdown must render emphasis');
assert.match(chatGptMarkdown, /<table>/, 'ChatGPT Markdown must render tables');
assert.match(chatGptMarkdown, /<pre><code class="language-html">&lt;script&gt;/, 'ChatGPT Markdown must escape fenced code');
assert.match(chatGptMarkdown, /target="_blank" rel="noopener noreferrer"/, 'ChatGPT Markdown links must open safely');
assert.doesNotMatch(chatGptMarkdown, /<script>/, 'ChatGPT Markdown must not execute raw HTML');
assert.doesNotMatch(chatGptMarkdown, /href="javascript:/, 'ChatGPT Markdown must reject unsafe link protocols');
assert.doesNotMatch(chatGptMarkdown, /<img\b/, 'ChatGPT Markdown must not auto-load third-party images');
assert.match(chatGptMarkdown, /\[이미지: 추적 이미지\]/, 'ChatGPT Markdown must keep image labels as links');

const serializedCrop = serializeImageCrop({
  enabled: true,
  x: 0.1,
  y: 0.2,
  width: 0.5,
  height: 0.4,
  aspect: 1.5,
  pixelWidth: 1200,
});
assert.equal(serializedCrop, '0.1,0.2,0.5,0.4,1.5,1200', 'crop metadata must use a stable compact HTML value');
assert.deepEqual(
  parseImageCrop(serializedCrop),
  { enabled: true, x: 0.1, y: 0.2, width: 0.5, height: 0.4, aspect: 1.5, pixelWidth: 1200 },
  'crop metadata must survive an HTML round trip',
);
assert.equal(parseImageCrop('NaN,-1,0,0,nope,0').enabled, false, 'malformed crop metadata must safely show the full image');
assert.equal(parseImageCrop('0,0,0.5,0.5,-1,0').enabled, false, 'incomplete finite crop metadata must also show the full image');
const boundedCrop = parseImageCrop('0.99,0.99,0.5,0.5,1,100');
assert.ok(boundedCrop.x + boundedCrop.width <= 1, 'crop metadata must stay inside the source width');
assert.ok(boundedCrop.y + boundedCrop.height <= 1, 'crop metadata must stay inside the source height');
const squareCrop = fitImageCropToAspect({ enabled: true, x: 0, y: 0, width: 1, height: 1 }, 1, 2);
assert.equal(squareCrop.width, 0.5, 'a square crop on a 2:1 source must reduce the normalized width');
assert.equal(squareCrop.height, 1, 'a square crop on a 2:1 source must keep the full normalized height');
assert.equal(cropAspectFromRect(squareCrop, 2), 1, 'stored crop aspect must match the selected visible rectangle');
assert.deepEqual(
  imageCropStyle({ ...squareCrop, aspect: 1, pixelWidth: 1000 }),
  {
    frame: { aspectRatio: '1', width: '1000px' },
    image: { width: '200%', height: 'auto', left: '-50%', top: '0%' },
  },
  'public crop CSS must enlarge and offset the untouched source image',
);

const bytes = new Uint8Array([1, 2, 3, 4]);
const filesVersion = new File([bytes], 'same.png', {
  type: 'image/png',
  lastModified: 1000,
});
const itemsVersion = new File([bytes], 'same.png', {
  type: 'image/png',
  lastModified: 1001,
});

const filesPreferred = preferredTransferImageFiles({
  files: [filesVersion],
  items: [{ kind: 'file', type: 'image/png', getAsFile: () => itemsVersion }],
});
assert.deepEqual(filesPreferred, [filesVersion], 'DataTransfer files/items duplicate must collapse to files');

const itemsFallback = preferredTransferImageFiles({
  files: [],
  items: [{ kind: 'file', type: 'image/png', getAsFile: () => itemsVersion }],
});
assert.deepEqual(itemsFallback, [itemsVersion], 'items must remain available when files is empty');

const distinctFiles = preferredTransferImageFiles({
  files: [filesVersion, itemsVersion],
  items: [],
});
assert.equal(distinctFiles.length, 2, 'distinct entries in the canonical files list must be preserved');
assert.deepEqual(
  uniqueTransferFiles(distinctFiles),
  [filesVersion],
  'Photos duplicates with the same name, type, and size must ignore unstable lastModified values',
);

const laterNamed = new File([bytes], 'IMG_0020.jpg', { type: 'image/jpeg', lastModified: 1000 });
const earlierNamed = new File([bytes, 5], 'IMG_0010.jpg', { type: 'image/jpeg', lastModified: 1000 });
assert.deepEqual(
  uniqueTransferFiles([laterNamed, earlierNamed]),
  [laterNamed, earlierNamed],
  'media files must preserve the Photos transfer order instead of sorting by filename',
);

const unnamedA = new File([bytes], '', { type: 'image/png', lastModified: 2000 });
const unnamedB = new File([bytes], '', { type: 'image/png', lastModified: 2000 });
const uniqueUnnamed = uniqueSupportedFiles([unnamedA, unnamedB], new Set(['image/png']));
assert.equal(uniqueUnnamed.length, 2, 'different unnamed clipboard images with the same size must be preserved');
assert.equal(uniqueSupportedFiles([unnamedA, unnamedA], new Set(['image/png'])).length, 1, 'the same file object must be deduplicated');

const videoA = new File([bytes], 'clip-01.mov', { type: 'video/quicktime', lastModified: 3000 });
const videoB = new File([bytes], 'clip-02.mp4', { type: 'video/mp4', lastModified: 3001 });
const transferredVideos = preferredTransferFiles({
  files: [videoA, videoB],
  items: [{ kind: 'file', type: 'video/quicktime', getAsFile: () => videoA }],
});
assert.deepEqual(transferredVideos, [videoA, videoB], 'multiple videos must use the canonical transfer file list once');

const videoItemsFallback = preferredTransferFiles({
  files: [],
  items: [
    { kind: 'file', type: 'video/quicktime', getAsFile: () => videoA },
    { kind: 'file', type: 'video/mp4', getAsFile: () => videoB },
  ],
});
assert.deepEqual(videoItemsFallback, [videoA, videoB], 'video clipboard items must remain available when files is empty');

let uploadCalls = 0;
let completedBatches = 0;
let coordinatorNow = 0;
let markFirstPasteStarted;
const firstPasteStarted = new Promise(resolve => { markFirstPasteStarted = resolve; });
const uploadCoordinator = createEditorUploadCoordinator({
  now: () => coordinatorNow,
  async uploadFile(file) {
    uploadCalls += 1;
    await new Promise(resolve => setTimeout(resolve, 5));
    return { url: `/media/${file.name}`, name: file.name, type: file.type };
  },
});
const photo1 = new File([new Uint8Array([11, 12, 13])], '1.png', { type: 'image/png', lastModified: 5000 });
const photo2 = new File([new Uint8Array([21, 22, 23])], '2.png', { type: 'image/png', lastModified: 5001 });
const insertedOrders = [];
const firstPaste = uploadCoordinator.runBatch([photo1, photo2], {
  onFileStart() {
    markFirstPasteStarted();
  },
  onComplete(items) {
    completedBatches += 1;
    insertedOrders.push(items.map(item => item.file.name));
  },
});
await firstPasteStarted;
const repeatedPaste = uploadCoordinator.runBatch([photo2, photo1], {
  onComplete() {
    completedBatches += 1;
  },
});
const [firstPasteResult, repeatedPasteResult] = await Promise.all([firstPaste, repeatedPaste]);
assert.equal(firstPasteResult.duplicate, false, 'the first multi-file paste must be accepted');
assert.equal(repeatedPasteResult.duplicate, true, 'the same batch in a different order must be treated as one duplicated paste event');
assert.equal(uploadCalls, 2, 'duplicated paste events must upload each physical file only once');
assert.equal(completedBatches, 1, 'duplicated paste events must insert one batch only once');
assert.deepEqual(insertedOrders, [['1.png', '2.png']], 'the accepted paste batch must preserve its original order');

coordinatorNow = 3000;
const intentionalSecondPaste = await uploadCoordinator.runBatch([photo2, photo1], {
  onComplete(items) {
    insertedOrders.push(items.map(item => item.file.name));
  },
});
assert.equal(intentionalSecondPaste.duplicate, false, 'the same files may be intentionally inserted again after the event suppression window');
assert.equal(uploadCalls, 2, 'intentional reinsertion in one editor session must reuse already uploaded media records');
assert.deepEqual(insertedOrders[1], ['2.png', '1.png'], 'a later intentional paste must preserve its own transfer order');

let retryCalls = 0;
const retryCoordinator = createEditorUploadCoordinator({
  async uploadFile(file) {
    retryCalls += 1;
    if (retryCalls === 1) throw new Error('temporary failure');
    return { name: file.name };
  },
});
await assert.rejects(() => retryCoordinator.uploadSingle(photo1), /temporary failure/);
await retryCoordinator.uploadSingle(photo1);
assert.equal(retryCalls, 2, 'a failed upload must not be cached and must remain retryable');

const sameNameDifferentImage = new File([new Uint8Array([31, 32, 33])], '1.png', { type: 'image/png', lastModified: 5000 });
assert.notEqual(
  await editorFileFingerprint(photo1),
  await editorFileFingerprint(sameNameDifferentImage),
  'image dedupe must use file content instead of filename alone',
);

const pendingTracker = createPendingMediaTracker('["newmedia0000001"]');
pendingTracker.add('newmedia0000002');
pendingTracker.add('newmedia0000002');
assert.deepEqual(
  pendingTracker.values(),
  ['newmedia0000001', 'newmedia0000002'],
  'draft media candidates must survive reload and remain deduplicated',
);
assert.deepEqual(
  normalizePendingMediaIds(pendingTracker.serialize()),
  ['newmedia0000001', 'newmedia0000002'],
  'draft media candidates must round-trip through the PocketBase text field',
);
const publishedCleanupPlan = planPublishedMediaCleanup(
  pendingTracker.values(),
  '<p>keep</p><video src="https://coldwaterkim.com/api/files/media/newmedia0000001/clip.mov?token=x"></video>',
);
assert.deepEqual(publishedCleanupPlan.kept, ['newmedia0000001'], 'final published content must keep its referenced new upload');
assert.deepEqual(publishedCleanupPlan.removable, ['newmedia0000002'], 'only a new upload removed from final content may be cleaned');
assert.deepEqual(planPublishedMediaCleanup('', '<p>legacy content</p>').removable, [], 'legacy records without candidates must never enter cleanup');

assert.equal(publishedEntryViewerUrl('posts', { slug: 'hello world' }), '/posts/hello%20world/');
assert.equal(
  publishedEntryViewerUrl('posts', { slug: '\ubca0\ud2b8\ub0a8-\uc0ac\ud30c' }),
  '/posts/%EB%B2%A0%ED%8A%B8%EB%82%A8-%EC%82%AC%ED%8C%8C/',
  'Korean post slugs must be encoded safely in public links',
);
assert.equal(publishedEntryViewerUrl('daily', { day_key: '2026-08-03' }), '/daily/2026-08-03/');
assert.equal(publishedEntryViewerUrl('programs', { slug: 'my-app' }), '', 'retired program posts must not have a publish target');
assert.equal(
  postListEntryUrl({ id: 'draft id', slug: 'draft-slug', status: 'draft' }, { ownerMode: true }),
  '/admin/posts.html?id=draft%20id',
  'owner draft titles must reopen the editor instead of the published-only route',
);
assert.equal(
  postListEntryUrl({ id: 'published-id', slug: 'hello world', status: 'published' }, { ownerMode: true }),
  '/posts/hello%20world/',
  'owner published titles must keep opening the public viewer',
);
assert.equal(
  postListEntryUrl({ id: 'draft-id', slug: 'hidden-draft', status: 'draft' }),
  '/posts/hidden-draft/',
  'non-owner URL resolution must never expose an admin editor link',
);

assert.equal(
  isSameOriginMediaUrl('/api/files/media/record/preview.mp4', {
    baseUrl: 'https://coldwaterkim.com/admin/write.html',
    origin: 'https://coldwaterkim.com',
  }),
  true,
  'relative editor previews must be recognized as same-origin network traffic',
);
assert.equal(
  isSameOriginMediaUrl('https://example.com/external.mp4', {
    baseUrl: 'https://coldwaterkim.com/admin/write.html',
    origin: 'https://coldwaterkim.com',
  }),
  false,
  'external media must not be detached by the editor upload guard',
);
assert.equal(
  isSameOriginMediaUrl('blob:https://coldwaterkim.com/local-preview', {
    baseUrl: 'https://coldwaterkim.com/admin/write.html',
    origin: 'https://coldwaterkim.com',
  }),
  false,
  'in-memory blob previews must not be treated as server traffic',
);

function fakeAttributeElement(initialAttributes = {}) {
  const attributes = new Map(Object.entries(initialAttributes));
  return {
    isConnected: true,
    getAttribute(name) {
      return attributes.has(name) ? attributes.get(name) : null;
    },
    hasAttribute(name) {
      return attributes.has(name);
    },
    setAttribute(name, value) {
      attributes.set(name, String(value));
    },
    removeAttribute(name) {
      attributes.delete(name);
    },
  };
}

const previewSource = fakeAttributeElement({ src: '/api/files/media/record/large.mp4' });
const previewVideo = {
  ...fakeAttributeElement({ preload: 'metadata' }),
  isConnected: true,
  currentSrc: 'https://coldwaterkim.com/api/files/media/record/large.mp4',
  paused: false,
  currentTime: 37,
  playbackRate: 1.25,
  muted: true,
  volume: 0.4,
  readyState: 1,
  pauseCalls: 0,
  loadCalls: 0,
  playCalls: 0,
  pause() {
    this.paused = true;
    this.pauseCalls += 1;
  },
  load() {
    this.currentTime = 0;
    this.loadCalls += 1;
  },
  play() {
    this.paused = false;
    this.playCalls += 1;
    return Promise.resolve();
  },
  querySelectorAll(selector) {
    return selector === 'source[src]' && previewSource.hasAttribute('src') ? [previewSource] : [];
  },
};
const previewRoot = {
  querySelectorAll(selector) {
    return selector === 'video, audio' ? [previewVideo] : [];
  },
};
const uploadClasses = new Set();
const uploadContainer = {
  classList: {
    contains: value => uploadClasses.has(value),
  },
};
const fakeObservers = [];
class FakeMutationObserver {
  constructor(callback) {
    this.callback = callback;
    fakeObservers.push(this);
  }
  observe() {}
  disconnect() {}
}
const mediaQuiescence = observeEditorMediaDuringUploads(uploadContainer, {
  mediaRoot: previewRoot,
  MutationObserverClass: FakeMutationObserver,
  baseUrl: 'https://coldwaterkim.com/admin/write.html',
  origin: 'https://coldwaterkim.com',
});
uploadClasses.add('is-image-uploading');
fakeObservers.forEach(observer => observer.callback());
assert.equal(previewSource.hasAttribute('src'), false, 'upload start must detach the same-origin preview source');
assert.equal(previewVideo.getAttribute('preload'), 'none', 'quiesced media must not preload another range');
assert.equal(previewVideo.getAttribute('data-cwk-upload-quiesced'), 'true', 'the suspended preview state must be inspectable');
assert.equal(previewVideo.pauseCalls, 1, 'a playing preview must pause exactly once during upload');

uploadClasses.delete('is-image-uploading');
fakeObservers.forEach(observer => observer.callback());
assert.equal(previewSource.getAttribute('src'), '/api/files/media/record/large.mp4', 'upload end must restore the exact source URL');
assert.equal(previewVideo.getAttribute('preload'), 'metadata', 'upload end must restore the prior preload policy');
assert.equal(previewVideo.currentTime, 37, 'upload end must restore the previous playback position');
assert.equal(previewVideo.playCalls, 1, 'a preview that was playing must resume after upload');
assert.equal(previewVideo.hasAttribute('data-cwk-upload-quiesced'), false, 'the inspectable suspended marker must be cleared');
mediaQuiescence.destroy();

const { pocketBaseImageSources, pocketBaseVideoReference, videoDerivativeSources } = await import('../js/media-embeds.js');
const optimizedImage = pocketBaseImageSources(
  'https://coldwaterkim.com/api/files/media/record/photo.jpeg?token=keep-me',
);
assert.equal(
  optimizedImage.displayUrl,
  'https://coldwaterkim.com/api/files/media/record/photo.jpeg?token=keep-me&thumb=1600x0',
  'public article images must use the large display thumbnail while preserving existing query params',
);
assert.equal(
  optimizedImage.editorPreviewUrl,
  'https://coldwaterkim.com/api/files/media/record/photo.jpeg?token=keep-me&thumb=800x0',
  'media-heavy editors must use a bounded preview instead of loading every original image',
);
assert.match(optimizedImage.srcset, /thumb=800x0.*800w/, 'responsive image sources must include an 800px thumbnail');
assert.match(optimizedImage.srcset, /thumb=1600x0.*1600w/, 'responsive image sources must include a 1600px thumbnail');
assert.equal(
  optimizedImage.originalUrl,
  'https://coldwaterkim.com/api/files/media/record/photo.jpeg?token=keep-me',
  'the original image URL must remain available separately from display thumbnails',
);

const legacyImage = pocketBaseImageSources(
  'https://api.coldwaterkim.com/api/files/media/record/photo.png',
);
assert.equal(
  legacyImage.originalUrl,
  'https://coldwaterkim.com/api/files/media/record/photo.png',
  'legacy Oracle media URLs must resolve through the current iMac origin',
);
assert.equal(pocketBaseImageSources('https://coldwaterkim.com/api/files/media/record/animated.gif'), null, 'GIF animation must keep its original source');
assert.equal(pocketBaseImageSources('https://coldwaterkim.com/api/files/media/record/animated.webp'), null, 'WebP animation must keep its original source');
assert.equal(pocketBaseImageSources('https://example.com/photo.jpeg'), null, 'external images must not receive PocketBase thumbnail params');

const videoReference = pocketBaseVideoReference(
  'https://api.coldwaterkim.com/api/files/pbc_2708086759/abcdefghijklmno/large.MP4',
);
assert.equal(videoReference.origin, 'https://coldwaterkim.com', 'legacy video URLs must use the current iMac origin');
assert.equal(videoReference.recordId, 'abcdefghijklmno', 'video media record id must be parsed from the original URL');
assert.equal(videoReference.originalUrl, 'https://coldwaterkim.com/api/files/pbc_2708086759/abcdefghijklmno/large.MP4');

const videoSources = videoDerivativeSources(videoReference, {
  id: 'abcdefghijklmno',
  collectionId: 'pbc_2708086759',
  web_video: 'large_web_abcd1234.mp4',
  video_poster: 'large_poster_abcd1234.jpg',
  video_status: 'ready',
});
assert.equal(videoSources.playbackUrl, 'https://coldwaterkim.com/api/files/pbc_2708086759/abcdefghijklmno/large_web_abcd1234.mp4');
assert.equal(videoSources.posterUrl, 'https://coldwaterkim.com/api/files/pbc_2708086759/abcdefghijklmno/large_poster_abcd1234.jpg');
assert.equal(videoSources.originalUrl, videoReference.originalUrl, 'video derivative metadata must preserve the original URL');
assert.equal(videoDerivativeSources(videoReference, { id: 'abcdefghijklmno', video_status: 'pending' }), null, 'pending videos must keep the original playback fallback');
const pendingPoster = videoDerivativeSources(videoReference, { id: 'abcdefghijklmno', collectionId: 'pbc_2708086759', video_status: 'processing', video_poster: 'early.jpg' });
assert.equal(pendingPoster.playbackUrl, '', 'processing videos must not replace the original playback source');
assert.match(pendingPoster.posterUrl, /early\.jpg$/, 'poster must become visible before the full transcode finishes');

globalThis.window = {
  location: {
    hostname: '127.0.0.1',
    origin: 'http://127.0.0.1:4173',
  },
  POCKETBASE_URL: '',
};

const pbModule = await import('../js/pb.js');
assert.equal(
  pbModule.slugify('(26.02.24-26.03.06)\ubca0\ud2b8\ub0a8 \ud138: \uc0ac\ud30c'),
  '260224-260306-\ubca0\ud2b8\ub0a8-\ud138-\uc0ac\ud30c',
  'post slugs must preserve Korean title words while normalizing punctuation',
);
assert.equal(pbModule.slugify('Caf\u00e9 \uc5ec\ud589\uae30'), 'cafe-\uc5ec\ud589\uae30', 'Latin accent folding must remain stable alongside Korean slugs');
let requestedPostSort = '';
pbModule.pb.collection = collectionName => {
  assert.equal(collectionName, 'posts');
  return {
    async getList(_page, _perPage, options) {
      requestedPostSort = options.sort;
      return { items: [], page: 1, perPage: 20, totalItems: 0, totalPages: 0 };
    },
  };
};

await pbModule.getAllPosts(1, 20);
assert.equal(requestedPostSort, '-published_at,-created', 'owner posts must use the selected publish date');

await pbModule.getPublishedPosts(1, 20);
assert.equal(requestedPostSort, '-published_at,-created', 'public and owner post lists must share the same sort');

let requestedSummaryFields = '';
const dailyPages = [
  {
    items: [
      { id: 'a', day_key: '2026-08-05', published_at: '2026-08-05T10:00:00Z' },
      { id: 'b', day_key: '2026-08-05', published_at: '2026-08-05T09:00:00Z' },
      { id: 'c', day_key: '2026-08-04', published_at: '2026-08-04T09:00:00Z' },
    ],
    page: 1,
    totalPages: 2,
  },
  {
    items: [
      { id: 'd', day_key: '2026-08-03', published_at: '2026-08-03T09:00:00Z' },
      { id: 'e', day_key: '2026-08-02', published_at: '2026-08-02T09:00:00Z' },
    ],
    page: 2,
    totalPages: 2,
  },
];
pbModule.pb.collection = collectionName => {
  assert.equal(collectionName, 'daily_entries');
  return {
    async getList(page, _perPage, options) {
      requestedSummaryFields = options.fields;
      return dailyPages[page - 1];
    },
  };
};
const threeDailyDays = await pbModule.getPublishedDailySummariesThroughDays(3, 3);
assert.deepEqual(threeDailyDays.map(entry => entry.id), ['a', 'b', 'c', 'd'], 'home summary must preserve all entries from exactly three recent days');
assert.match(requestedSummaryFields, /day_key/);
assert.doesNotMatch(requestedSummaryFields, /content/, 'home daily summary must not request full bodies');

const sortedPosts = pbModule.sortPostsForDisplay([
  { id: 'newer-created', published_at: '2026-07-17', created: '2026-07-20' },
  { id: 'newer-published', published_at: '2026-07-19', created: '2026-07-19' },
]);
assert.equal(sortedPosts[0].id, 'newer-published', 'July 19 must remain above a newly-created July 17 post');
assert.equal(pbModule.getKstDateKey(new Date('2026-07-19T16:30:00Z')), '2026-07-20');

const adminPosts = fs.readFileSync(new URL('../admin/posts.html', import.meta.url), 'utf8');
assert.match(adminPosts, /published_at'\)\.value = getKstDateKey\(\)/, 'new posts must default to the KST date');
assert.match(adminPosts, /hasEditorFileTransfer\(event\.dataTransfer\)/, 'post editor drag and drop must detect supported media files');
assert.match(adminPosts, /markdownEditor\.insertFiles\(insertIndex, uploadedFiles\)/, 'post editor must insert uploaded videos as media blocks');
assert.match(adminPosts, /markdownEditor\.withUploadActivity\(async \(\) =>/, 'post batch uploads must share the editor upload activity guard');
assert.match(adminPosts, /onFilesPaste: files => insertEditorFiles/, 'BlockNote must own post file paste handling');
assert.doesNotMatch(adminPosts, /markdownEditor\.root\.addEventListener\('paste'/, 'post file paste must not have a second DOM owner');
assert.match(adminPosts, /navigateToPublishedEntry\('posts', saved\)/, 'published posts must leave the editor for the public viewer');
assert.match(adminPosts, /formData\.append\('pending_media_ids', pendingMediaTracker\.serialize\(\)\)/, 'post drafts must persist newly uploaded media candidates');
assert.match(adminPosts, /finalizePublishedEditorMedia\(\{\s*collectionName: 'posts'/, 'post cleanup must run only from the explicit publish path');

const postsIndex = fs.readFileSync(new URL('../posts/index.html', import.meta.url), 'utf8');
assert.match(postsIndex, /postListEntryUrl\(post, \{ ownerMode \}\)/, 'post list titles must resolve draft and published destinations by status');
assert.match(postsIndex, /href="\/admin\/posts\.html\?id=\$\{post\.id\}"/, 'post list owner edit links must be root-relative');
assert.doesNotMatch(postsIndex, /href="\.\.\/admin\//, 'post list must not resolve owner links relative to its public route');

const globalWriter = fs.readFileSync(new URL('../js/global-writer.js', import.meta.url), 'utf8');
assert.match(globalWriter, /onFilesPaste: files => insertEditorFiles/, 'BlockNote must own global writer file paste handling');
assert.doesNotMatch(globalWriter, /markdownEditor\.root\.addEventListener\('paste'/, 'global writer file paste must not have a second DOM owner');
assert.match(globalWriter, /markdownEditor\.insertFiles\(insertIndex, uploadedFiles\)/, 'global writer must insert uploaded videos as media blocks');
assert.match(globalWriter, /markdownEditor\.withUploadActivity\(async \(\) =>/, 'global writer batch uploads must share the editor upload activity guard');
assert.match(globalWriter, /navigateToPublishedEntry\(category, saved\)/, 'global writer publish must leave the editor for the matching viewer');
assert.match(globalWriter, /if \(mode === 'publish'\) \{\s*const collectionName[\s\S]*finalizePublishedEditorMedia/, 'global writer cleanup must wait for explicit publish');

const adminDaily = fs.readFileSync(new URL('../admin/daily.html', import.meta.url), 'utf8');
assert.match(adminDaily, /onFilesPaste: files => insertEditorFiles/, 'BlockNote must own daily file paste handling');
assert.match(adminDaily, /markdownEditor\.withUploadActivity\(async \(\) =>/, 'daily batch uploads must share the editor upload activity guard');
assert.doesNotMatch(adminDaily, /markdownEditor\.root\.addEventListener\('paste'/, 'daily file paste must not have a second DOM owner');
assert.match(adminDaily, /navigateToPublishedEntry\('daily', saved\)/, 'published daily entries must leave the editor for the day viewer');
assert.match(adminDaily, /formData\.append\('pending_media_ids', pendingMediaTracker\.serialize\(\)\)/, 'daily drafts must persist newly uploaded media candidates');
assert.match(adminDaily, /finalizePublishedEditorMedia\(\{\s*collectionName: 'daily_entries'/, 'daily cleanup must run only from the explicit publish path');

const programs = fs.readFileSync(new URL('../js/programs.js', import.meta.url), 'utf8');
assert.match(programs, /runLocalTool/, 'programs room must run local file tools');
assert.match(programs, /runServerToolClient/, 'programs room must connect authenticated server tools');
assert.doesNotMatch(programs, /createProgram|updateProgram|deleteProgram/, 'retired program post editing must stay removed');

const mediaEmbeds = fs.readFileSync(new URL('../js/media-embeds.js', import.meta.url), 'utf8');
assert.match(mediaEmbeds, /img\.setAttribute\('loading', 'lazy'\)/, 'rendered images must use native lazy loading');
assert.match(mediaEmbeds, /img\.setAttribute\('decoding', 'async'\)/, 'rendered images must decode asynchronously');
assert.match(mediaEmbeds, /setAttribute\('preload', 'none'\)/, 'rendered video and audio must wait for user playback');
assert.doesNotMatch(mediaEmbeds, /setAttribute\('preload', 'metadata'\)/, 'media-heavy articles must not preload every video metadata block');
assert.match(mediaEmbeds, /setAttribute\('poster', sources\.posterUrl\)/, 'ready video derivatives must expose a poster frame');
assert.match(mediaEmbeds, /dataset\.cwkOriginalSrc = sources\.originalUrl/, 'video rendering must retain the original file URL');
assert.match(mediaEmbeds, /dataset\.cwkPlaybackFailed/, 'broken playback derivatives must fall back to the preserved original');
assert.match(mediaEmbeds, /!video\.paused \|\| video\.currentTime > 0 \|\| video\.seeking/, 'hydration must not interrupt video playback already in progress');
assert.match(mediaEmbeds, /applyImageCropFrame\(img, crop, originalLink\)/, 'public rendering must apply each image block crop independently');
assert.match(mediaEmbeds, /Math\.ceil\(displayWidth \/ crop\.width\)/, 'cropped responsive images must request enough source pixels for the visible zoom');
assert.match(mediaEmbeds, /element\.closest\('\.cwk-media-crop-frame'\) \|\| element/, 'album deep links must target the visible crop frame');

const markdownEditorSource = fs.readFileSync(new URL('../js/markdown-editor.js', import.meta.url), 'utf8');
assert.match(markdownEditorSource, /BlockNoteSchema\.create/, 'the shared BlockNote schema must preserve custom crop props');
assert.match(markdownEditorSource, /IMAGE_CROP_DATA_ATTRIBUTE/, 'crop coordinates must be serialized into the image HTML itself');
assert.match(markdownEditorSource, /원본 전체로/, 'the crop dialog must provide a reversible reset action');
assert.doesNotMatch(markdownEditorSource, /toBlob\(|drawImage\(|getContext\(['"]2d/, 'visual cropping must never create or overwrite a raster file');
assert.doesNotMatch(markdownEditorSource, /markdown-editor-crop-button/, 'the crop action must not stay fixed at the top of the editor');
assert.match(markdownEditorSource, /cwk-image-crop-toolbar-button/, 'the selected image toolbar must expose the crop action next to the image');
assert.match(markdownEditorSource, /key: crop\.enabled \? 'cwk-cropped' : 'cwk-full'/, 'enabling a crop must remount the BlockNote image wrapper with its new preview width');
assert.match(markdownEditorSource, /pocketBaseImageSources\(originalImageUrl\)\?\.editorPreviewUrl/, 'the editor must render PocketBase images from bounded previews');
assert.match(markdownEditorSource, /loading: 'lazy'/, 'the editor must defer offscreen image loading');
assert.match(markdownEditorSource, /decoding: 'async'/, 'the editor must decode image previews asynchronously');
assert.match(markdownEditorSource, /observeEditorMediaDuringUploads\(uploadContainer/, 'all shared BlockNote editors must suspend previews while their upload container is busy');
assert.match(markdownEditorSource, /adapter\.withUploadActivity\(\(\) => adapter\.options\.uploadFile\(file\)\)/, 'BlockNote single-file uploads must use the same preview suspension guard');

const aboutWikiSource = fs.readFileSync(new URL('../js/about-wiki.js', import.meta.url), 'utf8');
assert.match(aboutWikiSource, /observeEditorMediaDuringUploads\(container, \{\s*mediaRoot: state\.root/, 'About uploads must also quiesce media rendered beside the source editor');

const postsView = fs.readFileSync(new URL('../posts/view.html', import.meta.url), 'utf8');
assert.match(postsView, /prepareEmbeddedMediaForDisplay\(post\.content/, 'post HTML must be optimized before it enters the live DOM');
assert.match(postsView, /href="\/admin\/posts\.html\?id=\$\{targetPost\.id\}"/, 'pretty post owner edit links must target the root admin route');
assert.doesNotMatch(postsView, /href="\.\.\/admin\//, 'pretty post pages must not create nested /posts/admin routes');
for (const route of ['/index.html', '/posts/index.html', '/daily/index.html', '/album/index.html', '/programs/index.html', '/nasajab/index.html', '/guestbook.html', '/askme.html', '/about.html']) {
  assert.match(postsView, new RegExp(`href="${route.replaceAll('.', '\\.')}"`), `pretty post navigation must use root route ${route}`);
}
assert.doesNotMatch(postsView, /<div class="top-nav">[\s\S]*?href="(?:\.\.\/|index\.html)/, 'pretty post public navigation must not depend on a missing SPA base');

const dailyIndexSource = fs.readFileSync(new URL('../daily/index.html', import.meta.url), 'utf8');
const dailyViewSource = fs.readFileSync(new URL('../daily/view.html', import.meta.url), 'utf8');
assert.doesNotMatch(dailyIndexSource, /href="\.\.\/admin\//, 'daily list owner links must not depend on the current public path');
assert.doesNotMatch(dailyViewSource, /href="\.\.\/admin\//, 'pretty daily pages must not create nested /daily/admin routes');
assert.match(dailyViewSource, /href="\/admin\/daily\.html\?id=\$\{encodeURIComponent\(entry\.id\)\}"/, 'pretty daily owner edit links must target the root admin route');
for (const route of ['/index.html', '/posts/index.html', '/daily/index.html', '/album/index.html', '/programs/index.html', '/nasajab/index.html', '/guestbook.html', '/askme.html', '/about.html']) {
  assert.match(dailyViewSource, new RegExp(`href="${route.replaceAll('.', '\\.')}"`), `pretty daily navigation must use root route ${route}`);
}
assert.doesNotMatch(dailyViewSource, /<div class="top-nav">[\s\S]*?href="(?:\.\.\/|index\.html)/, 'pretty daily public navigation must not depend on a missing SPA base');

const schema = JSON.parse(fs.readFileSync(new URL('../pb_schema.json', import.meta.url), 'utf8'));
const mediaCollection = schema.collections.find(collection => collection.name === 'media');
const mediaFileField = mediaCollection.fields.find(field => field.name === 'file');
assert.deepEqual(mediaFileField.thumbs, ['400x400', '800x0', '1600x0'], 'media schema must allow album and responsive thumbnail sizes');
assert.equal(mediaFileField.maxSize, 20 * 1024 * 1024 * 1024, 'media originals must allow one 20GB file');
const programsCollection = schema.collections.find(collection => collection.name === 'programs');
assert.equal(programsCollection.fields.find(field => field.name === 'download_files').maxSize, 2 * 1024 * 1024 * 1024, 'program downloads must keep their separate 2GB limit');
for (const collectionName of ['posts', 'programs']) {
  const collection = schema.collections.find(item => item.name === collectionName);
  assert.match(collection.fields.find(field => field.name === 'slug').pattern, /\uac00-\ud7a3/, `${collectionName} schema must accept generated Korean slugs`);
}
for (const collectionName of ['posts', 'daily_entries', 'programs']) {
  const collection = schema.collections.find(item => item.name === collectionName);
  assert.equal(collection.fields.find(field => field.name === 'pending_media_ids')?.max, 10000, `${collectionName} must persist only future editor-upload cleanup candidates`);
}
const webVideoField = mediaCollection.fields.find(field => field.name === 'web_video');
const videoPosterField = mediaCollection.fields.find(field => field.name === 'video_poster');
const videoStatusField = mediaCollection.fields.find(field => field.name === 'video_status');
const videoAttemptsField = mediaCollection.fields.find(field => field.name === 'video_attempts');
const resumableUploadIdField = mediaCollection.fields.find(field => field.name === 'resumable_upload_id');
assert.deepEqual(webVideoField.mimeTypes, ['video/mp4'], 'web playback derivatives must be MP4 files');
assert.deepEqual(videoPosterField.mimeTypes, ['image/jpeg'], 'video posters must be JPEG files');
assert.deepEqual(videoPosterField.thumbs, ['400x400'], 'video posters must allow square album thumbnails');
assert.deepEqual(videoStatusField.values, ['pending', 'processing', 'ready', 'error'], 'video processing states must be explicit');
assert.equal(videoAttemptsField.max, 3, 'transient video failures must have a bounded retry count');
assert.equal(resumableUploadIdField.hidden, true, 'the tus upload id must remain an internal idempotency key');
assert.match(mediaCollection.indexes.join('\n'), /resumable_upload_id.*WHERE [`]?resumable_upload_id[`]? != ''/, 'completed tus uploads must be imported only once');

const thumbnailMigration = fs.readFileSync(new URL('../pb_migrations/1784641062_enable_media_thumbnails.js', import.meta.url), 'utf8');
assert.match(thumbnailMigration, /mediaFile\.thumbs = \["800x0", "1600x0"\]/, 'production migration must enable the same thumbnail sizes');

const videoMigration = fs.readFileSync(new URL('../pb_migrations/1784726400_add_media_video_derivatives.js', import.meta.url), 'utf8');
assert.match(videoMigration, /new FileField\(\{\s*name: "web_video"/, 'production migration must add the web playback field');
assert.match(videoMigration, /new FileField\(\{\s*name: "video_poster"/, 'production migration must add the poster field');

const resumableMigration = fs.readFileSync(new URL('../pb_migrations/1785769200_add_media_resumable_upload_id.js', import.meta.url), 'utf8');
assert.match(resumableMigration, /name: "resumable_upload_id"/, 'production migration must add the tus idempotency field');
assert.match(resumableMigration, /CREATE UNIQUE INDEX/, 'production migration must prevent duplicate tus finalization');

const pendingMediaMigration = fs.readFileSync(new URL('../pb_migrations/1786885200_add_pending_media_ids.js', import.meta.url), 'utf8');
assert.match(pendingMediaMigration, /\["posts", "daily_entries", "programs"\]/, 'production migration must cover every draft-capable shared editor');
assert.match(pendingMediaMigration, /name: "pending_media_ids"/, 'production migration must add the future-only cleanup candidate field');

const koreanSlugMigration = fs.readFileSync(new URL('../pb_migrations/1787065200_allow_korean_content_slugs.js', import.meta.url), 'utf8');
assert.match(koreanSlugMigration, /\["posts", "programs"\]/, 'Korean slug migration must cover every collection using the shared title slugger');
assert.match(koreanSlugMigration, /\\uac00-\\ud7a3/, 'Korean slug migration must widen the live PocketBase validation pattern');

const upload20GbMigration = fs.readFileSync(new URL('../pb_migrations/1787224751_raise_media_upload_to_20gb.js', import.meta.url), 'utf8');
assert.match(upload20GbMigration, /mediaFile\.maxSize = 21474836480/, 'forward migration must raise media originals to 20GiB');
assert.match(upload20GbMigration, /mediaFile\.maxSize = 8589934592/, 'rollback migration must restore the former 8GiB limit');

const siteSource = fs.readFileSync(new URL('../js/site.js', import.meta.url), 'utf8');
assert.match(siteSource, /history\.(?:push|replace)State[\s\S]*syncDocumentBase\(nextDoc\)[\s\S]*content\.innerHTML = nextContent\.innerHTML/, 'SPA navigation must apply the fetched page base before inserting relative links');
assert.match(siteSource, /if \(!nextBase\) \{\s*currentBase\?\.remove\(\)/, 'SPA navigation must remove a stale base when the next page has none');
assert.match(siteSource, /document\.head\.prepend\(base\)/, 'SPA navigation must install the fetched base for pretty post and daily routes');
assert.equal(new URL('../album/index.html', 'https://coldwaterkim.com/posts/').pathname, '/album/index.html', 'post detail base must resolve album navigation at the site root');
assert.equal(new URL('../guestbook.html', 'https://coldwaterkim.com/daily/').pathname, '/guestbook.html', 'daily detail base must resolve root page navigation at the site root');

assert.equal(pbModule.shouldUseResumableUpload({ name: 'day.mov', type: 'video/quicktime', size: 64 * 1024 * 1024 }), true, 'large videos must use tus');
assert.equal(pbModule.shouldUseResumableUpload({ name: 'short.mov', type: 'video/quicktime', size: 63 * 1024 * 1024 }), false, 'small videos must keep the simple PocketBase upload');
assert.equal(pbModule.MEDIA_UPLOAD_MAX_BYTES, 20 * 1024 * 1024 * 1024, 'the client and media schema must share the 20GB limit');
assert.match(pbModule.formatMediaUploadProgress({ resumable: true, percent: 42 }), /재개 업로드 42%/, 'resumable upload progress must be visible in the editor');
assert.match(pbModule.formatMediaUploadProgress({ resumable: true, phase: 'preparing' }), /원본 파일 읽기 속도 확인 중/, 'large video uploads must disclose the source read probe');
assert.deepEqual(
  pbModule.resolveResumableUploadTuning(630 * 1024 * 1024, { parallelUploads: 6, maxParallelUploads: 8, chunkSize: 32 * 1024 * 1024 }),
  { parallelUploads: 6, chunkSize: 32 * 1024 * 1024 },
  'large videos must use the balanced six-part profile with finite chunks',
);
assert.deepEqual(
  pbModule.resolveResumableUploadTuning(128 * 1024 * 1024, { parallelUploads: 6, maxParallelUploads: 8, chunkSize: 32 * 1024 * 1024 }),
  { parallelUploads: 3, chunkSize: 32 * 1024 * 1024 },
  'smaller resumable videos must avoid unnecessary parallel requests',
);
assert.deepEqual(
  pbModule.resolveResumableUploadTuning(630 * 1024 * 1024, { parallelUploads: 6, maxParallelUploads: 8 }, 3),
  { parallelUploads: 3, chunkSize: 32 * 1024 * 1024 },
  'diagnostic A/B must be able to retain the three-part baseline without a redeploy',
);
assert.deepEqual(
  pbModule.resolveResumableUploadTuning(630 * 1024 * 1024, { parallelUploads: 6, maxParallelUploads: 8 }, 99),
  { parallelUploads: 8, chunkSize: 32 * 1024 * 1024 },
  'diagnostic throughput profiles must remain capped by the server maximum',
);

const pbSource = fs.readFileSync(new URL('../js/pb.js', import.meta.url), 'utf8');
assert.match(pbSource, /import\('@uppy\/core'\)/, 'the resumable client must lazy-load Uppy');
assert.match(pbSource, /\/api\/cwk\/tus\/finalize/, 'completed tus files must be finalized as PocketBase media records');
assert.match(pbSource, /getResumableMediaUploadCapability/, 'large video uploads must inspect the custom tus endpoint before starting');
assert.match(pbSource, /64MB 이상 영상은 재개 업로드 서버가 연결되어야 올릴 수 있어/, 'large videos must not fall back to an unreliable direct upload');
assert.match(pbSource, /parallelUploads:\s*tuning\.parallelUploads/, 'large videos must use the bounded server-advertised tus capacity');
assert.match(pbSource, /RESUMABLE_VIDEO_MAX_PARALLEL_UPLOADS\s*=\s*8/, 'parallel tus uploads must remain bounded');
assert.match(pbSource, /chunkSize:\s*tuning\.chunkSize/, 'resumable uploads must use finite retry chunks');
assert.match(pbSource, /X-Request-ID/, 'browser and iMac upload measurements must share a CORS-safe session id');
assert.match(pbSource, /cache:\s*'no-store'/, 'each upload must refresh server tuning so rollback applies immediately');
const resumableServer = fs.readFileSync(new URL('../deploy/imac/pocketbase-custom/resumable_upload.go', import.meta.url), 'utf8');
assert.match(resumableServer, /"parallel_uploads":\s*resumableParallelParts/, 'the tus status route must advertise the safe parallel capacity');
assert.match(resumableServer, /resumableParallelParts\s*=\s*6/, 'the balanced server profile must advertise six parallel parts');
assert.match(resumableServer, /"chunk_size":\s*resumableChunkBytes/, 'the tus status route must advertise finite chunks');
assert.match(resumableServer, /Cache-Control",\s*"no-store"/, 'the tus status response must not cache rollback-sensitive tuning');
assert.match(resumableServer, /DisableConcatenation:\s*false/, 'the tus server must accept parallel upload concatenation');
assert.match(resumableServer, /mediaUploadMaxBytes\s*=\s*int64\(21474836480\)/, 'the tus server must accept a 20GB original');
assert.match(resumableServer, /terminateTusPartialUploads/, 'parallel parts must be released before PocketBase copies the final original');
assert.match(resumableServer, /safe_upload_bytes/, 'the client must receive a disk-aware safe upload capacity');

const videoProcessor = fs.readFileSync(new URL('../deploy/imac/process-video-media.py', import.meta.url), 'utf8');
assert.match(videoProcessor, /"-movflags", "\+faststart"/, 'web MP4 generation must enable fast start');
assert.match(videoProcessor, /"h264_videotoolbox"/, 'non-compatible originals should use iMac hardware H.264 encoding first');
assert.match(videoProcessor, /adaptive_bitrate_kbps/, 'web MP4 bitrate must adapt to source size and resolution');
assert.match(videoProcessor, /"libx264"/, 'video processing must retain a software encoder fallback');
assert.match(videoProcessor, /return None, mode/, 'already compatible fast-start MP4 originals must not be duplicated');
assert.match(videoProcessor, /validate_original_path/, 'video processing must resolve a separate original file safely');
assert.doesNotMatch(videoProcessor, /immutable=1/, 'live SQLite reference discovery must not claim the database is immutable');
assert.match(videoProcessor, /video_attempts<3/, 'transient failures must be retried up to the bounded attempt count');

const videoProcessorPlist = fs.readFileSync(new URL('../deploy/imac/com.coldwaterkim.video-processor.plist', import.meta.url), 'utf8');
assert.match(videoProcessorPlist, /<integer>60<\/integer>/, 'video processor must poll queued uploads without blocking the editor');

console.log('Writing regression checks passed.');

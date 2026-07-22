import assert from 'node:assert/strict';
import fs from 'node:fs';
import { preferredTransferFiles, preferredTransferImageFiles, uniqueSupportedFiles, uniqueTransferFiles } from '../js/editor-file-transfer.mjs';

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

const { pocketBaseImageSources, pocketBaseVideoReference, videoDerivativeSources } = await import('../js/media-embeds.js');
const optimizedImage = pocketBaseImageSources(
  'https://coldwaterkim.com/api/files/media/record/photo.jpeg?token=keep-me',
);
assert.equal(
  optimizedImage.displayUrl,
  'https://coldwaterkim.com/api/files/media/record/photo.jpeg?token=keep-me&thumb=1600x0',
  'public article images must use the large display thumbnail while preserving existing query params',
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

const globalWriter = fs.readFileSync(new URL('../js/global-writer.js', import.meta.url), 'utf8');
assert.match(globalWriter, /hasEditorFileTransfer\(event\.clipboardData\)/, 'global writer paste must detect supported media files');
assert.match(globalWriter, /markdownEditor\.insertFiles\(insertIndex, uploadedFiles\)/, 'global writer must insert uploaded videos as media blocks');

const mediaEmbeds = fs.readFileSync(new URL('../js/media-embeds.js', import.meta.url), 'utf8');
assert.match(mediaEmbeds, /img\.setAttribute\('loading', 'lazy'\)/, 'rendered images must use native lazy loading');
assert.match(mediaEmbeds, /img\.setAttribute\('decoding', 'async'\)/, 'rendered images must decode asynchronously');
assert.match(mediaEmbeds, /setAttribute\('preload', 'none'\)/, 'rendered video and audio must wait for user playback');
assert.doesNotMatch(mediaEmbeds, /setAttribute\('preload', 'metadata'\)/, 'media-heavy articles must not preload every video metadata block');
assert.match(mediaEmbeds, /setAttribute\('poster', sources\.posterUrl\)/, 'ready video derivatives must expose a poster frame');
assert.match(mediaEmbeds, /dataset\.cwkOriginalSrc = sources\.originalUrl/, 'video rendering must retain the original file URL');
assert.match(mediaEmbeds, /dataset\.cwkPlaybackFailed/, 'broken playback derivatives must fall back to the preserved original');
assert.match(mediaEmbeds, /!video\.paused \|\| video\.currentTime > 0 \|\| video\.seeking/, 'hydration must not interrupt video playback already in progress');

const postsView = fs.readFileSync(new URL('../posts/view.html', import.meta.url), 'utf8');
assert.match(postsView, /prepareEmbeddedMediaForDisplay\(post\.content/, 'post HTML must be optimized before it enters the live DOM');

const schema = JSON.parse(fs.readFileSync(new URL('../pb_schema.json', import.meta.url), 'utf8'));
const mediaCollection = schema.collections.find(collection => collection.name === 'media');
const mediaFileField = mediaCollection.fields.find(field => field.name === 'file');
assert.deepEqual(mediaFileField.thumbs, ['800x0', '1600x0'], 'media schema must allow the responsive thumbnail sizes');
const webVideoField = mediaCollection.fields.find(field => field.name === 'web_video');
const videoPosterField = mediaCollection.fields.find(field => field.name === 'video_poster');
const videoStatusField = mediaCollection.fields.find(field => field.name === 'video_status');
const videoAttemptsField = mediaCollection.fields.find(field => field.name === 'video_attempts');
assert.deepEqual(webVideoField.mimeTypes, ['video/mp4'], 'web playback derivatives must be MP4 files');
assert.deepEqual(videoPosterField.mimeTypes, ['image/jpeg'], 'video posters must be JPEG files');
assert.deepEqual(videoStatusField.values, ['pending', 'processing', 'ready', 'error'], 'video processing states must be explicit');
assert.equal(videoAttemptsField.max, 3, 'transient video failures must have a bounded retry count');

const thumbnailMigration = fs.readFileSync(new URL('../pb_migrations/1784641062_enable_media_thumbnails.js', import.meta.url), 'utf8');
assert.match(thumbnailMigration, /mediaFile\.thumbs = \["800x0", "1600x0"\]/, 'production migration must enable the same thumbnail sizes');

const videoMigration = fs.readFileSync(new URL('../pb_migrations/1784726400_add_media_video_derivatives.js', import.meta.url), 'utf8');
assert.match(videoMigration, /new FileField\(\{\s*name: "web_video"/, 'production migration must add the web playback field');
assert.match(videoMigration, /new FileField\(\{\s*name: "video_poster"/, 'production migration must add the poster field');

const videoProcessor = fs.readFileSync(new URL('../deploy/imac/process-video-media.py', import.meta.url), 'utf8');
assert.match(videoProcessor, /"-movflags", "\+faststart"/, 'web MP4 generation must enable fast start');
assert.match(videoProcessor, /"-maxrate", "3500k"/, 'web MP4 generation must cap sustained bitrate');
assert.match(videoProcessor, /validate_original_path/, 'video processing must resolve a separate original file safely');
assert.doesNotMatch(videoProcessor, /immutable=1/, 'live SQLite reference discovery must not claim the database is immutable');
assert.match(videoProcessor, /video_attempts<3/, 'transient failures must be retried up to the bounded attempt count');

const videoProcessorPlist = fs.readFileSync(new URL('../deploy/imac/com.coldwaterkim.video-processor.plist', import.meta.url), 'utf8');
assert.match(videoProcessorPlist, /<integer>60<\/integer>/, 'video processor must poll queued uploads without blocking the editor');

console.log('Writing regression checks passed (58 assertions).');

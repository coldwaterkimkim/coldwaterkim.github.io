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

const { pocketBaseImageSources } = await import('../js/media-embeds.js');
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

const postsView = fs.readFileSync(new URL('../posts/view.html', import.meta.url), 'utf8');
assert.match(postsView, /prepareEmbeddedMediaForDisplay\(post\.content/, 'post HTML must be optimized before it enters the live DOM');

const schema = JSON.parse(fs.readFileSync(new URL('../pb_schema.json', import.meta.url), 'utf8'));
const mediaCollection = schema.collections.find(collection => collection.name === 'media');
const mediaFileField = mediaCollection.fields.find(field => field.name === 'file');
assert.deepEqual(mediaFileField.thumbs, ['800x0', '1600x0'], 'media schema must allow the responsive thumbnail sizes');

const thumbnailMigration = fs.readFileSync(new URL('../pb_migrations/1784641062_enable_media_thumbnails.js', import.meta.url), 'utf8');
assert.match(thumbnailMigration, /mediaFile\.thumbs = \["800x0", "1600x0"\]/, 'production migration must enable the same thumbnail sizes');

console.log('Writing regression checks passed (33 assertions).');

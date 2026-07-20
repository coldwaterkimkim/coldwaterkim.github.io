import assert from 'node:assert/strict';
import fs from 'node:fs';
import { preferredTransferImageFiles, uniqueSupportedFiles } from '../js/editor-file-transfer.mjs';

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

const unnamedA = new File([bytes], '', { type: 'image/png', lastModified: 2000 });
const unnamedB = new File([bytes], '', { type: 'image/png', lastModified: 2000 });
const uniqueUnnamed = uniqueSupportedFiles([unnamedA, unnamedB], new Set(['image/png']));
assert.equal(uniqueUnnamed.length, 2, 'different unnamed clipboard images with the same size must be preserved');
assert.equal(uniqueSupportedFiles([unnamedA, unnamedA], new Set(['image/png'])).length, 1, 'the same file object must be deduplicated');

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

console.log('Writing regression checks passed (10 assertions).');

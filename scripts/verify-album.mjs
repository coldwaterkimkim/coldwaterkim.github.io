import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ALBUM_PAGE_SIZE, albumBrowseUrl, albumMediaAnchorId, albumMediaKey, albumPageNumbers, albumSourceUrl, albumTileLabel, normalizeAlbumKind, normalizeAlbumPage, pocketBaseMediaReference } from '../js/album-logic.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
let assertions = 0;
const check = (condition, message) => { assert.ok(condition, message); assertions += 1; };

check(ALBUM_PAGE_SIZE === 24, 'album page size must remain 24');
check(normalizeAlbumPage('-2') === 1 && normalizeAlbumPage('3') === 3, 'page normalization');
check(normalizeAlbumKind('video') === 'video' && normalizeAlbumKind('other') === '', 'kind normalization');
check(albumMediaAnchorId('source1', 'media1') === 'cwk-media-source1-media1', 'stable first-media anchor');
check(albumMediaAnchorId('source1', 'media1', 2).endsWith('-2'), 'repeated-media anchor');
check(albumSourceUrl({ source_kind: 'daily', source_id: 'source1', source_slug: 'a b', media: 'media1' }) === '/#record/daily_entries%3Asource1/media:media1', 'daily deep link');
check(albumSourceUrl({ source_kind: 'nasajab', source_id: 'nasa item', media: 'nasa item' }) === '/#record/nasajab%3Anasa%20item/media:nasa%20item', 'nasajab deep link');
check(albumMediaKey({ file_collection: 'media', media: 'media1' }) === 'media:media1', 'media assignment key');
check(albumMediaKey({ file_collection: 'nasajab', media: 'nasa1' }) === 'nasajab:nasa1', 'nasajab assignment key');
check(albumBrowseUrl({ page: 3, kind: 'image', tag: 'tag 1' }) === '/album/index.html?page=3&kind=image&tag=tag+1', 'album filters stay shareable');
for (let total = 1; total <= 60; total += 1) {
  for (let current = 1; current <= total; current += 1) {
    const pages = albumPageNumbers(current, total);
    const numbers = pages.filter(Number.isInteger);
    assert.equal(numbers[0], 1);
    assert.equal(numbers.at(-1), total);
    assert.ok(numbers.includes(current));
    assert.ok(numbers.length <= 7);
    assert.deepEqual(numbers, [...new Set(numbers)].sort((a, b) => a - b));
    assert.ok(numbers.every(page => page >= 1 && page <= total));
  }
}
check(true, 'pagination stays bounded and includes current/first/last across every position in 1–60 pages');
check(JSON.stringify(albumPageNumbers(20, 46)) === '[1,null,19,20,21,null,46]', 'long albums skip distant pages');
check(albumTileLabel({ source_title: '제목 없는 하루', source_published_at: '2026-09-07 12:00:00Z' }, 25) === '2026-09-07 · 제목 없는 하루 · 사진 25, 원문으로 이동', 'tile name uses real source metadata and page offset');
check(albumTileLabel({ is_video: true }, 2) === '영상 2, 원문으로 이동', 'missing metadata has an honest numbered fallback');
check(albumTileLabel({ source_title: '  첫 줄\n둘째 줄 ' }, 3).startsWith('첫 줄 둘째 줄 · 사진 3'), 'tile titles normalize whitespace');
check(pocketBaseMediaReference('https://coldwaterkim.com/api/files/pbc/abc123/photo.JPG')?.kind === 'image', 'image reference');
check(pocketBaseMediaReference('/api/files/pbc/abc123/movie.mov')?.kind === 'video', 'video reference');
check(pocketBaseMediaReference('https://youtube.com/watch?v=x') === null, 'external media excluded');

const albumHtml = read('album/index.html');
const albumJs = read('js/album.js');
const styles = read('css/styles.css');
const migration = read('pb_migrations/1787490000_include_nasajab_in_album.js');
check(albumHtml.includes('id="album-grid"'), 'album page grid');
check(albumHtml.includes('id="album-tag-filters"') && albumHtml.includes('id="album-kind-filters"'), 'album exposes tag and media-kind filters');
check(albumHtml.includes('id="album-edit-toggle"') && albumHtml.includes('class="album-owner-only"'), 'classification editor starts owner-only');
check(!albumJs.includes('album-tile-title') && !albumJs.includes('album-tile-meta'), 'tiles have no visible metadata rows');
check(styles.includes('aspect-ratio: 1') && styles.includes('object-fit: cover'), 'square cropped previews');
check(styles.includes('repeat(5,') && styles.includes('repeat(4,') && styles.includes('repeat(3,'), 'responsive 5/4/3 columns');
check(albumJs.includes('return 5') && !albumJs.includes("return 10"), 'home preview stays at five thumbnails');
check(read('js/pb.js').includes('collectionId,collectionName,media,file_collection,uploaded_at,file,video_poster'), 'album API requests only render fields');
check(read('js/site.js').includes('requestIdleCallback(load, { timeout: 1200 })'), 'home album waits for the core content');
check(albumJs.includes("item.is_video ? item.video_poster : item.file"), 'videos use poster previews');
check(!albumJs.includes('<video'), 'album never embeds playable video');
check(albumJs.includes('href="${escapeAttribute(albumSourceUrl(item))}"'), 'normal album tile keeps the source deep link');
check(albumJs.includes('event.preventDefault();') && albumJs.includes('event.shiftKey'), 'edit mode supports click and shift range selection');
check(albumJs.includes('IntersectionObserver') && albumJs.includes('OWNER_PAGE_SIZE'), 'owner edit mode automatically extends the album');
check(albumJs.includes('state.editMode && state.selectedKeys.size') && albumJs.includes('renderSelectionBar(state)'), 'tag CRUD refreshes the active selection controls');
check(read('js/pb.js').includes("collection('album_tag_summary')") && read('js/pb.js').includes("'/api/cwk/album/tags/batch'"), 'album tag read and owner batch APIs are connected');
check(migration.includes("p.status = 'published'") && migration.includes("d.status = 'published'") && migration.includes("n.is_public = TRUE"), 'only published sources are indexed');
check(migration.includes('m.created AS uploaded_at'), 'upload time drives ordering');
check(migration.includes('ROW_NUMBER() OVER'), 'duplicate media are collapsed');
check(migration.includes("'nasajab' AS source_kind") && migration.includes('n.image AS file'), 'public nasajab images join the album');
check(migration.includes("'media' AS file_collection") && migration.includes("'nasajab' AS file_collection"), 'album keeps each file storage collection');
check(migration.includes('image.thumbs = ["400x400"]'), 'nasajab album thumbnails are enabled');
check(read('js/legacy-record-redirect.js').includes('mediaAnchor') && read('js/records-v2-app.js').includes('media:'), 'old and new media links preserve the selected attachment');
check(albumHtml.includes('cwk-scroll-content') && albumJs.includes('getContentScroller'), 'album pagination and restoration use the shared central scroller');

console.log(`Album QA passed: ${assertions} assertions`);

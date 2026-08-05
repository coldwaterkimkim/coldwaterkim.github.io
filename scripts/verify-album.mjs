import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ALBUM_PAGE_SIZE, albumMediaAnchorId, albumSourceUrl, normalizeAlbumKind, normalizeAlbumPage, pocketBaseMediaReference } from '../js/album-logic.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
let assertions = 0;
const check = (condition, message) => { assert.ok(condition, message); assertions += 1; };

check(ALBUM_PAGE_SIZE === 24, 'album page size must remain 24');
check(normalizeAlbumPage('-2') === 1 && normalizeAlbumPage('3') === 3, 'page normalization');
check(normalizeAlbumKind('video') === 'video' && normalizeAlbumKind('other') === '', 'kind normalization');
check(albumMediaAnchorId('source1', 'media1') === 'cwk-media-source1-media1', 'stable first-media anchor');
check(albumMediaAnchorId('source1', 'media1', 2).endsWith('-2'), 'repeated-media anchor');
check(albumSourceUrl({ source_kind: 'daily', source_id: 'source1', source_slug: 'a b', media: 'media1' }) === '/daily/view.html?slug=a%20b#cwk-media-source1-media1', 'daily deep link');
check(pocketBaseMediaReference('https://coldwaterkim.com/api/files/pbc/abc123/photo.JPG')?.kind === 'image', 'image reference');
check(pocketBaseMediaReference('/api/files/pbc/abc123/movie.mov')?.kind === 'video', 'video reference');
check(pocketBaseMediaReference('https://youtube.com/watch?v=x') === null, 'external media excluded');

const albumHtml = read('album/index.html');
const albumJs = read('js/album.js');
const styles = read('css/styles.css');
const migration = read('pb_migrations/1785855600_create_album_view.js');
check(albumHtml.includes('id="album-grid"'), 'album page grid');
check(!albumJs.includes('album-tile-title') && !albumJs.includes('album-tile-meta'), 'tiles have no visible metadata rows');
check(styles.includes('aspect-ratio: 1') && styles.includes('object-fit: cover'), 'square cropped previews');
check(styles.includes('repeat(5,') && styles.includes('repeat(4,') && styles.includes('repeat(3,'), 'responsive 5/4/3 columns');
check(albumJs.includes('return 5') && !albumJs.includes("return 10"), 'home preview stays at five thumbnails');
check(read('js/pb.js').includes('collectionId,collectionName,media,uploaded_at,file,video_poster'), 'album API requests only render fields');
check(read('js/site.js').includes('requestIdleCallback(load, { timeout: 1200 })'), 'home album waits for the core content');
check(albumJs.includes("item.is_video ? item.video_poster : item.file"), 'videos use poster previews');
check(!albumJs.includes('<video'), 'album never embeds playable video');
check(migration.includes("p.status = 'published'") && migration.includes("d.status = 'published'"), 'only published sources are indexed');
check(migration.includes('m.created AS uploaded_at'), 'upload time drives ordering');
check(migration.includes('ROW_NUMBER() OVER'), 'duplicate media are collapsed');
check(read('posts/view.html').includes('scrollToAlbumMediaHash') && read('daily/view.html').includes('scrollToAlbumMediaHash'), 'source pages scroll to media anchors');

console.log(`Album QA passed: ${assertions} assertions`);

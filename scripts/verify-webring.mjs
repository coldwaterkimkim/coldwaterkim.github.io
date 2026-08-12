import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  buildWebRingCategories,
  interleaveWebRingCategories,
  randomWebRingItem,
  webRingNeighbors,
} from '../js/webring-logic.mjs';
import { publicContentKeyFromLocation } from '../js/content-urls.mjs';

let assertions = 0;
const check = (value, message) => { assert.ok(value, message); assertions += 1; };
const categories = buildWebRingCategories({
  posts: [{ slug: 'hello', title: 'Hello' }, { slug: 'second' }],
  daily: [
    { id: 'd1', day_key: '2026-08-12' },
    { id: 'd2', day_key: '2026-08-12' },
    { id: 'd3', day_key: '2026-08-11' },
  ],
  album: [{ media: 'm1', source_id: 'p1', source_slug: 'hello', source_kind: 'posts' }],
  nasajab: [{ id: 'n1', memo: '잡힘' }],
});

check(categories[1].length === 2, 'daily records must be grouped by day');
check(categories[2][0].url === '/posts/hello/#cwk-media-p1-m1', 'album must deep-link to the canonical source');
const deck = interleaveWebRingCategories(categories);
check(deck.slice(0, 4).map(item => item.kind).join(',') === 'post,daily,album,nasajab', 'deck must interleave content kinds');
const neighbors = webRingNeighbors(deck, deck[0].key);
check(neighbors.prev === deck.at(-1) && neighbors.next === deck[1], 'neighbors must wrap');
check(randomWebRingItem(categories, 'post:hello', () => 0)?.key === 'post:second', 'random must exclude the current item');
check(publicContentKeyFromLocation({ pathname: '/posts/hello/', search: '', hash: '' }) === 'post:hello', 'pretty post location');
check(publicContentKeyFromLocation({ pathname: '/daily/2026-08-12/', search: '', hash: '' }) === 'daily:2026-08-12', 'pretty daily location');
check(publicContentKeyFromLocation({ pathname: '/posts/hello/', search: '', hash: '#cwk-media-p1-m1' }) === 'album:m1', 'album hash has location priority');

const siteSource = fs.readFileSync(new URL('../js/site.js', import.meta.url), 'utf8');
const migration = fs.readFileSync(new URL('../pb_migrations/1785855600_create_album_view.js', import.meta.url), 'utf8');
check(siteSource.includes('getPublishedPostSummaryTimeline') && siteSource.includes('getPublishedNasajabSummaryTimeline'), 'WebRing must use public loaders');
check(!siteSource.includes('getAllPostTimeline()') && !siteSource.includes('getAllNasajabTimeline()'), 'WebRing must not use owner timelines');
check(migration.includes("p.status = 'published'") && migration.includes("d.status = 'published'"), 'album source must remain published-only');

console.log(`WebRing QA passed: ${assertions} assertions`);

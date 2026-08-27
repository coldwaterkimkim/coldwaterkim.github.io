import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildArchiveEntries } from '../js/archive-logic.mjs';

const sources = {
  posts: [{
    id: 'p1',
    title: '글방 글',
    slug: 'post',
    published_at: '2026-08-20T10:00:00Z',
    first_published_at: '2026-08-25T10:00:00Z',
    updated: '2026-08-26T10:00:00Z',
  }],
  daily: [
    {
      id: 'd1',
      day_key: '2026-08-19',
      published_at: '2026-08-19T00:00:00Z',
      first_published_at: '2026-08-22T11:00:00Z',
      updated: '2026-08-23T15:00:00Z',
    },
    {
      id: 'd2',
      day_key: '2026-08-19',
      published_at: '2026-08-19T00:00:00Z',
      first_published_at: '2026-08-22T12:00:00Z',
      updated: '2026-08-24T15:00:00Z',
    },
  ],
  nasajab: [{ id: 'n1', memo: '나사잡', display_at: '2026-08-17T10:00:00Z', first_published_at: '2026-08-23T10:00:00Z' }],
  guestbook: [
    {
      id: 'g12345678901234',
      name: '방문자',
      owner_reply: '주인장 답글',
      display_date: '2026-08-21T10:00:00Z',
      owner_replied_at: '2026-08-26T10:00:00Z',
      first_published_at: '2026-08-21T11:00:00Z',
      updated: '2026-08-27T10:00:00Z',
    },
    { id: 'x12345678901234', name: '미답변', owner_reply: '', created: '2026-08-23T10:00:00Z' },
  ],
};

const entries = buildArchiveEntries(sources);
assert.equal(entries.length, 4, 'four public content categories must be merged while file tools and unanswered guestbook entries stay out');
assert.equal(entries[0].category, 'post');
assert.equal(entries[0].date, sources.posts[0].first_published_at, 'posts must use their first public upload time, not their chosen article date');
assert.equal(entries.filter(entry => entry.category === 'daily').length, 1, 'same-day daily records must share one canonical row');
assert.match(entries.find(entry => entry.category === 'daily').title, /\(2개\)$/);
assert.equal(entries.find(entry => entry.category === 'daily').date, '2026-08-22T12:00:00Z', 'daily ordering must use the latest first publication in its day group');
assert.notEqual(entries.find(entry => entry.category === 'daily').date, sources.daily[1].updated, 'later edits must not reorder an already-published daily entry');
assert.equal(entries.find(entry => entry.category === 'nasajab').date, sources.nasajab[0].first_published_at);
assert.equal(entries.find(entry => entry.category === 'guestbook').date, sources.guestbook[0].first_published_at);
for (const category of ['post', 'daily', 'nasajab', 'guestbook']) {
  const entry = entries.find(item => item.category === category);
  assert.notEqual(entry.date, sources[category === 'post' ? 'posts' : category === 'daily' ? 'daily' : category][0]?.updated, `${category} edits must not reorder an already-public entry`);
}
assert.deepEqual(entries.map(entry => entry.category), ['post', 'nasajab', 'daily', 'guestbook']);
assert.ok(!entries.some(entry => entry.category === 'album' || entry.category === 'about'));
assert.ok(!entries.some(entry => entry.category === 'program'), 'programs room is a utility desk, not archive content');

const home = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const site = fs.readFileSync(new URL('../js/site.js', import.meta.url), 'utf8');
const pb = fs.readFileSync(new URL('../js/pb.js', import.meta.url), 'utf8');
const archivePage = fs.readFileSync(new URL('../all/index.html', import.meta.url), 'utf8');
const archiveView = fs.readFileSync(new URL('../all/view.html', import.meta.url), 'utf8');
const archiveScript = fs.readFileSync(new URL('../js/archive.js', import.meta.url), 'utf8');
const schema = JSON.parse(fs.readFileSync(new URL('../pb_schema.json', import.meta.url), 'utf8'));

for (const collectionName of ['posts', 'daily_entries', 'nasajab', 'guestbook']) {
  const collection = schema.collections.find(item => item.name === collectionName);
  assert.ok(collection?.fields.some(field => field.name === 'first_published_at' && field.type === 'date'), `${collectionName} must store an immutable first publication time`);
}
assert.match(pb, /POST_SUMMARY_FIELDS = '[^']*first_published_at/, 'post archive summaries must request first publication time');
assert.match(pb, /DAILY_SUMMARY_FIELDS = '[^']*first_published_at/, 'daily archive summaries must request first publication time');
for (const loader of ['getPublishedNasajabSummaries', 'getAnsweredGuestbookSummaries']) {
  assert.match(pb, new RegExp(`function ${loader}[\\s\\S]*?fields: '[^']*first_published_at`), `${loader} must request first publication time`);
}

assert.match(home, /id="recent-all-table"/);
assert.match(home, /최근 글 8개/, 'home heading must describe the eight rendered recent rows');
for (const removed of ['recent-daily-table', 'recent-posts-table', 'recent-programs-table', 'recent-nasajab-table']) {
  assert.ok(!home.includes(removed), `${removed} must be removed from home`);
}
assert.match(home, /id="recent-album-table"/, 'album preview remains separate from written-content aggregation');
assert.match(site, /buildArchiveEntries[\s\S]*\.slice\(0, 8\)/, 'home must use the shared archive ordering and take its first eight rows');
assert.doesNotMatch(site, /getPublishedProgramSummaryTimeline/, 'home and entry update checks must not query retired program posts');
assert.doesNotMatch(archiveScript, /getPublishedProgramSummaryTimeline/, 'archive must not query retired program posts');
assert.match(archivePage, /id="archive-list"/);
assert.match(
  archivePage,
  /<th class="archive-category-cell">분류<\/th><th align="left">제목<\/th><th class="date-cell">Date<\/th>/,
  'archive columns must be category, title, then date',
);
assert.match(
  archiveScript,
  /row\.append\(categoryCell, titleCell, dateCell\)/,
  'archive rows must follow the category, title, then date header order',
);
assert.match(archiveView, /data-archive-body/);
assert.match(archiveScript, /body\.textContent = String\(entry\.owner_reply/);
assert.doesNotMatch(archiveScript, /entry\.message/, 'guestbook archive detail must not render the visitor message');

console.log('Archive QA passed.');

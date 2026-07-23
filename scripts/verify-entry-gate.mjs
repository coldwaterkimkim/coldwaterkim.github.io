import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ENTRY_LAST_ADMITTED_STORAGE_KEY,
  ENTRY_SESSION_ADMITTED_STORAGE_KEY,
  entryWebmasterLineKey,
  normalizeEntryLastAdmittedAt,
  summarizeEntryUpdates,
} from '../js/entry-gate-logic.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const publicHtml = [
  'index.html',
  'about.html',
  'guestbook.html',
  'posts/index.html',
  'posts/view.html',
  'daily/index.html',
  'daily/view.html',
  'programs/index.html',
  'programs/view.html',
  'nasajab/index.html',
];
const siteSource = fs.readFileSync(path.join(root, 'js/site.js'), 'utf8');
const logicSource = fs.readFileSync(path.join(root, 'js/entry-gate-logic.mjs'), 'utf8');
const stylesSource = fs.readFileSync(path.join(root, 'css/styles.css'), 'utf8');
const postViewSource = fs.readFileSync(path.join(root, 'posts/view.html'), 'utf8');
let assertions = 0;

function check(condition, message) {
  assert.ok(condition, message);
  assertions += 1;
}

for (const relativePath of publicHtml) {
  const source = fs.readFileSync(path.join(root, relativePath), 'utf8');
  check(
    /<html[^>]*class="[^"]*\bentry-gate-pending\b[^"]*"/i.test(source),
    `${relativePath} must start behind the entry gate`,
  );
}

check(siteSource.includes('audio.play()'), 'entry must call the real audio play method');
check(siteSource.includes('coldwaterkim:entry-admitted'), 'entry must publish an admission event');
check(
  siteSource.includes('ENTRY_LAST_ADMITTED_STORAGE_KEY') && logicSource.includes(ENTRY_LAST_ADMITTED_STORAGE_KEY),
  'entry must use its own last-admitted storage key',
);
check(
  siteSource.includes('ENTRY_SESSION_ADMITTED_STORAGE_KEY') && logicSource.includes(ENTRY_SESSION_ADMITTED_STORAGE_KEY),
  'entry must use its own tab-session storage key',
);
check(siteSource.includes('entryWebmasterLineKey'), 'entry must use a KST date-specific webmaster line');
check(siteSource.includes('getPublishedPostTimeline'), 'entry must summarize posts');
check(siteSource.includes('getPublishedDailyTimeline'), 'entry must summarize daily entries');
check(siteSource.includes('getPublishedProgramTimeline'), 'entry must summarize programs');
check(siteSource.includes('getPublishedNasajabTimeline'), 'entry must summarize nasajab');
check(!/quiet|mute|sound off|소리 없이|조용히 입장/i.test(siteSource), 'entry must not offer a silent route');
check(stylesSource.includes('.entry-gate'), 'entry gate styles must exist');
check(stylesSource.includes('@media (max-width: 640px)'), 'entry gate must keep the public mobile breakpoint');
check(postViewSource.includes('coldwaterkim:entry-admitted'), 'post views must wait for successful entry');
check(postViewSource.includes("dataset.entryAdmitted === 'true'"), 'post views must recognize DOM admission state');

check(
  entryWebmasterLineKey('2026-07-23') === 'entry_webmaster_line_2026-07-23',
  'daily webmaster line key uses the KST day',
);
check(normalizeEntryLastAdmittedAt('not-a-date') === '', 'invalid visits are first visits');
check(
  normalizeEntryLastAdmittedAt('2099-01-01T00:00:00.000Z', Date.parse('2026-07-23T00:00:00.000Z')) === '',
  'future visits are ignored',
);

const groups = [
  {
    label: '글방',
    unit: '개',
    items: [
      { title: '새 글', href: '/posts/view.html?slug=new', updatedAt: '2026-07-22T12:00:00.000Z' },
    ],
  },
  {
    label: '나으 하루',
    unit: '개',
    items: [
      { title: '오늘', href: '/daily/view.html?day=2026-07-23', updatedAt: '2026-07-23T01:00:00.000Z' },
      { title: '어제', href: '/daily/view.html?day=2026-07-22', updatedAt: '2026-07-22T01:00:00.000Z' },
    ],
  },
];
const firstVisit = summarizeEntryUpdates(groups, '', Date.parse('2026-07-23T02:00:00.000Z'));
check(firstVisit.heading === 'LATEST UPDATE', 'first visit shows latest update');
check(firstVisit.href.includes('/daily/'), 'first visit links the latest item');

const futureContent = summarizeEntryUpdates([
  ...groups,
  {
    label: '미래',
    unit: '개',
    items: [
      { title: '미래 글', href: '/future', updatedAt: '2099-01-01T00:00:00.000Z' },
    ],
  },
], '', Date.parse('2026-07-23T02:00:00.000Z'));
check(futureContent.href.includes('/daily/'), 'future-dated content cannot replace the latest update');

const returningVisit = summarizeEntryUpdates(
  groups,
  '2026-07-22T06:00:00.000Z',
  Date.parse('2026-07-23T02:00:00.000Z'),
);
check(returningVisit.heading === 'NEW SINCE YOUR LAST VISIT: 2', 'return visit counts new updates');
check(returningVisit.text === '글방 1개 · 나으 하루 1개', 'return visit groups update counts');

const noUpdates = summarizeEntryUpdates(
  groups,
  '2026-07-23T01:30:00.000Z',
  Date.parse('2026-07-23T02:00:00.000Z'),
);
check(noUpdates.count === 0, 'return visit can report no updates');

console.log(`Entry gate QA passed (${assertions} assertions).`);

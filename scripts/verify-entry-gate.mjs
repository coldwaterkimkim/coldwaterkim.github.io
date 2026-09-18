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
  'all/index.html',
  'all/view.html',
  'askme.html',
  'posts/index.html',
  'posts/view.html',
  'daily/index.html',
  'daily/view.html',
  'album/index.html',
  'programs/index.html',
  'programs/view.html',
  'nasajab/index.html',
];
const runtimeSource = fs.readFileSync(path.join(root, 'js/public-runtime.js'), 'utf8');
const bgmSource = fs.readFileSync(path.join(root, 'js/bgm-runtime.js'), 'utf8');
const consentSource = fs.readFileSync(path.join(root, 'js/bgm-consent.js'), 'utf8');
const logicSource = fs.readFileSync(path.join(root, 'js/entry-gate-logic.mjs'), 'utf8');
let assertions = 0;

function check(condition, message) {
  assert.ok(condition, message);
  assertions += 1;
}

for (const relativePath of publicHtml) {
  const source = fs.readFileSync(path.join(root, relativePath), 'utf8');
  check(
    !/<html[^>]*class="[^"]*\bentry-gate-pending\b[^"]*"/i.test(source),
    `${relativePath} must open the public site without the entry gate`,
  );
}

// Retired entry gating must not return; audio admission now belongs to BGM consent.
check(!runtimeSource.includes('initEntryGate'), 'public runtime must not initialize the retired gate');
check(bgmSource.includes('initBgmConsent(audio)'), 'real audio must initialize the active consent flow');
check(consentSource.includes('await audio.play()'), 'active consent must use real audio playback');
check(consentSource.includes('주인장 안내문'), 'active music admission copy must remain available');
check(consentSource.includes('응 그딴 거 없음ㅋ'), 'approved second admission dialog must remain available');
check(logicSource.includes(ENTRY_LAST_ADMITTED_STORAGE_KEY), 'retained compatibility logic preserves historical storage keys');
check(logicSource.includes(ENTRY_SESSION_ADMITTED_STORAGE_KEY), 'retained compatibility logic preserves historical session keys');

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

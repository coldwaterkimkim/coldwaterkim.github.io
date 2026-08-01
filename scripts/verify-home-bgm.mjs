import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBgmTrackIndex } from '../js/bgm-playlist-logic.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const homeSource = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const siteSource = fs.readFileSync(path.join(root, 'js/site.js'), 'utf8');
let assertions = 0;

function check(condition, message) {
  assert.ok(condition, message);
  assertions += 1;
}

check(
  homeSource.indexOf('id="recent-daily-table"') < homeSource.indexOf('id="recent-posts-table"'),
  'the daily table must appear before the posts table on Home',
);
check(siteSource.includes('randomBgmTrackIndex(playlist.length)'), 'initial BGM selection must be random');
check(
  siteSource.includes('randomBgmTrackIndex(playlist.length, audio._bgmTrackIndex)'),
  'the next BGM selection must be random and know the current track',
);
check(randomBgmTrackIndex(0, -1, () => 0.5) === -1, 'an empty playlist has no track');
check(randomBgmTrackIndex(1, 0, () => 0.5) === 0, 'a one-track playlist keeps its only track');
check(randomBgmTrackIndex(3, -1, () => 0) === 0, 'random selection can choose the first track');
check(randomBgmTrackIndex(3, -1, () => 0.999) === 2, 'random selection can choose the last track');

for (let currentIndex = 0; currentIndex < 4; currentIndex += 1) {
  for (const randomValue of [0, 0.25, 0.5, 0.75, 0.999]) {
    const nextIndex = randomBgmTrackIndex(4, currentIndex, () => randomValue);
    check(nextIndex >= 0 && nextIndex < 4, 'the next track index stays inside the playlist');
    check(nextIndex !== currentIndex, 'the next track does not immediately repeat');
  }
}

console.log(`Home/BGM QA passed (${assertions} assertions).`);

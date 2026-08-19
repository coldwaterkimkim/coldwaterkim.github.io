import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DEFAULT_BGM_TIME_SLOTS,
  activeBgmTimeSlot,
  bgmMediaRecordId,
  bgmMinuteInTimeZone,
  normalizeBgmSchedule,
  remapBgmScheduleTrack,
  randomBgmCandidateIndex,
  randomBgmTrackIndex,
  scheduledBgmTrackIndexes,
} from '../js/bgm-playlist-logic.mjs';

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
check(siteSource.includes('randomBgmCandidateIndex(scheduledBgmTrackIndexes('), 'initial BGM selection must use the active time slot');
check(
  siteSource.includes('randomScheduledBgmTrackIndex(audio, audio._bgmTrackIndex)'),
  'the next BGM selection must use the current time slot and know the current track',
);
check(siteSource.includes("const BGM_SCHEDULE_SETTING_KEY = 'bgm_schedule'"), 'the BGM schedule must have its own site setting');
check(siteSource.includes("scheduleButton.textContent = 'BGM 편성표'"), 'OWNER MODE must expose the BGM schedule editor');
check(siteSource.includes('data-bgm-assignment'), 'the schedule editor must render track/time assignment checkboxes');
check(siteSource.includes('input.multiple = true'), 'OWNER MODE must accept multiple MP3 files in one selection');
check(siteSource.includes('data-bgm-delete'), 'the schedule editor must expose per-track deletion');
check(siteSource.includes('data-bgm-trim'), 'the schedule editor must expose per-track MP3 trimming');
check(siteSource.includes("import('wavesurfer.js')"), 'the waveform editor must load only when a track is selected');
check(siteSource.includes('region.play(true)'), 'trim preview must play the latest selected region through its end');
check(!siteSource.includes("regions.on('region-out'"), 'trim preview must not race region playback with manual region-out pausing');
check(siteSource.includes('trimBgmMedia(mediaId, region.start, region.end, trimRequestId)'), 'BGM trimming must use an idempotent authenticated server request');
check(siteSource.includes('await saveBgmLibrarySettings(nextPlaylist, nextSchedule)'), 'the trimmed playlist and schedule must save before old media cleanup');
check(siteSource.includes('removeBgmScheduleEditor(existing, audio)'), 'closing or redrawing the schedule must destroy an open waveform editor');
check(siteSource.includes('deleteMediaIfUnreferenced(mediaId)'), 'BGM deletion must preserve media referenced by other content');
check(siteSource.includes('getSettingStrict(BGM_PLAYLIST_SETTING_KEY)'), 'BGM rollback snapshots must not turn read failures into empty settings');
check(siteSource.includes('setBgmScheduleEditorBusy(panel, true)'), 'schedule controls must lock during track deletion');
check(siteSource.includes("BGM_TIME_ZONE"), 'the site must select BGM using the configured Korean time zone');
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

const trackKeys = ['track-a', 'track-b', 'track-c'];
const defaultSchedule = normalizeBgmSchedule(null, trackKeys);
check(defaultSchedule.timezone === 'Asia/Seoul', 'the default BGM schedule uses Korean time');
check(defaultSchedule.slots.length === 5, 'the default BGM schedule has five time slots');
for (const trackKey of trackKeys) {
  check(
    defaultSchedule.assignments[trackKey].length === DEFAULT_BGM_TIME_SLOTS.length,
    'a legacy or newly uploaded track defaults to every time slot',
  );
}

const customSchedule = normalizeBgmSchedule({
  slots: DEFAULT_BGM_TIME_SLOTS,
  assignments: {
    'track-a': ['dawn', 'night'],
    'track-b': ['morning', 'day', 'evening'],
    'track-c': [],
  },
}, trackKeys);
check(customSchedule.assignments['track-a'].join(',') === 'dawn,night', 'one track can belong to overlapping time pools');
check(customSchedule.assignments['track-c'].length === 0, 'an explicitly unassigned track stays unassigned');
check(activeBgmTimeSlot(customSchedule.slots, 0).id === 'dawn', '00:00 selects dawn');
check(activeBgmTimeSlot(customSchedule.slots, 359).id === 'dawn', '05:59 stays in dawn');
check(activeBgmTimeSlot(customSchedule.slots, 360).id === 'morning', '06:00 selects morning');
check(activeBgmTimeSlot(customSchedule.slots, 659).id === 'morning', '10:59 stays in morning');
check(activeBgmTimeSlot(customSchedule.slots, 660).id === 'day', '11:00 selects day');
check(activeBgmTimeSlot(customSchedule.slots, 1020).id === 'evening', '17:00 selects evening');
check(activeBgmTimeSlot(customSchedule.slots, 1320).id === 'night', '22:00 selects night');
check(activeBgmTimeSlot(customSchedule.slots, 1439).id === 'night', '23:59 stays in night');

check(
  scheduledBgmTrackIndexes(trackKeys, customSchedule, 60).join(',') === '0',
  'dawn only selects tracks assigned to dawn',
);
check(
  scheduledBgmTrackIndexes(trackKeys, customSchedule, 700).join(',') === '1',
  'day only selects tracks assigned to day',
);

const emptyEveningSchedule = normalizeBgmSchedule({
  slots: DEFAULT_BGM_TIME_SLOTS,
  assignments: {
    'track-a': ['dawn'],
    'track-b': ['morning'],
    'track-c': [],
  },
}, trackKeys);
check(
  scheduledBgmTrackIndexes(trackKeys, emptyEveningSchedule, 1100).join(',') === '0,1,2',
  'an empty active time pool safely falls back to the full playlist',
);
check(randomBgmCandidateIndex([1, 2], 1, () => 0) === 2, 'candidate selection avoids repeating the current track');
check(randomBgmCandidateIndex([1, 2], 2, () => 0.999) === 1, 'candidate selection remains inside the active pool');
check(randomBgmCandidateIndex([2], 2, () => 0.5) === 2, 'a one-track time pool can repeat its only track');
check(randomBgmCandidateIndex([], 0, () => 0.5) === -1, 'an empty candidate pool has no track');

const knownKstMinute = bgmMinuteInTimeZone(new Date('2026-08-03T21:30:00.000Z'));
check(knownKstMinute === 390, 'Korean time conversion handles the next calendar day');
check(
  bgmMediaRecordId('https://coldwaterkim.com/api/files/media/abcdefghijklmno/song.mp3?token=x') === 'abcdefghijklmno',
  'PocketBase media record ids can be recovered from saved BGM URLs',
);
check(
  bgmMediaRecordId('https://coldwaterkim.com/api/files/pbc_2708086759/aio9h6rgv687rmm/song.mp3') === 'aio9h6rgv687rmm',
  'PocketBase collection-id file URLs expose the BGM media record id',
);
check(bgmMediaRecordId('/api/files/media/too-short/song.mp3') === '', 'invalid media record ids cannot be deleted');
check(
  bgmMediaRecordId('https://example.com/api/files/media/abcdefghijklmno/song.mp3') === '',
  'external file URLs cannot select a local media record for deletion',
);
check(bgmMediaRecordId('/assets/bgm/local.mp3') === '', 'local fallback MP3 files are not treated as deletable media records');

const trimmedKey = 'track-a-trimmed';
const remappedSchedule = remapBgmScheduleTrack(
  customSchedule,
  'track-a',
  trimmedKey,
  [trimmedKey, 'track-b', 'track-c'],
);
check(!('track-a' in remappedSchedule.assignments), 'trim replacement removes the old URL assignment key');
check(
  remappedSchedule.assignments[trimmedKey].join(',') === 'dawn,night',
  'trim replacement preserves the old track time assignments',
);
const unassignedRemap = remapBgmScheduleTrack(
  customSchedule,
  'track-c',
  'track-c-trimmed',
  ['track-a', 'track-b', 'track-c-trimmed'],
);
check(unassignedRemap.assignments['track-c-trimmed'].length === 0, 'trim replacement preserves an explicit unassigned track');

console.log(`Home/BGM QA passed (${assertions} assertions).`);

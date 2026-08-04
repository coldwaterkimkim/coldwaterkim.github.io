export const BGM_TIME_ZONE = 'Asia/Seoul';

export const DEFAULT_BGM_TIME_SLOTS = Object.freeze([
  Object.freeze({ id: 'dawn', label: '새벽', startMinute: 0 }),
  Object.freeze({ id: 'morning', label: '아침', startMinute: 6 * 60 }),
  Object.freeze({ id: 'day', label: '낮', startMinute: 11 * 60 }),
  Object.freeze({ id: 'evening', label: '저녁', startMinute: 17 * 60 }),
  Object.freeze({ id: 'night', label: '밤', startMinute: 22 * 60 }),
]);

export function randomBgmTrackIndex(length, currentIndex = -1, random = Math.random) {
  const trackCount = Math.max(0, Math.floor(Number(length) || 0));
  if (trackCount === 0) return -1;
  if (trackCount === 1) return 0;

  const previousIndex = Number.isInteger(currentIndex) && currentIndex >= 0 && currentIndex < trackCount
    ? currentIndex
    : -1;
  const candidateCount = previousIndex === -1 ? trackCount : trackCount - 1;
  const randomValue = Math.max(0, Math.min(Number(random()) || 0, 1 - Number.EPSILON));
  const candidate = Math.floor(randomValue * candidateCount);

  return previousIndex !== -1 && candidate >= previousIndex ? candidate + 1 : candidate;
}

export function normalizeBgmSchedule(rawSchedule, trackKeys = []) {
  const parsed = parseSchedule(rawSchedule);
  const slots = normalizeSlots(parsed?.slots);
  const slotIds = slots.map(slot => slot.id);
  const savedAssignments = parsed?.assignments && typeof parsed.assignments === 'object'
    ? parsed.assignments
    : {};
  const assignments = {};

  normalizeTrackKeys(trackKeys).forEach(trackKey => {
    if (!Object.prototype.hasOwnProperty.call(savedAssignments, trackKey)) {
      assignments[trackKey] = [...slotIds];
      return;
    }

    const requested = Array.isArray(savedAssignments[trackKey]) ? savedAssignments[trackKey] : [];
    assignments[trackKey] = slotIds.filter(slotId => requested.includes(slotId));
  });

  return {
    version: 1,
    timezone: BGM_TIME_ZONE,
    slots,
    assignments,
  };
}

export function activeBgmTimeSlot(slots, minuteOfDay) {
  const normalizedSlots = normalizeSlots(slots);
  const minute = normalizeMinute(minuteOfDay);
  let active = normalizedSlots[normalizedSlots.length - 1];

  for (const slot of normalizedSlots) {
    if (slot.startMinute > minute) break;
    active = slot;
  }

  return active;
}

export function bgmMinuteInTimeZone(date = new Date(), timeZone = BGM_TIME_ZONE) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const hour = Number(parts.find(part => part.type === 'hour')?.value || 0);
  const minute = Number(parts.find(part => part.type === 'minute')?.value || 0);
  return normalizeMinute((hour * 60) + minute);
}

export function scheduledBgmTrackIndexes(trackKeys, schedule, minuteOfDay) {
  const keys = normalizeTrackKeys(trackKeys);
  if (keys.length === 0) return [];

  const normalized = normalizeBgmSchedule(schedule, keys);
  const activeSlot = activeBgmTimeSlot(normalized.slots, minuteOfDay);
  const scheduled = keys.reduce((indexes, trackKey, index) => {
    if (normalized.assignments[trackKey]?.includes(activeSlot.id)) indexes.push(index);
    return indexes;
  }, []);

  return scheduled.length > 0 ? scheduled : keys.map((_, index) => index);
}

export function randomBgmCandidateIndex(candidateIndexes, currentIndex = -1, random = Math.random) {
  const candidates = Array.from(new Set((candidateIndexes || [])
    .map(value => Number(value))
    .filter(value => Number.isInteger(value) && value >= 0)));
  if (candidates.length === 0) return -1;

  const currentCandidateIndex = candidates.indexOf(currentIndex);
  const picked = randomBgmTrackIndex(candidates.length, currentCandidateIndex, random);
  return candidates[picked];
}

export function formatBgmMinute(minuteOfDay) {
  const minute = normalizeMinute(minuteOfDay);
  return `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
}

export function bgmSlotEndMinute(slots, slotIndex) {
  const normalized = normalizeSlots(slots);
  if (slotIndex < 0 || slotIndex >= normalized.length) return 0;
  return normalized[(slotIndex + 1) % normalized.length].startMinute;
}

function parseSchedule(rawSchedule) {
  if (!rawSchedule) return null;
  if (typeof rawSchedule === 'object') return rawSchedule;

  try {
    const parsed = JSON.parse(rawSchedule);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch (error) {
    return null;
  }
}

function normalizeSlots(values) {
  const savedById = new Map(
    (Array.isArray(values) ? values : [])
      .filter(value => value && typeof value === 'object')
      .map(value => [String(value.id || ''), value]),
  );

  const slots = DEFAULT_BGM_TIME_SLOTS.map(defaultSlot => {
    const saved = savedById.get(defaultSlot.id);
    const startMinute = Number(saved?.startMinute);
    return {
      id: defaultSlot.id,
      label: String(saved?.label || defaultSlot.label).trim().slice(0, 20) || defaultSlot.label,
      startMinute: Number.isInteger(startMinute) && startMinute >= 0 && startMinute < 1440
        ? startMinute
        : defaultSlot.startMinute,
    };
  });

  const hasValidOrder = slots[0].startMinute === 0
    && slots.every((slot, index) => index === 0 || slot.startMinute > slots[index - 1].startMinute);
  return hasValidOrder ? slots : DEFAULT_BGM_TIME_SLOTS.map(slot => ({ ...slot }));
}

function normalizeTrackKeys(trackKeys) {
  return Array.from(new Set((trackKeys || [])
    .map(value => String(value || '').trim())
    .filter(Boolean)));
}

function normalizeMinute(value) {
  const numeric = Math.floor(Number(value) || 0);
  return ((numeric % 1440) + 1440) % 1440;
}

export const ENTRY_LAST_ADMITTED_STORAGE_KEY = 'cwk_entry_last_admitted_at';
export const ENTRY_SESSION_ADMITTED_STORAGE_KEY = 'cwk_entry_admitted';
export const ENTRY_WEBMASTER_LINE_KEY_PREFIX = 'entry_webmaster_line_';

export function entryWebmasterLineKey(dayKey) {
  return `${ENTRY_WEBMASTER_LINE_KEY_PREFIX}${String(dayKey || '').trim()}`;
}

export function normalizeEntryLastAdmittedAt(value, now = Date.now()) {
  const timestamp = Date.parse(String(value || ''));
  if (!Number.isFinite(timestamp)) return '';
  if (timestamp > now + (5 * 60 * 1000)) return '';
  return new Date(timestamp).toISOString();
}

function entryTimestamp(value) {
  const timestamp = Date.parse(String(value || ''));
  return Number.isFinite(timestamp) ? timestamp : 0;
}

export function summarizeEntryUpdates(groups = [], lastAdmittedAt = '', now = Date.now()) {
  const normalizedGroups = groups.map(group => ({
    label: String(group?.label || '').trim(),
    unit: String(group?.unit || '개').trim() || '개',
    items: Array.isArray(group?.items) ? group.items : [],
  }));
  const entries = normalizedGroups.flatMap(group => group.items.map(item => ({
    groupLabel: group.label,
    groupUnit: group.unit,
    title: String(item?.title || '(제목 없음)').trim() || '(제목 없음)',
    href: String(item?.href || '').trim(),
    timestamp: entryTimestamp(item?.updatedAt),
  }))).filter(entry => entry.timestamp > 0 && entry.timestamp <= now + (5 * 60 * 1000))
    .sort((a, b) => b.timestamp - a.timestamp);
  const previous = normalizeEntryLastAdmittedAt(lastAdmittedAt, now);

  if (!previous) {
    const latest = entries[0];
    return latest
      ? {
        heading: 'LATEST UPDATE',
        text: `${latest.groupLabel}: ${latest.title}`,
        href: latest.href,
        count: 1,
      }
      : {
        heading: 'LATEST UPDATE',
        text: '아직 올라온 소식이 없음.',
        href: '',
        count: 0,
      };
  }

  const previousTimestamp = Date.parse(previous);
  const updates = entries.filter(entry => entry.timestamp > previousTimestamp && entry.timestamp <= now + (5 * 60 * 1000));
  if (updates.length === 0) {
    return {
      heading: 'NO NEW UPDATES SINCE YOUR LAST VISIT',
      text: '그동안 조용했음. 그래도 들어오시오.',
      href: '',
      count: 0,
    };
  }

  const counts = normalizedGroups.map(group => {
    const count = group.items.filter(item => {
      const timestamp = entryTimestamp(item?.updatedAt);
      return timestamp > previousTimestamp && timestamp <= now + (5 * 60 * 1000);
    }).length;
    return { label: group.label, unit: group.unit, count };
  }).filter(group => group.count > 0);

  return {
    heading: `NEW SINCE YOUR LAST VISIT: ${updates.length}`,
    text: counts.map(group => `${group.label} ${group.count}${group.unit}`).join(' · '),
    href: updates[0].href,
    count: updates.length,
  };
}

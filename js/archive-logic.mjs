const CATEGORY_LABELS = Object.freeze({
  post: '글방',
  daily: '나으 하루',
  program: '프로그램실',
  nasajab: '나사잡',
  guestbook: '방명록',
});

function timestamp(value) {
  const parsed = Date.parse(value || '');
  return Number.isFinite(parsed) ? parsed : 0;
}

function encode(value) {
  return encodeURIComponent(String(value || ''));
}

function dailyDayKey(entry = {}) {
  return String(entry.day_key || entry.published_at || entry.created || '').slice(0, 10);
}

function groupDailyEntries(entries = []) {
  const groups = new Map();

  entries.forEach(entry => {
    const dayKey = dailyDayKey(entry);
    if (!dayKey) return;
    const date = entry.published_at || `${dayKey}T00:00:00+09:00`;
    const current = groups.get(dayKey);
    if (!current) {
      groups.set(dayKey, { dayKey, date, count: 1, id: entry.id || dayKey });
      return;
    }
    current.count += 1;
    if (timestamp(date) > timestamp(current.date)) current.date = date;
  });

  return Array.from(groups.values());
}

export function buildArchiveEntries({
  posts = [],
  daily = [],
  programs = [],
  nasajab = [],
  guestbook = [],
} = {}) {
  const entries = [
    ...posts.map(post => ({
      id: `post:${post.id || post.slug || ''}`,
      category: 'post',
      categoryLabel: CATEGORY_LABELS.post,
      title: post.title || '(제목 없음)',
      date: post.published_at || post.created || '',
      url: `/posts/${encode(post.slug)}/`,
    })),
    ...groupDailyEntries(daily).map(day => ({
      id: `daily:${day.id}`,
      category: 'daily',
      categoryLabel: CATEGORY_LABELS.daily,
      title: `${day.dayKey}의 하루${day.count > 1 ? ` (${day.count}개)` : ''}`,
      date: day.date,
      url: `/daily/${encode(day.dayKey)}/`,
    })),
    ...programs.map(program => ({
      id: `program:${program.id || program.slug || ''}`,
      category: 'program',
      categoryLabel: CATEGORY_LABELS.program,
      title: program.title || '(이름 없음)',
      date: program.created || program.published_at || '',
      url: `/programs/view.html?slug=${encode(program.slug)}`,
    })),
    ...nasajab.map(item => ({
      id: `nasajab:${item.id || ''}`,
      category: 'nasajab',
      categoryLabel: CATEGORY_LABELS.nasajab,
      title: item.title || item.caption || item.memo || '(제목 없음)',
      date: item.display_at || item.created || '',
      url: item.id ? `/nasajab/index.html#${encode(item.id)}` : '/nasajab/index.html',
    })),
    ...guestbook
      .filter(entry => String(entry.owner_reply || '').trim())
      .map(entry => ({
        id: `guestbook:${entry.id || ''}`,
        category: 'guestbook',
        categoryLabel: CATEGORY_LABELS.guestbook,
        title: `${String(entry.name || '').trim() || '익명의 누군가'}: 방명록`,
        date: entry.display_date || entry.created || '',
        url: `/all/view.html?id=${encode(entry.id)}`,
      })),
  ];

  return entries.sort((a, b) => {
    const byDate = timestamp(b.date) - timestamp(a.date);
    if (byDate !== 0) return byDate;
    return String(b.id).localeCompare(String(a.id));
  });
}

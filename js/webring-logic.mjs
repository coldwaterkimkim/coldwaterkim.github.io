import { dailyPublicUrl, nasajabPublicUrl, postPublicUrl } from './content-urls.mjs';

export function buildWebRingCategories({ posts = [], daily = [], album = [], nasajab = [] } = {}) {
  const seenDays = new Set();
  return [
    posts.filter(item => item?.slug).map(item => ({
      kind: 'post',
      key: `post:${item.slug}`,
      url: postPublicUrl(item.slug),
      label: item.title || '글방 기록',
    })),
    daily.filter(item => {
      const dayKey = String(item?.day_key || item?.published_at || '').slice(0, 10);
      if (!dayKey || seenDays.has(dayKey)) return false;
      seenDays.add(dayKey);
      return true;
    }).map(item => {
      const dayKey = String(item.day_key || item.published_at).slice(0, 10);
      return { kind: 'daily', key: `daily:${dayKey}`, url: dailyPublicUrl(dayKey), label: `${dayKey} 나으 하루` };
    }),
    album.filter(item => item?.media && item?.source_slug).map(item => ({
      kind: 'album',
      key: `album:${item.media}`,
      url: albumItemUrl(item),
      label: item.is_video ? '앨범 영상' : '앨범 사진',
    })),
    nasajab.filter(item => item?.id).map(item => ({
      kind: 'nasajab',
      key: `nasajab:${item.id}`,
      url: nasajabPublicUrl(item.id),
      label: item.title || item.caption || item.memo || '나사잡 기록',
    })),
  ];
}

export function interleaveWebRingCategories(categories = []) {
  const deck = [];
  const maxLength = Math.max(0, ...categories.map(items => items.length));
  for (let index = 0; index < maxLength; index += 1) {
    categories.forEach(items => {
      if (items[index]) deck.push(items[index]);
    });
  }
  return deck;
}

export function webRingNeighbors(deck = [], currentKey = '') {
  if (!deck.length) return { prev: null, next: null };
  const index = deck.findIndex(item => item.key === currentKey);
  if (index < 0) return { prev: deck.at(-1), next: deck[0] };
  return {
    prev: deck[(index - 1 + deck.length) % deck.length],
    next: deck[(index + 1) % deck.length],
  };
}

export function randomWebRingItem(categories = [], currentKey = '', random = Math.random) {
  const available = categories.map(items => items.filter(item => item.key !== currentKey)).filter(items => items.length);
  if (!available.length) return null;
  const category = available[Math.floor(clampRandom(random()) * available.length)];
  return category[Math.floor(clampRandom(random()) * category.length)];
}

function albumItemUrl(item) {
  const anchor = `cwk-media-${cleanId(item.source_id)}-${cleanId(item.media)}`;
  const dayKey = String(item.source_published_at || '').slice(0, 10);
  const base = item.source_kind === 'daily' && /^\d{4}-\d{2}-\d{2}$/.test(dayKey)
    ? dailyPublicUrl(dayKey)
    : item.source_kind === 'daily'
      ? `/daily/view.html?slug=${encodeURIComponent(item.source_slug)}`
      : postPublicUrl(item.source_slug);
  return `${base}#${anchor}`;
}

function cleanId(value) {
  return String(value || '').replace(/[^a-zA-Z0-9_-]/g, '');
}

function clampRandom(value) {
  return Math.max(0, Math.min(Number(value) || 0, 1 - Number.EPSILON));
}

export const ALBUM_PAGE_SIZE = 24;

const MEDIA_EXT_RE = /\.(jpe?g|png|gif|webp|mp4|mov|m4v|webm)$/i;
const VIDEO_EXT_RE = /\.(mp4|mov|m4v|webm)$/i;

export function pocketBaseMediaReference(value = '', baseHref = globalThis.location?.href || 'https://coldwaterkim.com') {
  let url;
  try {
    url = new URL(String(value || '').trim(), baseHref);
  } catch {
    return null;
  }

  const parts = url.pathname.split('/').filter(Boolean);
  const filename = parts.at(-1) || '';
  if (parts[0] !== 'api' || parts[1] !== 'files' || parts.length < 5 || !MEDIA_EXT_RE.test(filename)) return null;

  return {
    collection: parts[2],
    recordId: parts[3],
    filename,
    kind: VIDEO_EXT_RE.test(filename) ? 'video' : 'image',
  };
}

export function albumMediaAnchorId(sourceId, mediaId, occurrence = 1) {
  const base = `cwk-media-${String(sourceId || '').replace(/[^a-zA-Z0-9_-]/g, '')}-${String(mediaId || '').replace(/[^a-zA-Z0-9_-]/g, '')}`;
  return occurrence > 1 ? `${base}-${occurrence}` : base;
}

export function albumSourceUrl(item = {}) {
  const collection = item.source_kind === 'nasajab' ? 'nasajab' : item.source_kind === 'daily' ? 'daily_entries' : 'posts';
  if (!item.source_id) return '/';
  const record = encodeURIComponent(`${collection}:${item.source_id}`);
  const media = item.media ? `/media:${encodeURIComponent(item.media)}` : '';
  return `/#record/${record}${media}`;
}

export function normalizeAlbumKind(value = '') {
  return ['image', 'video'].includes(value) ? value : '';
}

export function normalizeAlbumPage(value = 1) {
  const page = Number.parseInt(value, 10);
  return Number.isFinite(page) && page > 0 ? page : 1;
}

export function albumMediaKey(item = {}) {
  const collection = String(item.file_collection || 'media').trim() || 'media';
  const media = String(item.media || '').trim();
  return media ? `${collection}:${media}` : '';
}

export function albumBrowseUrl({ page = 1, kind = '', tag = '' } = {}) {
  const params = new URLSearchParams();
  const normalizedPage = normalizeAlbumPage(page);
  const normalizedKind = normalizeAlbumKind(kind);
  if (normalizedPage > 1) params.set('page', String(normalizedPage));
  if (normalizedKind) params.set('kind', normalizedKind);
  if (tag) params.set('tag', String(tag));
  const query = params.toString();
  return `/album/index.html${query ? `?${query}` : ''}`;
}

export function albumPageNumbers(currentPage, totalPages) {
  const total = normalizeAlbumPage(totalPages);
  const current = Math.min(normalizeAlbumPage(currentPage), total);
  const pages = new Set([1, total]);
  for (let page = Math.max(1, current - 1); page <= Math.min(total, current + 1); page += 1) pages.add(page);
  const result = [];
  for (const page of [...pages].sort((a, b) => a - b)) {
    const previous = result.at(-1);
    if (previous && page - previous === 2) result.push(previous + 1);
    else if (previous && page - previous > 2) result.push(null);
    result.push(page);
  }
  return result;
}

export function albumTileLabel(item = {}, ordinal = 1) {
  const kind = item.is_video ? '영상' : '사진';
  const date = String(item.source_published_at || item.uploaded_at || '').match(/^\d{4}-\d{2}-\d{2}/)?.[0];
  const title = String(item.source_title || '').replace(/\s+/g, ' ').trim();
  const context = [date, title].filter(Boolean).join(' · ');
  return `${context ? `${context} · ` : ''}${kind} ${ordinal}, 원문으로 이동`;
}

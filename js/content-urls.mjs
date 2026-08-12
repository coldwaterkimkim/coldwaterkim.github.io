export function postPublicUrl(slug = '') {
  const value = String(slug || '').trim();
  return value ? `/posts/${encodeURIComponent(value)}/` : '/posts/index.html';
}

export function dailyPublicUrl(dayKey = '') {
  const value = String(dayKey || '').trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? `/daily/${encodeURIComponent(value)}/`
    : '/daily/index.html';
}

export function nasajabPublicUrl(id = '') {
  const value = String(id || '').trim();
  return value ? `/nasajab/index.html#${encodeURIComponent(value)}` : '/nasajab/index.html';
}

export function publicContentKeyFromLocation(locationLike = globalThis.location) {
  const pathname = String(locationLike?.pathname || '');
  const search = new URLSearchParams(String(locationLike?.search || ''));
  const hash = decodeURIComponent(String(locationLike?.hash || '').replace(/^#/, ''));

  const albumMatch = hash.match(/^cwk-media-([a-zA-Z0-9_-]+)-([a-zA-Z0-9_-]+)(?:-\d+)?$/);
  if (albumMatch) return `album:${albumMatch[2]}`;

  if (pathname === '/nasajab/index.html' && hash) return `nasajab:${hash}`;

  const prettyPost = pathname.match(/^\/posts\/([^/]+)\/?$/);
  if (prettyPost) return `post:${decodeURIComponent(prettyPost[1])}`;
  if (pathname.endsWith('/posts/view.html') && search.get('slug')) return `post:${search.get('slug')}`;

  const prettyDaily = pathname.match(/^\/daily\/(\d{4}-\d{2}-\d{2})\/?$/);
  if (prettyDaily) return `daily:${prettyDaily[1]}`;
  if (pathname.endsWith('/daily/view.html') && search.get('day')) return `daily:${search.get('day').slice(0, 10)}`;

  return '';
}

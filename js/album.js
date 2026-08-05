import { getAlbumItems, getMediaUrl } from './pb.js';
import { ALBUM_PAGE_SIZE, albumSourceUrl, normalizeAlbumKind, normalizeAlbumPage } from './album-logic.mjs';

const ALBUM_SCROLL_KEY = 'cwk:album:return';

export async function initAlbumPage(scope = document) {
  const grid = scope.querySelector('#album-grid');
  if (!grid || grid.dataset.albumReady === 'true') return;
  grid.dataset.albumReady = 'true';

  const params = new URLSearchParams(location.search);
  const page = normalizeAlbumPage(params.get('page'));
  const kind = normalizeAlbumKind(params.get('kind'));
  markActiveFilter(scope, kind);

  try {
    const result = await getAlbumItems(page, ALBUM_PAGE_SIZE, kind);
    renderGrid(grid, result.items);
    renderPagination(scope.querySelector('#album-pagination'), result, kind);
    const status = scope.querySelector('#album-status');
    if (status) status.textContent = `총 ${result.totalItems.toLocaleString('ko-KR')}개`;
    restoreAlbumScroll();
  } catch (error) {
    grid.innerHTML = '<p class="album-message">앨범을 불러오지 못했습니다.</p>';
    console.error('Album load failed:', error);
  }
}

export async function initHomeAlbumPreview(scope = document) {
  const grid = scope.querySelector('#home-album-grid');
  if (!grid || grid.dataset.albumReady === 'true') return;
  grid.dataset.albumReady = 'true';

  try {
    const result = await getAlbumItems(1, homePreviewCount());
    renderGrid(grid, result.items, true);
  } catch (error) {
    grid.innerHTML = '<span class="note">앨범을 불러오지 못했습니다.</span>';
    console.error('Home album preview failed:', error);
  }
}

function renderGrid(grid, items, compact = false) {
  grid.classList.toggle('album-grid--home', compact);
  if (!items.length) {
    grid.innerHTML = '<p class="album-message">아직 앨범에 담긴 미디어가 없습니다.</p>';
    return;
  }

  grid.innerHTML = items.map(item => {
    const previewFile = item.is_video ? item.video_poster : item.file;
    if (!previewFile) return '';
    const previewUrl = new URL(getMediaUrl(item, previewFile), location.href);
    previewUrl.searchParams.set('thumb', '400x400');
    const label = item.is_video ? '영상' : '사진';
    return `<a class="album-tile" href="${albumSourceUrl(item)}" aria-label="${label}이 있는 글로 이동" data-album-source>
      <img src="${previewUrl.href}" alt="" loading="lazy" decoding="async">
      ${item.is_video ? '<span class="album-video-badge" aria-hidden="true">VIDEO</span>' : ''}
    </a>`;
  }).join('');

  grid.querySelectorAll('[data-album-source]').forEach(link => {
    link.addEventListener('click', rememberAlbumScroll);
  });
}

function renderPagination(container, result, kind) {
  if (!container || result.totalPages <= 1) {
    if (container) container.replaceChildren();
    return;
  }
  const href = page => `/album/index.html?page=${page}${kind ? `&kind=${kind}` : ''}`;
  const links = [];
  if (result.page > 1) links.push(`<a href="${href(result.page - 1)}">[이전]</a>`);
  for (let page = 1; page <= result.totalPages; page += 1) {
    links.push(page === result.page ? `<b>[${page}]</b>` : `<a href="${href(page)}">[${page}]</a>`);
  }
  if (result.page < result.totalPages) links.push(`<a href="${href(result.page + 1)}">[다음]</a>`);
  container.innerHTML = links.join(' ');
}

function markActiveFilter(scope, kind) {
  scope.querySelectorAll('[data-album-kind]').forEach(link => {
    const active = link.dataset.albumKind === kind;
    link.classList.toggle('album-filter--active', active);
    if (active) link.setAttribute('aria-current', 'page');
  });
}

function homePreviewCount() {
  return 5;
}

function rememberAlbumScroll() {
  try {
    sessionStorage.setItem(ALBUM_SCROLL_KEY, JSON.stringify({ url: location.pathname + location.search, y: scrollY }));
  } catch {}
}

function restoreAlbumScroll() {
  try {
    const saved = JSON.parse(sessionStorage.getItem(ALBUM_SCROLL_KEY) || 'null');
    if (saved?.url !== location.pathname + location.search) return;
    sessionStorage.removeItem(ALBUM_SCROLL_KEY);
    requestAnimationFrame(() => scrollTo({ top: Number(saved.y) || 0 }));
  } catch {}
}

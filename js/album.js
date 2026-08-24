import {
  applyAlbumTag,
  createAlbumTag,
  deleteAlbumTag,
  getAlbumItems,
  getAlbumTagAssignments,
  getAlbumTags,
  getMediaUrl,
  isLoggedIn,
  updateAlbumTag,
} from './pb.js';
import {
  ALBUM_PAGE_SIZE,
  albumBrowseUrl,
  albumMediaKey,
  albumSourceUrl,
  normalizeAlbumKind,
  normalizeAlbumPage,
} from './album-logic.mjs';

const ALBUM_SCROLL_KEY = 'cwk:album:return';
const OWNER_PAGE_SIZE = 180;

export async function initAlbumPage(scope = document) {
  const grid = scope.querySelector('#album-grid');
  if (!grid || grid.dataset.albumReady === 'true') return;
  grid.dataset.albumReady = 'true';

  const params = new URLSearchParams(location.search);
  const state = {
    scope,
    grid,
    browsePage: normalizeAlbumPage(params.get('page')),
    page: normalizeAlbumPage(params.get('page')),
    kind: normalizeAlbumKind(params.get('kind')),
    tagId: String(params.get('tag') || ''),
    tags: [],
    items: [],
    totalItems: 0,
    totalPages: 1,
    editMode: false,
    loading: false,
    selectedKeys: new Set(),
    lastSelectedKey: '',
    assignments: new Map(),
    loadedAssignmentKeys: new Set(),
    assignmentRequest: 0,
    observer: null,
  };

  bindAlbumEvents(state);
  revealOwnerControls(state);

  try {
    const [tags] = await Promise.all([
      refreshTags(state),
      loadAlbumPage(state, state.page, { replace: true }),
    ]);
    if (state.tagId && !tags.some(tag => tag.id === state.tagId)) {
      state.tagId = '';
      await loadAlbumPage(state, 1, { replace: true });
    }
    renderFilters(state);
    restoreAlbumScroll();
  } catch (error) {
    grid.innerHTML = '<p class="album-message">앨범을 불러오지 못했습니다.</p>';
    setAlbumStatus(state, '앨범을 불러오지 못했습니다.');
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

function bindAlbumEvents(state) {
  const { scope, grid } = state;
  grid.addEventListener('click', event => {
    const tile = event.target.closest('[data-album-source]');
    if (!tile) return;
    if (!state.editMode) {
      rememberAlbumScroll();
      return;
    }
    event.preventDefault();
    toggleTileSelection(state, tile.dataset.albumKey, event.shiftKey);
  });

  scope.querySelector('#album-edit-toggle')?.addEventListener('click', () => toggleEditMode(state));
  scope.querySelector('#album-selection-clear')?.addEventListener('click', () => clearSelection(state));
  scope.querySelector('#album-selection-tags')?.addEventListener('click', event => {
    const button = event.target.closest('[data-album-apply-tag]');
    if (button) applyTagToSelection(state, button.dataset.albumApplyTag, button.dataset.albumAction);
  });
  scope.querySelector('#album-tag-create-form')?.addEventListener('submit', event => createTagFromForm(state, event));
  scope.querySelector('#album-tag-manager-list')?.addEventListener('click', event => {
    const rename = event.target.closest('[data-album-rename-tag]');
    const remove = event.target.closest('[data-album-delete-tag]');
    if (rename) renameTag(state, rename.dataset.albumRenameTag);
    if (remove) removeTag(state, remove.dataset.albumDeleteTag);
  });
  document.addEventListener('keydown', event => {
    if (state.editMode && event.key === 'Escape') clearSelection(state);
  });
}

function revealOwnerControls(state) {
  if (!isLoggedIn()) return;
  state.scope.querySelectorAll('.album-owner-only').forEach(element => {
    if (element.id === 'album-tag-manager') return;
    element.hidden = false;
  });
}

async function loadAlbumPage(state, page, { replace = false } = {}) {
  if (state.loading) return;
  state.loading = true;
  const perPage = state.editMode ? OWNER_PAGE_SIZE : ALBUM_PAGE_SIZE;
  try {
    const result = await getAlbumItems(page, perPage, state.kind, state.tagId);
    state.page = result.page;
    state.totalItems = result.totalItems;
    state.totalPages = result.totalPages || 1;
    state.items = replace ? [...result.items] : [...state.items, ...result.items];
    if (replace) renderGrid(state.grid, state.items, false, state);
    else appendGridItems(state.grid, result.items, state);
    renderPagination(state.scope.querySelector('#album-pagination'), result, state);
    setAlbumStatus(state, `총 ${result.totalItems.toLocaleString('ko-KR')}개`);
    updateInfiniteScroll(state);
  } finally {
    state.loading = false;
  }
}

function renderGrid(grid, items, compact = false, state = null) {
  grid.classList.toggle('album-grid--home', compact);
  if (!items.length) {
    grid.innerHTML = '<p class="album-message">아직 앨범에 담긴 미디어가 없습니다.</p>';
    return;
  }
  grid.innerHTML = items.map(item => tileMarkup(item, state)).join('');
}

function appendGridItems(grid, items, state) {
  if (!items.length) return;
  grid.querySelector('.album-message')?.remove();
  grid.insertAdjacentHTML('beforeend', items.map(item => tileMarkup(item, state)).join(''));
}

function tileMarkup(item, state = null) {
  const previewFile = item.is_video ? item.video_poster : item.file;
  if (!previewFile) return '';
  const fileRecord = { id: item.media, collectionName: item.file_collection || 'media' };
  const previewUrl = new URL(getMediaUrl(fileRecord, previewFile), location.href);
  previewUrl.searchParams.set('thumb', '400x400');
  const label = item.is_video ? '영상' : '사진';
  const sourceLabel = item.source_kind === 'nasajab' ? '나사잡 항목' : '원문 글';
  const mediaKey = albumMediaKey(item);
  const selected = Boolean(state?.selectedKeys.has(mediaKey));
  return `<a class="album-tile${selected ? ' album-tile--selected' : ''}" href="${escapeAttribute(albumSourceUrl(item))}" aria-label="${label}이 있는 ${sourceLabel}으로 이동" data-album-source data-album-key="${escapeAttribute(mediaKey)}"${state?.editMode ? ` aria-pressed="${selected}"` : ''}>
    <img src="${escapeAttribute(previewUrl.href)}" alt="" loading="lazy" decoding="async">
    ${item.is_video ? '<span class="album-video-badge" aria-hidden="true">VIDEO</span>' : ''}
    ${state?.editMode ? '<span class="album-select-mark" aria-hidden="true">✓</span>' : ''}
  </a>`;
}

function renderFilters(state) {
  const tagContainer = state.scope.querySelector('#album-tag-filters');
  const tagLinks = [
    `<a href="${albumBrowseUrl({ kind: state.kind })}" data-album-tag=""${state.tagId ? '' : ' aria-current="page" class="album-filter--active"'}>전체</a>`,
    ...state.tags.map(tag => `<a href="${albumBrowseUrl({ kind: state.kind, tag: tag.id })}" data-album-tag="${escapeAttribute(tag.id)}"${state.tagId === tag.id ? ' aria-current="page" class="album-filter--active"' : ''}>${escapeHtml(tag.name)}</a>`),
  ];
  if (tagContainer) tagContainer.innerHTML = `[ ${tagLinks.join(' | ')} ]`;

  const kindContainer = state.scope.querySelector('#album-kind-filters');
  if (kindContainer) {
    const kinds = [['', '모두'], ['image', '사진'], ['video', '영상']];
    kindContainer.innerHTML = `[ ${kinds.map(([kind, label]) => `<a href="${albumBrowseUrl({ kind, tag: state.tagId })}" data-album-kind="${kind}"${state.kind === kind ? ' aria-current="page" class="album-filter--active"' : ''}>${label}</a>`).join(' | ')} ]`;
  }
  renderTagManager(state);
}

function renderPagination(container, result, state) {
  if (!container || state.editMode || result.totalPages <= 1) {
    if (container) container.replaceChildren();
    return;
  }
  const links = [];
  if (result.page > 1) links.push(`<a href="${albumBrowseUrl({ page: result.page - 1, kind: state.kind, tag: state.tagId })}">[이전]</a>`);
  for (let page = 1; page <= result.totalPages; page += 1) {
    links.push(page === result.page ? `<b>[${page}]</b>` : `<a href="${albumBrowseUrl({ page, kind: state.kind, tag: state.tagId })}">[${page}]</a>`);
  }
  if (result.page < result.totalPages) links.push(`<a href="${albumBrowseUrl({ page: result.page + 1, kind: state.kind, tag: state.tagId })}">[다음]</a>`);
  container.innerHTML = links.join(' ');
}

async function toggleEditMode(state) {
  state.editMode = !state.editMode;
  clearSelection(state);
  const toggle = state.scope.querySelector('#album-edit-toggle');
  if (toggle) {
    toggle.textContent = state.editMode ? '분류 편집 끝내기' : '분류 편집';
    toggle.setAttribute('aria-pressed', String(state.editMode));
  }
  const manager = state.scope.querySelector('#album-tag-manager');
  if (manager) manager.hidden = !state.editMode;
  state.grid.classList.toggle('album-grid--editing', state.editMode);
  state.page = state.editMode ? 1 : state.browsePage;
  state.items = [];
  state.grid.innerHTML = '<p class="album-message">앨범을 불러오는 중...</p>';
  try {
    await loadAlbumPage(state, state.page, { replace: true });
  } catch (error) {
    showOwnerError(state, error);
  }
}

function toggleTileSelection(state, mediaKey, useRange) {
  if (!mediaKey) return;
  const visibleKeys = [...state.grid.querySelectorAll('[data-album-key]')].map(tile => tile.dataset.albumKey);
  if (useRange && state.lastSelectedKey && visibleKeys.includes(state.lastSelectedKey)) {
    const start = visibleKeys.indexOf(state.lastSelectedKey);
    const end = visibleKeys.indexOf(mediaKey);
    visibleKeys.slice(Math.min(start, end), Math.max(start, end) + 1).forEach(key => state.selectedKeys.add(key));
  } else if (state.selectedKeys.has(mediaKey)) {
    state.selectedKeys.delete(mediaKey);
  } else {
    state.selectedKeys.add(mediaKey);
  }
  state.lastSelectedKey = mediaKey;
  syncSelectedTiles(state);
  renderSelectionBar(state);
  ensureSelectedAssignments(state);
}

function clearSelection(state) {
  state.selectedKeys.clear();
  state.lastSelectedKey = '';
  syncSelectedTiles(state);
  renderSelectionBar(state);
}

function syncSelectedTiles(state) {
  state.grid.querySelectorAll('[data-album-key]').forEach(tile => {
    const selected = state.selectedKeys.has(tile.dataset.albumKey);
    tile.classList.toggle('album-tile--selected', selected);
    if (state.editMode) tile.setAttribute('aria-pressed', String(selected));
  });
}

function renderSelectionBar(state, loading = false) {
  const bar = state.scope.querySelector('#album-selection-bar');
  const count = state.scope.querySelector('#album-selection-count');
  const tags = state.scope.querySelector('#album-selection-tags');
  const size = state.selectedKeys.size;
  if (!bar || !count || !tags) return;
  bar.hidden = !state.editMode || !size;
  count.textContent = String(size);
  if (!size) {
    tags.replaceChildren();
    return;
  }
  if (loading) {
    tags.innerHTML = '<span class="note">태그 확인 중...</span>';
    return;
  }
  tags.innerHTML = state.tags.map(tag => {
    const taggedCount = [...state.selectedKeys].filter(key => state.assignments.get(key)?.has(tag.id)).length;
    const action = taggedCount === size ? 'remove' : 'add';
    const prefix = action === 'remove' ? '−' : '+';
    const countLabel = taggedCount > 0 && taggedCount < size ? ` (${taggedCount}/${size})` : '';
    return `<button type="button" data-album-apply-tag="${escapeAttribute(tag.id)}" data-album-action="${action}">${prefix} ${escapeHtml(tag.name)}${countLabel}</button>`;
  }).join(' ');
}

async function ensureSelectedAssignments(state) {
  const missing = [...state.selectedKeys].filter(key => !state.loadedAssignmentKeys.has(key));
  if (!missing.length) {
    renderSelectionBar(state);
    return;
  }
  const request = ++state.assignmentRequest;
  renderSelectionBar(state, true);
  try {
    const records = await getAlbumTagAssignments(missing);
    missing.forEach(key => {
      state.assignments.set(key, new Set());
      state.loadedAssignmentKeys.add(key);
    });
    records.forEach(record => {
      const key = albumMediaKey(record);
      if (key && record.tag_id) state.assignments.get(key)?.add(record.tag_id);
    });
    if (request === state.assignmentRequest) renderSelectionBar(state);
  } catch (error) {
    if (request === state.assignmentRequest) showOwnerError(state, error);
  }
}

async function applyTagToSelection(state, tagId, action) {
  const mediaKeys = [...state.selectedKeys];
  if (!mediaKeys.length || !tagId || !['add', 'remove'].includes(action)) return;
  setOwnerBusy(state, true);
  try {
    await applyAlbumTag(mediaKeys, tagId, action);
    mediaKeys.forEach(key => {
      const assigned = state.assignments.get(key) || new Set();
      if (action === 'add') assigned.add(tagId);
      else assigned.delete(tagId);
      state.assignments.set(key, assigned);
      state.loadedAssignmentKeys.add(key);
    });
    await refreshTags(state);
    renderFilters(state);
    renderSelectionBar(state);
  } catch (error) {
    showOwnerError(state, error);
  } finally {
    setOwnerBusy(state, false);
  }
}

async function refreshTags(state) {
  state.tags = await getAlbumTags();
  renderFilters(state);
  if (state.editMode && state.selectedKeys.size) renderSelectionBar(state);
  return state.tags;
}

function renderTagManager(state) {
  const list = state.scope.querySelector('#album-tag-manager-list');
  if (!list) return;
  if (!state.tags.length) {
    list.innerHTML = '<span class="note">만든 태그가 없습니다.</span>';
    return;
  }
  list.innerHTML = state.tags.map(tag => `<span class="album-tag-manager-item"><b>${escapeHtml(tag.name)}</b> (${Number(tag.assignment_count || 0).toLocaleString('ko-KR')}) <button type="button" data-album-rename-tag="${escapeAttribute(tag.id)}">이름 수정</button> <button type="button" data-album-delete-tag="${escapeAttribute(tag.id)}">삭제</button></span>`).join(' ');
}

async function createTagFromForm(state, event) {
  event.preventDefault();
  const input = event.currentTarget.querySelector('#album-tag-name');
  const name = input?.value.trim();
  if (!name) return;
  setOwnerBusy(state, true);
  try {
    await createAlbumTag(name);
    input.value = '';
    await refreshTags(state);
  } catch (error) {
    showOwnerError(state, error);
  } finally {
    setOwnerBusy(state, false);
  }
}

async function renameTag(state, tagId) {
  const tag = state.tags.find(entry => entry.id === tagId);
  if (!tag) return;
  const name = window.prompt('새 태그 이름', tag.name)?.trim();
  if (!name || name === tag.name) return;
  setOwnerBusy(state, true);
  try {
    await updateAlbumTag(tagId, name);
    await refreshTags(state);
  } catch (error) {
    showOwnerError(state, error);
  } finally {
    setOwnerBusy(state, false);
  }
}

async function removeTag(state, tagId) {
  const tag = state.tags.find(entry => entry.id === tagId);
  if (!tag) return;
  const count = Number(tag.assignment_count || 0).toLocaleString('ko-KR');
  if (!window.confirm(`“${tag.name}” 태그를 삭제할까? ${count}개 미디어에서도 이 태그가 제거돼.`)) return;
  setOwnerBusy(state, true);
  try {
    await deleteAlbumTag(tagId);
    if (state.tagId === tagId) {
      location.href = albumBrowseUrl({ kind: state.kind });
      return;
    }
    state.assignments.forEach(assigned => assigned.delete(tagId));
    await refreshTags(state);
    renderSelectionBar(state);
  } catch (error) {
    showOwnerError(state, error);
  } finally {
    setOwnerBusy(state, false);
  }
}

function updateInfiniteScroll(state) {
  state.observer?.disconnect();
  state.observer = null;
  if (!state.editMode || state.page >= state.totalPages || typeof IntersectionObserver === 'undefined') return;
  const sentinel = state.scope.querySelector('#album-scroll-sentinel');
  if (!sentinel) return;
  state.observer = new IntersectionObserver(async entries => {
    if (!entries.some(entry => entry.isIntersecting) || state.loading || state.page >= state.totalPages) return;
    try {
      await loadAlbumPage(state, state.page + 1);
    } catch (error) {
      showOwnerError(state, error);
    }
  }, { rootMargin: '600px 0px' });
  state.observer.observe(sentinel);
}

function setOwnerBusy(state, busy) {
  state.scope.querySelectorAll('#album-tag-manager button, #album-tag-manager input, #album-selection-bar button').forEach(control => {
    control.disabled = busy;
  });
}

function setAlbumStatus(state, message) {
  const status = state.scope.querySelector('#album-status');
  if (status) status.textContent = message;
}

function showOwnerError(state, error) {
  const message = error?.response?.message || error?.message || '처리하지 못했습니다.';
  setAlbumStatus(state, message);
  console.error('Album owner action failed:', error);
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

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function escapeAttribute(value) {
  return escapeHtml(value);
}

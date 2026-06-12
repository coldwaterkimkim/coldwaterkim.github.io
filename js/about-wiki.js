import {
  getSetting,
  setSetting,
  isLoggedIn,
  cmsErrorMessage,
  escapeHtml,
  uploadMedia,
  getMediaUrl
} from './pb.js';
import {
  ABOUT_PROFILE_DOCUMENT_VERSION,
  defaultAboutProfileRows,
  normalizeAboutProfileRows
} from './profile-data.js';

const SETTING_KEY = 'about_wiki_document';
const IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);
let markdownEditorModulePromise = null;
let createMarkdownEditor = null;
let hasImageTransfer = null;
let imageFilesFromTransfer = null;

const DEFAULT_DOCUMENT = {
  title: '김찬수',
  subtitle: '',
  profileTitle: 'coldwaterkim',
  profileImage: 'assets/profile-crop.jpg',
  profileSchemaVersion: ABOUT_PROFILE_DOCUMENT_VERSION,
  profileRows: defaultAboutProfileRows(),
  sections: [
    {
      id: 'overview',
      title: '개요',
      body: '대한민국의 밀레니엄 베이비. 개인 홈페이지 <b>coldwaterkim.com</b>의 주인장이다.<br><br>글방, 나으 하루, 프로그램실, 나사잡을 통해 생각·일상·만든 것·갑자기 사로잡힌 이미지를 계속 쌓고 있다. 모던한 포트폴리오보다는 직접 만든 홈페이지의 기척을 더 좋아하는 편.'
    },
    {
      id: 'what-made',
      title: '만든 것',
      body: '<ul><li><b>글방</b>: 생각과 기록을 올리는 곳.</li><li><b>나으 하루</b>: 하루 단위로 남기는 생활 로그.</li><li><b>프로그램실</b>: 직접 만든 작은 프로그램과 실험작을 보관하는 자료실.</li><li><b>나사잡</b>: 나를 사로잡은 사진, 캡처, 장면을 한 장씩 수집하는 코너.</li></ul>'
    },
    {
      id: 'history',
      title: '연혁',
      body: '<table><tr><th>시기</th><th>내용</th></tr><tr><td>2000</td><td>태어남. 당시 본인은 기억이 없다.</td></tr><tr><td>2025</td><td>개인 홈페이지를 진짜 운영물로 만들기 시작.</td></tr><tr><td>2026</td><td>홈페이지가 점점 위키, 블로그, 자료실, 방명록을 겸하는 무언가가 되어가는 중.</td></tr></table>'
    },
    {
      id: 'taste',
      title: '취향',
      body: '90년대 개인 홈페이지, 기본 파란 링크, 마퀴, 방문자 카운터, 수상하게 진심인 테이블 UI를 좋아한다. 너무 매끈한 포트폴리오보다 약간 삐걱대지만 실제로 운영되는 웹을 더 신뢰한다.'
    },
    {
      id: 'contact',
      title: '연락처',
      body: '메일은 <a href="mailto:ckstn1112@gmail.com?subject=Hello%20from%20your%20site">ckstn1112@gmail.com</a>으로 보내면 된다. 방명록에 한 줄 남기는 것도 환영.'
    },
    {
      id: 'trivia',
      title: '여담',
      body: '이 문서는 나무위키처럼 보이지만 실제로는 본인이 직접 관리한다. 그래서 틀린 내용이 있다면 높은 확률로 본인이 미래의 본인에게 남긴 과제다.'
    },
  ],
};

const stateByRoot = new WeakMap();

initAboutWiki();

window.addEventListener('coldwaterkim:content-ready', initAboutWiki);

function initAboutWiki() {
  document.querySelectorAll('[data-about-wiki-root]').forEach((root) => {
    if (root.dataset.aboutWikiReady === 'true') return;
    root.dataset.aboutWikiReady = 'true';

    const state = {
      root,
      doc: cloneDefaultDocument(),
      isOwner: isLoggedIn(),
      selectedSectionId: null,
      selectedProfileIndex: null,
      sectionEditor: null,
      pendingEditorImageIndex: null,
      saveTimer: null,
    };
    stateByRoot.set(root, state);

    loadDocument(state);
  });
}

async function loadDocument(state) {
  render(state);

  try {
    const saved = await getSetting(SETTING_KEY);
    const parsed = parseSavedDocument(saved);
    if (parsed) {
      state.doc = parsed;
      render(state);
    }
  } catch (error) {
    renderStatus(state, `CMS 설정을 불러오지 못했음: ${cmsErrorMessage(error)}`, 'error');
  }
}

function parseSavedDocument(value) {
  if (!value) return null;

  try {
    const parsed = JSON.parse(value);
    return normalizeDocument(parsed);
  } catch (error) {
    console.warn('About wiki document parse failed:', error);
    return null;
  }
}

function normalizeDocument(value) {
  const next = cloneDefaultDocument();
  if (!value || typeof value !== 'object') return next;

  next.title = cleanText(value.title) || next.title;
  next.subtitle = cleanText(value.subtitle) || next.subtitle;
  next.profileTitle = cleanText(value.profileTitle) || next.profileTitle;
  next.profileImage = cleanText(value.profileImage) || next.profileImage;
  next.profileSchemaVersion = ABOUT_PROFILE_DOCUMENT_VERSION;

  if (Array.isArray(value.profileRows)) {
    next.profileRows = normalizeAboutProfileRows(value.profileRows, {
      mergeDefaults: Number(value.profileSchemaVersion || 0) < ABOUT_PROFILE_DOCUMENT_VERSION,
    });
  }

  if (Array.isArray(value.sections)) {
    next.sections = value.sections
      .map((section, index) => ({
        id: sectionId(section?.id, section?.title, index),
        title: cleanText(section?.title) || `새 섹션 ${index + 1}`,
        body: cleanHtml(section?.body),
      }))
      .filter(section => section.title || section.body);
  }

  if (next.sections.length === 0) {
    next.sections = cloneDefaultDocument().sections;
  }

  return next;
}

function render(state) {
  const { root, doc, isOwner } = state;
  state.sectionEditor = null;
  state.pendingEditorImageIndex = null;

  root.innerHTML = `
    ${isOwner ? ownerBarHtml(state) : ''}
    <div class="about-wiki-head">
      <h1>${escapeHtml(doc.title)}</h1>
    </div>
    <div class="about-wiki-status" data-about-status hidden></div>
    <div class="about-profile-block">
      ${infoboxHtml(doc, isOwner)}
      ${tocHtml(doc.sections, isOwner)}
    </div>
    <div class="about-wiki-body">
      ${sectionsHtml(doc.sections, isOwner)}
    </div>
    ${isOwner ? editorHtml(state) : ''}
  `;

  hydrateSavedHtml(state);
  bindEvents(state);
  initSectionEditor(state);
}

function ownerBarHtml(state) {
  const selected = findSelectedSection(state);

  return `
    <div class="owner-bar about-owner-bar">
      <b>OWNER MODE</b> ·
      <button type="button" class="owner-btn" data-about-action="add-section">섹션 추가</button>
      <button type="button" class="owner-btn" data-about-action="edit-profile">프로필 표 수정</button>
      <button type="button" class="owner-btn" data-about-action="reset-selection">편집 닫기</button>
      <span class="note">${selected ? `"${escapeHtml(selected.title)}" 편집 중` : '섹션 제목에서 [편집] 누르면 바로 고침'}</span>
    </div>
  `;
}

function infoboxHtml(doc, isOwner) {
  const rows = doc.profileRows.map((row, index) => `
    <tr>
      <th>${escapeHtml(row.label || '')}</th>
      <td>
        <span data-about-profile-value-index="${index}"></span>
        ${isOwner ? `<button type="button" class="about-edit-link" data-about-action="edit-profile-row" data-profile-index="${index}">[편집]</button>` : ''}
      </td>
    </tr>
  `).join('');

  return `
    <table class="about-infobox" border="1" cellspacing="0" cellpadding="5" align="right">
      <tr>
        <th colspan="2" class="about-infobox-title">${escapeHtml(doc.profileTitle)}</th>
      </tr>
      <tr>
        <td colspan="2" class="about-infobox-photo">
          <img src="${escapeAttribute(doc.profileImage)}" alt="${escapeAttribute(doc.profileTitle)} profile">
        </td>
      </tr>
      ${rows}
    </table>
  `;
}

function tocHtml(sections, isOwner) {
  const items = sections.map((section) => `
    <li>
      <a href="#about-section-${escapeAttribute(section.id)}">${escapeHtml(section.title)}</a>
      ${isOwner ? `<button type="button" class="about-edit-link" data-about-action="edit-section" data-section-id="${escapeAttribute(section.id)}">[편집]</button>` : ''}
    </li>
  `).join('');

  return `
    <table class="about-toc" border="1" cellspacing="0" cellpadding="6">
      <tr bgcolor="#f0f0f0">
        <th>목차</th>
      </tr>
      <tr>
        <td>
          <ol>${items}</ol>
        </td>
      </tr>
    </table>
  `;
}

function sectionsHtml(sections, isOwner) {
  return sections.map((section, index) => `
    <div class="about-section" id="about-section-${escapeAttribute(section.id)}" data-section-id="${escapeAttribute(section.id)}">
      <h2>
        <span>${index + 1}. ${escapeHtml(section.title)}</span>
        ${isOwner ? `<button type="button" class="about-edit-link" data-about-action="edit-section" data-section-id="${escapeAttribute(section.id)}">[편집]</button>` : ''}
      </h2>
      <div class="about-section-body post-content" data-about-section-body-index="${index}"></div>
    </div>
  `).join('');
}

function hydrateSavedHtml(state) {
  state.root.querySelectorAll('[data-about-profile-value-index]').forEach((slot) => {
    const index = Number(slot.getAttribute('data-about-profile-value-index'));
    slot.innerHTML = state.doc.profileRows[index]?.value || '';
  });

  state.root.querySelectorAll('[data-about-section-body-index]').forEach((slot) => {
    const index = Number(slot.getAttribute('data-about-section-body-index'));
    slot.innerHTML = state.doc.sections[index]?.body || '<p></p>';
  });
}

function editorHtml(state) {
  const selected = findSelectedSection(state);
  const profileIndex = state.selectedProfileIndex;
  const selectedProfile = Number.isInteger(profileIndex) ? state.doc.profileRows[profileIndex] : null;

  if (selectedProfile) {
    return `
      <form class="about-editor" data-about-editor="profile">
        <b>프로필 표 row 편집</b>
        <table border="1" cellspacing="0" cellpadding="5" width="100%">
          <tr>
            <th width="120">라벨</th>
            <td><input type="text" name="label" value="${escapeAttribute(selectedProfile.label)}"></td>
          </tr>
          <tr>
            <th>값</th>
            <td><textarea name="value" rows="4">${escapeTextarea(selectedProfile.value)}</textarea></td>
          </tr>
        </table>
        <div class="about-editor-actions">
          <button type="submit" class="owner-btn">저장</button>
          <button type="button" class="owner-btn owner-btn-danger" data-about-action="delete-profile-row">삭제</button>
          <button type="button" class="owner-btn" data-about-action="add-profile-row">row 추가</button>
        </div>
      </form>
    `;
  }

  if (!selected) {
    return `
      <div class="about-editor about-editor-empty">
        <b>문서 편집 대기중</b><br>
        <span class="note">섹션 제목 옆 [편집]을 누르거나, OWNER MODE에서 섹션을 추가하면 편집기가 열림.</span>
      </div>
    `;
  }

  const index = state.doc.sections.findIndex(section => section.id === selected.id);

  return `
    <form class="about-editor" data-about-editor="section">
      <b>섹션 편집: ${escapeHtml(selected.title)}</b>
      <table border="1" cellspacing="0" cellpadding="5" width="100%">
        <tr>
          <th width="120">제목</th>
          <td><input type="text" name="title" value="${escapeAttribute(selected.title)}"></td>
        </tr>
        <tr>
          <th>본문</th>
          <td>
            <div class="about-editor-container" data-about-editor-container>
              <div data-about-markdown-editor></div>
            </div>
            <input type="file" data-about-image-input accept="image/*" multiple hidden>
            <div class="about-editor-image-status" data-about-image-status aria-live="polite"></div>
            <div class="note">블로그랑 같은 Markdown/WYSIWYG 편집기. 저장하면 목차 번호는 자동 재계산됨.</div>
          </td>
        </tr>
      </table>
      <div class="about-editor-actions">
        <button type="submit" class="owner-btn">저장</button>
        <button type="button" class="owner-btn" data-about-action="move-section" data-direction="-1" ${index <= 0 ? 'disabled' : ''}>위로</button>
        <button type="button" class="owner-btn" data-about-action="move-section" data-direction="1" ${index >= state.doc.sections.length - 1 ? 'disabled' : ''}>아래로</button>
        <button type="button" class="owner-btn owner-btn-danger" data-about-action="delete-section">삭제</button>
      </div>
    </form>
  `;
}

async function initSectionEditor(state) {
  if (!state.isOwner) return;
  await loadMarkdownEditorModule();

  const selected = findSelectedSection(state);
  const mount = state.root.querySelector('[data-about-markdown-editor]');
  const form = state.root.querySelector('[data-about-editor="section"]');
  const input = state.root.querySelector('[data-about-image-input]');
  if (!selected || !mount || !form || !input) return;

  const selectedId = selected.id;
  try {
    const editor = await createMarkdownEditor(mount, {
      height: '320px',
      minHeight: '240px',
      placeholder: 'Markdown으로 섹션 본문 쓰기...',
      onImageButton: () => {
        state.pendingEditorImageIndex = currentEditorIndex(state);
        input.click();
      }
    });

    if (!mount.isConnected || state.selectedSectionId !== selectedId) return;

    state.sectionEditor = editor;
    editor.root.innerHTML = selected.body || '';
    bindSectionEditorImages(state, form, input, editor);
  } catch (error) {
    renderStatus(state, `편집기 로드 실패: ${cmsErrorMessage(error)}`, 'error');
  }
}

async function loadMarkdownEditorModule() {
  if (!markdownEditorModulePromise) {
    markdownEditorModulePromise = import('./markdown-editor.js');
  }

  const module = await markdownEditorModulePromise;
  createMarkdownEditor = module.createMarkdownEditor;
  hasImageTransfer = module.hasImageTransfer;
  imageFilesFromTransfer = module.imageFilesFromTransfer;
}

function bindSectionEditorImages(state, form, input, editor) {
  const container = form.querySelector('[data-about-editor-container]');
  if (!container) return;

  input.addEventListener('change', async () => {
    await insertEditorImages(state, input.files, {
      index: state.pendingEditorImageIndex
    });
    state.pendingEditorImageIndex = null;
    input.value = '';
  });

  container.addEventListener('dragenter', (event) => {
    if (!hasImageTransfer(event.dataTransfer)) return;
    event.preventDefault();
    container.classList.add('is-image-dragover');
  });

  container.addEventListener('dragover', (event) => {
    if (!hasImageTransfer(event.dataTransfer)) return;
    event.preventDefault();
    container.classList.add('is-image-dragover');
  });

  container.addEventListener('dragleave', (event) => {
    if (event.relatedTarget instanceof Node && container.contains(event.relatedTarget)) return;
    container.classList.remove('is-image-dragover');
  });

  container.addEventListener('drop', async (event) => {
    if (!hasImageTransfer(event.dataTransfer)) return;
    event.preventDefault();
    event.stopPropagation();
    container.classList.remove('is-image-dragover');
    await insertEditorImages(state, editorImageFilesFromTransfer(event.dataTransfer), {
      index: currentEditorIndex(state)
    });
  }, true);

  editor.root.addEventListener('paste', async (event) => {
    if (!hasImageTransfer(event.clipboardData)) return;
    event.preventDefault();
    event.stopPropagation();
    await insertEditorImages(state, editorImageFilesFromTransfer(event.clipboardData), {
      index: currentEditorIndex(state)
    });
  }, true);
}

function bindEvents(state) {
  if (!state.isOwner) return;
  if (state.eventsBound) return;
  state.eventsBound = true;

  state.root.addEventListener('click', (event) => {
    const button = event.target.closest('[data-about-action]');
    if (!button || !state.root.contains(button)) return;

    const action = button.dataset.aboutAction;

    if (action === 'edit-section') {
      state.selectedProfileIndex = null;
      state.selectedSectionId = button.dataset.sectionId || null;
      render(state);
      scrollEditorIntoView(state);
    }

    if (action === 'add-section') {
      addSection(state);
    }

    if (action === 'delete-section') {
      deleteSelectedSection(state);
    }

    if (action === 'move-section') {
      moveSelectedSection(state, Number(button.dataset.direction || 0));
    }

    if (action === 'edit-profile') {
      openProfileEditor(state);
    }

    if (action === 'add-profile-row') {
      addProfileRow(state);
    }

    if (action === 'edit-profile-row') {
      state.selectedSectionId = null;
      state.selectedProfileIndex = Number(button.dataset.profileIndex);
      render(state);
      scrollEditorIntoView(state);
    }

    if (action === 'delete-profile-row') {
      deleteSelectedProfileRow(state);
    }

    if (action === 'reset-selection') {
      state.selectedSectionId = null;
      state.selectedProfileIndex = null;
      render(state);
    }
  });

  state.root.addEventListener('submit', (event) => {
    const form = event.target.closest('[data-about-editor]');
    if (!form || !state.root.contains(form)) return;
    event.preventDefault();

    if (form.dataset.aboutEditor === 'section') {
      saveSectionForm(state, form);
    }

    if (form.dataset.aboutEditor === 'profile') {
      saveProfileForm(state, form);
    }
  });
}

function addSection(state) {
  const id = uniqueSectionId(state.doc.sections, 'new-section');
  const next = {
    id,
    title: '새 섹션',
    body: '여기에 내용을 적으면 목차에 자동으로 추가됨.'
  };

  state.doc.sections.push(next);
  state.selectedSectionId = id;
  state.selectedProfileIndex = null;
  persistAndRender(state, '섹션 추가됨');
}

function deleteSelectedSection(state) {
  const selected = findSelectedSection(state);
  if (!selected) return;
  if (!window.confirm(`"${selected.title}" 섹션을 삭제할까?`)) return;

  state.doc.sections = state.doc.sections.filter(section => section.id !== selected.id);
  state.selectedSectionId = null;
  persistAndRender(state, '섹션 삭제됨');
}

function moveSelectedSection(state, direction) {
  const index = state.doc.sections.findIndex(section => section.id === state.selectedSectionId);
  const nextIndex = index + direction;
  if (index < 0 || nextIndex < 0 || nextIndex >= state.doc.sections.length) return;

  const [section] = state.doc.sections.splice(index, 1);
  state.doc.sections.splice(nextIndex, 0, section);
  persistAndRender(state, '순서 변경됨');
}

function saveSectionForm(state, form) {
  const selected = findSelectedSection(state);
  if (!selected) return;

  const title = cleanText(new FormData(form).get('title')) || '제목 없음';
  selected.title = title;
  selected.body = cleanHtml(sectionEditorHtml(state, selected.body));
  selected.id = uniqueSectionId(
    state.doc.sections.filter(section => section !== selected),
    sectionId(selected.id, title)
  );

  state.selectedSectionId = selected.id;
  persistAndRender(state, '섹션 저장됨');
}

function addProfileRow(state) {
  state.doc.profileRows.push({ label: '새 항목', value: '내용' });
  state.selectedSectionId = null;
  state.selectedProfileIndex = state.doc.profileRows.length - 1;
  persistAndRender(state, '프로필 row 추가됨');
}

function openProfileEditor(state) {
  if (state.doc.profileRows.length === 0) {
    addProfileRow(state);
    return;
  }

  state.selectedSectionId = null;
  state.selectedProfileIndex = 0;
  render(state);
  scrollEditorIntoView(state);
}

function deleteSelectedProfileRow(state) {
  if (!Number.isInteger(state.selectedProfileIndex)) return;
  state.doc.profileRows.splice(state.selectedProfileIndex, 1);
  state.selectedProfileIndex = null;
  persistAndRender(state, '프로필 row 삭제됨');
}

function saveProfileForm(state, form) {
  const index = state.selectedProfileIndex;
  if (!Number.isInteger(index) || !state.doc.profileRows[index]) return;

  const data = new FormData(form);
  state.doc.profileRows[index] = {
    label: cleanText(data.get('label')) || '항목',
    value: cleanHtml(data.get('value')),
  };
  persistAndRender(state, '프로필 row 저장됨');
}

async function persistAndRender(state, message) {
  render(state);
  renderStatus(state, '저장 중...', 'pending');

  try {
    state.doc.profileSchemaVersion = ABOUT_PROFILE_DOCUMENT_VERSION;
    await setSetting(SETTING_KEY, JSON.stringify(state.doc));
    window.dispatchEvent(new CustomEvent('coldwaterkim:profile-data-updated', {
      detail: { document: state.doc }
    }));
    renderStatus(state, message || '저장됨', 'success');
  } catch (error) {
    renderStatus(state, `저장 실패: ${cmsErrorMessage(error)}`, 'error');
  }
}

function renderStatus(state, message, type = 'success') {
  const status = state.root.querySelector('[data-about-status]');
  if (!status) return;

  status.hidden = false;
  status.textContent = message;
  status.className = `about-wiki-status about-wiki-status--${type}`;

  if (type === 'success') {
    window.clearTimeout(state.saveTimer);
    state.saveTimer = window.setTimeout(() => {
      const nextStatus = state.root.querySelector('[data-about-status]');
      if (nextStatus) nextStatus.hidden = true;
    }, 1600);
  }
}

function sectionEditorHtml(state, fallback = '') {
  const html = state.sectionEditor?.root?.innerHTML?.trim();
  if (html === '<p><br></p>') return '';
  return typeof html === 'string' ? html : fallback;
}

function editorImageFilesFromTransfer(dataTransfer) {
  return imageFilesFromTransfer(dataTransfer, {
    mimeTypes: IMAGE_MIME_TYPES,
    fallbackNamePrefix: 'about-section-image'
  });
}

function isSupportedEditorImage(file) {
  return file && IMAGE_MIME_TYPES.has(file.type);
}

function clampEditorIndex(state, index) {
  return state.sectionEditor?.clampIndex(index) || 0;
}

function currentEditorIndex(state) {
  const range = state.sectionEditor?.getSelection?.();
  return clampEditorIndex(state, range?.index);
}

async function insertEditorImages(state, files, options = {}) {
  const editor = state.sectionEditor;
  if (!editor) return;

  const imageFiles = Array.from(files || []).filter(isSupportedEditorImage);
  if (!imageFiles.length) {
    renderEditorImageStatus(state, 'JPG, PNG, GIF, WebP 이미지만 본문에 넣을 수 있어.', 'error');
    return;
  }

  const container = state.root.querySelector('[data-about-editor-container]');
  let insertIndex = clampEditorIndex(state, options.index);
  let uploadedCount = 0;
  container?.classList.add('is-image-uploading');

  for (let i = 0; i < imageFiles.length; i += 1) {
    const file = imageFiles[i];
    renderEditorImageStatus(state, `이미지 업로드 중... (${i + 1}/${imageFiles.length}) ${file.name}`, 'info');

    try {
      const media = await uploadMedia(file, file.name, 'About wiki');
      const url = getMediaUrl(media, media.file);
      insertIndex = editor.insertImage(insertIndex, url, file.name);
      uploadedCount += 1;
    } catch (error) {
      renderEditorImageStatus(state, `본문 이미지 업로드 실패 (${file.name}): ${cmsErrorMessage(error)}`, 'error');
    }
  }

  container?.classList.remove('is-image-uploading');

  if (uploadedCount > 0) {
    editor.setSelection(insertIndex, 0, 'silent');
    renderEditorImageStatus(state, `${uploadedCount}개 이미지가 본문에 들어갔습니다.`, 'success');
    setTimeout(() => renderEditorImageStatus(state), 2500);
  }
}

function renderEditorImageStatus(state, message = '', type = 'info') {
  const status = state.root.querySelector('[data-about-image-status]');
  if (!status) return;
  status.textContent = message;
  status.className = `about-editor-image-status about-editor-image-status--${type}`;
  status.classList.toggle('is-visible', Boolean(message));
}

function findSelectedSection(state) {
  return state.doc.sections.find(section => section.id === state.selectedSectionId) || null;
}

function scrollEditorIntoView(state) {
  requestAnimationFrame(() => {
    state.root.querySelector('.about-editor')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  });
}

function cloneDefaultDocument() {
  return JSON.parse(JSON.stringify(DEFAULT_DOCUMENT));
}

function sectionId(id, title, fallbackIndex = 0) {
  const raw = cleanText(id) || cleanText(title) || `section-${fallbackIndex + 1}`;
  const normalized = raw
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9가-힣]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return normalized || `section-${fallbackIndex + 1}`;
}

function uniqueSectionId(sections, preferred) {
  const base = sectionId(preferred, preferred);
  let next = base;
  let count = 2;
  const used = new Set(sections.map(section => section.id));

  while (used.has(next)) {
    next = `${base}-${count}`;
    count += 1;
  }

  return next;
}

function cleanText(value) {
  return String(value || '').trim();
}

function cleanHtml(value) {
  return String(value || '').trim();
}

function escapeAttribute(value) {
  return escapeHtml(String(value || '')).replace(/"/g, '&quot;');
}

function escapeTextarea(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

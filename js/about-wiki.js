import {
  getSetting,
  setSetting,
  isLoggedIn,
  cmsErrorMessage,
  escapeHtml,
  uploadMedia,
  getMediaUrl,
  formatMediaUploadProgress
} from './pb.js';
import {
  ABOUT_PROFILE_DOCUMENT_VERSION,
  defaultAboutProfileRows,
  normalizeAboutProfileRows,
  sanitizeProfileValueHtml,
} from './profile-data.js';
import { enhanceEmbeddedMedia, prepareEmbeddedMediaForDisplay } from './media-embeds.js';
import { moveItemById } from './about-wiki-logic.mjs';
import {
  ABOUT_WIKI_MARKUP_VERSION,
  aboutWikiMarkupWarnings,
  aboutWikiMediaSource,
  legacyHtmlToAboutWikiMarkup,
  normalizeAboutWikiSource,
  renderAboutWikiMarkup,
} from './about-wiki-markup.mjs';
import { preferredTransferFiles, uniqueTransferFiles } from './editor-file-transfer.mjs';
import { createEditorUploadCoordinator } from './editor-upload-coordinator.mjs';

const SETTING_KEY = 'about_wiki_document';
const CONTENT_SCHEMA_VERSION = 2;
const EDITOR_UPLOAD_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'video/mp4',
  'video/webm',
  'video/quicktime',
  'video/x-m4v',
  'audio/mpeg',
  'audio/mp3',
  'application/pdf',
]);

const DEFAULT_DOCUMENT = {
  contentSchemaVersion: CONTENT_SCHEMA_VERSION,
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
      format: `namumark-v${ABOUT_WIKI_MARKUP_VERSION}`,
      source: "대한민국의 밀레니엄 베이비. 개인 홈페이지 '''coldwaterkim.com'''의 주인장이다.\n\n글방, 나으 하루, 프로그램실, 나사잡을 통해 생각·일상·만든 것·갑자기 사로잡힌 이미지를 계속 쌓고 있다. 모던한 포트폴리오보다는 직접 만든 홈페이지의 기척을 더 좋아하는 편."
    },
    {
      id: 'what-made',
      title: '만든 것',
      format: `namumark-v${ABOUT_WIKI_MARKUP_VERSION}`,
      source: " * '''글방''': 생각과 기록을 올리는 곳.\n * '''나으 하루''': 하루 단위로 남기는 생활 로그.\n * '''프로그램실''': 직접 만든 작은 프로그램과 실험작을 보관하는 자료실.\n * '''나사잡''': 나를 사로잡은 사진, 캡처, 장면을 한 장씩 수집하는 코너."
    },
    {
      id: 'history',
      title: '연혁',
      format: `namumark-v${ABOUT_WIKI_MARKUP_VERSION}`,
      source: "|| '''시기''' || '''내용''' ||\n|| 2000 || 태어남. 당시 본인은 기억이 없다. ||\n|| 2025 || 개인 홈페이지를 진짜 운영물로 만들기 시작. ||\n|| 2026 || 홈페이지가 점점 위키, 블로그, 자료실, 방명록을 겸하는 무언가가 되어가는 중. ||"
    },
    {
      id: 'taste',
      title: '취향',
      format: `namumark-v${ABOUT_WIKI_MARKUP_VERSION}`,
      source: '90년대 개인 홈페이지, 기본 파란 링크, 마퀴, 방문자 카운터, 수상하게 진심인 테이블 UI를 좋아한다. 너무 매끈한 포트폴리오보다 약간 삐걱대지만 실제로 운영되는 웹을 더 신뢰한다.'
    },
    {
      id: 'contact',
      title: '연락처',
      format: `namumark-v${ABOUT_WIKI_MARKUP_VERSION}`,
      source: '메일은 [[mailto:ckstn1112@gmail.com?subject=Hello%20from%20your%20site|ckstn1112@gmail.com]]으로 보내면 된다. 방명록에 한 줄 남기는 것도 환영.'
    },
    {
      id: 'trivia',
      title: '여담',
      format: `namumark-v${ABOUT_WIKI_MARKUP_VERSION}`,
      source: '이 문서는 나무위키처럼 보이지만 실제로는 본인이 직접 관리한다. 그래서 틀린 내용이 있다면 높은 확률로 본인이 미래의 본인에게 남긴 과제다.'
    },
  ],
};

const stateByRoot = new WeakMap();

initAboutWiki();
bindAboutUnloadGuard();

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
      sourceEditor: null,
      previewVisible: false,
      returnFocusSectionId: null,
      pendingEditorSelection: null,
      isMediaUploading: false,
      mediaUploadOperations: 0,
      mediaUploadCoordinator: createEditorUploadCoordinator({
        uploadFile: uploadAboutMediaRecord,
      }),
      saveTimer: null,
      saveQueue: Promise.resolve(),
      saveVersion: 0,
      hasUnsavedChanges: false,
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
  next.contentSchemaVersion = Number(value.contentSchemaVersion || 1);
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
      .map((section, index) => normalizeSection(section, index))
      .filter(section => section.title || sectionHasSource(section) || section.body);
  }

  if (next.sections.length === 0) {
    next.sections = cloneDefaultDocument().sections;
  }

  return next;
}

function render(state) {
  const { root, doc, isOwner } = state;
  state.sourceEditor = null;
  state.pendingEditorSelection = null;

  root.innerHTML = `
    ${isOwner ? ownerBarHtml(state) : ''}
    <div class="about-wiki-head">
      <h1>${escapeHtml(doc.title)}</h1>
    </div>
    <div class="about-wiki-status" data-about-status role="status" aria-live="polite" hidden></div>
    <div class="about-profile-block">
      ${infoboxHtml(doc, isOwner)}
      ${tocHtml(doc.sections, isOwner)}
    </div>
    <div class="about-wiki-body">
      ${sectionsHtml(doc.sections, isOwner)}
    </div>
    ${isOwner ? editorHtml(state) : ''}
  `;

  hydrateDocumentContent(state);
  bindEvents(state);
  initSourceEditor(state);
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
        ${isOwner ? `
          <span class="about-section-tools">
            <button type="button" class="about-order-btn" data-about-action="move-section" data-section-id="${escapeAttribute(section.id)}" data-direction="-1" title="위로 이동" aria-label="${escapeAttribute(section.title)} 위로 이동" ${index <= 0 ? 'disabled' : ''}>↑</button>
            <button type="button" class="about-order-btn" data-about-action="move-section" data-section-id="${escapeAttribute(section.id)}" data-direction="1" title="아래로 이동" aria-label="${escapeAttribute(section.title)} 아래로 이동" ${index >= sections.length - 1 ? 'disabled' : ''}>↓</button>
            <button type="button" class="about-edit-link" data-about-action="edit-section" data-section-id="${escapeAttribute(section.id)}">[편집]</button>
          </span>
        ` : ''}
      </h2>
      <div class="about-section-body post-content" data-about-section-body-index="${index}"></div>
    </div>
  `).join('');
}

function hydrateDocumentContent(state) {
  state.root.querySelectorAll('[data-about-profile-value-index]').forEach((slot) => {
    const index = Number(slot.getAttribute('data-about-profile-value-index'));
    slot.innerHTML = prepareEmbeddedMediaForDisplay(sanitizeProfileValueHtml(state.doc.profileRows[index]?.value || ''));
  });

  state.root.querySelectorAll('[data-about-section-body-index]').forEach((slot) => {
    const index = Number(slot.getAttribute('data-about-section-body-index'));
    const section = state.doc.sections[index];
    slot.innerHTML = prepareEmbeddedMediaForDisplay(renderSectionMarkup(section));
  });
  enhanceEmbeddedMedia(state.root);
}

function editorHtml(state) {
  const selected = findSelectedSection(state);
  const profileIndex = state.selectedProfileIndex;
  const selectedProfile = Number.isInteger(profileIndex) ? state.doc.profileRows[profileIndex] : null;

  if (selectedProfile) {
    return `
      <form class="about-editor" data-about-editor="profile" data-version-refresh-block="${state.hasUnsavedChanges}">
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
  const editorSource = sourceForEditing(selected);

  return `
    <form class="about-editor" data-about-editor="section" data-version-refresh-block="${state.hasUnsavedChanges}">
      <b>섹션 편집: ${escapeHtml(selected.title)}</b>
      <table border="1" cellspacing="0" cellpadding="5" width="100%">
        <tr>
          <th width="120">제목</th>
          <td><input type="text" name="title" value="${escapeAttribute(selected.title)}"></td>
        </tr>
        <tr>
          <th><label for="about-section-source-${escapeAttribute(selected.id)}">나무마크 원문</label></th>
          <td>
            <div class="about-source-toolbar" aria-label="원문 편집 도구">
              <button type="button" class="owner-btn" data-about-action="toggle-preview" aria-pressed="${state.previewVisible}">${state.previewVisible ? '미리보기 닫기' : '미리보기'}</button>
              <button type="button" class="owner-btn" data-about-action="insert-media">미디어 넣기</button>
              <a href="#about-wiki-syntax-help" data-about-action="syntax-help">[문법 도움말]</a>
            </div>
            <div class="about-editor-container about-source-editor" data-about-editor-container>
              <textarea id="about-section-source-${escapeAttribute(selected.id)}" class="about-source-textarea" name="source" rows="16" spellcheck="true" data-about-source-editor>${escapeTextarea(editorSource)}</textarea>
            </div>
            <input type="file" data-about-media-input accept="image/jpeg,image/png,image/gif,image/webp,video/mp4,video/webm,video/quicktime,video/x-m4v,audio/mpeg,audio/mp3,application/pdf" multiple hidden>
            <div class="about-editor-image-status" data-about-image-status aria-live="polite"></div>
            <div class="about-source-warning" data-about-source-warning role="alert" hidden></div>
            <section class="about-source-preview" data-about-source-preview aria-label="저장 전 미리보기" ${state.previewVisible ? '' : 'hidden'}>
              <b>저장 전 미리보기</b>
              <div class="about-source-preview-body post-content" data-about-source-preview-body></div>
            </section>
            <details class="about-syntax-help" id="about-wiki-syntax-help">
              <summary>문법 도움말</summary>
              <code>'''굵게''' · ''기울임'' · [[주소|이름]] · [* 각주]</code><br>
              <code> * 목록</code> · <code>|| 셀 || 셀 ||</code> · <code>{{{#!folding 제목</code> ... <code>}}}</code>
            </details>
            <div class="note">미리보기는 저장되지 않아. 저장하면 기존 About JSON에 새 원문과 호환용 HTML을 덮어씀.</div>
          </td>
        </tr>
      </table>
      <div class="about-editor-actions">
        <button type="submit" class="owner-btn">저장</button>
        <button type="button" class="owner-btn" data-about-action="cancel-edit">취소</button>
        <button type="button" class="owner-btn" data-about-action="move-section" data-direction="-1" ${index <= 0 ? 'disabled' : ''}>위로</button>
        <button type="button" class="owner-btn" data-about-action="move-section" data-direction="1" ${index >= state.doc.sections.length - 1 ? 'disabled' : ''}>아래로</button>
        <button type="button" class="owner-btn owner-btn-danger" data-about-action="delete-section">삭제</button>
      </div>
    </form>
  `;
}

function initSourceEditor(state) {
  if (!state.isOwner) return;

  const selected = findSelectedSection(state);
  const textarea = state.root.querySelector('[data-about-source-editor]');
  const form = state.root.querySelector('[data-about-editor="section"]');
  const input = state.root.querySelector('[data-about-media-input]');
  if (!selected || !textarea || !form || !input) return;

  state.sourceEditor = textarea;
  if (state.previewVisible) renderSourcePreview(state);
  bindSourceEditorMedia(state, form, input, textarea);
  requestAnimationFrame(() => textarea.focus({ preventScroll: true }));
}

function bindSourceEditorMedia(state, form, input, textarea) {
  const container = form.querySelector('[data-about-editor-container]');
  if (!container) return;

  input.addEventListener('change', async () => {
    await insertEditorMedia(state, input.files, state.pendingEditorSelection);
    state.pendingEditorSelection = null;
    input.value = '';
  });

  container.addEventListener('dragenter', (event) => {
    if (!hasSupportedEditorTransfer(event.dataTransfer)) return;
    event.preventDefault();
    container.classList.add('is-image-dragover');
  });

  container.addEventListener('dragover', (event) => {
    if (!hasSupportedEditorTransfer(event.dataTransfer)) return;
    event.preventDefault();
    container.classList.add('is-image-dragover');
  });

  container.addEventListener('dragleave', (event) => {
    if (event.relatedTarget instanceof Node && container.contains(event.relatedTarget)) return;
    container.classList.remove('is-image-dragover');
  });

  container.addEventListener('drop', async (event) => {
    if (!hasSupportedEditorTransfer(event.dataTransfer)) return;
    event.preventDefault();
    event.stopPropagation();
    container.classList.remove('is-image-dragover');
    await insertEditorMedia(state, preferredTransferFiles(event.dataTransfer), editorSelection(textarea));
  }, true);

  textarea.addEventListener('paste', async (event) => {
    if (!hasSupportedEditorTransfer(event.clipboardData)) return;
    event.preventDefault();
    event.stopPropagation();
    await insertEditorMedia(state, preferredTransferFiles(event.clipboardData), editorSelection(textarea));
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
    const uploadLockedActions = new Set([
      'edit-section',
      'add-section',
      'delete-section',
      'move-section',
      'edit-profile',
      'edit-profile-row',
      'reset-selection',
      'cancel-edit',
      'insert-media',
    ]);
    if (state.isMediaUploading && uploadLockedActions.has(action)) {
      renderEditorImageStatus(state, '미디어 업로드가 끝난 뒤 이동하거나 저장해줘.', 'error');
      return;
    }

    if (action === 'edit-section') {
      if (state.selectedSectionId === button.dataset.sectionId) return;
      if (!confirmDiscardAboutDraft(state)) return;
      state.returnFocusSectionId = button.dataset.sectionId || null;
      state.selectedProfileIndex = null;
      state.selectedSectionId = button.dataset.sectionId || null;
      state.previewVisible = false;
      render(state);
      scrollEditorIntoView(state);
    }

    if (action === 'toggle-preview') {
      state.previewVisible = !state.previewVisible;
      toggleSourcePreview(state, button);
    }

    if (action === 'insert-media') {
      const input = state.root.querySelector('[data-about-media-input]');
      state.pendingEditorSelection = editorSelection(state.sourceEditor);
      input?.click();
    }

    if (action === 'syntax-help') {
      const help = state.root.querySelector('.about-syntax-help');
      if (help) help.open = true;
    }

    if (action === 'cancel-edit') {
      const returnId = state.returnFocusSectionId || state.selectedSectionId;
      state.selectedSectionId = null;
      state.previewVisible = false;
      markAboutDirty(state, false);
      render(state);
      focusSectionEditButton(state, returnId);
    }

    if (action === 'add-section') {
      if (!confirmDiscardAboutDraft(state)) return;
      addSection(state);
    }

    if (action === 'delete-section') {
      deleteSelectedSection(state);
    }

    if (action === 'move-section') {
      moveSection(state, button.dataset.sectionId || state.selectedSectionId, Number(button.dataset.direction || 0));
    }

    if (action === 'edit-profile') {
      if (!confirmDiscardAboutDraft(state)) return;
      openProfileEditor(state);
    }

    if (action === 'add-profile-row') {
      if (!confirmDiscardAboutDraft(state)) return;
      addProfileRow(state);
    }

    if (action === 'edit-profile-row') {
      if (!confirmDiscardAboutDraft(state)) return;
      state.selectedSectionId = null;
      state.selectedProfileIndex = Number(button.dataset.profileIndex);
      render(state);
      scrollEditorIntoView(state);
    }

    if (action === 'delete-profile-row') {
      deleteSelectedProfileRow(state);
    }

    if (action === 'reset-selection') {
      if (!confirmDiscardAboutDraft(state)) return;
      state.selectedSectionId = null;
      state.selectedProfileIndex = null;
      render(state);
    }
  });

  state.root.addEventListener('input', (event) => {
    if (event.target.closest('[data-about-editor]')) {
      markAboutDirty(state);
      if (event.target.matches('[data-about-source-editor]') && state.previewVisible) {
        renderSourcePreview(state);
      }
    }
  });

  state.root.addEventListener('submit', (event) => {
    const form = event.target.closest('[data-about-editor]');
    if (!form || !state.root.contains(form)) return;
    event.preventDefault();

    if (state.isMediaUploading) {
      renderEditorImageStatus(state, '미디어 업로드가 끝난 뒤 저장해줘.', 'error');
      return;
    }

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
    format: `namumark-v${ABOUT_WIKI_MARKUP_VERSION}`,
    source: '여기에 내용을 적으면 목차에 자동으로 추가됨.',
    body: '<p>여기에 내용을 적으면 목차에 자동으로 추가됨.</p>',
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

function moveSection(state, sectionId, direction) {
  captureSelectedSectionDraft(state);
  if (!moveItemById(state.doc.sections, sectionId, direction)) return;
  persistAndRender(state, '순서 변경됨');
}

function saveSectionForm(state, form) {
  const selected = findSelectedSection(state);
  if (!selected) return;

  const title = cleanText(new FormData(form).get('title')) || '제목 없음';
  const source = sectionEditorSource(state, sourceForEditing(selected));
  if (!sectionHasSource(selected) && selected.body && !selected.legacyBody) {
    selected.legacyBody = selected.body;
  }
  selected.title = title;
  selected.format = `namumark-v${ABOUT_WIKI_MARKUP_VERSION}`;
  selected.source = source;
  selected.body = renderAboutWikiMarkup(source, { idPrefix: selected.id });
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
  state.hasUnsavedChanges = true;
  const saveVersion = ++state.saveVersion;
  state.doc.contentSchemaVersion = CONTENT_SCHEMA_VERSION;
  state.doc.profileSchemaVersion = ABOUT_PROFILE_DOCUMENT_VERSION;
  const payload = JSON.stringify(state.doc);
  render(state);
  renderStatus(state, '저장 중...', 'pending');

  state.saveQueue = state.saveQueue.catch(() => {}).then(async () => {
    try {
      await setSetting(SETTING_KEY, payload);
      if (saveVersion !== state.saveVersion) return;

      markAboutDirty(state, false);
      window.dispatchEvent(new CustomEvent('coldwaterkim:profile-data-updated', {
        detail: { document: state.doc }
      }));
      renderStatus(state, message || '저장됨', 'success');
    } catch (error) {
      if (saveVersion !== state.saveVersion) return;
      markAboutDirty(state, true);
      renderStatus(state, `저장 실패: ${cmsErrorMessage(error)}`, 'error');
    }
  });

  return state.saveQueue;
}

function captureSelectedSectionDraft(state) {
  const selected = findSelectedSection(state);
  const form = state.root.querySelector('[data-about-editor="section"]');
  if (!selected || !form) return;

  selected.title = cleanText(new FormData(form).get('title')) || selected.title;
  const source = sectionEditorSource(state, sourceForEditing(selected));
  if (!sectionHasSource(selected) && selected.body && !selected.legacyBody) {
    selected.legacyBody = selected.body;
  }
  selected.format = `namumark-v${ABOUT_WIKI_MARKUP_VERSION}`;
  selected.source = source;
  selected.body = renderAboutWikiMarkup(source, { idPrefix: selected.id });
}

function markAboutDirty(state, isDirty = true) {
  state.hasUnsavedChanges = isDirty;
  const form = state.root.querySelector('[data-about-editor]');
  if (form) form.dataset.versionRefreshBlock = String(isDirty);
}

function confirmDiscardAboutDraft(state) {
  if (!state.hasUnsavedChanges) return true;
  if (!window.confirm('저장하지 않은 수정 내용이 있어. 버리고 다른 편집으로 이동할까?')) return false;
  markAboutDirty(state, false);
  return true;
}

function bindAboutUnloadGuard() {
  if (window.__coldwaterkimAboutUnloadGuard) return;
  window.__coldwaterkimAboutUnloadGuard = true;

  window.addEventListener('beforeunload', (event) => {
    if (!document.querySelector('[data-version-refresh-block="true"]')) return;
    event.preventDefault();
    event.returnValue = '';
  });
}

function renderStatus(state, message, type = 'success') {
  const status = state.root.querySelector('[data-about-status]');
  if (!status) return;

  status.hidden = false;
  status.textContent = message;
  status.className = `about-wiki-status about-wiki-status--${type}`;
  status.setAttribute('role', type === 'error' ? 'alert' : 'status');

  if (type === 'success') {
    window.clearTimeout(state.saveTimer);
    state.saveTimer = window.setTimeout(() => {
      const nextStatus = state.root.querySelector('[data-about-status]');
      if (nextStatus) nextStatus.hidden = true;
    }, 1600);
  }
}

function sectionEditorSource(state, fallback = '') {
  const source = state.sourceEditor?.value;
  return typeof source === 'string' ? normalizeAboutWikiSource(source) : normalizeAboutWikiSource(fallback);
}

function editorSelection(textarea) {
  if (!textarea) return { start: 0, end: 0 };
  return {
    start: Number(textarea.selectionStart || 0),
    end: Number(textarea.selectionEnd || 0),
  };
}

function hasSupportedEditorTransfer(dataTransfer) {
  return preferredTransferFiles(dataTransfer).some(isSupportedAboutUpload);
}

function isSupportedAboutUpload(file) {
  if (!file) return false;
  const type = String(file.type || '').toLowerCase();
  if (EDITOR_UPLOAD_MIME_TYPES.has(type)) return true;
  return /\.(?:jpe?g|png|gif|webp|mp4|webm|mov|m4v|mp3|pdf)$/i.test(file.name || '');
}

function aboutUploadLabel(file) {
  const type = String(file?.type || '').toLowerCase();
  const name = String(file?.name || '').toLowerCase();
  if (type.startsWith('video/') || /\.(?:mp4|webm|mov|m4v)$/i.test(name)) return '영상';
  if (type.startsWith('audio/') || /\.mp3$/i.test(name)) return '오디오';
  if (type === 'application/pdf' || /\.pdf$/i.test(name)) return 'PDF';
  return '이미지';
}

async function insertEditorMedia(state, files, selection = null) {
  const textarea = state.sourceEditor;
  const sectionIdValue = state.selectedSectionId;
  if (!textarea) return;
  const wasDirtyBeforeUpload = state.hasUnsavedChanges;
  const uploadFiles = uniqueTransferFiles(files).filter(isSupportedAboutUpload);
  if (!uploadFiles.length) {
    renderEditorImageStatus(state, 'JPG, PNG, GIF, WebP, MP4, WebM, MOV, M4V, MP3, PDF만 넣을 수 있어.', 'error');
    return;
  }

  const container = state.root.querySelector('[data-about-editor-container]');
  state.mediaUploadOperations += 1;
  state.isMediaUploading = true;
  markAboutDirty(state);
  setSourceEditorUploadLocked(state, true);
  container?.classList.add('is-image-uploading');

  let result;
  try {
    result = await state.mediaUploadCoordinator.runBatch(uploadFiles, {
      onFileStart(file, index, total) {
        renderEditorImageStatus(state, `${aboutUploadLabel(file)} 업로드 중... (${index + 1}/${total}) ${file.name}`, 'info');
      },
      onFileProgress(file, progress, index, total) {
        renderEditorImageStatus(state, `${file.name} (${index + 1}/${total}) · ${formatMediaUploadProgress(progress)}`, 'info');
      },
      onFileReused(file, _media, index, total) {
        renderEditorImageStatus(state, `${file.name} (${index + 1}/${total}) · 이미 올린 파일 재사용`, 'info');
      },
      onFileError(file, error) {
        renderEditorImageStatus(state, `${aboutUploadLabel(file)} 업로드 실패 (${file.name}): ${cmsErrorMessage(error)}`, 'error');
      },
      onDuplicateBatch() {
        renderEditorImageStatus(state, '같은 붙여넣기 요청이 겹쳐서 중복 삽입을 막았어.', 'info');
      },
    });
  } finally {
    state.mediaUploadOperations = Math.max(0, state.mediaUploadOperations - 1);
    state.isMediaUploading = state.mediaUploadOperations > 0;
    if (!state.isMediaUploading) container?.classList.remove('is-image-uploading');
    if (!state.isMediaUploading && state.sourceEditor === textarea && textarea.isConnected) {
      setSourceEditorUploadLocked(state, false);
    }
  }

  if (result?.duplicate) return;
  const tokens = (result?.uploaded || [])
    .map(({ result: media }) => aboutWikiMediaSource(media))
    .filter(Boolean);
  if (!tokens.length) {
    markAboutDirty(state, wasDirtyBeforeUpload);
    return;
  }

  if (state.sourceEditor !== textarea || !textarea.isConnected || state.selectedSectionId !== sectionIdValue) {
    renderStatus(state, `업로드는 끝났지만 편집 화면이 바뀌어서 자동 삽입하지 못했어. 원문에 직접 붙여줘: ${tokens.join(' ')}`, 'error');
    return;
  }

  insertSourceTokens(textarea, tokens, selection || editorSelection(textarea));
  markAboutDirty(state);
  renderSourcePreview(state);
  renderEditorImageStatus(state, `${tokens.length}개 미디어 문법이 원문에 들어갔어.`, 'success');
  setTimeout(() => renderEditorImageStatus(state), 2500);
}

async function uploadAboutMediaRecord(file, options = {}) {
  const media = await uploadMedia(file, file.name, 'About wiki media', options);
  return {
    url: getMediaUrl(media, media.file),
    name: file.name,
    type: file.type,
  };
}

function setSourceEditorUploadLocked(state, isLocked) {
  const form = state.root.querySelector('[data-about-editor="section"]');
  const textarea = state.sourceEditor;
  if (textarea) textarea.disabled = isLocked;
  form?.querySelectorAll('button, input[type="file"]').forEach(control => {
    control.disabled = isLocked;
  });
  form?.setAttribute('aria-busy', String(isLocked));
}

function insertSourceTokens(textarea, tokens, selection) {
  const start = Math.max(0, Math.min(textarea.value.length, Number(selection?.start || 0)));
  const end = Math.max(start, Math.min(textarea.value.length, Number(selection?.end || start)));
  const prefix = start > 0 && textarea.value[start - 1] !== '\n' ? '\n' : '';
  const suffix = end < textarea.value.length && textarea.value[end] !== '\n' ? '\n' : '';
  const inserted = `${prefix}${tokens.join('\n')}${suffix}`;
  textarea.setRangeText(inserted, start, end, 'end');
  textarea.focus();
  textarea.dispatchEvent(new Event('input', { bubbles: true }));
}

function renderSourcePreview(state) {
  const preview = state.root.querySelector('[data-about-source-preview-body]');
  const warning = state.root.querySelector('[data-about-source-warning]');
  const selected = findSelectedSection(state);
  if (!preview || !warning || !selected) return;

  const source = sectionEditorSource(state, sourceForEditing(selected));
  const warnings = aboutWikiMarkupWarnings(source);
  warning.hidden = warnings.length === 0;
  warning.textContent = warnings.join(' ');
  preview.innerHTML = prepareEmbeddedMediaForDisplay(renderAboutWikiMarkup(source, { idPrefix: `preview-${selected.id}` }));
  enhanceEmbeddedMedia(preview);
}

function toggleSourcePreview(state, button) {
  const preview = state.root.querySelector('[data-about-source-preview]');
  if (!preview) return;
  preview.hidden = !state.previewVisible;
  button.setAttribute('aria-pressed', String(state.previewVisible));
  button.textContent = state.previewVisible ? '미리보기 닫기' : '미리보기';
  if (state.previewVisible) renderSourcePreview(state);
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

function focusSectionEditButton(state, sectionIdValue) {
  if (!sectionIdValue) return;
  requestAnimationFrame(() => {
    state.root.querySelector(`[data-about-action="edit-section"][data-section-id="${CSS.escape(sectionIdValue)}"]`)?.focus();
  });
}

function normalizeSection(section, index) {
  const normalized = {
    id: sectionId(section?.id, section?.title, index),
    title: cleanText(section?.title) || `새 섹션 ${index + 1}`,
  };

  if (Object.prototype.hasOwnProperty.call(section || {}, 'source')) {
    normalized.format = cleanText(section?.format) || `namumark-v${ABOUT_WIKI_MARKUP_VERSION}`;
    normalized.source = normalizeAboutWikiSource(section?.source);
    normalized.body = cleanHtml(section?.body);
    if (section?.legacyBody) normalized.legacyBody = cleanHtml(section.legacyBody);
    return normalized;
  }

  normalized.body = cleanHtml(section?.body);
  return normalized;
}

function sectionHasSource(section) {
  return Object.prototype.hasOwnProperty.call(section || {}, 'source');
}

function sourceForEditing(section) {
  if (sectionHasSource(section)) return normalizeAboutWikiSource(section.source);
  return legacyHtmlToAboutWikiMarkup(section?.body || '');
}

function renderSectionMarkup(section) {
  const source = sourceForEditing(section);
  return renderAboutWikiMarkup(source, { idPrefix: section?.id || 'section' });
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

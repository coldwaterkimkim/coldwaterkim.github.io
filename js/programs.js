import {
    isLoggedIn,
    getPublishedProgramTimeline,
    getAllProgramTimeline,
    getProgramBySlug,
    createProgram,
    updateProgram,
    deleteProgram,
    resolveProgramCoverUrl,
    programDownloadTargets,
    programStatusLabel,
    normalizeProgramStatus,
    programDetailUrl,
    slugify,
    escapeHtml,
    cmsErrorMessage,
    uploadMedia,
    getMediaUrl
} from './pb.js';
import { findAutomaticProgramCoverFile } from './program-cover.js';

const ownerMode = isLoggedIn();
let programs = [];
let editingProgramId = '';
let programBodyEditor = null;
let programBodyEditorReady = null;
let pendingProgramBodyImageIndex = null;
let markdownEditorModulePromise = null;
let createMarkdownEditor = null;
let editorUploadLabel = null;
let hasImageTransfer = null;
let imageFilesFromTransfer = null;
let isSupportedEditorUpload = null;

const PROGRAM_IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);

const fallbackPrograms = [
    {
        id: 'fallback-onecut',
        title: 'OneCut',
        slug: 'onecut',
        status: 'beta',
        platform: 'iOS · TestFlight · 하루 기록',
        tagline: 'a day in one frame',
        story_intro: '하루를 한 컷으로 붙잡는 앱.',
        why: '하루가 너무 쉽게 흘러가서, 최소한 한 컷만큼은 붙잡아두려고.',
        pain_point: '사진은 많은데 하루의 감정과 맥락은 흩어지는 문제.',
        is_public: true
    },
    {
        id: 'fallback-doodle-dolmeng',
        title: 'Doodle 돌멩',
        slug: 'doodle-dolmeng',
        status: 'beta',
        platform: 'iOS · 위치 기반 지도 · 캠퍼스',
        tagline: 'campus map scribbles',
        story_intro: '캠퍼스 생활권을 낙서처럼 남기는 지도.',
        why: '장소에는 말로 설명하기 어려운 분위기와 낙서 같은 기억이 있어서.',
        pain_point: '지도는 정확하지만, 사람들이 실제로 느끼는 생활권은 너무 납작하게 보이는 문제.',
        is_public: true
    },
    {
        id: 'fallback-wisdom-dolmeng',
        title: '중생돌멩',
        slug: 'wisdom-dolmeng',
        status: 'released',
        platform: 'macOS · 메뉴바 앱 · .dmg 예정',
        tagline: 'floating wisdom panel',
        story_intro: '메뉴바에서 잠깐씩 정신을 붙잡아주는 작은 앱.',
        why: '하루 중 잠깐씩 정신을 붙잡아주는 이상한 문장이 필요해서.',
        pain_point: '집중이 풀릴 때마다 거창한 앱을 여는 건 너무 큰 행동이라는 문제.',
        is_public: true
    },
    {
        id: 'fallback-quick-dump-dolmeng',
        title: '브덤돌멩',
        slug: 'quick-dump-dolmeng',
        status: 'prototype',
        platform: 'macOS · 빠른 메모 · GitHub 예정',
        tagline: 'throw thoughts fast',
        story_intro: '생각이 지나가기 전에 아무 데나 던져놓는 메모 도구.',
        why: '생각이 지나가기 전에 어디든 빠르게 던져놓고 싶어서.',
        pain_point: '메모 앱을 고르는 순간 이미 쓰려던 말이 사라지는 문제.',
        is_public: true
    },
    {
        id: 'fallback-coming-soon-program',
        title: '이름 미정',
        slug: 'coming-soon-program',
        status: 'unreleased',
        platform: 'Web · 예고편 · 아직 비밀',
        tagline: 'unreleased trailer',
        story_intro: '아직 이름을 붙이지 않은 예고편 row.',
        why: '아직 말하면 김이 빠지는 종류의 빡침에서 시작됨.',
        pain_point: '공개 전이라 자세한 설명은 봉인. 대신 예고편 row로 먼저 입장.',
        is_public: true
    }
];

const programsList = document.getElementById('programsList');
const ownerPanel = document.getElementById('programOwnerPanel');
const ownerStatus = document.getElementById('programOwnerStatus');
const programForm = document.getElementById('programForm');
const formTitle = document.getElementById('programFormTitle');
const cancelButton = document.getElementById('cancelProgramEdit');
const newButton = document.getElementById('newProgramButton');
const formFields = {
    title: document.getElementById('programTitle'),
    slug: document.getElementById('programSlug'),
    status: document.getElementById('programStatus'),
    platform: document.getElementById('programPlatform'),
    primaryLinkLabel: document.getElementById('programPrimaryLinkLabel'),
    primaryLinkUrl: document.getElementById('programPrimaryLinkUrl'),
    storyIntro: document.getElementById('programStoryIntro'),
    bodyEditor: document.getElementById('programBodyEditor'),
    bodyEditorWrap: document.getElementById('programBodyEditorWrap'),
    bodyImageInput: document.getElementById('programBodyImageInput'),
    bodyImageStatus: document.getElementById('programBodyImageStatus'),
    coverImage: document.getElementById('programCoverImage'),
    downloadFiles: document.getElementById('programDownloadFiles')
};

if (ownerMode) {
    ownerPanel.hidden = false;
    setOwnerStatus('OWNER MODE: 이 페이지에서 바로 프로그램을 추가/수정할 수 있음.');
    programBodyEditorReady = initProgramBodyEditor().catch(error => {
        setOwnerStatus(`본문 에디터 로드 실패: ${cmsErrorMessage(error)}`, 'error');
    });
}

newButton?.addEventListener('click', () => {
    resetProgramForm({ hidden: false });
    programForm.scrollIntoView({ block: 'start' });
    formFields.title.focus();
});

cancelButton?.addEventListener('click', () => resetProgramForm({ hidden: true }));

formFields.title?.addEventListener('input', () => {
    if (editingProgramId || formFields.slug.value.trim()) return;
    formFields.slug.value = safeSlug(formFields.title.value);
});

programForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    await saveProgram();
});

programsList?.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-program-action]');
    if (!button) return;

    const id = button.getAttribute('data-program-id');
    const action = button.getAttribute('data-program-action');

    if (action === 'edit') {
        await editProgram(id);
    } else if (action === 'delete') {
        await removeProgram(id);
    }
});

loadPrograms();

async function loadPrograms() {
    programsList.innerHTML = '<tr><td colspan="3" class="loading">프로그램 목록 불러오는 중...</td></tr>';

    try {
        programs = ownerMode
            ? await getAllProgramTimeline()
            : await getPublishedProgramTimeline();
        renderPrograms();
    } catch (error) {
        if (!ownerMode && error?.status === 404) {
            programs = fallbackPrograms;
            renderPrograms();
            return;
        }

        const message = cmsErrorMessage(error);
        programsList.innerHTML = `<tr><td colspan="3">불러오기 실패: ${escapeHtml(message)}</td></tr>`;
        setOwnerStatus(`CMS 확인 필요: ${message}`, 'error');
    }
}

function renderPrograms() {
    if (!programs.length) {
        programsList.innerHTML = `
            <tr>
                <td colspan="3">
                    아직 등록된 프로그램이 없습니다.
                    ${ownerMode ? 'OWNER MODE에서 첫 프로그램을 올려보면 됨.' : '곧 채워질 예정.'}
                </td>
            </tr>
        `;
        return;
    }

    programsList.innerHTML = programs.map(renderProgramRow).join('');
}

function renderProgramRow(program) {
    const status = normalizeProgramStatus(program.status);
    const label = programStatusLabel(status);
    const title = program.title || '(이름 없음)';
    const coverUrl = resolveProgramCoverUrl(program);
    const detailUrl = programDetailUrl(program);
    const downloads = programDownloadTargets(program);
    const actionLinks = downloads.length
        ? downloads.slice(0, 3).map(target => `<a href="${escapeAttribute(target.url)}" target="_blank" rel="noopener">${escapeHtml(target.label)}</a>`).join('<br>')
        : '<span class="note">준비중</span>';
    const ownerActions = ownerMode ? `
        <hr>
        <button type="button" class="owner-btn" data-program-action="edit" data-program-id="${escapeAttribute(program.id)}">수정</button>
        <button type="button" class="owner-btn owner-btn-danger" data-program-action="delete" data-program-id="${escapeAttribute(program.id)}">삭제</button>
        ${program.is_public ? '' : '<br><span class="note">비공개</span>'}
    ` : '';

    return `
        <tr>
            <td class="program-cover-cell">
                <a href="${escapeAttribute(detailUrl)}" class="program-cover-link" aria-label="${escapeAttribute(title)} 상세 보기">
                    ${coverUrl ? renderImageCover(program, coverUrl) : renderMissingCover(program)}
                </a>
            </td>
            <td class="program-story-cell">
                <h2><span class="program-label">[${escapeHtml(label)}]</span> <a href="${escapeAttribute(detailUrl)}">${escapeHtml(title)}</a></h2>
                <p class="program-meta">${programMeta(program)}</p>
                <p>${previewText(program.story_intro || program.tagline || '아직 한 줄 소개를 쓰는 중.')}</p>
                <p><a href="${escapeAttribute(detailUrl)}">상세 이야기 보기</a></p>
            </td>
            <td class="program-action-cell">
                <b>${escapeHtml(label)}</b><br>
                <small>${escapeHtml(defaultStatusNote(status))}</small>
                <hr>
                ${actionLinks}
                ${ownerActions}
            </td>
        </tr>
    `;
}

function renderImageCover(program, coverUrl) {
    return `
        <div class="program-cover program-cover--image">
            <div class="program-window-bar">${escapeHtml(program.slug || 'program')}</div>
            <img src="${escapeAttribute(coverUrl)}" alt="${escapeAttribute(program.title || 'program cover')}">
        </div>
    `;
}

function renderMissingCover(program) {
    return `
        <div class="program-cover program-cover--missing">
            <div class="program-window-bar">${escapeHtml(program.slug || 'program')}</div>
            <div class="program-cover-title">없음</div>
            <div class="program-cover-caption">대표 이미지 없음</div>
        </div>
    `;
}

function programMeta(program) {
    const parts = [
        program.platform
    ].filter(Boolean);
    return escapeHtml(parts.join(' · ') || 'platform TBD');
}

function defaultStatusNote(status) {
    return {
        released: '받을 수 있음',
        beta: '실험중',
        prototype: '손보는중',
        unreleased: '예고편',
        archived: '보관됨'
    }[status] || '진행중';
}

async function saveProgram() {
    if (!ownerMode) return;
    await ensureProgramBodyEditor();

    const title = formFields.title.value.trim();

    if (!title) {
        setOwnerStatus('이름은 꼭 있어야 함.', 'error');
        return;
    }

    const formData = new FormData(programForm);
    const storyIntro = formFields.storyIntro.value.trim();
    const legacyRequiredText = storyIntro || title;

    formData.set('slug', safeSlug(formFields.slug.value || title));
    formData.set('status', normalizeProgramStatus(formFields.status.value));
    formData.set('is_public', 'true');
    formData.set('story_intro', storyIntro);
    formData.set('story_detail', programBodyHtml());
    formData.set('why', legacyRequiredText);
    formData.set('pain_point', legacyRequiredText);

    if (!formFields.coverImage.files.length) {
        formData.delete('cover_image');
        if (formFields.downloadFiles.files.length) {
            setOwnerStatus('첨부 파일에서 대표 이미지 찾는 중...');
        }
        const automaticCoverFile = await findAutomaticProgramCoverFile(formFields.downloadFiles.files);
        if (automaticCoverFile) formData.append('cover_image', automaticCoverFile);
    }
    if (!formFields.downloadFiles.files.length) formData.delete('download_files');
    normalizeOptionalTextField(formData, 'platform');
    normalizeOptionalTextField(formData, 'story_intro');
    normalizeOptionalTextField(formData, 'primary_link_label');
    normalizeOptionalTextField(formData, 'primary_link_url');

    setOwnerStatus(editingProgramId ? '프로그램 수정 중...' : '프로그램 저장 중...');

    try {
        const saved = editingProgramId
            ? await updateProgram(editingProgramId, formData)
            : await createProgram(formData);
        setOwnerStatus(`${saved.title || '프로그램'} 저장 완료.`, 'success');
        resetProgramForm({ hidden: true });
        await loadPrograms();
    } catch (error) {
        setOwnerStatus(`저장 실패: ${cmsErrorMessage(error)}`, 'error');
    }
}

async function editProgram(id) {
    if (!ownerMode || !id) return;
    await ensureProgramBodyEditor();

    try {
        const cached = programs.find(program => program.id === id);
        const program = cached || await getProgramBySlug(id, true);
        editingProgramId = program.id;
        programForm.hidden = false;
        formTitle.textContent = `✎ 프로그램 수정: ${program.title || '(이름 없음)'}`;
        formFields.title.value = program.title || '';
        formFields.slug.value = program.slug || '';
        formFields.status.value = normalizeProgramStatus(program.status);
        formFields.platform.value = program.platform || '';
        formFields.primaryLinkLabel.value = program.primary_link_label || '';
        formFields.primaryLinkUrl.value = program.primary_link_url || '';
        formFields.storyIntro.value = program.story_intro || '';
        setProgramBodyHtml(program.story_detail || legacyProgramBody(program));
        formFields.coverImage.value = '';
        formFields.downloadFiles.value = '';
        setOwnerStatus('수정 모드. 긴 설명과 스크린샷은 본문에서 자유롭게 고치면 됨.');
        programForm.scrollIntoView({ block: 'start' });
        formFields.title.focus();
    } catch (error) {
        setOwnerStatus(`프로그램을 불러올 수 없음: ${cmsErrorMessage(error)}`, 'error');
    }
}

async function removeProgram(id) {
    if (!ownerMode || !id) return;
    const program = programs.find(item => item.id === id);
    const label = program?.title || '이 프로그램';

    if (!confirm(`${label}을 삭제할까?\n첨부 파일도 CMS 레코드에서 같이 빠집니다.`)) return;

    try {
        await deleteProgram(id);
        setOwnerStatus(`${label} 삭제 완료.`, 'success');
        await loadPrograms();
    } catch (error) {
        setOwnerStatus(`삭제 실패: ${cmsErrorMessage(error)}`, 'error');
    }
}

function resetProgramForm(options = {}) {
    if (!programForm) return;
    editingProgramId = '';
    programForm.reset();
    formTitle.textContent = '✚ 새 프로그램 올리기';
    formFields.status.value = 'prototype';
    setProgramBodyHtml('');
    programForm.hidden = options.hidden ?? true;
}

function safeSlug(value) {
    return slugify(value) || `program-${Date.now()}`;
}

function setOwnerStatus(message, type = 'info') {
    if (!ownerStatus) return;
    ownerStatus.textContent = message;
    ownerStatus.className = `program-owner-status program-owner-status--${type}`;
}

function normalizeOptionalTextField(formData, name) {
    const value = String(formData.get(name) || '').trim();
    if (value) {
        formData.set(name, value);
    } else {
        formData.delete(name);
    }
}

function programBodyHtml() {
    if (!programBodyEditor) return '';
    const html = programBodyEditor.root.innerHTML.trim();
    return html === '<p><br></p>' ? '' : html;
}

function setProgramBodyHtml(html = '') {
    if (programBodyEditor) {
        programBodyEditor.root.innerHTML = html || '';
    }
}

function legacyProgramBody(program) {
    return [
        ['왜 만들었냐', program.why],
        ['해결하는 빡침', program.pain_point],
        ['어떻게 풀었냐', program.solution],
        ['제작 노트', program.build_notes]
    ]
        .filter(([, value]) => String(value || '').trim())
        .map(([title, value]) => `<h2>${escapeHtml(title)}</h2><p>${escapeMultiline(value)}</p>`)
        .join('');
}

async function ensureProgramBodyEditor() {
    if (programBodyEditorReady) {
        await programBodyEditorReady;
    }
}

async function initProgramBodyEditor() {
    if (!formFields.bodyEditor) return;
    await loadMarkdownEditorModule();

    programBodyEditor = await createMarkdownEditor('#programBodyEditor', {
        placeholder: 'Markdown으로 제작 배경, 사용법, 스크린샷, 긴 이야기 쓰기...',
        onImageButton: () => {
            pendingProgramBodyImageIndex = currentProgramBodyIndex();
            formFields.bodyImageInput.click();
        },
        uploadFile: uploadProgramBodyFile
    });

    formFields.bodyImageInput?.addEventListener('change', async () => {
        await insertProgramBodyImages(formFields.bodyImageInput.files, {
            index: pendingProgramBodyImageIndex
        });
        pendingProgramBodyImageIndex = null;
        formFields.bodyImageInput.value = '';
    });

    formFields.bodyEditorWrap?.addEventListener('dragenter', (event) => {
        if (!hasImageTransfer(event.dataTransfer)) return;
        event.preventDefault();
        formFields.bodyEditorWrap.classList.add('is-image-dragover');
    });

    formFields.bodyEditorWrap?.addEventListener('dragover', (event) => {
        if (!hasImageTransfer(event.dataTransfer)) return;
        event.preventDefault();
        formFields.bodyEditorWrap.classList.add('is-image-dragover');
    });

    formFields.bodyEditorWrap?.addEventListener('dragleave', (event) => {
        if (event.relatedTarget instanceof Node && formFields.bodyEditorWrap.contains(event.relatedTarget)) return;
        formFields.bodyEditorWrap.classList.remove('is-image-dragover');
    });

    formFields.bodyEditorWrap?.addEventListener('drop', async (event) => {
        if (!hasImageTransfer(event.dataTransfer)) return;
        event.preventDefault();
        event.stopPropagation();
        formFields.bodyEditorWrap.classList.remove('is-image-dragover');
        await insertProgramBodyImages(programImageFilesFromTransfer(event.dataTransfer), {
            index: currentProgramBodyIndex()
        });
    }, true);

    programBodyEditor.root.addEventListener('paste', async (event) => {
        if (!hasImageTransfer(event.clipboardData)) return;
        event.preventDefault();
        event.stopPropagation();
        await insertProgramBodyImages(programImageFilesFromTransfer(event.clipboardData), {
            index: currentProgramBodyIndex()
        });
    }, true);
}

async function loadMarkdownEditorModule() {
    if (!markdownEditorModulePromise) {
        markdownEditorModulePromise = import('./markdown-editor.js');
    }

    const module = await markdownEditorModulePromise;
    createMarkdownEditor = module.createMarkdownEditor;
    editorUploadLabel = module.editorUploadLabel;
    hasImageTransfer = module.hasImageTransfer;
    imageFilesFromTransfer = module.imageFilesFromTransfer;
    isSupportedEditorUpload = module.isSupportedEditorUpload;
}

function setProgramBodyImageStatus(message = '', type = 'info') {
    if (!formFields.bodyImageStatus) return;
    formFields.bodyImageStatus.textContent = message;
    formFields.bodyImageStatus.className = `program-editor-status program-editor-status--${type}`;
    formFields.bodyImageStatus.classList.toggle('is-visible', Boolean(message));
}

function isSupportedProgramImage(file) {
    return file && PROGRAM_IMAGE_MIME_TYPES.has(file.type);
}

function programImageFilesFromTransfer(dataTransfer) {
    return imageFilesFromTransfer(dataTransfer, {
        mimeTypes: PROGRAM_IMAGE_MIME_TYPES,
        fallbackNamePrefix: 'program-body-image'
    });
}

function clampProgramBodyIndex(index) {
    return programBodyEditor.clampIndex(index);
}

function currentProgramBodyIndex() {
    const range = programBodyEditor.getSelection(true);
    return clampProgramBodyIndex(range?.index);
}

async function insertProgramBodyImages(files, options = {}) {
    const imageFiles = Array.from(files || [])
        .filter(isSupportedProgramImage);

    if (!imageFiles.length) {
        setOwnerStatus('JPG, PNG, GIF, WebP 이미지만 본문에 넣을 수 있음.', 'error');
        return;
    }

    let insertIndex = clampProgramBodyIndex(options.index);
    let uploadedCount = 0;
    formFields.bodyEditorWrap?.classList.add('is-image-uploading');

    for (let i = 0; i < imageFiles.length; i += 1) {
        const file = imageFiles[i];
        setProgramBodyImageStatus(`이미지 업로드 중... (${i + 1}/${imageFiles.length}) ${file.name}`);

        try {
            const media = await uploadMedia(file);
            const url = getMediaUrl(media, media.file);
            insertIndex = programBodyEditor.insertImage(insertIndex, url, file.name);
            uploadedCount += 1;
        } catch (error) {
            setOwnerStatus(`본문 이미지 업로드 실패: ${cmsErrorMessage(error)}`, 'error');
        }
    }

    formFields.bodyEditorWrap?.classList.remove('is-image-uploading');

    if (uploadedCount > 0) {
        programBodyEditor.setSelection(insertIndex, 0, 'silent');
        setProgramBodyImageStatus(`${uploadedCount}개 이미지가 본문에 들어갔습니다.`, 'success');
        setTimeout(() => setProgramBodyImageStatus(), 2500);
    } else {
        setProgramBodyImageStatus();
    }
}

async function uploadProgramBodyFile(file) {
    if (!isSupportedEditorUpload?.(file)) {
        throw new Error('JPG, PNG, GIF, WebP, MP4, WebM, MP3, PDF만 올릴 수 있음.');
    }

    const label = editorUploadLabel?.(file) || '파일';
    setProgramBodyImageStatus(`${label} 업로드 중... ${file.name || ''}`);

    try {
        const media = await uploadMedia(file, file.name, 'Program editor media');
        const url = getMediaUrl(media, media.file);
        setProgramBodyImageStatus(`${label} 업로드 완료.`, 'success');
        setTimeout(() => setProgramBodyImageStatus(), 1800);
        return url;
    } catch (error) {
        setProgramBodyImageStatus(`${label} 업로드 실패: ${cmsErrorMessage(error)}`, 'error');
        throw error;
    }
}

function escapeMultiline(value) {
    return escapeHtml(value).replace(/\r?\n/g, '<br>');
}

function previewText(value, maxLength = 86) {
    const text = String(value || '').replace(/\s+/g, ' ').trim();
    if (text.length <= maxLength) return escapeHtml(text);
    return `${escapeHtml(text.slice(0, maxLength).trim())}...`;
}

function escapeAttribute(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

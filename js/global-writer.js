import {
    isLoggedIn,
    logout,
    createPost,
    createDailyEntry,
    dailySlugFromDayKey,
    dailyTitleFromDayKey,
    newDailyEntrySlug,
    newDailyEntryTitle,
    normalizeDailyDayKey,
    createProgram,
    normalizeProgramStatus,
    slugify,
    cmsErrorMessage,
    uploadMedia,
    getMediaUrl
} from './pb.js';
import {
    createMarkdownEditor,
    hasImageTransfer,
    imageFilesFromTransfer
} from './markdown-editor.js';

const IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);

const categorySelect = document.getElementById('category');
const form = document.getElementById('globalWriteForm');
const alertEl = document.getElementById('alert');
const titleInput = document.getElementById('title');
const dateInput = document.getElementById('published_at');
const dateLabel = document.getElementById('dateLabel');
const dateGroup = document.getElementById('dateGroup');
const writerHeading = document.getElementById('writerHeading');
const programFields = document.getElementById('programFields');
const editorContainer = document.querySelector('.editor-container');
const editorImageInput = document.getElementById('editorImageInput');
const editorImageStatus = document.getElementById('editorImageStatus');
const programStatus = document.getElementById('programStatus');
const programPlatform = document.getElementById('programPlatform');
const programStoryIntro = document.getElementById('programStoryIntro');
const programCoverImage = document.getElementById('programCoverImage');
const programDownloadFiles = document.getElementById('programDownloadFiles');
const programPrimaryLinkLabel = document.getElementById('programPrimaryLinkLabel');
const programPrimaryLinkUrl = document.getElementById('programPrimaryLinkUrl');

let pendingEditorImageIndex = null;
let lastAutoTitle = '';
let isSaving = false;

if (!isLoggedIn()) {
    const next = `${window.location.pathname}${window.location.search}`;
    window.location.replace(`/admin/login.html?next=${encodeURIComponent(next)}`);
    await new Promise(() => { });
}

document.getElementById('logoutBtn')?.addEventListener('click', (event) => {
    event.preventDefault();
    logout();
    window.location.href = '/admin/login.html?next=/';
});

const markdownEditor = await createMarkdownEditor('#editor', {
    placeholder: 'Markdown으로 쓰기 시작...',
    onImageButton: () => {
        pendingEditorImageIndex = currentEditorIndex();
        editorImageInput.click();
    }
});

editorImageInput?.addEventListener('change', async () => {
    await insertEditorImages(editorImageInput.files, {
        index: pendingEditorImageIndex
    });
    pendingEditorImageIndex = null;
    editorImageInput.value = '';
});

editorContainer?.addEventListener('dragenter', (event) => {
    if (!hasImageTransfer(event.dataTransfer)) return;
    event.preventDefault();
    editorContainer.classList.add('is-image-dragover');
});

editorContainer?.addEventListener('dragover', (event) => {
    if (!hasImageTransfer(event.dataTransfer)) return;
    event.preventDefault();
    editorContainer.classList.add('is-image-dragover');
});

editorContainer?.addEventListener('dragleave', (event) => {
    if (event.relatedTarget instanceof Node && editorContainer.contains(event.relatedTarget)) return;
    editorContainer.classList.remove('is-image-dragover');
});

editorContainer?.addEventListener('drop', async (event) => {
    if (!hasImageTransfer(event.dataTransfer)) return;
    event.preventDefault();
    event.stopPropagation();
    editorContainer.classList.remove('is-image-dragover');
    await insertEditorImages(editorImageFilesFromTransfer(event.dataTransfer), {
        index: currentEditorIndex()
    });
}, true);

markdownEditor.root.addEventListener('paste', async (event) => {
    if (!hasImageTransfer(event.clipboardData)) return;
    event.preventDefault();
    event.stopPropagation();
    await insertEditorImages(editorImageFilesFromTransfer(event.clipboardData), {
        index: currentEditorIndex()
    });
}, true);

categorySelect?.addEventListener('change', () => {
    applyCategory(categorySelect.value);
});

dateInput?.addEventListener('change', () => {
    if (categorySelect.value === 'daily') {
        setDailyDefaults(dateInput.value || new Date());
    }
});

titleInput?.addEventListener('input', () => {
    if (categorySelect.value !== 'daily') {
        lastAutoTitle = '';
    }
});

form?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const mode = event.submitter?.value === 'publish' ? 'publish' : 'draft';
    await saveEntry(mode);
});

const initialCategory = new URLSearchParams(window.location.search).get('category') || '';
if (['posts', 'daily', 'programs'].includes(initialCategory)) {
    categorySelect.value = initialCategory;
    applyCategory(initialCategory);
} else {
    form.hidden = true;
}

function applyCategory(category) {
    form.hidden = !category;
    programFields.hidden = category !== 'programs';
    dateGroup.hidden = category === 'programs';
    lastAutoTitle = '';
    setEditorImageStatus();

    if (!category) return;

    const today = normalizeDailyDayKey(new Date());
    dateInput.value = today;

    if (category === 'posts') {
        writerHeading.textContent = '글방에 올릴 글';
        dateLabel.textContent = '발행일';
        titleInput.placeholder = '글 제목';
        markdownEditor.editor?.setPlaceholder?.('Markdown으로 글을 작성하세요...');
    }

    if (category === 'daily') {
        writerHeading.textContent = '나으 하루에 올릴 기록';
        dateLabel.textContent = '기록 날짜';
        titleInput.placeholder = '하루 제목';
        setDailyDefaults(today);
        markdownEditor.editor?.setPlaceholder?.('Markdown으로 하루를 작성하세요...');
    }

    if (category === 'programs') {
        writerHeading.textContent = '프로그램실에 올릴 항목';
        titleInput.placeholder = '프로그램 이름';
        programStatus.value = 'prototype';
        markdownEditor.editor?.setPlaceholder?.('Markdown으로 제작 배경, 사용법, 스크린샷, 긴 이야기 쓰기...');
    }

    titleInput.focus();
}

function setDailyDefaults(value) {
    const dayKey = normalizeDailyDayKey(value);
    const nextAutoTitle = newDailyEntryTitle(dayKey);
    dateInput.value = dayKey;

    if (!titleInput.value || titleInput.value === lastAutoTitle) {
        titleInput.value = nextAutoTitle;
        lastAutoTitle = nextAutoTitle;
    }
}

async function saveEntry(mode) {
    if (isSaving) return;

    const category = categorySelect.value;
    const title = titleInput.value.trim();
    const content = editorHtml();

    if (!category) {
        showAlert('카테고리를 먼저 선택해줘.', 'error');
        return;
    }

    if (!title) {
        showAlert('제목은 꼭 필요해.', 'error');
        titleInput.focus();
        return;
    }

    isSaving = true;
    setSavingState(true);
    showAlert(mode === 'publish' ? '발행 중...' : '임시 저장 중...', 'info', false);

    try {
        if (category === 'posts') {
            const saved = await savePostEntry({ title, content, mode });
            showSaved('글방', saved, `/posts/view.html?slug=${encodeURIComponent(saved.slug || '')}`);
        } else if (category === 'daily') {
            const saved = await saveDailyEntry({ title, content, mode });
            showSaved('나으 하루', saved, `/daily/view.html?slug=${encodeURIComponent(saved.slug || '')}`);
        } else if (category === 'programs') {
            const saved = await saveProgramEntry({ title, content, mode });
            showSaved('프로그램실', saved, `/programs/view.html?slug=${encodeURIComponent(saved.slug || '')}`);
        }
    } catch (error) {
        showAlert(`저장 실패: ${cmsErrorMessage(error)}`, 'error');
    } finally {
        isSaving = false;
        setSavingState(false);
    }
}

async function savePostEntry({ title, content, mode }) {
    const day = normalizeDailyDayKey(dateInput.value || new Date());
    const formData = new FormData();
    const slug = slugify(title) || `post-${Date.now()}`;

    formData.append('title', title);
    formData.append('slug', slug);
    formData.append('status', mode === 'publish' ? 'published' : 'draft');
    formData.append('content', content);
    formData.append('published_at', day);

    return await createPost(formData);
}

async function saveDailyEntry({ title, content, mode }) {
    const dayKey = normalizeDailyDayKey(dateInput.value || new Date());
    const status = mode === 'publish' ? 'published' : 'draft';
    const slug = newDailyEntrySlug(dayKey);

    return await createDailyEntry(dailyFormData({
        title: title || newDailyEntryTitle(dayKey),
        slug,
        dayKey,
        status,
        content
    }));
}

function dailyFormData({ title, slug, dayKey, status, content, publishedAt = null }) {
    const formData = new FormData();
    formData.append('title', title || dailyTitleFromDayKey(dayKey));
    formData.append('slug', slug || dailySlugFromDayKey(dayKey));
    formData.append('day_key', dayKey);
    formData.append('status', status || 'draft');
    formData.append('content', content || '');
    formData.append('published_at', publishedAt || dayKey);
    return formData;
}

async function saveProgramEntry({ title, content, mode }) {
    const formData = new FormData();
    const intro = programStoryIntro.value.trim();
    const legacyRequiredText = intro || title;

    formData.append('title', title);
    formData.append('slug', slugify(title) || `program-${Date.now()}`);
    formData.append('status', normalizeProgramStatus(programStatus.value));
    formData.append('is_public', mode === 'publish' ? 'true' : 'false');
    formData.append('story_detail', content);
    formData.append('why', legacyRequiredText);
    formData.append('pain_point', legacyRequiredText);

    appendOptionalText(formData, 'platform', programPlatform.value);
    appendOptionalText(formData, 'story_intro', intro);
    appendOptionalText(formData, 'primary_link_label', programPrimaryLinkLabel.value);
    appendOptionalText(formData, 'primary_link_url', programPrimaryLinkUrl.value);

    Array.from(programCoverImage.files || []).forEach(file => {
        formData.append('cover_image', file);
    });
    Array.from(programDownloadFiles.files || []).forEach(file => {
        formData.append('download_files', file);
    });

    return await createProgram(formData);
}

function appendOptionalText(formData, name, value) {
    const text = String(value || '').trim();
    if (text) formData.append(name, text);
}

function showSaved(label, record, url) {
    const viewLink = record?.slug
        ? ` <a href="${url}" target="_blank" rel="noopener">공개 화면 보기</a>`
        : '';
    showAlert(`${label}에 저장됐어.${viewLink}`, 'success', false);
}

function editorHtml() {
    const html = markdownEditor.root.innerHTML.trim();
    return html === '<p><br></p>' ? '' : html;
}

function setSavingState(saving) {
    categorySelect.disabled = saving;
    form.querySelectorAll('button, input, select, textarea').forEach(control => {
        control.disabled = saving;
    });
}

function showAlert(message, type, autoHide = true) {
    alertEl.innerHTML = message;
    alertEl.className = `alert alert-${type}`;
    alertEl.style.display = 'block';
    if (autoHide) {
        setTimeout(() => {
            alertEl.style.display = 'none';
        }, 5000);
    }
}

function setEditorImageStatus(message = '', type = 'info') {
    editorImageStatus.textContent = message;
    editorImageStatus.className = `editor-image-status editor-image-status-${type}`;
    editorImageStatus.classList.toggle('is-visible', Boolean(message));
}

function editorImageFilesFromTransfer(dataTransfer) {
    return imageFilesFromTransfer(dataTransfer, {
        mimeTypes: IMAGE_MIME_TYPES,
        fallbackNamePrefix: 'global-editor-image'
    });
}

function isSupportedEditorImage(file) {
    return file && IMAGE_MIME_TYPES.has(file.type);
}

function clampEditorIndex(index) {
    return markdownEditor.clampIndex(index);
}

function currentEditorIndex() {
    const range = markdownEditor.getSelection(true);
    return clampEditorIndex(range?.index);
}

async function insertEditorImages(files, options = {}) {
    const imageFiles = Array.from(files || []).filter(isSupportedEditorImage);

    if (!imageFiles.length) {
        showAlert('JPG, PNG, GIF, WebP 이미지만 본문에 넣을 수 있어.', 'error');
        return;
    }

    let insertIndex = clampEditorIndex(options.index);
    let uploadedCount = 0;
    editorContainer.classList.add('is-image-uploading');

    for (let i = 0; i < imageFiles.length; i += 1) {
        const file = imageFiles[i];
        setEditorImageStatus(`이미지 업로드 중... (${i + 1}/${imageFiles.length}) ${file.name}`);

        try {
            const media = await uploadMedia(file);
            const url = getMediaUrl(media, media.file);
            insertIndex = markdownEditor.insertImage(insertIndex, url, file.name);
            uploadedCount += 1;
        } catch (error) {
            showAlert(`본문 이미지 업로드 실패 (${file.name}): ${cmsErrorMessage(error)}`, 'error');
        }
    }

    editorContainer.classList.remove('is-image-uploading');

    if (uploadedCount > 0) {
        markdownEditor.setSelection(insertIndex, 0, 'silent');
        setEditorImageStatus(`${uploadedCount}개 이미지가 본문에 들어갔습니다.`, 'success');
        setTimeout(() => setEditorImageStatus(), 2500);
    } else {
        setEditorImageStatus();
    }
}

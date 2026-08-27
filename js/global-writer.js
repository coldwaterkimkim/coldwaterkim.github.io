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
    slugify,
    cmsErrorMessage,
    uploadMedia,
    getMediaUrl,
    formatMediaUploadProgress,
    finalizePublishedEditorMedia
} from './pb.js';
import {
    createEditorUploadCoordinator,
    createMarkdownEditor,
    editorFilesFromTransfer,
    editorUploadLabel,
    hasEditorFileTransfer,
    isSupportedEditorUpload,
    normalizeEditorFiles,
    stopEditorTransferEvent
} from './markdown-editor.js';
import { navigateToPublishedEntry, publishedEntryViewerUrl } from './editor-publish-navigation.mjs';
import { createPendingMediaTracker } from './editor-pending-media.mjs';

const categorySelect = document.getElementById('category');
const form = document.getElementById('globalWriteForm');
const alertEl = document.getElementById('alert');
const titleInput = document.getElementById('title');
const dateInput = document.getElementById('published_at');
const dateLabel = document.getElementById('dateLabel');
const dateGroup = document.getElementById('dateGroup');
const writerHeading = document.getElementById('writerHeading');
const editorContainer = document.querySelector('.editor-container');
const editorImageInput = document.getElementById('editorImageInput');
const editorImageStatus = document.getElementById('editorImageStatus');

let pendingEditorImageIndex = null;
let lastAutoTitle = '';
let isSaving = false;
const pendingMediaTracker = createPendingMediaTracker();

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

const editorUploadCoordinator = createEditorUploadCoordinator({
    uploadFile: uploadEditorRecord
});
const markdownEditor = await createMarkdownEditor('#editor', {
    placeholder: 'Markdown으로 쓰기 시작...',
    fallbackNamePrefix: 'global-editor-file',
    onImageButton: () => {
        pendingEditorImageIndex = currentEditorIndex();
        editorImageInput.click();
    },
    uploadFile: uploadEditorFile,
    onFilesPaste: files => insertEditorFiles(files, {
        index: currentEditorIndex()
    }),
    onFilesPasteError: error => showAlert(`붙여넣기 실패: ${cmsErrorMessage(error)}`, 'error')
});

editorImageInput?.addEventListener('change', async () => {
    await insertEditorFiles(editorImageInput.files, {
        index: pendingEditorImageIndex
    });
    pendingEditorImageIndex = null;
    editorImageInput.value = '';
});

editorContainer?.addEventListener('dragenter', (event) => {
    if (!hasEditorFileTransfer(event.dataTransfer)) return;
    event.preventDefault();
    editorContainer.classList.add('is-image-dragover');
});

editorContainer?.addEventListener('dragover', (event) => {
    if (!hasEditorFileTransfer(event.dataTransfer)) return;
    event.preventDefault();
    editorContainer.classList.add('is-image-dragover');
});

editorContainer?.addEventListener('dragleave', (event) => {
    if (event.relatedTarget instanceof Node && editorContainer.contains(event.relatedTarget)) return;
    editorContainer.classList.remove('is-image-dragover');
});

editorContainer?.addEventListener('drop', async (event) => {
    if (!hasEditorFileTransfer(event.dataTransfer)) return;
    stopEditorTransferEvent(event);
    editorContainer.classList.remove('is-image-dragover');
    await insertEditorFiles(transferredEditorFiles(event.dataTransfer), {
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
if (['posts', 'daily'].includes(initialCategory)) {
    categorySelect.value = initialCategory;
    applyCategory(initialCategory);
} else {
    form.hidden = true;
}

function applyCategory(category) {
    form.hidden = !category;
    dateGroup.hidden = false;
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
        let saved;
        let label;
        if (category === 'posts') {
            saved = await savePostEntry({ title, content, mode });
            label = '글방';
        } else if (category === 'daily') {
            saved = await saveDailyEntry({ title, content, mode });
            label = '나으 하루';
        }

        if (mode === 'publish') {
            const collectionName = category === 'daily' ? 'daily_entries' : category;
            const cleanup = await finalizePublishedEditorMedia({
                collectionName,
                recordId: saved.id,
                content,
                pendingMediaIds: pendingMediaTracker.values()
            });
            pendingMediaTracker.reset(cleanup.remaining);
            if (cleanup.failures.length || cleanup.metadataError) {
                console.warn('Published global-writer media cleanup needs retry', cleanup);
            }
            navigateToPublishedEntry(category, saved);
            return;
        }

        showSaved(label, saved, publishedEntryViewerUrl(category, saved));
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
    formData.append('pending_media_ids', pendingMediaTracker.serialize());

    return await createPost(formData);
}

async function saveDailyEntry({ title, content, mode }) {
    const dayKey = normalizeDailyDayKey(dateInput.value || new Date());
    const status = mode === 'publish' ? 'published' : 'draft';
    const slug = newDailyEntrySlug(dayKey);

    const formData = dailyFormData({
        title: title || newDailyEntryTitle(dayKey),
        slug,
        dayKey,
        status,
        content
    });
    formData.append('pending_media_ids', pendingMediaTracker.serialize());
    return await createDailyEntry(formData);
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

function transferredEditorFiles(dataTransfer) {
    return editorFilesFromTransfer(dataTransfer, {
        fallbackNamePrefix: 'global-editor-file'
    });
}

function clampEditorIndex(index) {
    return markdownEditor.clampIndex(index);
}

function currentEditorIndex() {
    const range = markdownEditor.getSelection(true);
    return clampEditorIndex(range?.index);
}

async function insertEditorFiles(files, options = {}) {
    const editorFiles = normalizeEditorFiles(files, {
        fallbackNamePrefix: 'global-editor-file'
    });

    if (!editorFiles.length) {
        showAlert('JPG, PNG, GIF, WebP, MP4, WebM, MOV, M4V, MP3, PDF만 올릴 수 있어.', 'error');
        return;
    }

    let insertIndex = clampEditorIndex(options.index);
    await markdownEditor.withUploadActivity(async () => {
        await editorUploadCoordinator.runBatch(editorFiles, {
            onFileStart: (file, index, total) => setEditorImageStatus(`${editorUploadLabel(file)} 업로드 준비 중... (${index + 1}/${total}) ${file.name}`),
            onFileProgress: (file, progress, index, total) => setEditorImageStatus(`${editorUploadLabel(file)} ${formatMediaUploadProgress(progress)} (${index + 1}/${total}) ${file.name}`),
            onFileReused: (file, _result, index, total) => setEditorImageStatus(`이미 올린 ${editorUploadLabel(file)} 재사용 중... (${index + 1}/${total}) ${file.name}`),
            onFileError: (file, error) => showAlert(`${editorUploadLabel(file)} 업로드 실패 (${file.name}): ${cmsErrorMessage(error)}`, 'error'),
            onDuplicateBatch: () => setEditorImageStatus('같은 붙여넣기가 겹쳐서 한 번만 처리했습니다.', 'success'),
            onComplete: uploaded => {
                const uploadedFiles = uploaded.map(item => item.result);
                insertIndex = markdownEditor.insertFiles(insertIndex, uploadedFiles);
                markdownEditor.setSelection(insertIndex, 0, 'silent');
                setEditorImageStatus(`${uploadedFiles.length}개 미디어가 본문에 들어갔습니다.`, 'success');
                setTimeout(() => setEditorImageStatus(), 2500);
            }
        });
    });
}

async function uploadEditorFile(file) {
    if (!isSupportedEditorUpload(file)) {
        throw new Error('JPG, PNG, GIF, WebP, MP4, WebM, MOV, M4V, MP3, PDF만 올릴 수 있어.');
    }

    try {
        const uploaded = await editorUploadCoordinator.uploadSingle(file, {
            onFileStart: current => setEditorImageStatus(`${editorUploadLabel(current)} 업로드 준비 중... ${current.name || ''}`),
            onFileProgress: (current, progress) => setEditorImageStatus(`${editorUploadLabel(current)} ${formatMediaUploadProgress(progress)} ${current.name || ''}`),
            onFileReused: current => setEditorImageStatus(`이미 올린 ${editorUploadLabel(current)}를 재사용합니다.`, 'success')
        });
        setEditorImageStatus(`${editorUploadLabel(file)} 업로드 완료.`, 'success');
        setTimeout(() => setEditorImageStatus(), 1800);
        return uploaded.url;
    } catch (error) {
        setEditorImageStatus(`${editorUploadLabel(file)} 업로드 실패: ${cmsErrorMessage(error)}`, 'error');
        throw error;
    }
}

async function uploadEditorRecord(file, options = {}) {
    const media = await uploadMedia(file, file.name, 'Global writer media', options);
    pendingMediaTracker.add(media.id);
    return {
        url: getMediaUrl(media, media.file),
        name: file.name,
        type: file.type
    };
}

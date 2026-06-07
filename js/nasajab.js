import {
    isLoggedIn,
    getPublishedNasajabTimeline,
    getAllNasajabTimeline,
    createNasajab,
    updateNasajab,
    deleteNasajab,
    getNasajabImageUrl,
    nasajabDisplayDate,
    formatDate,
    escapeHtml,
    cmsErrorMessage
} from './pb.js';

const ARCHIVE_PER_PAGE = 5;
const NASAJAB_IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);
const ownerMode = isLoggedIn();
const demoMode = new URLSearchParams(window.location.search).has('demo');

let items = [];
let currentPage = 1;
let selectedId = cleanHashId();
let editingItemId = '';
let clipboardImageFile = null;
let imagePreviewObjectUrl = '';

const featuredEl = document.getElementById('nasajabFeatured');
const archiveEl = document.getElementById('nasajabArchive');
const paginationEl = document.getElementById('nasajabPagination');
const ownerPanel = document.getElementById('nasajabOwnerPanel');
const ownerHead = document.getElementById('nasajabOwnerHead');
const ownerStatus = document.getElementById('nasajabOwnerStatus');
const form = document.getElementById('nasajabForm');
const formTitle = document.getElementById('nasajabFormTitle');
const newButton = document.getElementById('newNasajabButton');
const cancelButton = document.getElementById('cancelNasajabEdit');

const formFields = {
    image: document.getElementById('nasajabImage'),
    pasteBox: document.getElementById('nasajabPasteBox'),
    clipboardButton: document.getElementById('nasajabClipboardButton'),
    clearImage: document.getElementById('nasajabClearImage'),
    imagePreview: document.getElementById('nasajabImagePreview'),
    memo: document.getElementById('nasajabMemo'),
    sourceUrl: document.getElementById('nasajabSourceUrl'),
    displayAt: document.getElementById('nasajabDisplayAt'),
    isPublic: document.getElementById('nasajabIsPublic')
};

if (ownerMode) {
    ownerPanel.hidden = false;
    ownerHead.hidden = false;
    setOwnerStatus('OWNER MODE: 사진 하나만 올려도 위쪽에 바로 뜸.');
}

newButton?.addEventListener('click', () => {
    resetForm({ hidden: false });
    form.scrollIntoView({ block: 'start' });
    formFields.pasteBox?.focus();
});

cancelButton?.addEventListener('click', () => resetForm({ hidden: true }));

form?.addEventListener('submit', async (event) => {
    event.preventDefault();
    await saveItem();
});

formFields.image?.addEventListener('change', () => {
    clipboardImageFile = null;

    const file = formFields.image.files?.[0];
    if (file) {
        if (!isSupportedNasajabImage(file)) {
            clearImageSelection({ silent: true });
            setOwnerStatus('JPG, PNG, GIF, WebP 이미지만 올릴 수 있음.', 'error');
            return;
        }

        showSelectedImage(file, '파일 선택됨');
        setOwnerStatus(`${file.name || '이미지'} 선택 완료. 저장하면 이 이미지로 올라감.`);
        return;
    }

    clearImageSelection({ silent: true });
});

formFields.pasteBox?.addEventListener('paste', async (event) => {
    event.preventDefault();
    event.stopPropagation();

    const imageFiles = imageFilesFromTransfer(event.clipboardData);
    const pastedUrl = urlFromTransfer(event.clipboardData);
    formFields.pasteBox.value = '';

    if (imageFiles.length) {
        useClipboardImage(imageFiles[0], imageFiles.length > 1 ? '붙여넣기: 첫 번째 이미지만 사용' : '붙여넣기 이미지');
        return;
    }

    if (pastedUrl) {
        fillSourceUrlFromClipboard(pastedUrl);
        return;
    }

    setOwnerStatus('클립보드에서 이미지 파일을 못 찾았음. 이미지에서 "이미지 복사"를 한 뒤 다시 붙여넣어봐.', 'error');
});

formFields.pasteBox?.addEventListener('input', () => {
    formFields.pasteBox.value = '';
});

formFields.clipboardButton?.addEventListener('click', async () => {
    await readClipboardImage();
});

formFields.clearImage?.addEventListener('click', () => {
    clearImageSelection();
});

archiveEl?.addEventListener('click', async (event) => {
    const actionButton = event.target.closest('[data-nasajab-action]');
    if (actionButton) {
        const id = actionButton.getAttribute('data-nasajab-id');
        const action = actionButton.getAttribute('data-nasajab-action');
        if (action === 'edit') await editItem(id);
        if (action === 'delete') await removeItem(id);
        return;
    }

    const pickLink = event.target.closest('[data-nasajab-pick]');
    if (!pickLink) return;

    event.preventDefault();
    selectedId = pickLink.getAttribute('data-nasajab-pick') || '';
    if (selectedId) {
        window.location.hash = selectedId;
    } else {
        history.replaceState(null, '', window.location.pathname + window.location.search);
    }
    render();
    featuredEl.scrollIntoView({ block: 'start' });
});

featuredEl?.addEventListener('click', async (event) => {
    const actionButton = event.target.closest('[data-nasajab-action]');
    if (actionButton) {
        const id = actionButton.getAttribute('data-nasajab-id');
        const action = actionButton.getAttribute('data-nasajab-action');
        if (action === 'edit') await editItem(id);
        if (action === 'delete') await removeItem(id);
        return;
    }
});

paginationEl?.addEventListener('click', (event) => {
    const link = event.target.closest('[data-nasajab-page]');
    if (!link) return;
    event.preventDefault();
    const nextPage = Number.parseInt(link.getAttribute('data-nasajab-page') || '1', 10);
    if (Number.isFinite(nextPage)) {
        currentPage = nextPage;
        renderArchive();
    }
});

window.addEventListener('hashchange', () => {
    selectedId = cleanHashId();
    render();
});

loadItems();

async function loadItems() {
    featuredEl.innerHTML = '<p>나사잡 불러오는 중...</p>';
    archiveEl.innerHTML = '<tr><td colspan="5">아카이브 불러오는 중...</td></tr>';

    if (demoMode) {
        items = demoNasajabItems();
        setOwnerStatus('DEMO MODE: 실제 CMS 저장 없이 화면만 보는 중.');
        render();
        return;
    }

    try {
        items = ownerMode
            ? await getAllNasajabTimeline()
            : await getPublishedNasajabTimeline();
        render();
    } catch (error) {
        renderLoadError(error);
    }
}

function render() {
    if (!items.length) {
        renderEmpty();
        return;
    }

    const latest = items[0];
    const selected = selectedId ? items.find(item => item.id === selectedId) : null;
    renderFeatured(selected || latest, Boolean(selected));
    renderArchive();
}

function renderFeatured(item, isArchivePick = false) {
    const label = isArchivePick ? 'ARCHIVE PICK' : "TODAY'S 나사잡";
    const imageUrl = imageUrlFor(item);
    const memo = displayMemo(item);
    const date = formatDateTime(nasajabDisplayDate(item));
    const source = item.source_url
        ? `<p class="nasajab-source">source: <a href="${escapeAttribute(item.source_url)}" target="_blank" rel="noopener">${escapeHtml(shortUrl(item.source_url))}</a></p>`
        : '';
    const ownerActions = ownerMode ? ownerActionsHtml(item) : '';

    featuredEl.innerHTML = `
        <table border="1" cellspacing="0" cellpadding="6" width="100%" class="nasajab-today-table nasajab-today-table--stacked">
            <tr bgcolor="#f0f0f0">
                <th colspan="2" align="center">${label}</th>
            </tr>
            <tr>
                <td class="nasajab-featured-image-cell">
                    ${imageUrl
                        ? `<img src="${escapeAttribute(imageUrl)}" alt="${escapeAttribute(memo)}">`
                        : '<div class="nasajab-missing-image">이미지 없음</div>'}
                </td>
                <td class="nasajab-featured-text-cell">
                    <div class="nasajab-featured-memo">${escapeMultiline(memo)}</div>
                    ${source}
                    <p class="nasajab-featured-date">${escapeHtml(date)}</p>
                    ${ownerActions}
                </td>
            </tr>
        </table>
    `;
}

function renderArchive() {
    const archiveItems = items;
    const ownerColspan = ownerMode ? 5 : 4;

    if (!archiveItems.length) {
        archiveEl.innerHTML = `
            <tr>
                <td colspan="${ownerColspan}">
                    아직 아래에 쌓인 것이 없습니다.
                    ${ownerMode ? '새 나사잡을 하나 더 올리면 아카이브가 생김.' : '곧 뭔가 잡힐 예정.'}
                </td>
            </tr>
        `;
        paginationEl.innerHTML = '';
        return;
    }

    const totalPages = Math.max(1, Math.ceil(archiveItems.length / ARCHIVE_PER_PAGE));
    currentPage = Math.min(Math.max(currentPage, 1), totalPages);

    const start = (currentPage - 1) * ARCHIVE_PER_PAGE;
    const pageItems = archiveItems.slice(start, start + ARCHIVE_PER_PAGE);

    archiveEl.innerHTML = pageItems.map((item, index) => {
        const number = archiveItems.length - start - index;
        const imageUrl = imageUrlFor(item);
        const memo = displayMemo(item);
        const isSelected = selectedId === item.id;
        const ownerCell = ownerMode ? `<td class="nasajab-owner-cell">${ownerActionsHtml(item)}</td>` : '';

        return `
            <tr class="${isSelected ? 'nasajab-archive-row--selected' : ''}">
                <td align="center" class="nasajab-no-cell">${number}</td>
                <td align="center" class="nasajab-thumb-cell">
                    <a href="#${escapeAttribute(item.id)}" data-nasajab-pick="${escapeAttribute(item.id)}">
                        ${imageUrl
                            ? `<img src="${escapeAttribute(imageUrl)}" alt="${escapeAttribute(memo)} thumbnail">`
                            : '<span class="note">no img</span>'}
                    </a>
                </td>
                <td>
                    <a href="#${escapeAttribute(item.id)}" data-nasajab-pick="${escapeAttribute(item.id)}">${escapeHtml(memo)}</a>
                    ${item.is_public === false ? ' <small class="note">[비공개]</small>' : ''}
                    ${isSelected ? ' <small class="note">[NOW]</small>' : ''}
                    <small class="nasajab-mobile-date">${escapeHtml(formatDate(nasajabDisplayDate(item)))}</small>
                </td>
                <td align="center" class="nasajab-archive-date">${escapeHtml(formatDate(nasajabDisplayDate(item)))}</td>
                ${ownerCell}
            </tr>
        `;
    }).join('');

    renderPagination(totalPages);
}

function renderPagination(totalPages) {
    if (totalPages <= 1) {
        paginationEl.innerHTML = '';
        return;
    }

    const links = [];
    for (let page = 1; page <= totalPages; page += 1) {
        links.push(page === currentPage
            ? `<b>${page}</b>`
            : `<a href="#" data-nasajab-page="${page}">${page}</a>`);
    }

    paginationEl.innerHTML = `[ ${links.join(' ')} ]`;
}

function renderEmpty() {
    const colspan = ownerMode ? 5 : 4;
    featuredEl.innerHTML = `
        <table border="1" cellspacing="0" cellpadding="6" width="100%" class="nasajab-today-table">
            <tr bgcolor="#f0f0f0">
                <th align="center">TODAY'S 나사잡</th>
            </tr>
            <tr>
                <td>
                    아직 나를 사로 잡은 것이 올라오지 않았습니다.
                    ${ownerMode ? 'OWNER MODE에서 첫 이미지를 올려보면 됨.' : '언젠가 갑자기 생김.'}
                </td>
            </tr>
        </table>
    `;
    archiveEl.innerHTML = `<tr><td colspan="${colspan}">아카이브도 아직 비어 있음.</td></tr>`;
    paginationEl.innerHTML = '';
}

function renderLoadError(error) {
    const message = cmsErrorMessage(error);
    const setupHint = error?.status === 404
        ? 'PocketBase에 nasajab 컬렉션을 먼저 반영해야 합니다.'
        : message;
    const colspan = ownerMode ? 5 : 4;

    featuredEl.innerHTML = `
        <table border="1" cellspacing="0" cellpadding="6" width="100%" class="nasajab-today-table">
            <tr bgcolor="#f0f0f0"><th align="center">TODAY'S 나사잡</th></tr>
            <tr><td>${escapeHtml(setupHint)}</td></tr>
        </table>
    `;
    archiveEl.innerHTML = `<tr><td colspan="${colspan}">${escapeHtml(message)}</td></tr>`;
    paginationEl.innerHTML = '';
    setOwnerStatus(`CMS 확인 필요: ${setupHint}`, 'error');
}

async function saveItem() {
    if (!ownerMode) return;

    const hasFileInputImage = formFields.image.files.length > 0;
    const hasClipboardImage = Boolean(clipboardImageFile);
    const hasNewImage = hasFileInputImage || hasClipboardImage;
    if (!editingItemId && !hasNewImage) {
        setOwnerStatus('이미지 하나는 꼭 있어야 함. 파일을 고르거나 복사한 이미지를 붙여넣으면 됨.', 'error');
        return;
    }

    const formData = new FormData(form);
    formData.set('is_public', formFields.isPublic.checked ? 'true' : 'false');

    if (hasClipboardImage) {
        formData.set('image', clipboardImageFile);
    } else if (!hasFileInputImage) {
        formData.delete('image');
    }

    normalizeOptionalTextField(formData, 'memo');
    normalizeOptionalTextField(formData, 'source_url');

    if (formFields.displayAt.value) {
        formData.set('display_at', new Date(formFields.displayAt.value).toISOString());
    } else {
        formData.delete('display_at');
    }

    setOwnerStatus(editingItemId ? '나사잡 수정 중...' : '나사잡 저장 중...');

    try {
        const saved = editingItemId
            ? await updateNasajab(editingItemId, formData)
            : await createNasajab(formData);
        setOwnerStatus(`${displayMemo(saved)} 저장 완료.`, 'success');
        resetForm({ hidden: true });
        selectedId = saved.id;
        window.location.hash = saved.id;
        await loadItems();
    } catch (error) {
        setOwnerStatus(`저장 실패: ${cmsErrorMessage(error)}`, 'error');
    }
}

async function editItem(id) {
    if (!ownerMode || !id) return;
    const item = items.find(entry => entry.id === id);
    if (!item) return;

    editingItemId = item.id;
    form.hidden = false;
    formTitle.textContent = `✎ 나사잡 수정: ${displayMemo(item)}`;
    clipboardImageFile = null;
    formFields.image.value = '';
    formFields.pasteBox.value = '';
    formFields.memo.value = item.memo || '';
    formFields.sourceUrl.value = item.source_url || '';
    formFields.displayAt.value = toDateTimeLocal(nasajabDisplayDate(item));
    formFields.isPublic.checked = item.is_public !== false;
    showExistingImage(item);
    setOwnerStatus('수정 모드. 새 이미지를 고르면 기존 이미지가 바뀜.');
    form.scrollIntoView({ block: 'start' });
    formFields.memo.focus();
}

async function removeItem(id) {
    if (!ownerMode || !id) return;
    const item = items.find(entry => entry.id === id);
    const label = displayMemo(item);

    if (!confirm(`${label}을 삭제할까?\n이 작업은 되돌릴 수 없습니다.`)) return;

    try {
        await deleteNasajab(id);
        if (selectedId === id) {
            selectedId = '';
            history.replaceState(null, '', window.location.pathname + window.location.search);
        }
        setOwnerStatus(`${label} 삭제 완료.`, 'success');
        await loadItems();
    } catch (error) {
        setOwnerStatus(`삭제 실패: ${cmsErrorMessage(error)}`, 'error');
    }
}

function resetForm(options = {}) {
    if (!form) return;
    editingItemId = '';
    form.reset();
    clearImageSelection({ silent: true, hidePreview: true });
    formTitle.textContent = '✚ 새 나사잡 올리기';
    formFields.displayAt.value = toDateTimeLocal(new Date().toISOString());
    formFields.isPublic.checked = true;
    form.hidden = options.hidden ?? true;
}

function ownerActionsHtml(item) {
    return `
        <span class="nasajab-owner-actions">
            <button type="button" class="owner-btn" data-nasajab-action="edit" data-nasajab-id="${escapeAttribute(item.id)}">수정</button>
            <button type="button" class="owner-btn owner-btn-danger" data-nasajab-action="delete" data-nasajab-id="${escapeAttribute(item.id)}">삭제</button>
        </span>
    `;
}

function displayMemo(item) {
    const memo = String(item?.memo || '').replace(/\s+/g, ' ').trim();
    if (memo) return memo.length > 80 ? `${memo.slice(0, 80).trim()}...` : memo;

    return '메모 없이 잡힌 것';
}

function imageUrlFor(item) {
    return item?.demo_image_url || getNasajabImageUrl(item);
}

function isSupportedNasajabImage(file) {
    return file && NASAJAB_IMAGE_MIME_TYPES.has(file.type);
}

function hasImageTransfer(dataTransfer) {
    if (!dataTransfer) return false;
    return Array.from(dataTransfer.items || []).some(item => item.type?.startsWith('image/'))
        || Array.from(dataTransfer.files || []).some(file => file.type?.startsWith('image/'));
}

function imageFilesFromTransfer(dataTransfer) {
    if (!hasImageTransfer(dataTransfer)) return [];

    const files = Array.from(dataTransfer.files || []);
    const itemFiles = Array.from(dataTransfer.items || [])
        .filter(item => item.kind === 'file' && item.type?.startsWith('image/'))
        .map(item => item.getAsFile())
        .filter(Boolean);

    return [...files, ...itemFiles]
        .filter((file, index, allFiles) => {
            if (!isSupportedNasajabImage(file)) return false;
            return allFiles.findIndex(candidate =>
                candidate.name === file.name
                && candidate.size === file.size
                && candidate.lastModified === file.lastModified
            ) === index;
        })
        .map((file, index) => namedNasajabImageFile(file, index));
}

function namedNasajabImageFile(file, index) {
    if (file.name && /\.[a-z0-9]+$/i.test(file.name)) return file;

    const extensionByType = {
        'image/jpeg': 'jpg',
        'image/png': 'png',
        'image/gif': 'gif',
        'image/webp': 'webp'
    };
    const extension = extensionByType[file.type] || 'png';

    return new File([file], `nasajab-image-${Date.now()}-${index + 1}.${extension}`, {
        type: file.type
    });
}

function urlFromTransfer(dataTransfer) {
    if (!dataTransfer) return '';

    const candidates = [
        dataTransfer.getData('text/uri-list'),
        dataTransfer.getData('text/plain')
    ];

    return candidates
        .map(value => String(value || '').split(/\r?\n/).find(line => /^https?:\/\//i.test(line.trim())) || '')
        .map(value => value.trim())
        .find(Boolean) || '';
}

function fillSourceUrlFromClipboard(url) {
    if (!formFields.sourceUrl.value.trim()) {
        formFields.sourceUrl.value = url;
        setOwnerStatus('클립보드에는 이미지 파일 대신 URL만 있어서 출처 링크에 넣었음. 이미지는 파일 선택이나 이미지 복사로 다시 넣어줘.', 'error');
        return;
    }

    setOwnerStatus('클립보드에는 이미지 파일 대신 URL만 있었음. 기존 출처 링크는 그대로 뒀어.', 'error');
}

function useClipboardImage(file, label = '붙여넣기 이미지') {
    clipboardImageFile = namedNasajabImageFile(file, 0);
    formFields.image.value = '';
    formFields.pasteBox.value = '';
    showSelectedImage(clipboardImageFile, label);
    setOwnerStatus(`${clipboardImageFile.name} 붙여넣기 완료. 저장하면 이 이미지로 올라감.`, 'success');
}

async function readClipboardImage() {
    if (!navigator.clipboard?.read) {
        setOwnerStatus('이 브라우저는 클립보드 직접 읽기를 지원하지 않음. 붙여넣기 박스에 직접 붙여넣어줘.', 'error');
        return;
    }

    try {
        const clipboardItems = await navigator.clipboard.read();
        const imageFiles = [];
        let textUrl = '';

        for (const item of clipboardItems) {
            const imageType = item.types.find(type => NASAJAB_IMAGE_MIME_TYPES.has(type));
            if (imageType) {
                const blob = await item.getType(imageType);
                imageFiles.push(namedNasajabImageFile(new File([blob], '', { type: blob.type || imageType }), imageFiles.length));
                continue;
            }

            const textType = item.types.find(type => type === 'text/uri-list' || type === 'text/plain');
            if (textType && !textUrl) {
                const textBlob = await item.getType(textType);
                const text = await textBlob.text();
                textUrl = text.split(/\r?\n/).find(line => /^https?:\/\//i.test(line.trim()))?.trim() || '';
            }
        }

        if (imageFiles.length) {
            useClipboardImage(imageFiles[0], imageFiles.length > 1 ? '클립보드: 첫 번째 이미지만 사용' : '클립보드 이미지');
            return;
        }

        if (textUrl) {
            fillSourceUrlFromClipboard(textUrl);
            return;
        }

        setOwnerStatus('클립보드에 읽을 수 있는 이미지가 없음.', 'error');
    } catch (error) {
        setOwnerStatus(`클립보드 읽기 실패: ${cmsErrorMessage(error)}`, 'error');
    }
}

function showSelectedImage(file, label) {
    revokeImagePreviewObjectUrl();
    imagePreviewObjectUrl = URL.createObjectURL(file);
    renderImagePreview({
        url: imagePreviewObjectUrl,
        label,
        detail: `${file.name || 'image'} · ${formatBytes(file.size)}`,
        canClear: true
    });
}

function showExistingImage(item) {
    revokeImagePreviewObjectUrl();
    const url = imageUrlFor(item);
    if (!url) {
        hideImagePreview();
        return;
    }

    renderImagePreview({
        url,
        label: '현재 저장된 이미지',
        detail: '새 파일을 고르거나 붙여넣으면 교체됨.',
        canClear: false
    });
}

function renderImagePreview({ url, label, detail, canClear }) {
    if (!formFields.imagePreview) return;

    formFields.imagePreview.innerHTML = `
        <img src="${escapeAttribute(url)}" alt="${escapeAttribute(label)} preview">
        <span>
            <b>${escapeHtml(label)}</b><br>
            <small>${escapeHtml(detail)}</small>
        </span>
    `;
    formFields.imagePreview.hidden = false;
    formFields.clearImage.hidden = !canClear;
}

function clearImageSelection(options = {}) {
    clipboardImageFile = null;
    formFields.image.value = '';
    formFields.pasteBox.value = '';
    revokeImagePreviewObjectUrl();

    if (options.hidePreview) {
        hideImagePreview();
    } else if (editingItemId) {
        const item = items.find(entry => entry.id === editingItemId);
        if (item) showExistingImage(item);
    } else {
        hideImagePreview();
    }

    if (!options.silent) {
        setOwnerStatus(editingItemId ? '새 이미지 선택 취소. 저장하면 기존 이미지 유지.' : '이미지 선택이 비워졌음.');
    }
}

function hideImagePreview() {
    if (formFields.imagePreview) {
        formFields.imagePreview.innerHTML = '';
        formFields.imagePreview.hidden = true;
    }
    if (formFields.clearImage) {
        formFields.clearImage.hidden = true;
    }
}

function revokeImagePreviewObjectUrl() {
    if (!imagePreviewObjectUrl) return;
    URL.revokeObjectURL(imagePreviewObjectUrl);
    imagePreviewObjectUrl = '';
}

function formatBytes(value) {
    const bytes = Number(value || 0);
    if (!Number.isFinite(bytes) || bytes <= 0) return '크기 알 수 없음';
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)}KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

function normalizeOptionalTextField(formData, name) {
    const value = String(formData.get(name) || '').trim();
    if (value) {
        formData.set(name, value);
    } else {
        formData.delete(name);
    }
}

function setOwnerStatus(message, type = 'info') {
    if (!ownerStatus) return;
    ownerStatus.textContent = message || '';
    ownerStatus.className = `nasajab-owner-status nasajab-owner-status--${type}`;
}

function cleanHashId() {
    return decodeURIComponent(window.location.hash.replace(/^#/, '')).trim();
}

function formatDateTime(value) {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    const datePart = date.toLocaleDateString('ko-KR', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    });
    const timePart = date.toLocaleTimeString('ko-KR', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });
    return `${datePart} ${timePart}`;
}

function toDateTimeLocal(value) {
    const date = value ? new Date(value) : new Date();
    if (Number.isNaN(date.getTime())) return '';
    const offsetMs = date.getTimezoneOffset() * 60 * 1000;
    return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

function shortUrl(url) {
    try {
        const parsed = new URL(url);
        return parsed.hostname.replace(/^www\./, '') + parsed.pathname.replace(/\/$/, '');
    } catch (e) {
        return url;
    }
}

function escapeMultiline(value) {
    return escapeHtml(value).replace(/\r?\n/g, '<br>');
}

function escapeAttribute(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

function demoNasajabItems() {
    const demos = [
        ['demo-sky', '퇴근길, 하늘이 오늘따라 멋졌다.', '1999-05-20T19:15:27+09:00', '#d4b4ff', '#3c286e'],
        ['demo-cassette', '오래된 카세트 테이프. 갑자기 이런 질감이 좋아져서.', '1999-05-18T23:41:02+09:00', '#e8e8e8', '#111111'],
        ['demo-game', '재미있던 8비트 게임. 쓸데없이 진지해서 웃겼음.', '1999-05-15T16:20:33+09:00', '#b7f7c1', '#1f5c2a'],
        ['demo-coffee', '좋은 음악과 커피 한 잔. 별것 아닌데 오래 봄.', '1999-05-12T10:05:11+09:00', '#d8b08c', '#3d2415'],
        ['demo-sentence', '마음에 남는 문장 하나. 지피띠니가 이상하게 정확한 말을 함.', '1999-05-10T22:18:44+09:00', '#fff6c9', '#533c00'],
        ['demo-flower', '길가에 핀 작은 꽃. 작은데 너무 뻔뻔하게 예뻤다.', '1999-05-08T13:07:59+09:00', '#c9f2c7', '#195a1f']
    ];

    return demos.map(([id, memo, displayAt, bg, fg], index) => ({
        id,
        memo,
        display_at: displayAt,
        created: displayAt,
        is_public: true,
        demo_image_url: svgDataUri(memo, bg, fg, index)
    }));
}

function svgDataUri(label, bg, fg, index) {
    const imageLabel = label.split(/[.!?]/)[0].trim().slice(0, 18) || '나사잡';
    const shapes = [
        '<circle cx="260" cy="110" r="52" fill="white" opacity="0.6"/>',
        '<rect x="80" y="70" width="260" height="120" fill="white" opacity="0.5"/>',
        '<path d="M30 180 C120 60 240 240 370 80" fill="none" stroke="white" stroke-width="18" opacity="0.5"/>',
        '<circle cx="90" cy="80" r="28" fill="white" opacity="0.55"/><circle cx="310" cy="160" r="40" fill="white" opacity="0.35"/>'
    ][index % 4];
    const svg = `
        <svg xmlns="http://www.w3.org/2000/svg" width="480" height="270" viewBox="0 0 480 270">
            <rect width="480" height="270" fill="${bg}"/>
            ${shapes}
            <rect x="20" y="20" width="440" height="230" fill="none" stroke="${fg}" stroke-width="4"/>
            <text x="240" y="145" text-anchor="middle" font-family="monospace" font-size="22" fill="${fg}">${escapeSvg(imageLabel)}</text>
        </svg>
    `;
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function escapeSvg(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

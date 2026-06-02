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
    formatDate,
    slugify,
    escapeHtml,
    cmsErrorMessage
} from './pb.js';

const ownerMode = isLoggedIn();
let programs = [];
let editingProgramId = '';

const fallbackPrograms = [
    {
        id: 'fallback-onecut',
        title: 'OneCut',
        slug: 'onecut',
        status: 'beta',
        platform: 'iOS · TestFlight · 하루 기록',
        status_note: '공개 준비',
        tagline: 'a day in one frame',
        story_intro: '하루를 한 컷으로 붙잡는 앱.',
        why: '하루가 너무 쉽게 흘러가서, 최소한 한 컷만큼은 붙잡아두려고.',
        pain_point: '사진은 많은데 하루의 감정과 맥락은 흩어지는 문제.',
        sort_order: 10,
        is_public: true
    },
    {
        id: 'fallback-doodle-dolmeng',
        title: 'Doodle 돌멩',
        slug: 'doodle-dolmeng',
        status: 'beta',
        platform: 'iOS · 위치 기반 지도 · 캠퍼스',
        status_note: '실험중',
        tagline: 'campus map scribbles',
        story_intro: '캠퍼스 생활권을 낙서처럼 남기는 지도.',
        why: '장소에는 말로 설명하기 어려운 분위기와 낙서 같은 기억이 있어서.',
        pain_point: '지도는 정확하지만, 사람들이 실제로 느끼는 생활권은 너무 납작하게 보이는 문제.',
        sort_order: 20,
        is_public: true
    },
    {
        id: 'fallback-wisdom-dolmeng',
        title: '중생돌멩',
        slug: 'wisdom-dolmeng',
        status: 'released',
        platform: 'macOS · 메뉴바 앱 · .dmg 예정',
        status_note: '파일 준비',
        tagline: 'floating wisdom panel',
        story_intro: '메뉴바에서 잠깐씩 정신을 붙잡아주는 작은 앱.',
        why: '하루 중 잠깐씩 정신을 붙잡아주는 이상한 문장이 필요해서.',
        pain_point: '집중이 풀릴 때마다 거창한 앱을 여는 건 너무 큰 행동이라는 문제.',
        sort_order: 30,
        is_public: true
    },
    {
        id: 'fallback-quick-dump-dolmeng',
        title: '브덤돌멩',
        slug: 'quick-dump-dolmeng',
        status: 'prototype',
        platform: 'macOS · 빠른 메모 · GitHub 예정',
        status_note: '손보는중',
        tagline: 'throw thoughts fast',
        story_intro: '생각이 지나가기 전에 아무 데나 던져놓는 메모 도구.',
        why: '생각이 지나가기 전에 어디든 빠르게 던져놓고 싶어서.',
        pain_point: '메모 앱을 고르는 순간 이미 쓰려던 말이 사라지는 문제.',
        sort_order: 40,
        is_public: true
    },
    {
        id: 'fallback-coming-soon-program',
        title: '이름 미정',
        slug: 'coming-soon-program',
        status: 'unreleased',
        platform: 'Web · 예고편 · 아직 비밀',
        status_note: '예고편',
        tagline: 'unreleased trailer',
        story_intro: '아직 이름을 붙이지 않은 예고편 row.',
        why: '아직 말하면 김이 빠지는 종류의 빡침에서 시작됨.',
        pain_point: '공개 전이라 자세한 설명은 봉인. 대신 예고편 row로 먼저 입장.',
        sort_order: 50,
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
    version: document.getElementById('programVersion'),
    statusNote: document.getElementById('programStatusNote'),
    sortOrder: document.getElementById('programSortOrder'),
    publishedAt: document.getElementById('programPublishedAt'),
    primaryLinkLabel: document.getElementById('programPrimaryLinkLabel'),
    primaryLinkUrl: document.getElementById('programPrimaryLinkUrl'),
    externalLinks: document.getElementById('programExternalLinks'),
    storyIntro: document.getElementById('programStoryIntro'),
    why: document.getElementById('programWhy'),
    painPoint: document.getElementById('programPainPoint'),
    storyDetail: document.getElementById('programStoryDetail'),
    solution: document.getElementById('programSolution'),
    buildNotes: document.getElementById('programBuildNotes'),
    screenshots: document.getElementById('programScreenshots'),
    coverImage: document.getElementById('programCoverImage'),
    downloadFiles: document.getElementById('programDownloadFiles'),
    isPublic: document.getElementById('programIsPublic')
};

if (ownerMode) {
    ownerPanel.hidden = false;
    setOwnerStatus('OWNER MODE: 이 페이지에서 바로 프로그램을 추가/수정할 수 있음.');
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
                    ${coverUrl ? renderImageCover(program, coverUrl) : renderFallbackCover(program)}
                </a>
            </td>
            <td class="program-story-cell">
                <h2><span class="program-label">[${escapeHtml(label)}]</span> <a href="${escapeAttribute(detailUrl)}">${escapeHtml(title)}</a></h2>
                <p class="program-meta">${programMeta(program)}</p>
                ${program.story_intro ? `<p>${escapeMultiline(program.story_intro)}</p>` : ''}
                <p><b>왜 만들었냐:</b> ${previewText(program.why || '아직 작성중.')}</p>
                <p><b>해결하는 빡침:</b> ${previewText(program.pain_point || '아직 작성중.')}</p>
                <p><a href="${escapeAttribute(detailUrl)}">상세 이야기 보기</a></p>
            </td>
            <td class="program-action-cell">
                <b>${escapeHtml(label)}</b><br>
                <small>${escapeHtml(program.status_note || defaultStatusNote(status))}</small>
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

function renderFallbackCover(program) {
    return `
        <div class="program-cover ${coverClass(program)}">
            <div class="program-window-bar">${escapeHtml(program.slug || 'program')}</div>
            <div class="program-cover-title">${fallbackCoverTitle(program.title)}</div>
            <div class="program-cover-caption">${escapeHtml(program.tagline || program.platform || 'made by me')}</div>
        </div>
    `;
}

function coverClass(program) {
    const haystack = `${program.slug || ''} ${program.title || ''}`.toLowerCase();
    if (haystack.includes('onecut') || haystack.includes('one-cut')) return 'program-cover--onecut';
    if (haystack.includes('doodle') || haystack.includes('두들')) return 'program-cover--doodle';
    if (haystack.includes('중생') || haystack.includes('wisdom')) return 'program-cover--wisdom';
    if (haystack.includes('브덤') || haystack.includes('dump')) return 'program-cover--dump';
    if (normalizeProgramStatus(program.status) === 'unreleased') return 'program-cover--secret';
    return `program-cover--${normalizeProgramStatus(program.status)}`;
}

function fallbackCoverTitle(title = '') {
    const clean = String(title || '???').trim() || '???';
    const words = clean.split(/\s+/).filter(Boolean);
    const display = words.length > 1 ? words.slice(0, 2).join('<br>') : clean;
    return escapeHtml(display.toUpperCase()).replace(/&lt;BR&gt;/g, '<br>');
}

function programMeta(program) {
    const parts = [
        program.platform,
        program.version,
        program.published_at ? formatDate(program.published_at) : ''
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

    const title = formFields.title.value.trim();
    const why = formFields.why.value.trim();
    const painPoint = formFields.painPoint.value.trim();

    if (!title || !why || !painPoint) {
        setOwnerStatus('제목, 왜 만들었는지, 해결하는 빡침은 필수임.', 'error');
        return;
    }

    const formData = new FormData(programForm);
    formData.set('slug', safeSlug(formFields.slug.value || title));
    formData.set('status', normalizeProgramStatus(formFields.status.value));
    formData.set('is_public', formFields.isPublic.checked ? 'true' : 'false');
    formData.set('sort_order', String(Number.parseInt(formFields.sortOrder.value || '100', 10) || 100));

    if (!formFields.publishedAt.value) formData.delete('published_at');
    if (!formFields.coverImage.files.length) formData.delete('cover_image');
    if (!formFields.screenshots.files.length) formData.delete('screenshots');
    if (!formFields.downloadFiles.files.length) formData.delete('download_files');

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
        formFields.version.value = program.version || '';
        formFields.statusNote.value = program.status_note || '';
        formFields.sortOrder.value = Number.isFinite(Number(program.sort_order)) ? String(program.sort_order) : '100';
        formFields.publishedAt.value = program.published_at ? program.published_at.split(' ')[0].split('T')[0] : '';
        formFields.primaryLinkLabel.value = program.primary_link_label || '';
        formFields.primaryLinkUrl.value = program.primary_link_url || '';
        formFields.externalLinks.value = program.external_links || '';
        formFields.storyIntro.value = program.story_intro || '';
        formFields.why.value = program.why || '';
        formFields.painPoint.value = program.pain_point || '';
        formFields.storyDetail.value = program.story_detail || '';
        formFields.solution.value = program.solution || '';
        formFields.buildNotes.value = program.build_notes || '';
        formFields.coverImage.value = '';
        formFields.screenshots.value = '';
        formFields.downloadFiles.value = '';
        formFields.isPublic.checked = Boolean(program.is_public);
        setOwnerStatus('수정 모드. 새 표지/스크린샷/파일을 고르면 CMS에 추가됨.');
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
    formFields.sortOrder.value = '100';
    formFields.publishedAt.value = new Date().toISOString().split('T')[0];
    formFields.isPublic.checked = true;
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

/**
 * PocketBase SDK Wrapper for coldwaterkim.com
 *
 * 사용법:
 * import { pb, isLoggedIn, logout } from './pb.js';
 *
 * // 글 목록 가져오기
 * const posts = await pb.collection('posts').getList(1, 10, {
 *   filter: 'status = "published"',
 *   sort: '-published_at,-created'
 * });
 */

import PocketBase from '../vendor/pocketbase.es.mjs';

// PocketBase API 경로
// - 로컬 Vite: PocketBase 서버를 127.0.0.1:8090에서 따로 실행
// - 로컬 Vite live CMS 모드: Vite 프록시를 통해 운영 API 서버 사용
// - GitHub Pages: coldwaterkim.com의 PocketBase 서버 사용
// - iMac/VPS 단일 배포: VITE_CMS_TARGET=same-origin 빌드에서 같은 도메인의 /api 사용
// - 필요하면 HTML에서 window.POCKETBASE_URL로 외부 CMS 주소를 덮어쓸 수 있음
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);
const IS_LOCAL_FRONTEND = LOCAL_HOSTS.has(window.location.hostname);
const LOCAL_API_URL = 'http://127.0.0.1:8090';
const LIVE_CMS_URL = String(typeof __LIVE_CMS_URL__ !== 'undefined' ? __LIVE_CMS_URL__ : '').replace(/\/+$/, '');
const CMS_TARGET = String(typeof __CMS_TARGET__ !== 'undefined' ? __CMS_TARGET__ : '').toLowerCase();
const SAME_ORIGIN_CMS_TARGETS = new Set(['same-origin', 'self', 'imac', 'home']);
const API_HOSTS = LIVE_CMS_URL
    ? new Map([
        ['coldwaterkim.com', LIVE_CMS_URL],
        ['www.coldwaterkim.com', LIVE_CMS_URL],
        ['coldwaterkimkim.github.io', LIVE_CMS_URL],
    ])
    : new Map();
const CONFIGURED_API_URL = window.POCKETBASE_URL
    ? String(window.POCKETBASE_URL).replace(/\/+$/, '')
    : '';
const DEFAULT_LOCAL_API_URL = CMS_TARGET === 'live'
    ? window.location.origin
    : LOCAL_API_URL;
const API_URL = CONFIGURED_API_URL
    || (IS_LOCAL_FRONTEND
        ? DEFAULT_LOCAL_API_URL
        : SAME_ORIGIN_CMS_TARGETS.has(CMS_TARGET)
            ? window.location.origin
            : API_HOSTS.get(window.location.hostname) || window.location.origin);

// PocketBase 인스턴스 생성
export const pb = new PocketBase(API_URL);
pb.autoCancellation(false);

// ─────────────────────────────────────────────────────────
// 인증 헬퍼 함수들
// ─────────────────────────────────────────────────────────

/**
 * 로그인 상태 확인
 * @returns {boolean}
 */
export function isLoggedIn() {
    return pb.authStore.isValid;
}

/**
 * 현재 사용자 정보
 * @returns {object|null}
 */
export function currentUser() {
    return pb.authStore.model;
}

/**
 * 로그인
 * @param {string} identity username or email
 * @param {string} password
 * @returns {Promise<object>}
 */
export async function login(identity, password) {
    return await pb.collection('users').authWithPassword(identity, password);
}

/**
 * 로그아웃
 */
export function logout() {
    pb.authStore.clear();
}

const MEDIA_UPLOAD_AUTH_MESSAGE = '관리자 로그인 상태가 만료됐어. 다시 로그인한 뒤 같은 파일을 올려줘.';
const MEDIA_UPLOAD_TYPE_MESSAGE = '지원하지 않는 파일 형식이야. 현재 JPG, PNG, GIF, WebP, MP4, WebM, MOV/M4V, MP3, PDF만 올릴 수 있어.';

function errorFieldData(err) {
    return err?.data?.data || err?.response?.data || {};
}

function hasFieldErrors(err) {
    return Object.keys(errorFieldData(err)).length > 0;
}

function isInvalidMimeTypeError(err) {
    return Object.values(errorFieldData(err))
        .some(field => field?.code === 'validation_invalid_mime_type');
}

function isAuthRequiredCreateError(err) {
    const message = err?.message || err?.data?.message || '';
    return err?.status === 400
        && !hasFieldErrors(err)
        && /Failed to create record/i.test(message);
}

export function isAuthExpiredLikeError(err) {
    return err?.status === 401
        || err?.status === 403
        || isAuthRequiredCreateError(err);
}

/**
 * 관리자 페이지 접근 체크 (로그인 안 되어 있으면 리다이렉트)
 */
export function requireAuth() {
    if (!isLoggedIn()) {
        window.location.href = '/admin/login.html';
        return false;
    }
    return true;
}

// ─────────────────────────────────────────────────────────
// Posts 헬퍼 함수들
// ─────────────────────────────────────────────────────────

const POST_DISPLAY_SORT = '-published_at,-created';

/**
 * 발행된 글 목록 가져오기
 * @param {number} page
 * @param {number} perPage
 * @returns {Promise<object>}
 */
export async function getPublishedPosts(page = 1, perPage = 10) {
    return await pb.collection('posts').getList(page, perPage, {
        filter: pb.filter('status = {:status}', { status: 'published' }),
        sort: POST_DISPLAY_SORT
    });
}

export function postDisplayDate(post) {
    return post?.published_at || post?.created || '';
}

export function sortPostsForDisplay(posts = []) {
    return Array.from(posts).sort((a, b) => {
        const byDisplayDate = dateTimestamp(postDisplayDate(b)) - dateTimestamp(postDisplayDate(a));
        if (byDisplayDate !== 0) return byDisplayDate;

        const byCreated = dateTimestamp(b?.created) - dateTimestamp(a?.created);
        if (byCreated !== 0) return byCreated;

        return String(b?.id || '').localeCompare(String(a?.id || ''));
    });
}

async function collectPostPages(loader, perPage = 100) {
    const items = [];
    let page = 1;

    while (true) {
        const result = await loader(page, perPage);
        items.push(...(result.items || []));

        if (!result.totalPages || page >= result.totalPages) break;
        page += 1;
    }

    return sortPostsForDisplay(items);
}

export async function getPublishedPostTimeline(perPage = 100) {
    return await collectPostPages(getPublishedPosts, perPage);
}

/**
 * 슬러그로 글 가져오기
 * @param {string} slug
 * @returns {Promise<object>}
 */
export async function getPostBySlug(slug, includeDrafts = false) {
    if (includeDrafts && isLoggedIn()) {
        return await pb.collection('posts').getFirstListItem(
            pb.filter('slug = {:slug}', { slug })
        );
    }

    return await pb.collection('posts').getFirstListItem(
        pb.filter('slug = {:slug} && status = {:status}', {
            slug,
            status: 'published'
        })
    );
}

/**
 * 모든 글 목록 (관리자용)
 * @param {number} page
 * @param {number} perPage
 * @returns {Promise<object>}
 */
export async function getAllPosts(page = 1, perPage = 20) {
    return await pb.collection('posts').getList(page, perPage, {
        sort: POST_DISPLAY_SORT
    });
}

export async function getAllPostTimeline(perPage = 100) {
    return await collectPostPages(getAllPosts, perPage);
}

/**
 * 글 생성
 * @param {object} data
 * @returns {Promise<object>}
 */
export async function createPost(data) {
    return await pb.collection('posts').create(data);
}

/**
 * 글 수정
 * @param {string} id
 * @param {object} data
 * @returns {Promise<object>}
 */
export async function updatePost(id, data) {
    return await pb.collection('posts').update(id, data);
}

/**
 * 글 삭제
 * @param {string} id
 * @returns {Promise<boolean>}
 */
export async function deletePost(id) {
    return await pb.collection('posts').delete(id);
}

// ─────────────────────────────────────────────────────────
// Daily Entries: 나으 하루 헬퍼 함수들
// ─────────────────────────────────────────────────────────

export const DAILY_COLLECTION = 'daily_entries';

/**
 * 날짜 입력값을 하루 키(YYYY-MM-DD)로 정규화한다.
 * @param {string|Date} value
 * @returns {string}
 */
export function normalizeDailyDayKey(value = new Date()) {
    if (value instanceof Date) return getKstDateKey(value);

    const raw = String(value || '').trim();
    const directMatch = raw.match(/^\d{4}-\d{2}-\d{2}/);
    if (directMatch) return directMatch[0];

    const parsed = new Date(raw);
    return Number.isNaN(parsed.getTime()) ? getKstDateKey() : getKstDateKey(parsed);
}

export function dailySlugFromDayKey(dayKey) {
    return normalizeDailyDayKey(dayKey);
}

export function newDailyEntrySlug(dayKey, createdAt = new Date()) {
    const base = dailySlugFromDayKey(dayKey);
    const date = createdAt instanceof Date ? createdAt : new Date(createdAt);
    const timePart = Number.isNaN(date.getTime())
        ? Date.now().toString(36)
        : date.getTime().toString(36);
    const randomPart = Math.random().toString(36).slice(2, 8) || 'entry';
    return `${base}-${timePart}-${randomPart}`;
}

export function dailyTitleFromDayKey(dayKey) {
    return `${normalizeDailyDayKey(dayKey)} 나으 하루`;
}

export function newDailyEntryTitle(dayKey, createdAt = new Date()) {
    const date = createdAt instanceof Date ? createdAt : new Date(createdAt);
    const timeLabel = Number.isNaN(date.getTime())
        ? ''
        : new Intl.DateTimeFormat('ko-KR', {
            timeZone: 'Asia/Seoul',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
        }).format(date);

    return timeLabel
        ? `${dailyTitleFromDayKey(dayKey)} ${timeLabel}`
        : dailyTitleFromDayKey(dayKey);
}

export function dailyEntryDayKey(entry) {
    return entry?.day_key || normalizeDailyDayKey(entry?.published_at || entry?.created);
}

export function dailyEntryDisplayDate(entry) {
    return entry?.published_at || `${dailyEntryDayKey(entry)}T00:00:00+09:00`;
}

function sortDailyEntriesForDisplay(entries = []) {
    return Array.from(entries).sort((a, b) => {
        const byDay = String(dailyEntryDayKey(b)).localeCompare(String(dailyEntryDayKey(a)));
        if (byDay !== 0) return byDay;

        const byDisplayDate = dateTimestamp(dailyEntryDisplayDate(b)) - dateTimestamp(dailyEntryDisplayDate(a));
        if (byDisplayDate !== 0) return byDisplayDate;

        const byUpdated = dateTimestamp(b?.updated) - dateTimestamp(a?.updated);
        if (byUpdated !== 0) return byUpdated;

        return String(b?.id || '').localeCompare(String(a?.id || ''));
    });
}

async function collectDailyPages(loader, perPage = 100) {
    const items = [];
    let page = 1;

    while (true) {
        const result = await loader(page, perPage);
        items.push(...(result.items || []));

        if (!result.totalPages || page >= result.totalPages) break;
        page += 1;
    }

    return sortDailyEntriesForDisplay(items);
}

/**
 * 공개된 나으 하루 목록 가져오기
 * @param {number} page
 * @param {number} perPage
 * @returns {Promise<object>}
 */
export async function getPublishedDailyEntries(page = 1, perPage = 10) {
    return await pb.collection(DAILY_COLLECTION).getList(page, perPage, {
        filter: pb.filter('status = {:status}', { status: 'published' }),
        sort: '-day_key,-published_at,-created'
    });
}

/**
 * 모든 나으 하루 목록 (관리자용)
 * @param {number} page
 * @param {number} perPage
 * @returns {Promise<object>}
 */
export async function getAllDailyEntries(page = 1, perPage = 20) {
    return await pb.collection(DAILY_COLLECTION).getList(page, perPage, {
        sort: '-day_key,-created'
    });
}

export async function getPublishedDailyTimeline(perPage = 100) {
    return await collectDailyPages(getPublishedDailyEntries, perPage);
}

export async function getAllDailyTimeline(perPage = 100) {
    return await collectDailyPages(getAllDailyEntries, perPage);
}

/**
 * 슬러그로 나으 하루 가져오기
 * @param {string} slug
 * @param {boolean} includeDrafts
 * @returns {Promise<object>}
 */
export async function getDailyEntryBySlug(slug, includeDrafts = false) {
    if (includeDrafts && isLoggedIn()) {
        return await pb.collection(DAILY_COLLECTION).getFirstListItem(
            pb.filter('slug = {:slug}', { slug })
        );
    }

    return await pb.collection(DAILY_COLLECTION).getFirstListItem(
        pb.filter('slug = {:slug} && status = {:status}', {
            slug,
            status: 'published'
        })
    );
}

/**
 * 날짜로 나으 하루 가져오기
 * @param {string} dayKey
 * @param {boolean} includeDrafts
 * @returns {Promise<object|null>}
 */
export async function getDailyEntryByDay(dayKey, includeDrafts = false) {
    try {
        if (includeDrafts && isLoggedIn()) {
            return await pb.collection(DAILY_COLLECTION).getFirstListItem(
                pb.filter('day_key = {:dayKey}', { dayKey: normalizeDailyDayKey(dayKey) })
            );
        }

        return await pb.collection(DAILY_COLLECTION).getFirstListItem(
            pb.filter('day_key = {:dayKey} && status = {:status}', {
                dayKey: normalizeDailyDayKey(dayKey),
                status: 'published'
            })
        );
    } catch (e) {
        if (e?.status === 404) return null;
        throw e;
    }
}

/**
 * 나으 하루 생성
 * @param {object|FormData} data
 * @returns {Promise<object>}
 */
export async function createDailyEntry(data) {
    return await pb.collection(DAILY_COLLECTION).create(data);
}

/**
 * 나으 하루 수정
 * @param {string} id
 * @param {object|FormData} data
 * @returns {Promise<object>}
 */
export async function updateDailyEntry(id, data) {
    return await pb.collection(DAILY_COLLECTION).update(id, data);
}

/**
 * 나으 하루 삭제
 * @param {string} id
 * @returns {Promise<boolean>}
 */
export async function deleteDailyEntry(id) {
    return await pb.collection(DAILY_COLLECTION).delete(id);
}

/**
 * @deprecated 기존 하루 단위 append 저장 방식에서 쓰던 헬퍼다.
 * 지금 나으 하루 새 작성은 같은 날짜라도 개별 레코드로 만든다.
 */
export function appendDailyContent(existingContent, nextContent, appendedAt = new Date()) {
    const before = String(existingContent || '').trim();
    const after = String(nextContent || '').trim();
    if (!before) return after;
    if (!after || after === '<p><br></p>') return before;

    const timeLabel = new Intl.DateTimeFormat('ko-KR', {
        timeZone: 'Asia/Seoul',
        hour: '2-digit',
        minute: '2-digit'
    }).format(appendedAt);

    return `${before}\n<hr>\n<p><small>[${timeLabel}에 덧붙임]</small></p>\n${after}`;
}

// ─────────────────────────────────────────────────────────
// Programs 헬퍼 함수들
// ─────────────────────────────────────────────────────────

export const PROGRAM_STATUS_LABELS = {
    released: 'RELEASED',
    beta: 'BETA',
    prototype: 'PROTOTYPE',
    unreleased: 'UNRELEASED',
    archived: 'ARCHIVED'
};

const PROGRAM_STATUS_VALUES = Object.keys(PROGRAM_STATUS_LABELS);

/**
 * 프로그램 상태값 정규화
 * @param {string} status
 * @returns {string}
 */
export function normalizeProgramStatus(status) {
    return PROGRAM_STATUS_VALUES.includes(status) ? status : 'prototype';
}

/**
 * 공개 표시용 프로그램 상태 라벨
 * @param {string} status
 * @returns {string}
 */
export function programStatusLabel(status) {
    return PROGRAM_STATUS_LABELS[normalizeProgramStatus(status)];
}

/**
 * 프로그램 표시 날짜
 * @param {object} program
 * @returns {string}
 */
export function programDisplayDate(program) {
    return program?.created || program?.published_at || '';
}

function sortProgramsForDisplay(programs = []) {
    return Array.from(programs).sort((a, b) => {
        const byDisplayDate = dateTimestamp(programDisplayDate(b)) - dateTimestamp(programDisplayDate(a));
        if (byDisplayDate !== 0) return byDisplayDate;

        return String(b?.id || '').localeCompare(String(a?.id || ''));
    });
}

async function collectProgramPages(loader, perPage = 100) {
    const items = [];
    let page = 1;

    while (true) {
        const result = await loader(page, perPage);
        items.push(...(result.items || []));

        if (!result.totalPages || page >= result.totalPages) break;
        page += 1;
    }

    return sortProgramsForDisplay(items);
}

/**
 * 공개 프로그램 목록 가져오기
 * @param {number} page
 * @param {number} perPage
 * @returns {Promise<object>}
 */
export async function getPublishedPrograms(page = 1, perPage = 50) {
    return await pb.collection('programs').getList(page, perPage, {
        filter: pb.filter('is_public = {:isPublic}', { isPublic: true }),
        sort: '-created'
    });
}

/**
 * 모든 프로그램 목록 (관리자용)
 * @param {number} page
 * @param {number} perPage
 * @returns {Promise<object>}
 */
export async function getAllPrograms(page = 1, perPage = 50) {
    return await pb.collection('programs').getList(page, perPage, {
        sort: '-created'
    });
}

export async function getPublishedProgramTimeline(perPage = 100) {
    return await collectProgramPages(getPublishedPrograms, perPage);
}

export async function getAllProgramTimeline(perPage = 100) {
    return await collectProgramPages(getAllPrograms, perPage);
}

/**
 * 슬러그로 프로그램 가져오기
 * @param {string} slug
 * @param {boolean} includePrivate
 * @returns {Promise<object>}
 */
export async function getProgramBySlug(slug, includePrivate = false) {
    if (includePrivate && isLoggedIn()) {
        return await pb.collection('programs').getFirstListItem(
            pb.filter('slug = {:slug}', { slug })
        );
    }

    return await pb.collection('programs').getFirstListItem(
        pb.filter('slug = {:slug} && is_public = {:isPublic}', {
            slug,
            isPublic: true
        })
    );
}

/**
 * 프로그램 생성
 * @param {object|FormData} data
 * @returns {Promise<object>}
 */
export async function createProgram(data) {
    return await pb.collection('programs').create(data);
}

/**
 * 프로그램 수정
 * @param {string} id
 * @param {object|FormData} data
 * @returns {Promise<object>}
 */
export async function updateProgram(id, data) {
    return await pb.collection('programs').update(id, data);
}

/**
 * 프로그램 삭제
 * @param {string} id
 * @returns {Promise<boolean>}
 */
export async function deleteProgram(id) {
    return await pb.collection('programs').delete(id);
}

function fileList(value) {
    if (Array.isArray(value)) return value.filter(Boolean);
    return value ? [value] : [];
}

const PROGRAM_IMAGE_FILENAME_RE = /\.(avif|gif|jpe?g|png|svg|webp)$/i;

export function isProgramImageFilename(filename) {
    return PROGRAM_IMAGE_FILENAME_RE.test(String(filename || '').split('?')[0]);
}

/**
 * 프로그램 파일 URL 가져오기
 * @param {object} record
 * @param {string} filename
 * @returns {string}
 */
export function getProgramFileUrl(record, filename) {
    return getMediaUrl(record, filename);
}

export function resolveProgramCoverUrl(program) {
    const explicitCover = fileList(program?.cover_image)[0];
    if (explicitCover) return getProgramFileUrl(program, explicitCover);

    const attachedImage = fileList(program?.download_files).find(isProgramImageFilename);
    return attachedImage ? getProgramFileUrl(program, attachedImage) : '';
}

/**
 * 프로그램 다운로드 파일 목록
 * @param {object} program
 * @returns {Array<{label: string, url: string, filename: string, type: string}>}
 */
export function programDownloadFiles(program) {
    return fileList(program?.download_files).map(filename => ({
        label: filename,
        filename,
        url: getProgramFileUrl(program, filename),
        type: 'file'
    }));
}

/**
 * 프로그램 대표 링크 목록.
 * @param {object} program
 * @returns {Array<{label: string, url: string, type: string}>}
 */
export function programPrimaryLinks(program) {
    if (program?.primary_link_url) {
        return [{
            label: program.primary_link_label || '바로가기',
            url: program.primary_link_url,
            type: 'external'
        }];
    }

    return [];
}

export function programDownloadTargets(program) {
    return [
        ...programDownloadFiles(program),
        ...programPrimaryLinks(program)
    ];
}

export function programDetailUrl(program) {
    return `/programs/view.html?slug=${encodeURIComponent(program?.slug || '')}`;
}

// ─────────────────────────────────────────────────────────
// Nasajab 헬퍼 함수들
// ─────────────────────────────────────────────────────────

/**
 * 나사잡 표시 날짜
 * @param {object} item
 * @returns {string}
 */
export function nasajabDisplayDate(item) {
    return item?.display_at || item?.created || '';
}

function sortNasajabForDisplay(items = []) {
    return Array.from(items).sort((a, b) => {
        const byDisplayDate = dateTimestamp(nasajabDisplayDate(b)) - dateTimestamp(nasajabDisplayDate(a));
        if (byDisplayDate !== 0) return byDisplayDate;

        const byCreated = dateTimestamp(b?.created) - dateTimestamp(a?.created);
        if (byCreated !== 0) return byCreated;

        return String(b?.id || '').localeCompare(String(a?.id || ''));
    });
}

async function collectNasajabPages(loader, perPage = 100) {
    const items = [];
    let page = 1;

    while (true) {
        const result = await loader(page, perPage);
        items.push(...(result.items || []));

        if (!result.totalPages || page >= result.totalPages) break;
        page += 1;
    }

    return sortNasajabForDisplay(items);
}

/**
 * 공개 나사잡 목록 가져오기
 * @param {number} page
 * @param {number} perPage
 * @returns {Promise<object>}
 */
export async function getPublishedNasajab(page = 1, perPage = 50) {
    return await pb.collection('nasajab').getList(page, perPage, {
        filter: pb.filter('is_public = {:isPublic}', { isPublic: true }),
        sort: '-display_at,-created'
    });
}

/**
 * 모든 나사잡 목록 (관리자용)
 * @param {number} page
 * @param {number} perPage
 * @returns {Promise<object>}
 */
export async function getAllNasajab(page = 1, perPage = 50) {
    return await pb.collection('nasajab').getList(page, perPage, {
        sort: '-display_at,-created'
    });
}

export async function getPublishedNasajabTimeline(perPage = 100) {
    return await collectNasajabPages(getPublishedNasajab, perPage);
}

export async function getAllNasajabTimeline(perPage = 100) {
    return await collectNasajabPages(getAllNasajab, perPage);
}

/**
 * 나사잡 생성
 * @param {object|FormData} data
 * @returns {Promise<object>}
 */
export async function createNasajab(data) {
    return await pb.collection('nasajab').create(data);
}

/**
 * 나사잡 수정
 * @param {string} id
 * @param {object|FormData} data
 * @returns {Promise<object>}
 */
export async function updateNasajab(id, data) {
    return await pb.collection('nasajab').update(id, data);
}

/**
 * 나사잡 삭제
 * @param {string} id
 * @returns {Promise<boolean>}
 */
export async function deleteNasajab(id) {
    return await pb.collection('nasajab').delete(id);
}

/**
 * 나사잡 이미지 URL
 * @param {object} item
 * @returns {string}
 */
export function getNasajabImageUrl(item) {
    const filename = fileList(item?.image)[0];
    return filename ? getMediaUrl(item, filename) : '';
}

// ─────────────────────────────────────────────────────────
// Guestbook 헬퍼 함수들
// ─────────────────────────────────────────────────────────

/**
 * 방명록 목록 가져오기
 * @param {number} page
 * @param {number} perPage
 * @returns {Promise<object>}
 */
export async function getGuestbookEntries(page = 1, perPage = 50) {
    return await pb.collection('guestbook').getList(page, perPage, {
        sort: '-created'
    });
}

export function guestbookDisplayDate(entry) {
    return entry?.display_date || entry?.created || '';
}

function dateTimestamp(value) {
    const n = Date.parse(value || '');
    return Number.isFinite(n) ? n : 0;
}

export function sortGuestbookEntriesForDisplay(entries = []) {
    return Array.from(entries).sort((a, b) => {
        const byDisplayDate = dateTimestamp(guestbookDisplayDate(b)) - dateTimestamp(guestbookDisplayDate(a));
        if (byDisplayDate !== 0) return byDisplayDate;
        return dateTimestamp(b?.created) - dateTimestamp(a?.created);
    });
}

/**
 * 방명록 작성
 * @param {string} name
 * @param {string} message
 * @returns {Promise<object>}
 */
export async function addGuestbookEntry(name, message) {
    const safeName = String(name || '').trim().slice(0, 50) || '익명의 누군가';
    const safeMessage = String(message || '').trim();
    return await pb.collection('guestbook').create({
        name: safeName,
        message: safeMessage
    });
}

/**
 * 방명록 삭제 (관리자용)
 * @param {string} id
 * @returns {Promise<boolean>}
 */
export async function deleteGuestbookEntry(id) {
    return await pb.collection('guestbook').delete(id);
}

// ─────────────────────────────────────────────────────────
// Visitor Counter 헬퍼 함수들
// ─────────────────────────────────────────────────────────

const VISITOR_ID_KEY = 'cwk_visitor_id';
const VISITOR_SESSION_KEY = 'cwk_visitor_session';
const VISITOR_SESSION_TIMEOUT_MS = 30 * 60 * 1000;
const POST_VIEW_SESSION_KEY = 'cwk_post_view_sessions';
// 2026-05-30 운영 visitor_sessions 누적 23개를 공개 표시값 237의 기준점으로 삼는다.
const VISITOR_TOTAL_DISPLAY_START = 237;
const VISITOR_TOTAL_BASELINE_REAL_TOTAL = 23;
const VISITOR_TODAY_MIN_KEY_PREFIX = 'visitor_today_min_';

export function getKstDateKey(date = new Date()) {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Seoul',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).formatToParts(date);
    const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
    return `${values.year}-${values.month}-${values.day}`;
}

function randomId() {
    if (globalThis.crypto?.randomUUID) {
        return globalThis.crypto.randomUUID();
    }

    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function storageGet(key) {
    try {
        return localStorage.getItem(key);
    } catch (e) {
        return null;
    }
}

function storageSet(key, value) {
    try {
        localStorage.setItem(key, value);
    } catch (e) {
        // 저장소가 막힌 환경에서는 같은 브라우저 중복 방지만 포기한다.
    }
}

function storageRemove(key) {
    try {
        localStorage.removeItem(key);
    } catch (e) {
        // 저장소가 막힌 환경에서는 지울 방문 세션도 유지되지 않는다.
    }
}

function getVisitorId() {
    const existing = storageGet(VISITOR_ID_KEY);
    if (existing) return existing;

    const id = randomId();
    storageSet(VISITOR_ID_KEY, id);
    return id;
}

async function sha256(input) {
    if (globalThis.crypto?.subtle) {
        const bytes = new TextEncoder().encode(input);
        const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
        return Array.from(new Uint8Array(digest))
            .map(byte => byte.toString(16).padStart(2, '0'))
            .join('');
    }

    let hash = 0;
    for (let i = 0; i < input.length; i += 1) {
        hash = ((hash << 5) - hash) + input.charCodeAt(i);
        hash |= 0;
    }
    return Math.abs(hash).toString(16).padStart(64, '0').slice(0, 64);
}

function readActiveSession(now) {
    try {
        const session = JSON.parse(storageGet(VISITOR_SESSION_KEY) || 'null');
        if (!session?.sessionKey || !session?.lastSeenAt) return null;

        const lastSeenAt = Number(session.lastSeenAt);
        if (!Number.isFinite(lastSeenAt)) return null;

        if (now - lastSeenAt >= VISITOR_SESSION_TIMEOUT_MS) return null;

        return session;
    } catch (e) {
        return null;
    }
}

function saveActiveSession(sessionKey, dayKey, now) {
    storageSet(VISITOR_SESSION_KEY, JSON.stringify({
        sessionKey,
        dayKey,
        lastSeenAt: now
    }));
}

async function getVisitorStats(dayKey) {
    const [total, today] = await Promise.all([
        pb.collection('visitor_sessions').getList(1, 1, {
            fields: 'id',
            requestKey: 'visitor-total'
        }),
        pb.collection('visitor_sessions').getList(1, 1, {
            filter: pb.filter('day_key = {:dayKey}', { dayKey }),
            fields: 'id',
            requestKey: 'visitor-today'
        })
    ]);

    return {
        total: total.totalItems || 0,
        today: today.totalItems || 0
    };
}

function parseCounterValue(value) {
    const n = Number.parseInt(value || '0', 10);
    return Number.isFinite(n) && n > 0 ? n : 0;
}

function visitorTotalForDisplay(realTotal) {
    return VISITOR_TOTAL_DISPLAY_START + Math.max(0, realTotal - VISITOR_TOTAL_BASELINE_REAL_TOTAL);
}

export async function getVisitorDisplayStats(dayKey = getKstDateKey()) {
    const stats = await getVisitorStats(dayKey);
    const todayMinimum = parseCounterValue(await getSetting(`${VISITOR_TODAY_MIN_KEY_PREFIX}${dayKey}`));

    return {
        dayKey,
        realTotal: stats.total,
        realToday: stats.today,
        todayMinimum,
        total: visitorTotalForDisplay(stats.total),
        today: Math.max(stats.today, todayMinimum)
    };
}

/**
 * 30분 세션 기준으로 방문을 1회 기록하고 TOTAL/TODAY 값을 가져온다.
 * 같은 브라우저의 새로고침과 페이지 이동은 localStorage 세션으로 중복 집계를 막는다.
 * @returns {Promise<{dayKey: string, realTotal: number, realToday: number, todayMinimum: number, total: number, today: number}>}
 */
export async function recordVisitAndGetStats() {
    const now = Date.now();
    const dayKey = getKstDateKey(new Date(now));
    const activeSession = readActiveSession(now);

    if (activeSession?.dayKey === dayKey) {
        saveActiveSession(activeSession.sessionKey, dayKey, now);
        return await getVisitorDisplayStats(dayKey);
    }

    const visitorId = getVisitorId();
    const sessionBucket = Math.floor(now / VISITOR_SESSION_TIMEOUT_MS);
    const sessionKey = await sha256(`cwk-visitor-v1:${visitorId}:${sessionBucket}`);

    try {
        await pb.collection('visitor_sessions').create({
            session_key: sessionKey,
            day_key: dayKey
        }, {
            requestKey: `visitor-session-${sessionKey}`
        });
    } catch (e) {
        if (e?.status !== 400) {
            throw e;
        }
    }

    saveActiveSession(sessionKey, dayKey, now);
    return await getVisitorDisplayStats(dayKey);
}

/**
 * 로그인 직전에 같은 브라우저에서 생성된 활성 방문 세션을 관리자 집계에서 제외한다.
 * 삭제에 실패하면 다음 OWNER MODE 진입에서 다시 시도할 수 있도록 로컬 세션을 유지한다.
 * @returns {Promise<boolean>}
 */
export async function excludeCurrentVisitorSession() {
    const activeSession = readActiveSession(Date.now());
    if (!activeSession?.sessionKey) return false;

    try {
        const record = await pb.collection('visitor_sessions').getFirstListItem(
            pb.filter('session_key = {:sessionKey}', { sessionKey: activeSession.sessionKey }),
            {
                fields: 'id',
                requestKey: `visitor-session-owner-${activeSession.sessionKey}`
            }
        );
        await pb.collection('visitor_sessions').delete(record.id);
    } catch (e) {
        if (e?.status !== 404) throw e;
    }

    storageRemove(VISITOR_SESSION_KEY);
    return true;
}

/**
 * 오늘 표시용 방문자 최소값을 저장한다. 실제 방문 수보다 낮으면 화면에서는 실제값이 우선된다.
 * @param {string} dayKey
 * @param {number} value
 * @returns {Promise<{dayKey: string, realTotal: number, realToday: number, todayMinimum: number, total: number, today: number}>}
 */
export async function setVisitorTodayMinimum(dayKey, value) {
    const n = Math.max(0, Number.parseInt(value || 0, 10) || 0);
    await setSetting(`${VISITOR_TODAY_MIN_KEY_PREFIX}${dayKey}`, String(n));
    return await getVisitorDisplayStats(dayKey);
}

function readPostViewSessions(now) {
    try {
        const sessions = JSON.parse(storageGet(POST_VIEW_SESSION_KEY) || '{}');
        if (!sessions || typeof sessions !== 'object') return {};

        const active = {};
        Object.entries(sessions).forEach(([postId, session]) => {
            const expiresAt = Number(session?.expiresAt);
            if (!postId || !Number.isFinite(expiresAt) || expiresAt <= now) return;
            active[postId] = { expiresAt };
        });
        return active;
    } catch (e) {
        return {};
    }
}

function savePostViewSessions(sessions) {
    storageSet(POST_VIEW_SESSION_KEY, JSON.stringify(sessions || {}));
}

function postViewCountKey(postId) {
    return `post-view-count-${postId}`;
}

/**
 * 글 상세 조회를 30분 단위 익명 세션으로 기록한다.
 * 로그인한 관리자의 조회는 제품 의도상 집계하지 않는다.
 * @param {object} post
 * @returns {Promise<boolean>} 새 조회로 기록됐으면 true
 */
export async function recordPostView(post) {
    if (isLoggedIn() || !post?.id || post.status !== 'published') return false;

    const now = Date.now();
    const sessions = readPostViewSessions(now);
    if (sessions[post.id]) return false;

    const visitorId = getVisitorId();
    const sessionBucket = Math.floor(now / VISITOR_SESSION_TIMEOUT_MS);
    const viewKey = await sha256(`cwk-post-view-v1:${visitorId}:${post.id}:${sessionBucket}`);

    try {
        await pb.collection('post_views').create({
            view_key: viewKey,
            post_id: post.id,
            post_slug: post.slug || '',
            day_key: getKstDateKey(new Date(now))
        }, {
            requestKey: `post-view-${viewKey}`
        });
    } catch (e) {
        if (e?.status !== 400) {
            console.warn('Post view count failed:', cmsErrorMessage(e));
            return false;
        }
    }

    sessions[post.id] = {
        expiresAt: now + VISITOR_SESSION_TIMEOUT_MS
    };
    savePostViewSessions(sessions);
    return true;
}

/**
 * 관리자 화면에서 여러 글의 조회수를 가져온다.
 * post_views 컬렉션이 아직 운영 DB에 없으면 UI를 깨지 않고 빈 값으로 둔다.
 * @param {string[]} postIds
 * @returns {Promise<Record<string, number>>}
 */
export async function getPostViewCounts(postIds = []) {
    if (!isLoggedIn()) return {};

    const uniquePostIds = Array.from(new Set((postIds || []).filter(Boolean)));
    if (!uniquePostIds.length) return {};

    try {
        const pairs = await Promise.all(uniquePostIds.map(async (postId) => {
            const result = await pb.collection('post_views').getList(1, 1, {
                filter: pb.filter('post_id = {:postId}', { postId }),
                fields: 'id',
                requestKey: postViewCountKey(postId)
            });
            return [postId, result.totalItems || 0];
        }));

        return Object.fromEntries(pairs);
    } catch (e) {
        console.warn('Post view counts failed:', cmsErrorMessage(e));
        return {};
    }
}

// ─────────────────────────────────────────────────────────
// Media 헬퍼 함수들
// ─────────────────────────────────────────────────────────

/**
 * 미디어 업로드
 * @param {File} file
 * @param {string} altText
 * @param {string} caption
 * @returns {Promise<object>}
 */
export async function uploadMedia(file, altText = '', caption = '') {
    const formData = new FormData();
    formData.append('file', file);
    if (altText) formData.append('alt_text', altText);
    if (caption) formData.append('caption', caption);

    try {
        return await pb.collection('media').create(formData);
    } catch (e) {
        if (isAuthExpiredLikeError(e)) {
            pb.authStore.clear();
        }
        throw e;
    }
}

/**
 * 미디어 파일 URL 가져오기
 * @param {object} record
 * @param {string} filename
 * @returns {string}
 */
export function getMediaUrl(record, filename) {
    const getUrl = typeof pb.files.getURL === 'function'
        ? pb.files.getURL
        : pb.files.getUrl;
    return normalizeFileUrl(getUrl.call(pb.files, record, filename));
}

/**
 * 저장되는 본문 HTML에는 로컬 Vite 프록시 주소가 아니라 실제 API 파일 주소가 들어가야 한다.
 * dev:live-cms 모드에서 글을 쓰면 /api 프록시를 쓰지만 공개 사이트는 coldwaterkim.com에서 이미지를 읽는다.
 * @param {string} url
 * @returns {string}
 */
function normalizeFileUrl(url) {
    const fileUrl = String(url || '');
    if (!fileUrl) return fileUrl;

    if (IS_LOCAL_FRONTEND && CMS_TARGET === 'live') {
        const localApiPrefix = `${window.location.origin}/api/files/`;
        if (fileUrl.startsWith(localApiPrefix)) {
            return fileUrl.replace(window.location.origin, LIVE_CMS_URL);
        }
    }

    return fileUrl;
}

/**
 * 미디어 목록 가져오기
 * @param {number} page
 * @param {number} perPage
 * @returns {Promise<object>}
 */
export async function getMediaList(page = 1, perPage = 20) {
    return await pb.collection('media').getList(page, perPage, {
        sort: '-created'
    });
}

/**
 * 미디어 삭제
 * @param {string} id
 * @returns {Promise<boolean>}
 */
export async function deleteMedia(id) {
    return await pb.collection('media').delete(id);
}

// ─────────────────────────────────────────────────────────
// Site Settings 헬퍼 함수들
// ─────────────────────────────────────────────────────────

/**
 * 사이트 설정 가져오기
 * @param {string} key
 * @returns {Promise<string|null>}
 */
export async function getSetting(key) {
    try {
        const record = await pb.collection('site_settings').getFirstListItem(
            pb.filter('key = {:key}', { key })
        );
        return record?.value || null;
    } catch (e) {
        return null;
    }
}

async function getSettingRecord(key) {
    return await pb.collection('site_settings').getFirstListItem(
        pb.filter('key = {:key}', { key })
    );
}

function isNotFoundError(e) {
    return e?.status === 404;
}

function isUniqueConstraintError(e) {
    return e?.status === 400 && Object.values(e?.data?.data || {})
        .some(field => field?.code === 'validation_not_unique');
}

/**
 * 사이트 설정 저장 (upsert)
 * @param {string} key
 * @param {string} value
 * @returns {Promise<object>}
 */
export async function setSetting(key, value) {
    try {
        const existing = await getSettingRecord(key);
        return await pb.collection('site_settings').update(existing.id, { value });
    } catch (e) {
        if (!isNotFoundError(e)) {
            throw e;
        }
    }

    try {
        return await pb.collection('site_settings').create({ key, value });
    } catch (e) {
        if (!isUniqueConstraintError(e)) {
            throw e;
        }

        const existing = await getSettingRecord(key);
        return await pb.collection('site_settings').update(existing.id, { value });
    }
}

// ─────────────────────────────────────────────────────────
// 유틸리티
// ─────────────────────────────────────────────────────────

/**
 * 슬러그 생성
 * @param {string} text
 * @returns {string}
 */
export function slugify(text) {
    return text
        .toString()
        .normalize('NFKD')
        .toLowerCase()
        .replace(/[^\w\s-]/g, '')
        .replace(/[\s_]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .substring(0, 100);
}

/**
 * 날짜 포맷팅
 * @param {string} dateString
 * @returns {string}
 */
export function formatDate(dateString) {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString('ko-KR', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });
}

/**
 * HTML 이스케이프
 * @param {string} str
 * @returns {string}
 */
export function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

/**
 * CMS 연결/인증 실패 메시지 정리
 * @param {unknown} err
 * @returns {string}
 */
export function cmsErrorMessage(err) {
    const message = err?.message || String(err || '');

    if (isInvalidMimeTypeError(err)) {
        return MEDIA_UPLOAD_TYPE_MESSAGE;
    }

    if (
        err?.status === 0
        || /Failed to fetch|NetworkError|Load failed|connection|refused/i.test(message)
    ) {
        if (!IS_LOCAL_FRONTEND) {
            return '글/방명록 서버에 잠시 연결할 수 없습니다. 조금 뒤에 다시 확인해주세요.';
        }

        return CMS_TARGET === 'live'
            ? '운영 CMS에 연결할 수 없습니다. dev:live-cms 프록시나 coldwaterkim.com 상태를 확인해야 합니다.'
            : 'CMS 서버에 연결할 수 없습니다. 로컬에서는 PocketBase를 먼저 실행해야 합니다.';
    }

    if (isAuthExpiredLikeError(err)) {
        return MEDIA_UPLOAD_AUTH_MESSAGE;
    }

    if (err?.status === 404) {
        return 'CMS 컬렉션이나 글을 찾을 수 없습니다. PocketBase 스키마가 설정됐는지 확인해야 합니다.';
    }

    return message || '알 수 없는 CMS 오류가 발생했습니다.';
}

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

import PocketBase from 'https://cdn.jsdelivr.net/npm/pocketbase@0.21.1/dist/pocketbase.es.mjs';

// PocketBase API 경로
// - 로컬 Vite: PocketBase 서버를 127.0.0.1:8090에서 따로 실행
// - 로컬 Vite live CMS 모드: Vite 프록시를 통해 운영 API 서버 사용
// - GitHub Pages: api.coldwaterkim.com의 PocketBase 서버 사용
// - VPS 단일 배포: 같은 도메인의 PocketBase/Nginx 사용
// - 필요하면 HTML에서 window.POCKETBASE_URL로 외부 CMS 주소를 덮어쓸 수 있음
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);
const IS_LOCAL_FRONTEND = LOCAL_HOSTS.has(window.location.hostname);
const LOCAL_API_URL = 'http://127.0.0.1:8090';
const LIVE_CMS_URL = 'https://api.coldwaterkim.com';
const CMS_TARGET = String(import.meta.env?.VITE_CMS_TARGET || '').toLowerCase();
const API_HOSTS = new Map([
    ['coldwaterkim.com', LIVE_CMS_URL],
    ['www.coldwaterkim.com', LIVE_CMS_URL],
    ['coldwaterkimkim.github.io', LIVE_CMS_URL],
]);
const CONFIGURED_API_URL = window.POCKETBASE_URL
    ? String(window.POCKETBASE_URL).replace(/\/+$/, '')
    : '';
const DEFAULT_LOCAL_API_URL = CMS_TARGET === 'live'
    ? window.location.origin
    : LOCAL_API_URL;
const API_URL = CONFIGURED_API_URL
    || (IS_LOCAL_FRONTEND
        ? DEFAULT_LOCAL_API_URL
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

/**
 * 발행된 글 목록 가져오기
 * @param {number} page
 * @param {number} perPage
 * @returns {Promise<object>}
 */
export async function getPublishedPosts(page = 1, perPage = 10) {
    return await pb.collection('posts').getList(page, perPage, {
        filter: pb.filter('status = {:status}', { status: 'published' }),
        sort: '-published_at,-created'
    });
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
        sort: '-created'
    });
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
// 2026-05-30 운영 visitor_sessions 누적 23개를 공개 표시값 237의 기준점으로 삼는다.
const VISITOR_TOTAL_DISPLAY_START = 237;
const VISITOR_TOTAL_BASELINE_REAL_TOTAL = 23;
const VISITOR_TODAY_MIN_KEY_PREFIX = 'visitor_today_min_';

function getKstDateKey(date = new Date()) {
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

async function getVisitorDisplayStats(dayKey) {
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

    return await pb.collection('media').create(formData);
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

export function extractImageUrlsFromHtml(html) {
    const doc = new DOMParser().parseFromString(String(html || ''), 'text/html');
    return Array.from(doc.querySelectorAll('img[src]'))
        .map(img => img.getAttribute('src'))
        .filter(Boolean)
        .filter((url, index, urls) => urls.indexOf(url) === index);
}

export function normalizeFeaturedImageMode(mode) {
    return ['auto', 'selected', 'none'].includes(mode) ? mode : 'auto';
}

export function resolvePostFeaturedImageUrl(post) {
    const mode = normalizeFeaturedImageMode(post?.featured_image_mode);
    if (mode === 'none') return '';

    const contentImages = extractImageUrlsFromHtml(post?.content);
    if (mode === 'selected' && post?.featured_image_url && contentImages.includes(post.featured_image_url)) {
        return post.featured_image_url;
    }

    if (contentImages.length > 0) {
        return contentImages[0];
    }

    if (post?.featured_image) {
        return getMediaUrl(post, post.featured_image);
    }

    return '';
}

/**
 * 저장되는 본문 HTML에는 로컬 Vite 프록시 주소가 아니라 실제 API 파일 주소가 들어가야 한다.
 * dev:live-cms 모드에서 글을 쓰면 /api 프록시를 쓰지만 공개 사이트는 api.coldwaterkim.com에서 이미지를 읽는다.
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

    if (
        err?.status === 0
        || /Failed to fetch|NetworkError|Load failed|connection|refused/i.test(message)
    ) {
        if (!IS_LOCAL_FRONTEND) {
            return '글/방명록 서버에 잠시 연결할 수 없습니다. 조금 뒤에 다시 확인해주세요.';
        }

        return CMS_TARGET === 'live'
            ? '운영 CMS에 연결할 수 없습니다. dev:live-cms 프록시나 api.coldwaterkim.com 상태를 확인해야 합니다.'
            : 'CMS 서버에 연결할 수 없습니다. 로컬에서는 PocketBase를 먼저 실행해야 합니다.';
    }

    if (err?.status === 401 || err?.status === 403) {
        return '권한이 없습니다. 관리자 로그인이 필요하거나 CMS 권한 규칙을 확인해야 합니다.';
    }

    if (err?.status === 404) {
        return 'CMS 컬렉션이나 글을 찾을 수 없습니다. PocketBase 스키마가 설정됐는지 확인해야 합니다.';
    }

    return message || '알 수 없는 CMS 오류가 발생했습니다.';
}

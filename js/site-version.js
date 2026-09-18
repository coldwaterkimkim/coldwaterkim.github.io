const SITE_VERSION = typeof __SITE_VERSION__ !== 'undefined' ? __SITE_VERSION__ : 'dev';
const VERSION_MANIFEST_PATH = '/site-version.json';
const VERSION_CHECK_INTERVAL_MS = 60 * 1000;
const VERSION_CHECK_THROTTLE_MS = 10 * 1000;
let lastVersionCheckAt = 0;
export function initSiteVersionRefresh() {
  if (window.__coldwaterkimVersionRefreshReady) return;
  window.__coldwaterkimVersionRefreshReady = true;
  if (!window.location.origin || window.location.protocol === 'file:') return;

  window.setTimeout(() => {
    checkSiteVersionAndRefresh('load');
  }, 2500);

  window.setInterval(() => {
    checkSiteVersionAndRefresh('interval');
  }, VERSION_CHECK_INTERVAL_MS);

  window.addEventListener('focus', () => {
    checkSiteVersionAndRefresh('focus');
  });

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      checkSiteVersionAndRefresh('visibility');
    }
  });

  window.addEventListener('pageshow', (event) => {
    if (event.persisted) {
      checkSiteVersionAndRefresh('pageshow');
    }
  });
}

async function checkSiteVersionAndRefresh(reason = 'manual') {
  const now = Date.now();
  if (reason !== 'interval' && now - lastVersionCheckAt < VERSION_CHECK_THROTTLE_MS) return;
  lastVersionCheckAt = now;

  try {
    const manifestUrl = new URL(VERSION_MANIFEST_PATH, window.location.origin);
    manifestUrl.searchParams.set('t', String(now));

    const response = await fetch(manifestUrl.href, {
      cache: 'no-store',
      credentials: 'same-origin',
    });
    if (!response.ok) return;

    const manifest = await response.json();
    const latestVersion = String(manifest?.version || '').trim();
    if (!latestVersion || latestVersion === SITE_VERSION) return;

    refreshForSiteVersion(latestVersion);
  } catch (e) {
    // 버전 확인은 편의 기능이다. 실패해도 기존 페이지 읽기는 막지 않는다.
  }
}

function refreshForSiteVersion(latestVersion) {
  if (document.querySelector('[data-version-refresh-block="true"], .rv-editor')) return;

  const refreshKey = `cwk-version-refresh:${SITE_VERSION}->${latestVersion}`;
  try {
    if (sessionStorage.getItem(refreshKey) === '1') return;
    sessionStorage.setItem(refreshKey, '1');
  } catch (e) {
    // sessionStorage가 막힌 브라우저에서도 한 번은 새 URL로 이동한다.
  }

  const nextUrl = new URL(window.location.href);
  if (nextUrl.searchParams.get('v') === latestVersion) return;
  nextUrl.searchParams.set('v', latestVersion);
  window.location.replace(nextUrl.href);
}

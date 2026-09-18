import './motion-preferences.js';
import {initBgmRuntime} from './bgm-runtime.js';
import {initSiteVersionRefresh} from './site-version.js';
import {isLoggedIn,recordVisitAndGetStats,excludeCurrentVisitorSession,initAnonymousAnalytics,trackAnalyticsEvent,analyticsPageKey,cmsErrorMessage} from './pb.js';
function initContentContinuationTracking() {
  document.addEventListener('click', event => {
    const link = event.target.closest('.sketch-content a[href]');
    if (!link || link.hasAttribute('download')) return;
    let targetUrl;
    try {
      targetUrl = new URL(link.href, location.href);
    } catch (_error) {
      return;
    }
    if (targetUrl.origin !== location.origin) return;
    const pageKey = analyticsPageKey();
    const targetKey = analyticsPageKey(targetUrl);
    if (!/^(post|daily|album|nasajab):/.test(pageKey) || targetKey === pageKey) return;
    trackAnalyticsEvent('content_continue', { pageKey, action: 'internal', targetKey })
      .catch(error => console.warn('Continuation analytics failed:', cmsErrorMessage(error)));
  }, true);
}

let initialization;
export function initPublicRuntime() {
  if (initialization) return initialization;
  initialization = (async () => {
    initSiteVersionRefresh();
    initContentContinuationTracking();
    initAnonymousAnalytics().catch(error => console.warn('Analytics failed:',cmsErrorMessage(error)));
    // Visits no longer depend on a hidden retro counter/banner.
    (isLoggedIn() ? excludeCurrentVisitorSession() : recordVisitAndGetStats())
      .catch(error => console.warn('Visit tracking failed:',cmsErrorMessage(error)));
    if(document.querySelector('#guestbookForm')) {
      const {initGuestbookPage}=await import('./guestbook-page.js');
      initGuestbookPage();
    }
    await initBgmRuntime();
  })();
  return initialization;
}
// Records bootstrap calls this after auth refresh; standalone pages use this module directly.
if (!document.querySelector('#records-app')) queueMicrotask(initPublicRuntime);

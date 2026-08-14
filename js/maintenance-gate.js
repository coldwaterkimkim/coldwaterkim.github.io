(function initMaintenanceGate() {
  const productionHosts = new Set(['coldwaterkim.com', 'www.coldwaterkim.com']);
  const search = new URLSearchParams(window.location.search);
  const previewEnabled = search.get('maintenance-preview') === '1';

  if ((!productionHosts.has(window.location.hostname) && !previewEnabled)
      || window.location.pathname === '/maintenance.html') {
    return;
  }

  const root = document.documentElement;
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 2500);
  root.classList.add('maintenance-health-pending');

  fetch('/api/health', {
    cache: 'no-store',
    credentials: 'same-origin',
    headers: { Accept: 'application/json' },
    signal: controller.signal,
  }).then((response) => {
    if (!response.ok) throw new Error(`Health check failed: ${response.status}`);
    root.classList.remove('maintenance-health-pending');
  }).catch(() => {
    root.classList.remove('maintenance-health-pending');
    const returnPath = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    const destination = new URL('/maintenance.html', window.location.origin);
    destination.searchParams.set('return', returnPath);
    if (previewEnabled) destination.searchParams.set('maintenance-preview', '1');
    window.location.replace(destination.href);
  }).finally(() => {
    window.clearTimeout(timeout);
  });
})();

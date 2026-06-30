const args = process.argv.slice(2);
const valueOptions = new Set(['--origin', '--api-origin', '--timeout-ms']);
const flags = new Set();
const options = new Map();

for (let index = 0; index < args.length; index += 1) {
  const arg = args[index];
  if (valueOptions.has(arg)) {
    options.set(arg, args[index + 1] || '');
    index += 1;
  } else if (arg.startsWith('-')) {
    flags.add(arg);
  }
}

const checks = [];
const bannedRuntimePatterns = [
  'https://api.coldwaterkim.com',
  'http://api.coldwaterkim.com',
  'cdn.jsdelivr.net',
];

function usage(exitCode = 0) {
  console.log(`iMac service smoke verifier

Usage:
  node scripts/verify-imac-service-smoke.mjs
  node scripts/verify-imac-service-smoke.mjs --origin http://127.0.0.1:18081

Options:
  --origin <url>       site origin, default: https://coldwaterkim.com
  --api-origin <url>   API origin, default: <origin>/api
  --timeout-ms <ms>    per-request timeout, default: 5000
  --allow-offline      allow connection failures for tooling QA only
`);
  process.exit(exitCode);
}

if (flags.has('-h') || flags.has('--help')) usage(0);

function optionValue(name, fallback = '') {
  return options.get(name) || fallback;
}

function normalizeOrigin(input) {
  return input.replace(/\/+$/, '');
}

const origin = normalizeOrigin(optionValue('--origin', process.env.IMAC_SMOKE_ORIGIN || 'https://coldwaterkim.com'));
const apiOrigin = normalizeOrigin(optionValue('--api-origin', process.env.IMAC_SMOKE_API_ORIGIN || `${origin}/api`));
const timeoutMs = Number(optionValue('--timeout-ms', process.env.IMAC_SMOKE_TIMEOUT_MS || '5000'));
const allowOffline = flags.has('--allow-offline');

if (!Number.isInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 60000) {
  throw new Error(`Invalid --timeout-ms value: ${timeoutMs}`);
}

function record(name, ok, detail = '') {
  checks.push({ name, ok, detail });
}

function routeUrl(base, route) {
  const normalizedRoute = route.replace(/^\/+/, '');
  return new URL(normalizedRoute, `${base.replace(/\/+$/, '')}/`).toString();
}

function isConnectionFailure(error) {
  return error.name === 'AbortError'
    || /fetch failed|ECONNREFUSED|ENOTFOUND|ETIMEDOUT|network/i.test(error.message);
}

async function fetchWithTimeout(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'User-Agent': 'coldwaterkim-imac-smoke/1.0',
      },
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function checkHtmlRoute(route) {
  const url = routeUrl(origin, route);
  try {
    const response = await fetchWithTimeout(url);
    if (!response.ok) {
      record(`site route ${route}`, false, `${response.status} ${response.statusText}`);
      return;
    }

    const contentType = response.headers.get('content-type') || '';
    const body = await response.text();
    const bannedPattern = bannedRuntimePatterns.find(pattern => body.includes(pattern));
    const hasHtml = /html/i.test(contentType) || /<!doctype html|<html/i.test(body);

    record(`site route ${route} responds`, true, `${response.status} ${contentType}`.trim());
    record(`site route ${route} is html`, hasHtml, contentType || 'missing content-type');
    record(`site route ${route} uses home-server API`, !bannedPattern, bannedPattern || 'same-origin safe');
  } catch (error) {
    const allowed = allowOffline && isConnectionFailure(error);
    record(`site route ${route} responds`, allowed, allowed ? `offline allowed: ${error.message}` : error.message);
  }
}

async function checkApiHealth() {
  const url = routeUrl(apiOrigin, '/health');
  try {
    const response = await fetchWithTimeout(url);
    if (!response.ok) {
      record('/api/health responds', false, `${response.status} ${response.statusText}`);
      return;
    }

    const contentType = response.headers.get('content-type') || '';
    const body = await response.text();
    let parsed = null;
    try {
      parsed = body ? JSON.parse(body) : null;
    } catch {
      // handled below
    }

    record('/api/health responds', true, `${response.status} ${contentType}`.trim());
    record('/api/health is PocketBase health JSON', Boolean(parsed) && (parsed.code === 200 || /healthy/i.test(parsed.message || '')), body.slice(0, 120));
  } catch (error) {
    const allowed = allowOffline && isConnectionFailure(error);
    record('/api/health responds', allowed, allowed ? `offline allowed: ${error.message}` : error.message);
  }
}

async function checkAdminProxy() {
  const url = routeUrl(origin, '/_/');
  try {
    const response = await fetchWithTimeout(url);
    const allowedStatus = response.ok || response.status === 401 || response.status === 403;
    record('/_/ admin proxy responds', allowedStatus, `${response.status} ${response.statusText}`);
  } catch (error) {
    const allowed = allowOffline && isConnectionFailure(error);
    record('/_/ admin proxy responds', allowed, allowed ? `offline allowed: ${error.message}` : error.message);
  }
}

function printSummary() {
  const failed = checks.filter(check => !check.ok);
  for (const check of checks) {
    const status = check.ok ? 'ok' : 'FAIL';
    console.log(`${status}  ${check.name}${check.detail ? ` - ${check.detail}` : ''}`);
  }

  if (failed.length) {
    console.error(`iMac service smoke verification failed (${failed.length}/${checks.length})`);
    process.exitCode = 1;
    return;
  }

  console.log(`iMac service smoke verification passed (${checks.length} checks)`);
}

async function main() {
  if (!/^https?:\/\//.test(origin)) throw new Error(`Invalid --origin: ${origin}`);
  if (!/^https?:\/\//.test(apiOrigin)) throw new Error(`Invalid --api-origin: ${apiOrigin}`);

  for (const route of ['/', '/posts/', '/daily/', '/programs/', '/nasajab/', '/guestbook.html', '/about.html']) {
    await checkHtmlRoute(route);
  }
  await checkApiHealth();
  await checkAdminProxy();
  printSummary();
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});

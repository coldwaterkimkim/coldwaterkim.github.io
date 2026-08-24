import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const args = new Set(process.argv.slice(2));
const apply = args.has('--apply');
const statePath = path.resolve(
  process.env.MEDIA_LAB_STATE || '/Users/kimchansu/Code/coldwaterkim-media-lab/data/review-state.json',
);

function expandHome(value) {
  if (value === '~') return os.homedir();
  if (value?.startsWith('~/')) return path.join(os.homedir(), value.slice(2));
  return value;
}

function parseEnvFile(file) {
  if (!file || !fs.existsSync(file)) return {};
  const output = {};
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = line.trim().match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match || line.trim().startsWith('#')) continue;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    output[match[1]] = value;
  }
  return output;
}

function environment() {
  const envFile = expandHome(process.env.PB_ADMIN_ENV_FILE || '~/.config/coldwaterkim/pocketbase-admin.env');
  return { ...parseEnvFile(envFile), ...process.env, PB_ADMIN_ENV_FILE: envFile };
}

function normalizeBaseUrl(value) {
  return String(value || '').replace(/\/+$/, '');
}

async function responseError(response) {
  const text = await response.text();
  try {
    return JSON.parse(text).message || text;
  } catch {
    return text;
  }
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, options);
  if (!response.ok) throw new Error(`${options.method || 'GET'} ${url}: ${response.status} ${await responseError(response)}`);
  const text = await response.text();
  return text ? JSON.parse(text) : {};
}

async function authenticate(baseUrl, identity, password) {
  const common = {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ identity, password }),
  };
  for (const endpoint of ['/api/collections/_superusers/auth-with-password', '/api/admins/auth-with-password']) {
    const response = await fetch(`${baseUrl}${endpoint}`, common);
    if (response.ok) return (await response.json()).token;
    if (![400, 401, 403, 404].includes(response.status)) {
      throw new Error(`Authentication failed: ${response.status} ${await responseError(response)}`);
    }
  }
  throw new Error('PocketBase superuser authentication failed.');
}

async function collectAlbumKeys(baseUrl) {
  const keys = new Set();
  let page = 1;
  while (true) {
    const url = new URL('/api/collections/album_items/records', baseUrl);
    url.searchParams.set('page', String(page));
    url.searchParams.set('perPage', '200');
    url.searchParams.set('fields', 'media,file_collection');
    const result = await requestJson(url);
    for (const item of result.items || []) keys.add(`${item.file_collection || 'media'}:${item.media}`);
    if (!result.totalPages || page >= result.totalPages) break;
    page += 1;
  }
  return keys;
}

async function collectSourceKeys(baseUrl) {
  const keys = new Set();
  for (const collection of ['media', 'nasajab']) {
    let page = 1;
    while (true) {
      const url = new URL(`/api/collections/${collection}/records`, baseUrl);
      url.searchParams.set('page', String(page));
      url.searchParams.set('perPage', '200');
      url.searchParams.set('fields', 'id');
      const result = await requestJson(url);
      for (const item of result.items || []) keys.add(`${collection}:${item.id}`);
      if (!result.totalPages || page >= result.totalPages) break;
      page += 1;
    }
  }
  return keys;
}

function loadPlan() {
  const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
  if (!Array.isArray(state.labels) || !state.reviews || typeof state.reviews !== 'object') {
    throw new Error('Media lab state is missing labels or reviews.');
  }
  const labelSet = new Set(state.labels);
  const keysByLabel = new Map(state.labels.map(label => [label, []]));
  for (const [mediaKey, review] of Object.entries(state.reviews)) {
    for (const label of review.labels || []) {
      if (!labelSet.has(label)) throw new Error(`Review references an unknown label: ${label}`);
      keysByLabel.get(label).push(mediaKey);
    }
  }
  return {
    labels: state.labels,
    keysByLabel,
    reviewedMedia: Object.keys(state.reviews).length,
    assignments: [...keysByLabel.values()].reduce((sum, keys) => sum + keys.length, 0),
  };
}

async function getTagSummary(baseUrl) {
  const url = new URL('/api/collections/album_tag_summary/records', baseUrl);
  url.searchParams.set('page', '1');
  url.searchParams.set('perPage', '200');
  url.searchParams.set('sort', 'position,created');
  url.searchParams.set('fields', 'id,name,position,assignment_count');
  return (await requestJson(url)).items || [];
}

async function ownerRequest(baseUrl, token, pathname, method, body) {
  return requestJson(`${baseUrl}${pathname}`, {
    method,
    headers: {
      authorization: token,
      ...(body ? { 'content-type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

async function main() {
  const env = environment();
  const baseUrl = normalizeBaseUrl(env.PB_URL || 'https://coldwaterkim.com');
  const plan = loadPlan();
  const [albumKeys, sourceKeys] = await Promise.all([collectAlbumKeys(baseUrl), collectSourceKeys(baseUrl)]);
  const plannedKeys = new Set([...plan.keysByLabel.values()].flat());
  const outsidePublicAlbum = [...plannedKeys].filter(key => !albumKeys.has(key));
  const missing = [...plannedKeys].filter(key => !sourceKeys.has(key));
  const report = {
    mode: apply ? 'apply' : 'dry-run',
    source: statePath,
    target: baseUrl,
    albumItems: albumKeys.size,
    labels: plan.labels,
    reviewedMedia: plan.reviewedMedia,
    assignments: plan.assignments,
    counts: Object.fromEntries([...plan.keysByLabel].map(([label, keys]) => [label, keys.length])),
    outsidePublicAlbum,
    missingSourceKeys: missing,
  };
  console.log(JSON.stringify(report, null, 2));
  if (missing.length) throw new Error(`Import blocked: ${missing.length} media source records do not exist.`);
  if (!apply) return;

  const identity = env.PB_ADMIN_EMAIL || env.POCKETBASE_ADMIN_EMAIL;
  const password = env.PB_ADMIN_PASSWORD || env.POCKETBASE_ADMIN_PASSWORD;
  if (!identity || !password) throw new Error(`Missing PocketBase credentials in ${env.PB_ADMIN_ENV_FILE}`);
  const token = await authenticate(baseUrl, identity, password);
  const tagsByName = new Map((await getTagSummary(baseUrl)).map(tag => [tag.name, tag]));
  for (const name of plan.labels) {
    if (tagsByName.has(name)) continue;
    const tag = await ownerRequest(baseUrl, token, '/api/cwk/album/tags', 'POST', { name });
    tagsByName.set(name, tag);
  }
  for (const [name, mediaKeys] of plan.keysByLabel) {
    if (!mediaKeys.length) continue;
    await ownerRequest(baseUrl, token, '/api/cwk/album/tags/batch', 'POST', {
      media_keys: mediaKeys,
      tag_id: tagsByName.get(name).id,
      action: 'add',
    });
  }

  const verified = new Map((await getTagSummary(baseUrl)).map(tag => [tag.name, Number(tag.assignment_count) || 0]));
  const mismatches = [];
  for (const [name, mediaKeys] of plan.keysByLabel) {
    if (verified.get(name) !== mediaKeys.length) mismatches.push(`${name}: expected ${mediaKeys.length}, got ${verified.get(name)}`);
  }
  if (mismatches.length) throw new Error(`Import verification failed: ${mismatches.join('; ')}`);
  console.log(`Album tag import verified: ${plan.labels.length} tags, ${plan.reviewedMedia} media, ${plan.assignments} assignments.`);
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});

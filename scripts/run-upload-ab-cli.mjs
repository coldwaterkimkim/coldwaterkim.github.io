import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import { basename, extname } from 'node:path';
import Uppy from '@uppy/core';
import Tus from '@uppy/tus';

const MIB = 1024 * 1024;
const DEFAULT_SIZE_MIB = 300;
const DEFAULT_VARIANTS = [3, 6, 8];
const DEFAULT_ROUNDS = 2;
const DEFAULT_COOLDOWN_MS = 1500;

const origin = String(process.env.CWK_TUS_QA_ORIGIN || '').replace(/\/+$/, '');
const identity = String(process.env.CWK_TUS_QA_ID || '');
const password = String(process.env.CWK_TUS_QA_PASSWORD || '');
const sourceFilePath = String(process.env.CWK_TUS_AB_FILE || '').trim();
const clientLabel = normalizeClientLabel(process.env.CWK_TUS_AB_CLIENT);
let token = String(process.env.CWK_TUS_QA_TOKEN || '');
let ownerId = String(process.env.CWK_TUS_QA_OWNER_ID || '');

assert.ok(origin, 'CWK_TUS_QA_ORIGIN is required');
const originUrl = new URL(origin);
assert.equal(originUrl.protocol, 'https:', 'OWNER credentials may only be sent over HTTPS');
assert.equal(originUrl.hostname, 'coldwaterkim.com', 'OWNER credentials may only be sent to coldwaterkim.com');
assert.equal(originUrl.port, '', 'OWNER credentials may only be sent to the standard HTTPS origin');
assert.ok(token || (identity && password), 'provide a token/owner id or CWK_TUS_QA_ID and CWK_TUS_QA_PASSWORD');

if (!token) {
  const authResponse = await fetch(`${origin}/api/collections/users/auth-with-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identity, password }),
  });
  assert.equal(authResponse.ok, true, `OWNER authentication failed (${authResponse.status})`);
  const auth = await authResponse.json();
  token = String(auth?.token || '');
  ownerId = String(auth?.record?.id || '');
}

assert.ok(token, 'OWNER token is required');
assert.ok(ownerId, 'OWNER record id is required');

const rounds = boundedInteger(process.env.CWK_TUS_AB_ROUNDS, DEFAULT_ROUNDS, 1, 2);
const cooldownMs = boundedInteger(process.env.CWK_TUS_AB_COOLDOWN_MS, DEFAULT_COOLDOWN_MS, 0, 30_000);
const variants = parseVariants(process.env.CWK_TUS_AB_VARIANTS);
const sequence = rounds === 1 ? [...variants] : [...variants, ...[...variants].reverse()];
const sourceFileName = sourceFilePath ? basename(sourceFilePath) : '';
const sourceFileType = mediaTypeForFile(sourceFileName);
const sizeMiB = sourceFilePath ? null : boundedInteger(process.env.CWK_TUS_AB_SIZE_MIB, DEFAULT_SIZE_MIB, 64, 1024);
const fileBytes = sourceFilePath ? statSync(sourceFilePath).size : sizeMiB * MIB;
assert.ok(fileBytes >= 64 * MIB && fileBytes <= 1024 * MIB, 'A/B source must be between 64MiB and 1024MiB');

const statusResponse = await fetch(`${origin}/api/cwk/tus/status`, {
  headers: { Authorization: token },
  cache: 'no-store',
});
assert.equal(statusResponse.ok, true, `tus status failed (${statusResponse.status})`);
const capability = await statusResponse.json();
assert.equal(capability?.available, true, 'tus must be available');
assert.equal(capability?.protocol, 'tus-1.0.0', 'tus protocol must be 1.0.0');
assert.ok(Number(capability?.max_parallel_uploads || 0) >= Math.max(...variants), 'server does not allow every requested parallel variant');
assert.ok(Number(capability?.max_size || 0) >= fileBytes, 'file exceeds the server max size');
assert.ok(Number(capability?.safe_upload_bytes || 0) >= fileBytes, 'file exceeds the current safe upload capacity');

const chunkSize = normalizeChunkSize(capability?.chunk_size);
const source = sourceFilePath ? readFileSync(sourceFilePath) : Buffer.alloc(fileBytes);
Object.defineProperty(source, 'size', { value: source.byteLength });
const report = {
  schemaVersion: 1,
  kind: 'coldwaterkim-imac-tus-ab-cli',
  origin,
  startedAt: new Date().toISOString(),
  completedAt: null,
  clientLabel,
  sourceKind: sourceFilePath ? 'file' : 'generated-buffer',
  sourceFileName: sourceFileName || null,
  fileBytes,
  chunkBytes: chunkSize,
  rounds,
  sequence,
  runs: [],
  summary: [],
};

for (let index = 0; index < sequence.length; index += 1) {
  const parallelUploads = sequence[index];
  console.error(`[${index + 1}/${sequence.length}] ${parallelUploads}-way starting`);
  const run = await runVariant({
    source,
    parallelUploads,
    chunkSize,
    runNumber: index + 1,
    fileName: sourceFileName || `cwk-imac-ab-${fileBytes}.bin`,
    fileType: sourceFileType || 'application/octet-stream',
  });
  report.runs.push(run);
  console.error(`[${index + 1}/${sequence.length}] ${parallelUploads}-way ${run.averageMBPerSecond.toFixed(3)}MB/s cleanup=${run.cleanupComplete}`);
  if (index < sequence.length - 1 && cooldownMs > 0) await delay(cooldownMs);
}

report.completedAt = new Date().toISOString();
report.summary = summarizeRuns(report.runs, variants);
console.log(JSON.stringify(report, null, 2));

async function runVariant({ source, parallelUploads, chunkSize, runNumber, fileName, fileType }) {
  const sessionId = `cwk-ab-${parallelUploads}w-${clientLabel}-${randomUUID().replaceAll('-', '').slice(0, 16)}`;
  const createdUrls = new Set();
  const requestState = new WeakMap();
  const offsets = new Map();
  const patchKeys = new Map();
  const statuses = [];
  let acceptedBytes = 0;
  let firstPatchStartedAt = 0;
  let lastAcceptedOffsetObservedAt = 0;
  let patchRequestCount = 0;
  let completedChunkCount = 0;
  let finalUrl = '';
  let finalOffset = 0;
  let runError = null;
  const wallStartedAt = performance.now();

  const uppy = new Uppy({
    autoProceed: false,
    restrictions: { maxNumberOfFiles: 1, maxFileSize: 20 * 1024 * MIB },
  });

  uppy.use(Tus, {
    endpoint: `${origin}/api/cwk/tus/files/`,
    headers: () => ({ Authorization: token }),
    retryDelays: [0, 1000, 3000, 5000, 10_000, 20_000],
    removeFingerprintOnSuccess: true,
    storeFingerprintForResuming: false,
    allowedMetaFields: ['name', 'type', 'owner_id', 'upload_session'],
    parallelUploads,
    chunkSize,
    limit: 1,
    onBeforeRequest(request) {
      request.setHeader('X-Request-ID', sessionId);
      const method = String(request.getMethod?.() || '').toUpperCase();
      const resourceUrl = normalizeTusUrl(request.getURL?.());
      const uploadOffset = Number(request.getHeader?.('Upload-Offset') || 0);
      const startedAt = performance.now();
      requestState.set(request, { method, resourceUrl, startedAt });
      if (method !== 'PATCH') return;
      patchRequestCount += 1;
      if (!firstPatchStartedAt) firstPatchStartedAt = startedAt;
      const key = `${resourceUrl}@${uploadOffset}`;
      patchKeys.set(key, (patchKeys.get(key) || 0) + 1);
      const state = offsets.get(resourceUrl) || { hasPatch: false, initialOffset: null, lastObservedOffset: 0 };
      if (state.initialOffset === null) state.initialOffset = uploadOffset;
      state.lastObservedOffset = Math.max(state.lastObservedOffset, uploadOffset);
      state.hasPatch = true;
      offsets.set(resourceUrl, state);
    },
    onAfterResponse(request, response) {
      const observedAt = performance.now();
      const requestInfo = requestState.get(request) || {
        method: String(request.getMethod?.() || '').toUpperCase(),
        resourceUrl: normalizeTusUrl(request.getURL?.()),
      };
      const status = Number(response.getStatus?.() || 0);
      const responseOffset = Number(response.getHeader?.('Upload-Offset') || 0);
      const location = normalizeTusUrl(response.getHeader?.('Location'));
      statuses.push(status);
      if (location) createdUrls.add(location);
      if ((requestInfo.method === 'PATCH' || requestInfo.method === 'HEAD') && requestInfo.resourceUrl) {
        const state = offsets.get(requestInfo.resourceUrl) || { hasPatch: false, initialOffset: null, lastObservedOffset: 0 };
        if (!state.hasPatch && state.initialOffset === null) state.initialOffset = responseOffset;
        if (state.hasPatch && responseOffset > state.lastObservedOffset) {
          acceptedBytes += responseOffset - state.lastObservedOffset;
          lastAcceptedOffsetObservedAt = observedAt;
        }
        state.lastObservedOffset = Math.max(state.lastObservedOffset, responseOffset);
        offsets.set(requestInfo.resourceUrl, state);
      }
    },
    onChunkComplete() {
      completedChunkCount += 1;
    },
  });

  const fileId = uppy.addFile({
    name: fileName,
    type: fileType,
    data: source,
    meta: { owner_id: ownerId, upload_session: sessionId },
  });

  try {
    const result = await uppy.upload();
    const failed = result?.failed?.[0];
    if (failed) throw failed.error || new Error('Uppy tus upload failed');
    const uploaded = result?.successful?.[0] || uppy.getFile(fileId);
    finalUrl = normalizeTusUrl(uploaded?.response?.uploadURL || uploaded?.uploadURL || uploaded?.tus?.uploadUrl);
    assert.ok(finalUrl, 'final tus URL is required');
    createdUrls.add(finalUrl);
    finalOffset = await readOffset(finalUrl, sessionId);
    assert.equal(acceptedBytes, fileBytes, 'accepted PATCH bytes must equal the source size');
    assert.equal(finalOffset, fileBytes, 'final tus offset must equal the source size');
  } catch (error) {
    runError = error;
  } finally {
    uppy.destroy();
  }

  const cleanup = await cleanupResources(createdUrls, sessionId);
  const wallCompletedAt = performance.now();
  const patchSeconds = firstPatchStartedAt && lastAcceptedOffsetObservedAt
    ? Math.max((lastAcceptedOffsetObservedAt - firstPatchStartedAt) / 1000, 0.001)
    : 0;
  const run = {
    runNumber,
    parallelUploads,
    sessionId,
    fileBytes,
    acceptedBytes,
    finalOffset,
    patchSeconds,
    wallSeconds: Math.max((wallCompletedAt - wallStartedAt) / 1000, 0.001),
    averageMBPerSecond: patchSeconds > 0 ? (acceptedBytes / 1_000_000) / patchSeconds : 0,
    averageMiBPerSecond: patchSeconds > 0 ? (acceptedBytes / MIB) / patchSeconds : 0,
    patchRequestCount,
    completedChunkCount,
    retryOrReplayCount: Array.from(patchKeys.values()).reduce((total, count) => total + Math.max(0, count - 1), 0),
    nonSuccessResponseCount: statuses.filter(status => status < 200 || status >= 300).length,
    responseCount: statuses.length,
    cleanupResourceCount: cleanup.statuses.length,
    cleanupStatuses: cleanup.statuses,
    cleanupComplete: cleanup.complete,
  };

  if (runError) throw new Error(`${parallelUploads}-way failed: ${runError.message || runError}; cleanup=${JSON.stringify(cleanup.statuses)}`);
  assert.equal(cleanup.complete, true, `${parallelUploads}-way staging cleanup must complete`);
  return run;
}

async function readOffset(url, sessionId) {
  const response = await fetch(url, {
    method: 'HEAD',
    headers: { Authorization: token, 'Tus-Resumable': '1.0.0', 'X-Request-ID': sessionId },
    cache: 'no-store',
  });
  assert.equal(response.ok, true, `final HEAD failed (${response.status})`);
  return Number(response.headers.get('Upload-Offset') || 0);
}

async function cleanupResources(urls, sessionId) {
  const statuses = [];
  for (const url of Array.from(urls).reverse()) {
    try {
      const response = await deleteWithRetry(url, sessionId);
      statuses.push({ resourceId: resourceId(url), status: response.status });
    } catch (error) {
      statuses.push({ resourceId: resourceId(url), status: 0, error: String(error?.message || error) });
    }
  }
  return {
    statuses,
    complete: statuses.length > 0 && statuses.every(item => item.status === 204 || item.status === 404),
  };
}

async function deleteWithRetry(url, sessionId) {
  let lastResponse = null;
  let lastError = null;
  for (const delayMs of [0, 250, 1000, 3000]) {
    if (delayMs > 0) await delay(delayMs);
    try {
      const response = await fetch(url, {
        method: 'DELETE',
        headers: { Authorization: token, 'Tus-Resumable': '1.0.0', 'X-Request-ID': sessionId },
      });
      lastResponse = response;
      if (response.status === 204 || response.status === 404) return response;
      if (![409, 423, 429].includes(response.status) && response.status < 500) return response;
    } catch (error) {
      lastError = error;
    }
  }
  if (lastResponse) return lastResponse;
  throw lastError || new Error('tus resource cleanup failed');
}

function normalizeTusUrl(value) {
  if (!value) return '';
  try {
    const base = new URL(`${origin}/api/cwk/tus/files/`);
    const url = new URL(String(value), base);
    if (url.origin !== base.origin || !url.pathname.startsWith(base.pathname)) return '';
    const id = resourceId(url.href);
    if (!/^[A-Za-z0-9._+~-]{10,512}$/.test(id) || id.includes('..')) return '';
    url.search = '';
    url.hash = '';
    return url.href;
  } catch {
    return '';
  }
}

function resourceId(value) {
  try {
    return decodeURIComponent(new URL(String(value), origin).pathname.split('/').filter(Boolean).at(-1) || '');
  } catch {
    return '';
  }
}

function normalizeChunkSize(value) {
  const bytes = Number(value || 0);
  return Number.isFinite(bytes) && bytes >= 8 * MIB && bytes <= 128 * MIB ? Math.round(bytes) : 32 * MIB;
}

function parseVariants(value) {
  const parsed = String(value || DEFAULT_VARIANTS.join(','))
    .split(',')
    .map(item => Number(item.trim()))
    .filter(item => Number.isInteger(item) && item >= 1 && item <= 8);
  assert.ok(parsed.length > 0, 'CWK_TUS_AB_VARIANTS must include at least one integer from 1 to 8');
  return [...new Set(parsed)];
}

function boundedInteger(value, fallback, minimum, maximum) {
  const parsed = Number(value || fallback);
  assert.equal(Number.isInteger(parsed) && parsed >= minimum && parsed <= maximum, true, `expected integer ${minimum}..${maximum}`);
  return parsed;
}

function normalizeClientLabel(value) {
  const normalized = String(value || 'imac').trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');
  return normalized || 'client';
}

function mediaTypeForFile(fileName) {
  switch (extname(fileName).toLowerCase()) {
    case '.mp4': return 'video/mp4';
    case '.mov': return 'video/quicktime';
    case '.m4v': return 'video/x-m4v';
    case '.webm': return 'video/webm';
    default: return '';
  }
}

function summarizeRuns(runs, requestedVariants) {
  return requestedVariants.map(parallelUploads => {
    const matching = runs.filter(run => run.parallelUploads === parallelUploads);
    const speeds = matching.map(run => run.averageMBPerSecond).sort((left, right) => left - right);
    return {
      parallelUploads,
      completedRuns: matching.length,
      medianMBPerSecond: median(speeds),
      minimumMBPerSecond: speeds[0] || 0,
      maximumMBPerSecond: speeds.at(-1) || 0,
    };
  });
}

function median(values) {
  if (!values.length) return 0;
  const middle = Math.floor(values.length / 2);
  return values.length % 2 ? values[middle] : (values[middle - 1] + values[middle]) / 2;
}

function delay(milliseconds) {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

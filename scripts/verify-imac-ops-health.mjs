#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import tls from 'node:tls';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const GIB = 1024 ** 3;
const MIB = 1024 ** 2;
const SAFE_JSON_LIMIT = 64 * 1024;
const MAX_BACKUP_MANIFEST_BYTES = 8 * MIB;
const MAX_BACKUP_SNAPSHOT_BYTES = 4 * GIB;
const MAX_BACKUP_ORIGINALS = 100_000;
const MAX_RUNTIME_BINARY_BYTES = 256 * MIB;
const MAX_MIGRATION_FILES = 4096;
const MAX_MIGRATION_ENTRIES = 8192;
const MAX_MIGRATION_TREE_BYTES = 64 * MIB;
const MAX_MIGRATION_DEPTH = 16;
const MAX_REPEATABLE_TARGETS = 32;
const HASH_CHUNK_BYTES = MIB;
const NETWORK_ERROR_CODES = new Set([
  'EAI_AGAIN', 'ECONNREFUSED', 'ECONNRESET', 'EHOSTUNREACH',
  'ENETDOWN', 'ENETUNREACH', 'ENOTFOUND', 'ETIMEDOUT',
]);
const DEFAULT_LABELS = [
  'com.coldwaterkim.pocketbase',
  'com.coldwaterkim.caddy',
  'com.coldwaterkim.pocketbase-backup',
];
const DEFAULT_LAUNCHD_NAMES = ['PocketBase launchd', 'Caddy launchd', 'backup launchd'];
const CONTINUOUS_JOB_STATES = new Set(['running']);
const SCHEDULED_JOB_STATES = new Set(['running', 'not running', 'waiting', 'idle', 'exited']);
const DEFAULT_LOG_NAMES = [
  'PocketBase stdout log',
  'PocketBase stderr log',
  'Caddy stdout log',
  'Caddy stderr log',
  'backup stdout log',
  'backup stderr log',
];

class UsageError extends Error {}

function usage() {
  console.log(`Read-only iMac production health audit

Usage:
  node scripts/verify-imac-ops-health.mjs [options]

Modes:
  (default)                 inspect the local iMac and public endpoint read-only
  --tooling                 never access live network, TLS, launchd, or host files
  --fixture <json>          use deterministic fixture data; implies --tooling

Targets and thresholds:
  --local-health-url <url>  local /api/health endpoint
  --public-health-url <url> public HTTPS /api/health endpoint
  --launchd-label <label>   expected system job; repeatable
  --backup-status <path>    incremental latest-success.json
  --backup-max-age-hours <n>  default: 26
  --disk-path <path>        filesystem whose free capacity is checked
  --disk-min-gib <n>        absolute reserve, default: 20
  --disk-min-percent <n>    percentage reserve, default: 10
  --log-file <path>         log file to size-check; repeatable
  --log-max-mib <n>         default: 100
  --tls-host <host>         certificate endpoint
  --tls-port <n>            default: 443
  --tls-min-days <n>        minimum remaining validity, default: 21
  --runtime-manifest <path> PocketBase release manifest
  --runtime-binary <path>   installed PocketBase binary
  --runtime-migrations <path> installed migration tree
  --timeout-ms <n>          per live probe, default: 5000
  --json                    machine-readable, secret-free summary

Launchd policy:
  PocketBase and Caddy PASS only while running. The default scheduled backup
  may also be cleanly idle. Custom labels are conservatively treated as
  continuously running jobs, so any state other than running is FAIL.

Status and exit-code contract:
  PASS    observed state meets the threshold
  FAIL    observed state violates the threshold
  UNKNOWN required state was missing, skipped, or unreadable
  0       every check PASS
  1       at least one check FAIL
  2       no FAIL, but at least one UNKNOWN
  64      invalid command or fixture configuration

This tool does not change files, restart services, or send external alerts.`);
}

function parseNumber(value, { min, max, integer = false }) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max || (integer && !Number.isInteger(parsed))) {
    throw new UsageError('invalid numeric option');
  }
  return parsed;
}

function requireValue(args, index) {
  const value = args[index + 1];
  if (!value || value.startsWith('--')) throw new UsageError('missing option value');
  return value;
}

function parseArgs(args) {
  const runtimeRoot = path.join(os.homedir(), '.local', 'share', 'coldwaterkim', 'home-server');
  const options = {
    tooling: false,
    fixture: null,
    json: false,
    localHealthUrl: 'http://127.0.0.1:8090/api/health',
    publicHealthUrl: 'https://coldwaterkim.com/api/health',
    launchdLabels: [...DEFAULT_LABELS],
    backupStatus: path.join(os.homedir(), 'Backups', 'coldwaterkim-pocketbase', 'incremental', 'latest-success.json'),
    backupMaxAgeHours: 26,
    diskPath: path.join(runtimeRoot, 'pb_data'),
    diskMinGiB: 20,
    diskMinPercent: 10,
    logFiles: [
      path.join(os.homedir(), 'Library', 'Logs', 'coldwaterkim-pocketbase.log'),
      path.join(os.homedir(), 'Library', 'Logs', 'coldwaterkim-pocketbase.err.log'),
      path.join(os.homedir(), 'Library', 'Logs', 'coldwaterkim-caddy.log'),
      path.join(os.homedir(), 'Library', 'Logs', 'coldwaterkim-caddy.err.log'),
      path.join(os.homedir(), 'Library', 'Logs', 'coldwaterkim-pocketbase-backup.log'),
      path.join(os.homedir(), 'Library', 'Logs', 'coldwaterkim-pocketbase-backup.err.log'),
    ],
    logMaxMiB: 100,
    tlsHost: 'coldwaterkim.com',
    tlsPort: 443,
    tlsMinDays: 21,
    runtimeManifest: path.join(runtimeRoot, 'pocketbase-release.json'),
    runtimeBinary: path.join(runtimeRoot, 'bin', 'pocketbase'),
    runtimeMigrations: path.join(runtimeRoot, 'pb_migrations'),
    timeoutMs: 5000,
  };
  let customLabels = false;
  let customLogs = false;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '-h' || arg === '--help') return { help: true };
    if (arg === '--tooling') {
      options.tooling = true;
      continue;
    }
    if (arg === '--json') {
      options.json = true;
      continue;
    }

    const value = requireValue(args, index);
    index += 1;
    switch (arg) {
      case '--fixture':
        options.fixture = value;
        options.tooling = true;
        break;
      case '--local-health-url': options.localHealthUrl = value; break;
      case '--public-health-url': options.publicHealthUrl = value; break;
      case '--launchd-label':
        if (!customLabels) options.launchdLabels = [];
        customLabels = true;
        options.launchdLabels.push(value);
        break;
      case '--backup-status': options.backupStatus = value; break;
      case '--backup-max-age-hours': options.backupMaxAgeHours = parseNumber(value, { min: 1, max: 720 }); break;
      case '--disk-path': options.diskPath = value; break;
      case '--disk-min-gib': options.diskMinGiB = parseNumber(value, { min: 1, max: 4096 }); break;
      case '--disk-min-percent': options.diskMinPercent = parseNumber(value, { min: 1, max: 99 }); break;
      case '--log-file':
        if (!customLogs) options.logFiles = [];
        customLogs = true;
        options.logFiles.push(value);
        break;
      case '--log-max-mib': options.logMaxMiB = parseNumber(value, { min: 1, max: 1_000_000 }); break;
      case '--tls-host': options.tlsHost = value; break;
      case '--tls-port': options.tlsPort = parseNumber(value, { min: 1, max: 65535, integer: true }); break;
      case '--tls-min-days': options.tlsMinDays = parseNumber(value, { min: 1, max: 365 }); break;
      case '--runtime-manifest': options.runtimeManifest = value; break;
      case '--runtime-binary': options.runtimeBinary = value; break;
      case '--runtime-migrations': options.runtimeMigrations = value; break;
      case '--timeout-ms': options.timeoutMs = parseNumber(value, { min: 500, max: 60_000, integer: true }); break;
      default: throw new UsageError('unknown option');
    }
  }

  validateHealthUrl(options.localHealthUrl, false);
  validateHealthUrl(options.publicHealthUrl, true);
  if (!options.launchdLabels.length
    || options.launchdLabels.length > MAX_REPEATABLE_TARGETS
    || options.launchdLabels.some(label => !/^[A-Za-z0-9._-]{1,128}$/.test(label))) {
    throw new UsageError('invalid launchd label');
  }
  if (!options.logFiles.length
    || options.logFiles.length > MAX_REPEATABLE_TARGETS
    || options.logFiles.some(file => file.length > 4096)) throw new UsageError('invalid log targets');
  if (!/^[A-Za-z0-9.-]+$/.test(options.tlsHost)) throw new UsageError('invalid TLS host');
  options.customLabels = customLabels;
  options.customLogs = customLogs;
  return options;
}

function validateHealthUrl(value, requireHttps) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new UsageError('invalid health URL');
  }
  if ((requireHttps && parsed.protocol !== 'https:')
    || (!requireHttps && !['http:', 'https:'].includes(parsed.protocol))
    || parsed.username || parsed.password || parsed.pathname !== '/api/health'
    || parsed.search || parsed.hash) {
    throw new UsageError('invalid health URL');
  }
}

function openRegularFile(file, maxBytes) {
  const flags = fs.constants.O_RDONLY
    | (fs.constants.O_NOFOLLOW || 0)
    | (fs.constants.O_NONBLOCK || 0);
  const descriptor = fs.openSync(file, flags);
  try {
    const stat = fs.fstatSync(descriptor);
    if (!stat.isFile() || stat.size < 0 || stat.size > maxBytes) {
      throw new Error('invalid regular file');
    }
    return { descriptor, size: stat.size };
  } catch (error) {
    fs.closeSync(descriptor);
    throw error;
  }
}

function readBoundedJson(file, maxBytes = SAFE_JSON_LIMIT) {
  const { descriptor, size } = openRegularFile(file, maxBytes);
  const buffer = Buffer.alloc(size + 1);
  let total = 0;
  try {
    while (total <= size) {
      const bytesRead = fs.readSync(descriptor, buffer, total, buffer.length - total, null);
      if (bytesRead === 0) break;
      total += bytesRead;
      if (total > size) throw new Error('JSON file changed while reading');
    }
  } finally {
    fs.closeSync(descriptor);
  }
  return JSON.parse(buffer.subarray(0, total).toString('utf8'));
}

function readSmallJson(file) {
  return readBoundedJson(file, SAFE_JSON_LIMIT);
}

function safeIsoDate(value) {
  if (typeof value !== 'string') return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  return date;
}

function rounded(value, digits = 1) {
  return Number(value.toFixed(digits));
}

function makeRecorder() {
  const checks = [];
  const record = (status, name, detail) => checks.push({ status, name, detail });
  return {
    checks,
    pass: (name, detail) => record('PASS', name, detail),
    fail: (name, detail) => record('FAIL', name, detail),
    unknown: (name, detail = 'state unavailable') => record('UNKNOWN', name, detail),
  };
}

async function fetchHealthSnapshot(url, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      redirect: 'manual',
      signal: controller.signal,
      headers: { 'User-Agent': 'coldwaterkim-ops-health/1.0' },
    });
    const bodyResult = await readHealthBodyLimited(response);
    if (bodyResult.tooLarge) {
      return { status: response.status, invalid: true, bodyBytes: bodyResult.bodyBytes };
    }
    let json = null;
    try { json = JSON.parse(bodyResult.body); } catch { /* evaluated below */ }
    return {
      status: response.status,
      bodyBytes: bodyResult.bodyBytes,
      healthy: isExactPocketBaseHealth(json),
    };
  } catch {
    return { unavailable: true };
  } finally {
    clearTimeout(timer);
  }
}

function isExactPocketBaseHealth(value) {
  return Boolean(value)
    && typeof value === 'object'
    && !Array.isArray(value)
    && value.code === 200
    && value.message === 'API is healthy.';
}

async function readHealthBodyLimited(response) {
  const declaredLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > SAFE_JSON_LIMIT) {
    try { await response.body?.cancel(); } catch { /* best-effort cancellation */ }
    return { tooLarge: true, bodyBytes: SAFE_JSON_LIMIT + 1 };
  }
  if (!response.body) return { body: '', bodyBytes: 0, tooLarge: false };

  const reader = response.body.getReader();
  const chunks = [];
  let bodyBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const remaining = SAFE_JSON_LIMIT + 1 - bodyBytes;
      const bounded = value.byteLength > remaining ? value.subarray(0, remaining) : value;
      chunks.push(Buffer.from(bounded));
      bodyBytes += bounded.byteLength;
      if (bodyBytes > SAFE_JSON_LIMIT) {
        try { await reader.cancel(); } catch { /* best-effort cancellation */ }
        return { tooLarge: true, bodyBytes };
      }
    }
  } finally {
    try { reader.releaseLock(); } catch { /* already cancelled */ }
  }
  return { body: Buffer.concat(chunks, bodyBytes).toString('utf8'), bodyBytes, tooLarge: false };
}

function evaluateHealth(recorder, name, snapshot) {
  if (!snapshot) return recorder.unknown(name);
  if (snapshot.unavailable) return recorder.fail(name, 'request unavailable');
  const status = Number(snapshot.status);
  const healthy = snapshot.healthy === true
    || isExactPocketBaseHealth(snapshot.json);
  if (!Number.isInteger(status)) return recorder.fail(name, 'invalid response metadata');
  if (status < 200 || status >= 300) return recorder.fail(name, `HTTP ${status}`);
  if (snapshot.bodyBytes !== undefined
    && (!Number.isInteger(snapshot.bodyBytes) || snapshot.bodyBytes < 0)) {
    return recorder.fail(name, `HTTP ${status}; invalid body size metadata`);
  }
  if (snapshot.bodyBytes > SAFE_JSON_LIMIT) {
    return recorder.fail(name, `HTTP ${status}; response body exceeds ${SAFE_JSON_LIMIT} bytes`);
  }
  if (!healthy || snapshot.invalid) return recorder.fail(name, `HTTP ${status}; invalid health JSON`);
  recorder.pass(name, `HTTP ${status}; healthy JSON`);
}

function launchctlSnapshot(label, timeoutMs) {
  const result = spawnSync('launchctl', ['print', `system/${label}`], {
    encoding: 'utf8',
    timeout: timeoutMs,
  });
  if (result.error) return { unavailable: true };
  if (result.status !== 0) return { loaded: false };
  const output = String(result.stdout || '');
  const stateMatch = output.match(/^\s*state\s*=\s*([^\n]+)$/mi);
  const exitMatch = output.match(/^\s*last exit code\s*=\s*(-?\d+)\s*$/mi);
  return {
    loaded: true,
    state: stateMatch?.[1]?.trim().toLowerCase() || null,
    lastExitCode: exitMatch ? Number(exitMatch[1]) : null,
  };
}

function safeLaunchState(state) {
  if (typeof state !== 'string') return null;
  const normalized = state.trim().toLowerCase();
  return ['running', 'waiting', 'idle', 'not running', 'exited', 'throttled', 'crashed', 'failed'].includes(normalized)
    ? normalized
    : 'observed';
}

function evaluateLaunchd(recorder, name, snapshot, allowedStates) {
  const statusName = `${name} status`;
  const exitName = `${name} last exit`;
  if (!snapshot || snapshot.unavailable) {
    recorder.unknown(statusName);
    recorder.unknown(exitName);
    return;
  }
  if (snapshot.loaded !== true) {
    recorder.fail(statusName, 'job not loaded');
    recorder.unknown(exitName, 'job not loaded');
    return;
  }
  const state = safeLaunchState(snapshot.state);
  if (!state) recorder.unknown(statusName, 'loaded; state unavailable');
  else if (state === 'observed') recorder.fail(statusName, 'unrecognized state');
  else if (allowedStates.has(state)) recorder.pass(statusName, `state ${state}`);
  else recorder.fail(statusName, `state ${state}`);

  if (!Number.isInteger(snapshot.lastExitCode)) recorder.unknown(exitName, 'last exit unavailable');
  else if (snapshot.lastExitCode === 0) recorder.pass(exitName, 'exit 0');
  else recorder.fail(exitName, `nonzero exit ${snapshot.lastExitCode}`);
}

function assertSafeBackupFileName(value, pattern) {
  return typeof value === 'string'
    && value.length <= 128
    && path.basename(value) === value
    && pattern.test(value);
}

function sha256RegularFile(file, maxBytes, deadline) {
  const opened = openRegularFile(file, maxBytes);
  const hash = crypto.createHash('sha256');
  const buffer = Buffer.allocUnsafe(HASH_CHUNK_BYTES);
  let total = 0;
  try {
    while (true) {
      if (Date.now() > deadline) throw new Error('read deadline exceeded');
      const bytesRead = fs.readSync(opened.descriptor, buffer, 0, buffer.length, null);
      if (bytesRead === 0) break;
      total += bytesRead;
      if (total > maxBytes) throw new Error('file grew beyond limit');
      hash.update(buffer.subarray(0, bytesRead));
    }
  } finally {
    fs.closeSync(opened.descriptor);
  }
  return hash.digest('hex');
}

function validateBackupOriginals(items, incrementalRoot, deadline) {
  if (!Array.isArray(items) || items.length > MAX_BACKUP_ORIGINALS) {
    throw new Error('invalid backup originals list');
  }
  const originalsRoot = path.resolve(incrementalRoot, 'originals', 'storage');
  const itemKeys = [
    'collection', 'collection_id', 'field', 'filename',
    'record_id', 'relative_path', 'sha256', 'size',
  ];

  for (const item of items) {
    if (Date.now() > deadline) throw new Error('read deadline exceeded');
    if (!item || typeof item !== 'object' || Array.isArray(item)
      || JSON.stringify(Object.keys(item).sort()) !== JSON.stringify(itemKeys)
      || !Number.isSafeInteger(item.size) || item.size < 0 || item.size > 20 * GIB
      || !/^[0-9a-f]{64}$/.test(item.sha256 || '')) {
      throw new Error('invalid backup original metadata');
    }
    for (const field of ['collection', 'collection_id', 'record_id', 'field', 'filename', 'relative_path']) {
      if (typeof item[field] !== 'string' || !item[field] || item[field].length > 1024 || item[field].includes('\0')) {
        throw new Error('invalid backup original metadata');
      }
    }
    if (item.filename.includes('/') || item.filename.includes('\\')
      || item.filename === '.' || item.filename === '..') {
      throw new Error('invalid backup original filename');
    }
    const expectedRelative = path.posix.join(item.collection_id, item.record_id, item.filename);
    if (item.relative_path !== expectedRelative
      || path.posix.isAbsolute(item.relative_path)
      || item.relative_path.includes('\\')) {
      throw new Error('invalid backup original path');
    }
    const originalPath = path.resolve(originalsRoot, ...item.relative_path.split('/'));
    if (!originalPath.startsWith(`${originalsRoot}${path.sep}`)) {
      throw new Error('backup original escapes storage root');
    }
    const opened = openRegularFile(originalPath, item.size);
    try {
      if (opened.size !== item.size) throw new Error('backup original size mismatch');
    } finally {
      fs.closeSync(opened.descriptor);
    }
  }
}

export function backupSnapshot(file, timeoutMs) {
  let json;
  try {
    json = readSmallJson(file);
  } catch (error) {
    return error?.code === 'ENOENT' ? { missing: true } : { invalid: true };
  }

  try {
    const pointerKeys = ['created_at', 'database', 'manifest', 'original_files', 'version'];
    if (!json || typeof json !== 'object' || Array.isArray(json)
      || JSON.stringify(Object.keys(json).sort()) !== JSON.stringify(pointerKeys)
      || json.version !== 1
      || !json.database || typeof json.database !== 'object' || Array.isArray(json.database)
      || JSON.stringify(Object.keys(json.database).sort()) !== JSON.stringify(['file', 'sha256'])
      || !assertSafeBackupFileName(json.database.file, /^data_\d{8}_\d{6}(?:_\d{6})?\.db$/)
      || !/^[0-9a-f]{64}$/.test(json.database.sha256 || '')
      || !assertSafeBackupFileName(json.manifest, /^originals_\d{8}_\d{6}(?:_\d{6})?\.json$/)
      || !Number.isInteger(json.original_files) || json.original_files < 0) {
      throw new Error('invalid latest-success structure');
    }

    const incrementalRoot = path.dirname(file);
    const snapshotPath = path.join(incrementalRoot, 'db-snapshots', json.database.file);
    const manifestPath = path.join(incrementalRoot, 'manifests', json.manifest);
    const deadline = Date.now() + Math.max(timeoutMs, 30_000);
    const manifest = readBoundedJson(manifestPath, MAX_BACKUP_MANIFEST_BYTES);
    if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)
      || manifest.version !== 1
      || manifest.created_at !== json.created_at
      || manifest.database?.file !== json.database.file
      || manifest.database?.sha256 !== json.database.sha256
      || !Array.isArray(manifest.originals)
      || manifest.originals.length !== json.original_files) {
      throw new Error('backup manifest does not match latest success');
    }
    validateBackupOriginals(manifest.originals, incrementalRoot, deadline);
    const snapshotSha256 = sha256RegularFile(snapshotPath, MAX_BACKUP_SNAPSHOT_BYTES, deadline);
    if (snapshotSha256 !== json.database.sha256) throw new Error('backup snapshot checksum mismatch');
    return {
      createdAt: json.created_at,
      complete: true,
      databaseChecksumVerified: true,
      originalsSizeVerified: true,
    };
  } catch {
    return { invalid: true };
  }
}

function evaluateBackup(recorder, snapshot, now, maxAgeHours) {
  const name = 'latest successful backup age';
  if (!snapshot || snapshot.missing) return recorder.unknown(name, 'latest success unavailable');
  if (snapshot.invalid) return recorder.fail(name, 'latest success is unreadable');
  if (snapshot.complete !== true
    || snapshot.databaseChecksumVerified !== true
    || snapshot.originalsSizeVerified !== true) {
    return recorder.fail(name, 'latest generation is incomplete or unverified');
  }
  const createdAt = safeIsoDate(snapshot.createdAt ?? snapshot.created_at);
  if (!createdAt) return recorder.fail(name, 'invalid success timestamp');
  const ageHours = (now.getTime() - createdAt.getTime()) / 3_600_000;
  if (ageHours < -5 / 60) return recorder.fail(name, 'success timestamp is in the future');
  const detail = `${rounded(Math.max(0, ageHours))}h old; limit ${maxAgeHours}h`;
  if (ageHours > maxAgeHours) recorder.fail(name, detail);
  else recorder.pass(name, detail);
}

function diskSnapshot(target) {
  try {
    const stat = fs.statfsSync(target);
    return {
      freeBytes: Number(stat.bavail) * Number(stat.bsize),
      totalBytes: Number(stat.blocks) * Number(stat.bsize),
    };
  } catch {
    return { missing: true };
  }
}

function evaluateDisk(recorder, snapshot, minGiB, minPercent) {
  const name = 'disk free capacity';
  if (!snapshot || snapshot.missing) return recorder.unknown(name);
  const free = Number(snapshot.freeBytes);
  const total = Number(snapshot.totalBytes);
  if (!Number.isFinite(free) || !Number.isFinite(total) || free < 0 || total <= 0 || free > total) {
    return recorder.fail(name, 'invalid capacity metadata');
  }
  const required = Math.max(minGiB * GIB, total * minPercent / 100);
  const percent = free / total * 100;
  const detail = `${rounded(free / GIB)} GiB free (${rounded(percent)}%); requires ${rounded(required / GIB)} GiB`;
  if (free < required) recorder.fail(name, detail);
  else recorder.pass(name, detail);
}

function logSnapshot(file) {
  try {
    const stat = fs.statSync(file);
    return stat.isFile() ? { exists: true, sizeBytes: stat.size } : { invalid: true };
  } catch {
    return { missing: true };
  }
}

function evaluateLog(recorder, snapshot, maxMiB, label) {
  const name = `${label} size`;
  if (!snapshot || snapshot.missing || snapshot.exists === false) return recorder.unknown(name);
  if (snapshot.invalid) return recorder.fail(name, 'target is not a regular file');
  const bytes = Number(snapshot.sizeBytes);
  if (!Number.isFinite(bytes) || bytes < 0) return recorder.fail(name, 'invalid size metadata');
  const sizeMiB = bytes / MIB;
  const detail = `${rounded(sizeMiB)} MiB; limit ${maxMiB} MiB`;
  if (sizeMiB > maxMiB) recorder.fail(name, detail);
  else recorder.pass(name, detail);
}

function tlsSnapshot(host, port, timeoutMs) {
  return new Promise(resolve => {
    let settled = false;
    let socket;
    let timer;
    const finish = value => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.destroy();
      resolve(value);
    };
    socket = tls.connect({ host, port, servername: host, rejectUnauthorized: true });
    timer = setTimeout(() => finish({ unavailable: true }), timeoutMs);
    socket.once('secureConnect', () => {
      const cert = socket.getPeerCertificate();
      finish({ authorized: socket.authorized, validTo: cert?.valid_to || null });
    });
    socket.once('error', error => {
      finish(classifyTlsErrorCode(error.code));
    });
  });
}

export function classifyTlsErrorCode(value) {
  const code = String(value || '');
  return NETWORK_ERROR_CODES.has(code) ? { unavailable: true } : { invalid: true };
}

function evaluateTls(recorder, snapshot, now, minDays) {
  const name = 'TLS certificate validity';
  if (!snapshot || snapshot.unavailable) return recorder.unknown(name);
  if (snapshot.invalid || snapshot.authorized === false) return recorder.fail(name, 'certificate validation failed');
  const validTo = safeIsoDate(snapshot.validTo ?? snapshot.valid_to);
  if (!validTo) return recorder.fail(name, 'expiration unavailable');
  const days = (validTo.getTime() - now.getTime()) / 86_400_000;
  const detail = `${rounded(days)} days remaining; requires ${minDays}`;
  if (days < minDays) recorder.fail(name, detail);
  else recorder.pass(name, detail);
}

function validateManifest(manifest, now) {
  const keys = [
    'binarySha256', 'builtAt', 'commit', 'goVersion', 'migrationTreeSha256',
    'pocketbaseVersion', 'schemaVersion',
  ];
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)
    || JSON.stringify(Object.keys(manifest).sort()) !== JSON.stringify(keys)) return false;
  if (manifest.schemaVersion !== 1 || !/^[0-9a-f]{40,64}$/.test(manifest.commit || '')) return false;
  if (!/^\d+\.\d+(?:\.\d+)?$/.test(manifest.goVersion || '')) return false;
  if (!/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(manifest.pocketbaseVersion || '')) return false;
  if (!/^[0-9a-f]{64}$/.test(manifest.binarySha256 || '')
    || !/^[0-9a-f]{64}$/.test(manifest.migrationTreeSha256 || '')) return false;
  const builtAt = safeIsoDate(manifest.builtAt);
  return Boolean(builtAt)
    && builtAt.toISOString() === manifest.builtAt
    && builtAt.getTime() <= now.getTime() + 5 * 60_000;
}

function migrationTreeSha256(root, deadline) {
  const files = [];
  let entries = 0;
  let totalBytes = 0;
  const walk = (current, depth) => {
    if (depth > MAX_MIGRATION_DEPTH) throw new Error('migration tree is too deep');
    const directory = fs.opendirSync(current);
    try {
      let entry;
      while ((entry = directory.readSync()) !== null) {
        if (Date.now() > deadline) throw new Error('read deadline exceeded');
        entries += 1;
        if (entries > MAX_MIGRATION_ENTRIES) throw new Error('migration tree has too many entries');
        const absolute = path.join(current, entry.name);
        if (entry.isSymbolicLink()) throw new Error('symbolic link');
        if (entry.isDirectory()) walk(absolute, depth + 1);
        else if (entry.isFile()) {
          const stat = fs.lstatSync(absolute);
          if (!stat.isFile()) throw new Error('non-regular entry');
          totalBytes += stat.size;
          if (totalBytes > MAX_MIGRATION_TREE_BYTES) throw new Error('migration tree is too large');
          files.push(path.relative(root, absolute).split(path.sep).join('/'));
          if (files.length > MAX_MIGRATION_FILES) throw new Error('migration tree has too many files');
        } else throw new Error('non-regular entry');
      }
    } finally {
      directory.closeSync();
    }
  };
  const rootStat = fs.lstatSync(root);
  if (!rootStat.isDirectory()) throw new Error('migration tree is not a directory');
  walk(root, 0);
  if (!files.length) throw new Error('empty tree');
  const tree = crypto.createHash('sha256');
  for (const relative of files.sort()) {
    if (Date.now() > deadline) throw new Error('read deadline exceeded');
    tree.update(relative);
    tree.update('\0');
    tree.update(sha256RegularFile(path.join(root, relative), MAX_MIGRATION_TREE_BYTES, deadline));
    tree.update('\n');
  }
  return tree.digest('hex');
}

export function runtimeSnapshot(manifestPath, binaryPath, migrationsPath, timeoutMs) {
  let manifest;
  try {
    manifest = readSmallJson(manifestPath);
  } catch (error) {
    return error?.code === 'ENOENT' ? { missing: true } : { invalid: true };
  }
  const snapshot = { manifest };
  const deadline = Date.now() + timeoutMs;
  try {
    snapshot.binarySha256 = sha256RegularFile(binaryPath, MAX_RUNTIME_BINARY_BYTES, deadline);
  } catch {
    snapshot.binaryUnavailable = true;
  }
  try {
    snapshot.migrationTreeSha256 = migrationTreeSha256(migrationsPath, deadline);
  } catch {
    snapshot.migrationsUnavailable = true;
  }
  return snapshot;
}

function evaluateRuntime(recorder, snapshot, now) {
  const manifestName = 'runtime release manifest';
  const binaryName = 'runtime binary provenance';
  const migrationsName = 'runtime migration provenance';
  if (!snapshot || snapshot.missing) {
    recorder.unknown(manifestName);
    recorder.unknown(binaryName, 'manifest unavailable');
    recorder.unknown(migrationsName, 'manifest unavailable');
    return;
  }
  const manifest = snapshot.manifest;
  if (snapshot.invalid || !validateManifest(manifest, now)) {
    recorder.fail(manifestName, 'invalid secret-free v1 manifest');
    recorder.unknown(binaryName, 'valid manifest unavailable');
    recorder.unknown(migrationsName, 'valid manifest unavailable');
    return;
  }
  recorder.pass(manifestName, 'valid secret-free v1 manifest');

  if (snapshot.binaryUnavailable || !snapshot.binarySha256) recorder.unknown(binaryName);
  else if (snapshot.binarySha256 !== manifest.binarySha256) recorder.fail(binaryName, 'SHA-256 mismatch');
  else recorder.pass(binaryName, 'SHA-256 matches');

  if (snapshot.migrationsUnavailable || !snapshot.migrationTreeSha256) recorder.unknown(migrationsName);
  else if (snapshot.migrationTreeSha256 !== manifest.migrationTreeSha256) recorder.fail(migrationsName, 'SHA-256 mismatch');
  else recorder.pass(migrationsName, 'SHA-256 matches');
}

function loadFixture(file) {
  try {
    const fixture = readSmallJson(file);
    if (!fixture || typeof fixture !== 'object' || Array.isArray(fixture)) throw new Error('invalid fixture');
    return fixture;
  } catch {
    throw new UsageError('invalid fixture');
  }
}

function fixtureLaunchd(fixture, label, index) {
  if (Array.isArray(fixture?.launchd)) return fixture.launchd[index];
  return fixture?.launchd?.[label];
}

function summarize(checks) {
  const counts = { pass: 0, fail: 0, unknown: 0 };
  for (const check of checks) counts[check.status.toLowerCase()] += 1;
  const status = counts.fail ? 'FAIL' : counts.unknown ? 'UNKNOWN' : 'PASS';
  return { status, ...counts };
}

function printResult(options, checks) {
  const summary = summarize(checks);
  const report = {
    tool: 'coldwaterkim-imac-ops-health',
    mode: options.fixture ? 'fixture' : options.tooling ? 'tooling' : 'live',
    thresholds: {
      backupMaxAgeHours: options.backupMaxAgeHours,
      diskMinGiB: options.diskMinGiB,
      diskMinPercent: options.diskMinPercent,
      logMaxMiB: options.logMaxMiB,
      tlsMinDays: options.tlsMinDays,
    },
    checks,
    summary,
    capabilities: { mutatingActions: false, externalAlerts: false },
  };
  if (options.json) console.log(JSON.stringify(report, null, 2));
  else {
    for (const check of checks) console.log(`${check.status.padEnd(7)} ${check.name} - ${check.detail}`);
    console.log(`OVERALL ${summary.status} (${summary.pass} pass, ${summary.fail} fail, ${summary.unknown} unknown)`);
    console.log('External alerting is not configured by this tool.');
  }
  return summary.status === 'FAIL' ? 1 : summary.status === 'UNKNOWN' ? 2 : 0;
}

async function audit(options) {
  const recorder = makeRecorder();
  const fixture = options.fixture ? loadFixture(options.fixture) : null;
  const now = fixture?.now ? safeIsoDate(fixture.now) : new Date();
  if (!now) throw new UsageError('invalid fixture clock');
  const live = !options.tooling;

  const localHealth = fixture?.health?.local
    ?? (live ? await fetchHealthSnapshot(options.localHealthUrl, options.timeoutMs) : null);
  const publicHealth = fixture?.health?.public
    ?? (live ? await fetchHealthSnapshot(options.publicHealthUrl, options.timeoutMs) : null);
  evaluateHealth(recorder, 'local API health', localHealth);
  evaluateHealth(recorder, 'public API health', publicHealth);

  for (let index = 0; index < options.launchdLabels.length; index += 1) {
    const label = options.launchdLabels[index];
    const snapshot = fixtureLaunchd(fixture, label, index)
      ?? (live ? launchctlSnapshot(label, options.timeoutMs) : null);
    const isDefaultBackup = !options.customLabels && label === DEFAULT_LABELS[2];
    const name = options.customLabels ? `launchd job ${index + 1}` : DEFAULT_LAUNCHD_NAMES[index];
    evaluateLaunchd(recorder, name, snapshot, isDefaultBackup ? SCHEDULED_JOB_STATES : CONTINUOUS_JOB_STATES);
  }

  evaluateBackup(
    recorder,
    fixture?.backup ?? (live ? backupSnapshot(options.backupStatus, options.timeoutMs) : null),
    now,
    options.backupMaxAgeHours,
  );
  evaluateDisk(
    recorder,
    fixture?.disk ?? (live ? diskSnapshot(options.diskPath) : null),
    options.diskMinGiB,
    options.diskMinPercent,
  );

  for (let index = 0; index < options.logFiles.length; index += 1) {
    const snapshot = fixture?.logs?.[index] ?? (live ? logSnapshot(options.logFiles[index]) : null);
    const name = options.customLogs ? `log file ${index + 1}` : DEFAULT_LOG_NAMES[index];
    evaluateLog(recorder, snapshot, options.logMaxMiB, name);
  }

  const tlsState = fixture?.tls ?? (live ? await tlsSnapshot(options.tlsHost, options.tlsPort, options.timeoutMs) : null);
  evaluateTls(recorder, tlsState, now, options.tlsMinDays);
  evaluateRuntime(
    recorder,
    fixture?.runtime ?? (live
      ? runtimeSnapshot(options.runtimeManifest, options.runtimeBinary, options.runtimeMigrations, options.timeoutMs)
      : null),
    now,
  );

  return printResult(options, recorder.checks);
}

async function main(args) {
  try {
    const options = parseArgs(args);
    if (options.help) {
      usage();
    } else {
      process.exitCode = await audit(options);
    }
  } catch (error) {
    if (error instanceof UsageError) {
      console.error('Invalid configuration. Run with --help for the documented contract.');
      process.exitCode = 64;
    } else {
      console.error('Operations health audit could not complete safely.');
      process.exitCode = 2;
    }
  }
}

const isMain = process.argv[1]
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) await main(process.argv.slice(2));

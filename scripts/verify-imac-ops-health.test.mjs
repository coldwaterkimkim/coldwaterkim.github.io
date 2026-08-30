import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import {
  backupSnapshot,
  classifyTlsErrorCode,
  runtimeSnapshot,
} from './verify-imac-ops-health.mjs';

const script = fileURLToPath(new URL('./verify-imac-ops-health.mjs', import.meta.url));
const source = fs.readFileSync(script, 'utf8');
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cwk-ops-health-test-'));
const secretText = 'super-secret-token-203.0.113.42';
const now = new Date('2026-08-30T12:00:00.000Z');
const labels = [
  'com.coldwaterkim.pocketbase',
  'com.coldwaterkim.caddy',
  'com.coldwaterkim.pocketbase-backup',
];
const binarySha256 = 'b'.repeat(64);
const migrationTreeSha256 = 'c'.repeat(64);

function run(args) {
  const startedAt = Date.now();
  const result = spawnSync(process.execPath, [script, ...args], {
    encoding: 'utf8',
    timeout: 10_000,
  });
  return { ...result, elapsedMs: Date.now() - startedAt };
}

function writeFixture(name, value) {
  const file = path.join(tempDir, name);
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  return file;
}

function healthyFixture() {
  return {
    now: now.toISOString(),
    privateDiagnosticNote: secretText,
    health: {
      local: { status: 200, bodyBytes: 128, json: { code: 200, message: 'API is healthy.', ignoredSecret: secretText } },
      public: { status: 200, bodyBytes: 128, healthy: true },
    },
    launchd: Object.fromEntries(labels.map((label, index) => [label, {
      loaded: true,
      state: index === 2 ? 'not running' : 'running',
      lastExitCode: 0,
    }])),
    backup: {
      createdAt: new Date(now.getTime() - 12 * 3_600_000).toISOString(),
      complete: true,
      databaseChecksumVerified: true,
      originalsSizeVerified: true,
    },
    disk: { freeBytes: 100 * 1024 ** 3, totalBytes: 500 * 1024 ** 3 },
    logs: Array.from({ length: 6 }, (_, index) => ({ exists: true, sizeBytes: (index + 1) * 1024 ** 2 })),
    tls: { authorized: true, validTo: new Date(now.getTime() + 30 * 86_400_000).toISOString() },
    runtime: {
      manifest: {
        schemaVersion: 1,
        commit: 'a'.repeat(40),
        pocketbaseVersion: '0.40.1',
        goVersion: '1.27.0',
        binarySha256,
        migrationTreeSha256,
        builtAt: new Date(now.getTime() - 86_400_000).toISOString(),
      },
      binarySha256,
      migrationTreeSha256,
    },
  };
}

try {
  const backupRoot = path.join(tempDir, 'incremental');
  const snapshotName = 'data_20260830_120000_000001.db';
  const manifestName = 'originals_20260830_120000_000001.json';
  const originalRelative = 'collection123456/record123456789/photo_example.jpg';
  const snapshotBytes = Buffer.from('sqlite-backup-fixture');
  const originalBytes = Buffer.from('original-media-fixture');
  const snapshotSha = crypto.createHash('sha256').update(snapshotBytes).digest('hex');
  const originalSha = crypto.createHash('sha256').update(originalBytes).digest('hex');
  const snapshotPath = path.join(backupRoot, 'db-snapshots', snapshotName);
  const manifestPath = path.join(backupRoot, 'manifests', manifestName);
  const originalPath = path.join(backupRoot, 'originals', 'storage', ...originalRelative.split('/'));
  const pointerPath = path.join(backupRoot, 'latest-success.json');
  fs.mkdirSync(path.dirname(snapshotPath), { recursive: true });
  fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
  fs.mkdirSync(path.dirname(originalPath), { recursive: true });
  fs.writeFileSync(snapshotPath, snapshotBytes);
  fs.writeFileSync(originalPath, originalBytes);
  const backupManifest = {
    version: 1,
    created_at: now.toISOString(),
    database: { file: snapshotName, sha256: snapshotSha },
    originals: [{
      collection: 'media',
      collection_id: 'collection123456',
      record_id: 'record123456789',
      field: 'file',
      filename: 'photo_example.jpg',
      relative_path: originalRelative,
      size: originalBytes.length,
      sha256: originalSha,
    }],
  };
  fs.writeFileSync(manifestPath, `${JSON.stringify(backupManifest)}\n`);
  fs.writeFileSync(pointerPath, `${JSON.stringify({
    version: 1,
    created_at: backupManifest.created_at,
    database: backupManifest.database,
    manifest: manifestName,
    original_files: 1,
  })}\n`);
  assert.deepEqual(
    backupSnapshot(pointerPath, 5000),
    {
      createdAt: now.toISOString(),
      complete: true,
      databaseChecksumVerified: true,
      originalsSizeVerified: true,
    },
    'a complete backup generation must validate through its real files',
  );
  fs.unlinkSync(originalPath);
  assert.deepEqual(backupSnapshot(pointerPath, 5000), { invalid: true }, 'a missing backup original must fail the generation');
  fs.writeFileSync(originalPath, originalBytes);
  fs.writeFileSync(manifestPath, `${JSON.stringify({ ...backupManifest, originals: [{}] })}\n`);
  assert.deepEqual(backupSnapshot(pointerPath, 5000), { invalid: true }, 'malformed original metadata must not pass by array length');
  fs.writeFileSync(manifestPath, `${JSON.stringify(backupManifest)}\n`);

  const fifoPath = path.join(tempDir, 'backup-status.fifo');
  const fifoCreate = spawnSync('/usr/bin/mkfifo', [fifoPath], { encoding: 'utf8' });
  assert.equal(fifoCreate.status, 0, fifoCreate.stderr);
  const fifoStartedAt = Date.now();
  assert.deepEqual(backupSnapshot(fifoPath, 500), { invalid: true }, 'a FIFO backup pointer must fail closed');
  assert.ok(Date.now() - fifoStartedAt < 1000, 'a FIFO backup pointer must not block the diagnostic');

  assert.deepEqual(classifyTlsErrorCode('INVALID_CA'), { invalid: true });
  assert.deepEqual(classifyTlsErrorCode('CRL_HAS_EXPIRED'), { invalid: true });
  assert.deepEqual(classifyTlsErrorCode('ENOTFOUND'), { unavailable: true });

  const runtimeFixture = path.join(tempDir, 'runtime-fixture');
  fs.mkdirSync(path.join(runtimeFixture, 'migrations'), { recursive: true });
  fs.writeFileSync(path.join(runtimeFixture, 'migrations', '1.js'), 'migrate(() => {}, () => {});\n');
  fs.writeFileSync(path.join(runtimeFixture, 'real-binary'), 'binary');
  fs.symlinkSync(path.join(runtimeFixture, 'real-binary'), path.join(runtimeFixture, 'linked-binary'));
  fs.writeFileSync(path.join(runtimeFixture, 'manifest.json'), `${JSON.stringify(healthyFixture().runtime.manifest)}\n`);
  const linkedRuntime = runtimeSnapshot(
    path.join(runtimeFixture, 'manifest.json'),
    path.join(runtimeFixture, 'linked-binary'),
    path.join(runtimeFixture, 'migrations'),
    5000,
  );
  assert.equal(linkedRuntime.binaryUnavailable, true, 'runtime hashing must not follow a replaced symbolic-link binary');

  const healthyPath = writeFixture('healthy.json', healthyFixture());
  const healthy = run([
    '--fixture', healthyPath,
    '--json',
    '--local-health-url', 'http://203.0.113.42/api/health',
    '--public-health-url', 'https://private-host.example/api/health',
    '--backup-status', `/private/${secretText}/latest-success.json`,
    '--disk-path', `/private/${secretText}`,
    '--tls-host', 'private-host.example',
    '--runtime-manifest', `/private/${secretText}/release.json`,
    '--runtime-binary', `/private/${secretText}/pocketbase`,
    '--runtime-migrations', `/private/${secretText}/migrations`,
  ]);
  assert.equal(healthy.status, 0, healthy.stderr || healthy.stdout);
  const healthyReport = JSON.parse(healthy.stdout);
  assert.equal(healthyReport.mode, 'fixture');
  assert.deepEqual(healthyReport.summary, { status: 'PASS', pass: 20, fail: 0, unknown: 0 });
  assert.equal(healthyReport.thresholds.backupMaxAgeHours, 26);
  assert.equal(healthyReport.thresholds.tlsMinDays, 21);
  assert.deepEqual(healthyReport.capabilities, { mutatingActions: false, externalAlerts: false });
  assert.ok(healthyReport.checks.every(check => check.status === 'PASS'));
  assert.doesNotMatch(`${healthy.stdout}\n${healthy.stderr}`, /super-secret|203\.0\.113\.42|private-host|\/private\//i);

  const failedFixture = healthyFixture();
  failedFixture.health.public = { status: 503, healthy: false };
  failedFixture.launchd[labels[0]].lastExitCode = 9;
  failedFixture.backup.createdAt = new Date(now.getTime() - 72 * 3_600_000).toISOString();
  failedFixture.disk = { freeBytes: 10 * 1024 ** 3, totalBytes: 100 * 1024 ** 3 };
  failedFixture.logs[0].sizeBytes = 101 * 1024 ** 2;
  failedFixture.tls.validTo = new Date(now.getTime() + 3 * 86_400_000).toISOString();
  failedFixture.runtime.binarySha256 = 'd'.repeat(64);
  const failedPath = writeFixture('failed.json', failedFixture);
  const failed = run(['--fixture', failedPath, '--json']);
  assert.equal(failed.status, 1, failed.stderr || failed.stdout);
  const failedReport = JSON.parse(failed.stdout);
  assert.equal(failedReport.summary.status, 'FAIL');
  assert.ok(failedReport.summary.fail >= 7, 'fixture must exercise every critical threshold family');
  assert.equal(failedReport.checks.find(check => check.name === 'disk free capacity')?.status, 'FAIL');
  assert.equal(failedReport.checks.find(check => check.name === 'runtime binary provenance')?.status, 'FAIL');
  assert.doesNotMatch(`${failed.stdout}\n${failed.stderr}`, /super-secret|203\.0\.113\.42/i);

  const cleanStopFixture = healthyFixture();
  cleanStopFixture.launchd[labels[0]].state = 'not running';
  cleanStopFixture.launchd[labels[2]].state = 'idle';
  const cleanStopPath = writeFixture('clean-stop.json', cleanStopFixture);
  const cleanStop = run(['--fixture', cleanStopPath, '--json']);
  assert.equal(cleanStop.status, 1, cleanStop.stderr || cleanStop.stdout);
  const cleanStopReport = JSON.parse(cleanStop.stdout);
  assert.equal(cleanStopReport.checks.find(check => check.name === 'PocketBase launchd status')?.status, 'FAIL');
  assert.equal(cleanStopReport.checks.find(check => check.name === 'backup launchd status')?.status, 'PASS');

  const customJobFixture = healthyFixture();
  customJobFixture.launchd = [{ loaded: true, state: 'waiting', lastExitCode: 0 }];
  const customJobPath = writeFixture('custom-job.json', customJobFixture);
  const customJob = run(['--fixture', customJobPath, '--launchd-label', secretText, '--json']);
  assert.equal(customJob.status, 1, customJob.stderr || customJob.stdout);
  const customJobReport = JSON.parse(customJob.stdout);
  assert.equal(customJobReport.checks.find(check => check.name === 'launchd job 1 status')?.status, 'FAIL');
  assert.doesNotMatch(`${customJob.stdout}\n${customJob.stderr}`, /super-secret|203\.0\.113\.42/i);

  const bodyLimitFixture = healthyFixture();
  bodyLimitFixture.health.local.bodyBytes = 64 * 1024;
  bodyLimitFixture.health.public.bodyBytes = 64 * 1024 + 1;
  const bodyLimitPath = writeFixture('body-limit.json', bodyLimitFixture);
  const bodyLimit = run(['--fixture', bodyLimitPath, '--json']);
  assert.equal(bodyLimit.status, 1, bodyLimit.stderr || bodyLimit.stdout);
  const bodyLimitReport = JSON.parse(bodyLimit.stdout);
  assert.equal(bodyLimitReport.checks.find(check => check.name === 'local API health')?.status, 'PASS');
  assert.equal(bodyLimitReport.checks.find(check => check.name === 'public API health')?.status, 'FAIL');
  assert.match(bodyLimitReport.checks.find(check => check.name === 'public API health')?.detail || '', /exceeds 65536 bytes/);

  const unhealthyMessageFixture = healthyFixture();
  unhealthyMessageFixture.health.local = {
    status: 200,
    bodyBytes: 64,
    json: { code: 503, message: 'API is unhealthy.' },
  };
  const unhealthyMessagePath = writeFixture('unhealthy-message.json', unhealthyMessageFixture);
  const unhealthyMessage = run(['--fixture', unhealthyMessagePath, '--json']);
  assert.equal(unhealthyMessage.status, 1, unhealthyMessage.stderr || unhealthyMessage.stdout);
  const unhealthyMessageReport = JSON.parse(unhealthyMessage.stdout);
  assert.equal(unhealthyMessageReport.checks.find(check => check.name === 'local API health')?.status, 'FAIL');

  const redirectFixture = healthyFixture();
  redirectFixture.health.public = { status: 302, bodyBytes: 0, healthy: true };
  const redirectPath = writeFixture('redirect.json', redirectFixture);
  const redirect = run(['--fixture', redirectPath, '--json']);
  assert.equal(redirect.status, 1, redirect.stderr || redirect.stdout);
  assert.equal(JSON.parse(redirect.stdout).checks.find(check => check.name === 'public API health')?.status, 'FAIL');

  const incompleteBackupFixture = healthyFixture();
  incompleteBackupFixture.backup = { createdAt: now.toISOString() };
  const incompleteBackupPath = writeFixture('incomplete-backup.json', incompleteBackupFixture);
  const incompleteBackup = run(['--fixture', incompleteBackupPath, '--json']);
  assert.equal(incompleteBackup.status, 1, incompleteBackup.stderr || incompleteBackup.stdout);
  assert.equal(JSON.parse(incompleteBackup.stdout).checks.find(check => check.name === 'latest successful backup age')?.status, 'FAIL');

  const invalidTlsFixture = healthyFixture();
  invalidTlsFixture.tls = { invalid: true };
  const invalidTlsPath = writeFixture('invalid-tls.json', invalidTlsFixture);
  const invalidTls = run(['--fixture', invalidTlsPath, '--json']);
  assert.equal(invalidTls.status, 1, invalidTls.stderr || invalidTls.stdout);
  assert.equal(JSON.parse(invalidTls.stdout).checks.find(check => check.name === 'TLS certificate validity')?.status, 'FAIL');

  const unknownPath = writeFixture('unknown.json', { now: now.toISOString(), privateDiagnosticNote: secretText });
  const unknown = run(['--fixture', unknownPath, '--json']);
  assert.equal(unknown.status, 2, unknown.stderr || unknown.stdout);
  const unknownReport = JSON.parse(unknown.stdout);
  assert.deepEqual(unknownReport.summary, { status: 'UNKNOWN', pass: 0, fail: 0, unknown: 20 });
  assert.ok(unknownReport.checks.every(check => check.status === 'UNKNOWN'));
  assert.doesNotMatch(`${unknown.stdout}\n${unknown.stderr}`, /super-secret|203\.0\.113\.42/i);

  const tooling = run([
    '--tooling', '--json', '--timeout-ms', '500',
    '--local-health-url', 'http://203.0.113.42/api/health',
    '--public-health-url', 'https://private-host.example/api/health',
    '--tls-host', 'private-host.example',
  ]);
  assert.equal(tooling.status, 2, tooling.stderr || tooling.stdout);
  assert.ok(tooling.elapsedMs < 2000, `tooling mode appears to have attempted live I/O (${tooling.elapsedMs}ms)`);
  assert.equal(JSON.parse(tooling.stdout).summary.status, 'UNKNOWN');
  assert.doesNotMatch(`${tooling.stdout}\n${tooling.stderr}`, /203\.0\.113\.42|private-host/i);

  const malformedPath = path.join(tempDir, 'malformed.json');
  fs.writeFileSync(malformedPath, `{ "private": "${secretText}"`, { mode: 0o600 });
  const malformed = run(['--fixture', malformedPath, '--json']);
  assert.equal(malformed.status, 64);
  assert.match(malformed.stderr, /Invalid configuration/);
  assert.doesNotMatch(`${malformed.stdout}\n${malformed.stderr}`, /super-secret|203\.0\.113\.42/i);

  const tooManyLabels = run([
    '--tooling',
    ...Array.from({ length: 33 }, (_, index) => ['--launchd-label', `job-${index}`]).flat(),
  ]);
  assert.equal(tooManyLabels.status, 64);
  assert.doesNotMatch(`${tooManyLabels.stdout}\n${tooManyLabels.stderr}`, /job-32/);

  const help = run(['--help']);
  assert.equal(help.status, 0);
  assert.match(help.stdout, /0\s+every check PASS/);
  assert.match(help.stdout, /1\s+at least one check FAIL/);
  assert.match(help.stdout, /2\s+no FAIL, but at least one UNKNOWN/);
  assert.match(help.stdout, /Custom labels are conservatively treated as[\s\S]*continuously running jobs/);
  assert.match(help.stdout, /does not change files, restart services, or send external alerts/);

  assert.match(source, /spawnSync\('launchctl', \['print'/, 'launchd inspection must use the read-only print operation');
  assert.match(source, /response\.body\.getReader\(\)/, 'health responses must be consumed as a bounded stream');
  assert.match(source, /SAFE_JSON_LIMIT \+ 1 - bodyBytes/, 'health streaming must retain only the limit plus one detection byte');
  assert.match(source, /await reader\.cancel\(\)/, 'oversized health responses must cancel the stream immediately');
  assert.doesNotMatch(source, /response\.text\(\)/, 'health responses must never be buffered without a byte limit');
  assert.match(source, /redirect: 'manual'/, 'health probes must not follow redirects away from the audited endpoint');
  assert.match(source, /NETWORK_ERROR_CODES\.has\(code\) \? \{ unavailable: true \} : \{ invalid: true \}/, 'non-network TLS validation errors must fail closed');
  assert.match(source, /O_NOFOLLOW[\s\S]*O_NONBLOCK[\s\S]*fs\.fstatSync/, 'runtime hashes must open one nonblocking, non-followed regular-file descriptor');
  assert.match(source, /MAX_MIGRATION_FILES[\s\S]*MAX_MIGRATION_TREE_BYTES[\s\S]*MAX_MIGRATION_DEPTH/, 'migration traversal must have file, byte, and depth bounds');
  assert.doesNotMatch(source, /\['(?:bootout|bootstrap|kickstart|remove|start|stop)'/, 'the diagnostic must not invoke launchd mutations');
  assert.doesNotMatch(source, /fs\.(?:write|append|rename|rm|unlink|mkdir|chmod|chown)/, 'the diagnostic must never change host files');

  console.log('iMac ops health QA passed (PASS/FAIL/UNKNOWN, thresholds, redaction, and read-only tooling mode).');
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}

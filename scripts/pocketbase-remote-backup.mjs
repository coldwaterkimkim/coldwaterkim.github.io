import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const command = args[0] || 'create';

function usage(exitCode = 0) {
  console.log(`PocketBase remote backup

Usage:
  node scripts/pocketbase-remote-backup.mjs
  node scripts/pocketbase-remote-backup.mjs list
  node scripts/pocketbase-remote-backup.mjs download <backup-name.zip>

Environment:
  PB_ADMIN_ENV_FILE          default: ~/.config/coldwaterkim/pocketbase-admin.env
  PB_URL                     default: https://api.coldwaterkim.com
  PB_ADMIN_EMAIL             required, or POCKETBASE_ADMIN_EMAIL
  PB_ADMIN_PASSWORD          required, or POCKETBASE_ADMIN_PASSWORD
  PB_BACKUP_DIR              default: migration_backups/pocketbase
  PB_BACKUP_NAME             default: coldwaterkim-production-<timestamp>.zip
  PB_DELETE_REMOTE_AFTER_DOWNLOAD=1  delete remote backup after a successful download
`);
  process.exit(exitCode);
}

if (command === '--help' || command === '-h' || command === 'help') {
  usage(0);
}

function expandHome(input) {
  if (!input) return input;
  if (input === '~') return os.homedir();
  if (input.startsWith('~/')) return path.join(os.homedir(), input.slice(2));
  return input;
}

function parseEnvFile(file) {
  if (!file || !fs.existsSync(file)) return {};

  const output = {};
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) continue;

    let value = match[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    output[match[1]] = value;
  }
  return output;
}

function mergeEnv() {
  const envFile = expandHome(
    process.env.PB_ADMIN_ENV_FILE || '~/.config/coldwaterkim/pocketbase-admin.env',
  );
  return {
    ...parseEnvFile(envFile),
    ...process.env,
    PB_ADMIN_ENV_FILE: envFile,
  };
}

function requireValue(env, names) {
  for (const name of names) {
    if (env[name]) return env[name];
  }
  throw new Error(`Missing required env value: ${names.join(' or ')}`);
}

function isPlaceholder(value) {
  return [
    /^you@example\.com$/i,
    /your-/i,
    /example/i,
    /changeme/i,
    /password$/i,
  ].some(pattern => pattern.test(value));
}

function requireRealValue(env, names) {
  const value = requireValue(env, names);
  if (isPlaceholder(value)) {
    throw new Error(`${names[0]} looks like a template placeholder. Run npm run pb:configure:production first.`);
  }
  return value;
}

function normalizeBaseUrl(input) {
  return input.replace(/\/+$/, '');
}

function timestamp() {
  return new Date().toISOString().replace(/\D/g, '').slice(0, 14);
}

async function readError(response) {
  const text = await response.text();
  try {
    const parsed = JSON.parse(text);
    return parsed.message || text;
  } catch {
    return text;
  }
}

async function requestJson(url, options = {}, allowStatus = []) {
  const response = await fetch(url, options);
  if (!response.ok && !allowStatus.includes(response.status)) {
    throw new Error(`${options.method || 'GET'} ${url} failed: ${response.status} ${await readError(response)}`);
  }
  if (allowStatus.includes(response.status)) return { response, data: null };
  const text = await response.text();
  return { response, data: text ? JSON.parse(text) : {} };
}

async function authenticate(baseUrl, email, password) {
  const body = JSON.stringify({ identity: email, password });
  const common = {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  };

  const superuser = await requestJson(
    `${baseUrl}/api/collections/_superusers/auth-with-password`,
    common,
    [400, 401, 403, 404],
  );
  if (superuser.response.ok) return superuser.data.token;

  const legacy = await requestJson(`${baseUrl}/api/admins/auth-with-password`, common);
  return legacy.data.token;
}

function backupRecordName(record) {
  return record?.key || record?.name || record?.file || '';
}

async function listBackups(baseUrl, token) {
  const { data } = await requestJson(`${baseUrl}/api/backups`, {
    headers: { Authorization: token },
  });
  return Array.isArray(data) ? data : data?.items || [];
}

async function createBackup(baseUrl, token, backupName) {
  await requestJson(`${baseUrl}/api/backups`, {
    method: 'POST',
    headers: {
      Authorization: token,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ name: backupName }),
  });
}

async function getFileToken(baseUrl, token) {
  const { data } = await requestJson(`${baseUrl}/api/files/token`, {
    method: 'POST',
    headers: { Authorization: token },
  });
  return data.token;
}

async function downloadBackup(baseUrl, token, backupName, outputFile) {
  const fileToken = await getFileToken(baseUrl, token);
  const response = await fetch(
    `${baseUrl}/api/backups/${encodeURIComponent(backupName)}?token=${encodeURIComponent(fileToken)}`,
    { headers: { Authorization: token } },
  );
  if (!response.ok) {
    throw new Error(`GET backup failed: ${response.status} ${await readError(response)}`);
  }

  await fsp.mkdir(path.dirname(outputFile), { recursive: true });
  const partialFile = `${outputFile}.partial`;
  const file = await fsp.open(partialFile, 'w');
  const hash = crypto.createHash('sha256');
  const firstBytes = [];
  let sizeBytes = 0;

  try {
    for await (const chunk of response.body) {
      const buffer = Buffer.from(chunk);
      if (firstBytes.length < 4) {
        firstBytes.push(...buffer.subarray(0, 4 - firstBytes.length));
      }
      hash.update(buffer);
      sizeBytes += buffer.length;
      await file.write(buffer);
    }
  } finally {
    await file.close();
  }

  const magic = Buffer.from(firstBytes).toString('hex');
  if (magic !== '504b0304') {
    throw new Error(`Downloaded file is not a ZIP archive. Magic bytes: ${magic || 'empty'}`);
  }

  await fsp.rename(partialFile, outputFile);
  return { sizeBytes, sha256: hash.digest('hex'), magic };
}

async function deleteBackup(baseUrl, token, backupName) {
  await requestJson(`${baseUrl}/api/backups/${encodeURIComponent(backupName)}`, {
    method: 'DELETE',
    headers: { Authorization: token },
  });
}

async function main() {
  const env = mergeEnv();
  const baseUrl = normalizeBaseUrl(env.PB_URL || 'https://api.coldwaterkim.com');
  const email = requireRealValue(env, ['PB_ADMIN_EMAIL', 'POCKETBASE_ADMIN_EMAIL']);
  const password = requireRealValue(env, ['PB_ADMIN_PASSWORD', 'POCKETBASE_ADMIN_PASSWORD']);
  const outputDir = path.resolve(root, expandHome(env.PB_BACKUP_DIR || 'migration_backups/pocketbase'));
  const token = await authenticate(baseUrl, email, password);

  if (command === 'list') {
    const backups = await listBackups(baseUrl, token);
    for (const record of backups) {
      const name = backupRecordName(record);
      const size = record.size || record.sizeBytes || 0;
      const modified = record.modified || record.updated || '';
      console.log(`${name}\t${size}\t${modified}`);
    }
    return;
  }

  let backupName = env.PB_BACKUP_NAME || `coldwaterkim-production-${timestamp()}.zip`;
  let createdRemoteBackup = true;

  if (command === 'download') {
    backupName = args[1];
    createdRemoteBackup = false;
    if (!backupName) usage(1);
  } else if (command !== 'create') {
    usage(1);
  } else {
    await createBackup(baseUrl, token, backupName);
  }

  const backups = await listBackups(baseUrl, token);
  if (!backups.some(record => backupRecordName(record) === backupName)) {
    throw new Error(`Backup was not found after ${createdRemoteBackup ? 'create' : 'lookup'}: ${backupName}`);
  }

  const outputFile = path.join(outputDir, backupName);
  const result = await downloadBackup(baseUrl, token, backupName, outputFile);
  const manifest = {
    source: baseUrl,
    backupName,
    createdRemoteBackup,
    downloadedAt: new Date().toISOString(),
    outputFile,
    sizeBytes: result.sizeBytes,
    sha256: result.sha256,
    magic: result.magic,
  };
  await fsp.writeFile(`${outputFile}.manifest.json`, `${JSON.stringify(manifest, null, 2)}\n`);

  if (env.PB_DELETE_REMOTE_AFTER_DOWNLOAD === '1') {
    await deleteBackup(baseUrl, token, backupName);
    manifest.deletedRemoteBackup = true;
    await fsp.writeFile(`${outputFile}.manifest.json`, `${JSON.stringify(manifest, null, 2)}\n`);
  }

  const relativeOutput = path.relative(root, outputFile);
  const displayFile = relativeOutput.startsWith('..') ? outputFile : relativeOutput;

  console.log(`PocketBase backup downloaded
source: ${baseUrl}
backup: ${backupName}
file: ${displayFile}
size: ${result.sizeBytes} bytes
sha256: ${result.sha256}`);
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});

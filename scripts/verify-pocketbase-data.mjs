import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const target = args[0];

const defaultCollections = [
  'daily_entries',
  'guestbook',
  'media',
  'nasajab',
  'posts',
  'programs',
  'site_settings',
];

function usage(exitCode = 0) {
  console.log(`PocketBase data verifier

Usage:
  node scripts/verify-pocketbase-data.mjs <pb_data-dir-or-backup.zip>
  node scripts/verify-pocketbase-data.mjs <pb_data-dir-or-backup.zip> --schema pb_schema.json

Options:
  --schema <file>              require all collections listed in a PocketBase schema export
  --allow-missing <a,b,c>      do not fail if these collections are missing
`);
  process.exit(exitCode);
}

if (!target || target === '-h' || target === '--help') usage(target ? 0 : 1);

function optionValue(name) {
  const index = args.indexOf(name);
  if (index === -1) return '';
  return args[index + 1] || '';
}

function fail(message) {
  console.error(message);
  process.exitCode = 1;
}

function run(command, commandArgs, options = {}) {
  const result = spawnSync(command, commandArgs, {
    encoding: 'utf8',
    ...options,
  });
  if (result.status !== 0) {
    const output = [result.stdout, result.stderr].filter(Boolean).join('\n').trim();
    throw new Error(`${command} ${commandArgs.join(' ')} failed${output ? `:\n${output}` : ''}`);
  }
  return result.stdout.trim();
}

function sqlite(dbFile, sql) {
  return run('sqlite3', ['-separator', '\t', dbFile, sql]);
}

function quoteIdent(identifier) {
  return `"${identifier.replace(/"/g, '""')}"`;
}

function loadSchemaCollections(schemaFile) {
  if (!schemaFile) return defaultCollections;
  const schemaPath = path.resolve(root, schemaFile);
  const parsed = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
  const collections = Array.isArray(parsed) ? parsed : parsed.collections || [];
  return collections.map(collection => collection.name).filter(Boolean).sort();
}

function parseAllowMissing() {
  return new Set(
    optionValue('--allow-missing')
      .split(',')
      .map(name => name.trim())
      .filter(Boolean),
  );
}

async function resolveDataDir(input) {
  const absolute = path.resolve(root, input);
  const stat = fs.statSync(absolute);
  if (stat.isDirectory()) return { dataDir: absolute, cleanup: async () => {} };
  if (!stat.isFile() || !absolute.endsWith('.zip')) {
    throw new Error(`Expected a pb_data directory or PocketBase backup .zip: ${input}`);
  }

  const tempDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'coldwaterkim-pb-verify-'));
  run('unzip', ['-tq', absolute]);
  run('unzip', ['-q', absolute, '-d', tempDir]);
  return {
    dataDir: tempDir,
    cleanup: async () => fsp.rm(tempDir, { recursive: true, force: true }),
  };
}

function parseTsvRows(output) {
  if (!output) return [];
  return output.split('\n').map(line => line.split('\t'));
}

function inspectCollections(dbFile) {
  return parseTsvRows(
    sqlite(dbFile, "select name, type, system from _collections order by name;"),
  ).map(([name, type, system]) => ({ name, type, system: system === '1' }));
}

function inspectFileLimit(dbFile, collection, field) {
  const sql = `
    select json_extract(f.value, '$.maxSize')
    from _collections c, json_each(c.fields) f
    where c.name = '${collection.replace(/'/g, "''")}'
      and json_extract(f.value, '$.name') = '${field.replace(/'/g, "''")}'
    limit 1;
  `;
  const value = sqlite(dbFile, sql).trim();
  return value ? Number(value) : null;
}

function inspectRecordCounts(dbFile, collections) {
  const counts = {};
  for (const collection of collections) {
    try {
      counts[collection] = Number(sqlite(dbFile, `select count(*) from ${quoteIdent(collection)};`));
    } catch {
      counts[collection] = null;
    }
  }
  return counts;
}

async function countStorageFiles(dataDir) {
  const storageDir = path.join(dataDir, 'storage');
  if (!fs.existsSync(storageDir)) return 0;

  let count = 0;
  async function walk(dir) {
    const entries = await fsp.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
      } else if (entry.isFile()) {
        count += 1;
      }
    }
  }
  await walk(storageDir);
  return count;
}

async function main() {
  const schemaFile = optionValue('--schema');
  const requiredCollections = loadSchemaCollections(schemaFile);
  const allowMissing = parseAllowMissing();
  const { dataDir, cleanup } = await resolveDataDir(target);

  try {
    const dbFile = path.join(dataDir, 'data.db');
    if (!fs.existsSync(dbFile)) {
      fail(`Missing data.db in ${dataDir}`);
      return;
    }

    const integrity = sqlite(dbFile, 'pragma integrity_check;');
    if (integrity !== 'ok') fail(`SQLite integrity_check failed: ${integrity}`);

    const collections = inspectCollections(dbFile);
    const collectionNames = new Set(collections.map(collection => collection.name));
    const missing = requiredCollections.filter(name => !collectionNames.has(name) && !allowMissing.has(name));
    if (missing.length) fail(`Missing required collections: ${missing.join(', ')}`);

    const mediaMaxSize = inspectFileLimit(dbFile, 'media', 'file');
    const programMaxSize = inspectFileLimit(dbFile, 'programs', 'download_files');
    if (mediaMaxSize !== 2147483648) fail(`media.file maxSize is ${mediaMaxSize}, expected 2147483648`);
    if (programMaxSize !== 2147483648) fail(`programs.download_files maxSize is ${programMaxSize}, expected 2147483648`);

    const recordCounts = inspectRecordCounts(
      dbFile,
      collections
        .filter(collection => !collection.system && collection.type !== 'view')
        .map(collection => collection.name),
    );
    const storageFiles = await countStorageFiles(dataDir);

    const hasFailure = Boolean(process.exitCode);
    console.log(hasFailure ? 'PocketBase data inspection completed with failures' : 'PocketBase data verified');
    console.log(`dataDir: ${dataDir}`);
    console.log(`collections: ${collections.length}`);
    console.log(`storageFiles: ${storageFiles}`);
    console.log(`media.file maxSize: ${mediaMaxSize}`);
    console.log(`programs.download_files maxSize: ${programMaxSize}`);
    console.log('recordCounts:');
    for (const [collection, count] of Object.entries(recordCounts).sort()) {
      console.log(`  ${collection}: ${count ?? 'unavailable'}`);
    }
  } finally {
    await cleanup();
  }

  if (process.exitCode) process.exit();
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});

import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);

function usage(exitCode = 0) {
  console.log(`PocketBase public API export

Usage:
  node scripts/pocketbase-public-export.mjs

Environment:
  PB_URL                 default: https://api.coldwaterkim.com
  PB_SCHEMA_FILE         default: pb_schema.json
  PB_PUBLIC_EXPORT_DIR   default: migration_backups/public-api
`);
  process.exit(exitCode);
}

if (args.includes('--help') || args.includes('-h')) usage(0);

function expandHome(input) {
  if (!input) return input;
  if (input === '~') return os.homedir();
  if (input.startsWith('~/')) return path.join(os.homedir(), input.slice(2));
  return input;
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

async function requestJson(url, options = {}) {
  const response = await fetch(url, options);
  if (!response.ok) {
    throw new Error(`${options.method || 'GET'} ${url} failed: ${response.status} ${await readError(response)}`);
  }
  const text = await response.text();
  return text ? JSON.parse(text) : {};
}

function loadSchema(schemaFile) {
  const absolute = path.resolve(root, expandHome(schemaFile));
  const parsed = JSON.parse(fs.readFileSync(absolute, 'utf8'));
  const collections = Array.isArray(parsed) ? parsed : parsed.collections || [];
  return collections.filter(collection => collection?.name);
}

function fileFields(collection) {
  return (collection.fields || [])
    .filter(field => field.type === 'file')
    .map(field => field.name);
}

function normalizeFiles(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.filter(Boolean);
  if (typeof value === 'string') return [value];
  return [];
}

function fileUrl(baseUrl, collectionName, recordId, filename) {
  return [
    baseUrl,
    'api',
    'files',
    encodeURIComponent(collectionName),
    encodeURIComponent(recordId),
    encodeURIComponent(filename),
  ].join('/');
}

async function writeJson(file, data) {
  await fsp.mkdir(path.dirname(file), { recursive: true });
  await fsp.writeFile(`${file}.tmp`, `${JSON.stringify(data, null, 2)}\n`);
  await fsp.rename(`${file}.tmp`, file);
}

async function downloadFile(url, outputFile) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`GET ${url} failed: ${response.status} ${await readError(response)}`);
  }

  await fsp.mkdir(path.dirname(outputFile), { recursive: true });
  const partialFile = `${outputFile}.partial`;
  const file = await fsp.open(partialFile, 'w');
  const hash = crypto.createHash('sha256');
  let sizeBytes = 0;

  try {
    for await (const chunk of response.body) {
      const buffer = Buffer.from(chunk);
      hash.update(buffer);
      sizeBytes += buffer.length;
      await file.write(buffer);
    }
  } finally {
    await file.close();
  }

  await fsp.rename(partialFile, outputFile);
  return { sizeBytes, sha256: hash.digest('hex') };
}

async function exportCollection(baseUrl, outputDir, collection) {
  const perPage = 500;
  let page = 1;
  const items = [];
  let totalItems = 0;
  let totalPages = 1;

  while (page <= totalPages) {
    const url = `${baseUrl}/api/collections/${encodeURIComponent(collection.name)}/records?page=${page}&perPage=${perPage}`;
    const data = await requestJson(url);
    totalItems = data.totalItems || 0;
    totalPages = data.totalPages || 0;
    items.push(...(data.items || []));
    if (!totalPages) break;
    page += 1;
  }

  await writeJson(path.join(outputDir, 'collections', `${collection.name}.json`), {
    collection: collection.name,
    exportedAt: new Date().toISOString(),
    totalItems,
    items,
  });

  return { totalItems, items };
}

async function exportFiles(baseUrl, outputDir, collection, items) {
  const fields = fileFields(collection);
  const downloads = [];
  const failures = [];

  for (const record of items) {
    for (const field of fields) {
      for (const filename of normalizeFiles(record[field])) {
        const url = fileUrl(baseUrl, collection.name, record.id, filename);
        const outputFile = path.join(outputDir, 'files', collection.name, record.id, filename);
        try {
          const result = await downloadFile(url, outputFile);
          downloads.push({
            collection: collection.name,
            recordId: record.id,
            field,
            filename,
            url,
            path: path.relative(outputDir, outputFile),
            ...result,
          });
        } catch (error) {
          failures.push({
            collection: collection.name,
            recordId: record.id,
            field,
            filename,
            url,
            error: error.message,
          });
        }
      }
    }
  }

  return { downloads, failures };
}

async function main() {
  const baseUrl = normalizeBaseUrl(process.env.PB_URL || 'https://api.coldwaterkim.com');
  const schemaFile = process.env.PB_SCHEMA_FILE || 'pb_schema.json';
  const outputRoot = path.resolve(root, expandHome(process.env.PB_PUBLIC_EXPORT_DIR || 'migration_backups/public-api'));
  const outputDir = path.join(outputRoot, `coldwaterkim-public-${timestamp()}`);
  const collections = loadSchema(schemaFile);
  const manifest = {
    kind: 'pocketbase-public-api-export',
    warning: 'This is not a full PocketBase backup. It contains only records and files readable through public API rules.',
    baseUrl,
    schemaFile,
    outputDir,
    startedAt: new Date().toISOString(),
    collections: [],
    files: [],
    fileFailures: [],
  };

  await fsp.mkdir(outputDir, { recursive: true });

  for (const collection of collections) {
    try {
      const { totalItems, items } = await exportCollection(baseUrl, outputDir, collection);
      const { downloads, failures } = await exportFiles(baseUrl, outputDir, collection, items);
      manifest.collections.push({
        name: collection.name,
        status: 'exported',
        recordCount: items.length,
        totalItems,
        fileCount: downloads.length,
        fileFailureCount: failures.length,
      });
      manifest.files.push(...downloads);
      manifest.fileFailures.push(...failures);
    } catch (error) {
      manifest.collections.push({
        name: collection.name,
        status: 'skipped',
        reason: error.message,
      });
    }
  }

  manifest.completedAt = new Date().toISOString();
  manifest.summary = {
    exportedCollections: manifest.collections.filter(collection => collection.status === 'exported').length,
    skippedCollections: manifest.collections.filter(collection => collection.status === 'skipped').length,
    downloadedFiles: manifest.files.length,
    fileFailures: manifest.fileFailures.length,
  };

  await writeJson(path.join(outputDir, 'manifest.json'), manifest);

  console.log('PocketBase public API export completed');
  console.log(`outputDir: ${outputDir}`);
  console.log(`exportedCollections: ${manifest.summary.exportedCollections}`);
  console.log(`skippedCollections: ${manifest.summary.skippedCollections}`);
  console.log(`downloadedFiles: ${manifest.summary.downloadedFiles}`);
  console.log(`fileFailures: ${manifest.summary.fileFailures}`);

  if (!manifest.summary.exportedCollections || manifest.summary.fileFailures) {
    process.exitCode = 1;
  }
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});

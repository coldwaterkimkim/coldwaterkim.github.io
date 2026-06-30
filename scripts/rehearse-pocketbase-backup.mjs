import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const valueOptions = new Set(['--schema', '--allow-missing', '--target-dir', '--port']);
const flags = new Set();
const options = new Map();
const positional = [];

for (let index = 0; index < args.length; index += 1) {
  const arg = args[index];
  if (valueOptions.has(arg)) {
    options.set(arg, args[index + 1] || '');
    index += 1;
  } else if (arg.startsWith('-')) {
    flags.add(arg);
  } else {
    positional.push(arg);
  }
}

function usage(exitCode = 0) {
  console.log(`PocketBase backup rehearsal

Usage:
  node scripts/rehearse-pocketbase-backup.mjs <backup.zip>
  node scripts/rehearse-pocketbase-backup.mjs --download

Options:
  --download                 create/download a production backup before rehearsing
  --schema <file>            schema file for data verification, default: pb_schema.json
  --allow-missing <a,b,c>    passed through to verify-pocketbase-data.mjs
  --target-dir <dir>         restore target, default: migration_backups/restore-rehearsals/<backup>-pb_data
  --overwrite                allow replacing the target dir
  --port <number>            temporary PocketBase port, default: 18092
`);
  process.exit(exitCode);
}

if (flags.has('-h') || flags.has('--help') || positional.includes('help')) usage(0);

function hasFlag(name) {
  return flags.has(name);
}

function optionValue(name, fallback = '') {
  return options.get(name) || fallback;
}

function timestamp() {
  return new Date().toISOString().replace(/\D/g, '').slice(0, 14);
}

function run(command, commandArgs, options = {}) {
  const result = spawnSync(command, commandArgs, {
    cwd: root,
    encoding: 'utf8',
    ...options,
  });
  if (result.status !== 0) {
    const output = [result.stdout, result.stderr].filter(Boolean).join('\n').trim();
    throw new Error(`${command} ${commandArgs.join(' ')} failed${output ? `:\n${output}` : ''}`);
  }
  return result;
}

function displayPath(file) {
  const relative = path.relative(root, file);
  return relative.startsWith('..') ? file : relative;
}

function resolveFromRoot(input) {
  return path.resolve(root, input);
}

function parseDownloadedFile(stdout) {
  const fileLine = stdout.split(/\r?\n/).find(line => line.startsWith('file: '));
  if (!fileLine) {
    throw new Error('Could not find downloaded backup path in backup command output.');
  }
  return resolveFromRoot(fileLine.slice('file: '.length).trim());
}

function backupBaseName(backupFile) {
  return path.basename(backupFile).replace(/\.zip$/i, '');
}

function defaultTargetDir(backupFile) {
  return path.join('migration_backups', 'restore-rehearsals', `${backupBaseName(backupFile)}-pb_data`);
}

function verifyData(target, schemaFile, allowMissing) {
  const commandArgs = ['scripts/verify-pocketbase-data.mjs', target];
  if (schemaFile) commandArgs.push('--schema', schemaFile);
  if (allowMissing) commandArgs.push('--allow-missing', allowMissing);
  run(process.execPath, commandArgs);
}

async function waitForHealth(url, child, timeoutMs = 15000) {
  const startedAt = Date.now();
  let exited = false;
  let exitCode = null;

  child.once('exit', code => {
    exited = true;
    exitCode = code;
  });

  while (Date.now() - startedAt < timeoutMs) {
    if (exited) {
      throw new Error(`PocketBase exited before health check passed. Exit code: ${exitCode}`);
    }

    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // Retry until timeout; PocketBase may still be opening the DB.
    }

    await new Promise(resolve => setTimeout(resolve, 250));
  }

  throw new Error(`Timed out waiting for ${url}`);
}

async function runPocketBaseHealthCheck(dataDir, port) {
  const pocketbase = path.join(root, '.local-bin', 'pocketbase');
  if (!fs.existsSync(pocketbase)) {
    throw new Error(`Missing PocketBase binary: ${displayPath(pocketbase)}`);
  }

  const child = spawn(
    pocketbase,
    [
      'serve',
      `--http=127.0.0.1:${port}`,
      `--dir=${dataDir}`,
      `--migrationsDir=${path.join(root, 'pb_migrations')}`,
    ],
    {
      cwd: root,
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );

  let logs = '';
  const appendLogs = chunk => {
    logs += chunk.toString();
    if (logs.length > 12000) logs = logs.slice(-12000);
  };
  child.stdout.on('data', appendLogs);
  child.stderr.on('data', appendLogs);

  try {
    await waitForHealth(`http://127.0.0.1:${port}/api/health`, child);
  } catch (error) {
    throw new Error(`${error.message}${logs ? `\nPocketBase output:\n${logs}` : ''}`);
  } finally {
    const closed = new Promise(resolve => {
      if (child.exitCode !== null || child.signalCode !== null) {
        resolve();
      } else {
        child.once('close', resolve);
      }
    });
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM');
    await closed;
  }
}

async function main() {
  const shouldDownload = hasFlag('--download');
  const backupArg = positional[0];
  const schemaFile = optionValue('--schema', 'pb_schema.json');
  const allowMissing = optionValue('--allow-missing');
  const overwrite = hasFlag('--overwrite');
  const port = Number(optionValue('--port', process.env.PB_REHEARSAL_PORT || '18092'));

  if (!Number.isInteger(port) || port < 1024 || port > 65535) {
    throw new Error(`Invalid --port value: ${port}`);
  }
  if (shouldDownload && backupArg) {
    throw new Error('Use either --download or <backup.zip>, not both.');
  }
  if (!shouldDownload && !backupArg) usage(1);

  let backupFile = backupArg ? resolveFromRoot(backupArg) : '';
  if (shouldDownload) {
    const result = run(process.execPath, ['scripts/pocketbase-remote-backup.mjs']);
    process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    backupFile = parseDownloadedFile(result.stdout);
  }

  if (!fs.existsSync(backupFile)) {
    throw new Error(`Backup file not found: ${displayPath(backupFile)}`);
  }

  const targetDir = resolveFromRoot(optionValue('--target-dir', defaultTargetDir(backupFile)));
  const targetExists = fs.existsSync(targetDir);
  if (targetExists && !overwrite) {
    throw new Error(`Target already exists: ${displayPath(targetDir)}. Use --overwrite after checking it is safe.`);
  }

  console.log(`Testing archive: ${displayPath(backupFile)}`);
  run('unzip', ['-tq', backupFile]);

  console.log('Verifying backup ZIP data...');
  verifyData(backupFile, schemaFile, allowMissing);

  console.log(`Restoring to rehearsal dir: ${displayPath(targetDir)}`);
  run('bash', ['deploy/imac/restore-pocketbase-backup.sh', backupFile, targetDir], {
    env: {
      ...process.env,
      ALLOW_OVERWRITE: overwrite ? '1' : '0',
    },
  });

  console.log('Verifying restored data...');
  verifyData(targetDir, schemaFile, allowMissing);

  console.log(`Starting temporary PocketBase health check on 127.0.0.1:${port}...`);
  await runPocketBaseHealthCheck(targetDir, port);

  const manifestDir = path.join(root, 'migration_backups', 'rehearsals');
  await fsp.mkdir(manifestDir, { recursive: true });
  const manifestFile = path.join(manifestDir, `${timestamp()}-${backupBaseName(backupFile)}.json`);
  await fsp.writeFile(
    manifestFile,
    `${JSON.stringify({
      backupFile: displayPath(backupFile),
      targetDir: displayPath(targetDir),
      schemaFile,
      allowMissing: allowMissing || null,
      healthUrl: `http://127.0.0.1:${port}/api/health`,
      verifiedAt: new Date().toISOString(),
    }, null, 2)}\n`,
  );

  console.log(`PocketBase backup rehearsal passed
backup: ${displayPath(backupFile)}
restore: ${displayPath(targetDir)}
manifest: ${displayPath(manifestFile)}`);
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const allowMissingEnv = args.includes('--allow-missing-env');
const envFileArgIndex = args.indexOf('--env-file');
const envFileInput = envFileArgIndex === -1 ? '' : args[envFileArgIndex + 1] || '';
const envFile = expandHome(
  envFileInput || process.env.PB_ADMIN_ENV_FILE || '~/.config/coldwaterkim/pocketbase-admin.env',
);
const checks = [];

function expandHome(input) {
  if (!input) return input;
  if (input === '~') return os.homedir();
  if (input.startsWith('~/')) return path.join(os.homedir(), input.slice(2));
  return input;
}

function record(name, ok, detail = '') {
  checks.push({ name, ok, detail });
}

function requireCondition(name, condition, detail = '') {
  record(name, Boolean(condition), detail);
}

function readText(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function run(command, commandArgs) {
  const result = spawnSync(command, commandArgs, {
    cwd: root,
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    const output = [result.stdout, result.stderr].filter(Boolean).join('\n').trim();
    throw new Error(`${command} ${commandArgs.join(' ')} failed${output ? `:\n${output}` : ''}`);
  }
  return result.stdout.trim();
}

function mode(file) {
  return fs.statSync(file).mode & 0o777;
}

function formatMode(value) {
  return `0${value.toString(8)}`;
}

function modeAtMost(file, maxMode) {
  const current = mode(file);
  return {
    ok: (current & ~maxMode) === 0,
    current,
  };
}

function parseEnvFile(file) {
  const values = {};
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
    values[match[1]] = value;
  }
  return values;
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

function verifyPackageScripts() {
  const packageJson = JSON.parse(readText('package.json'));
  const scripts = packageJson.scripts || {};
  for (const name of [
    'pb:backup:production',
    'pb:configure:production',
    'pb:preflight:production',
    'pb:rehearse:production',
    'pb:verify:data',
    'qa:migration-freeze',
    'qa:migration-go',
    'qa:migration-go:tooling',
    'qa:production-readiness',
  ]) {
    requireCondition(`package script ${name}`, Boolean(scripts[name]), scripts[name] || 'missing');
  }
}

function verifyToolingFiles() {
  for (const file of [
    'scripts/pocketbase-remote-backup.mjs',
    'scripts/rehearse-pocketbase-backup.mjs',
    'scripts/verify-migration-freeze.mjs',
    'scripts/verify-pocketbase-data.mjs',
    'deploy/imac/configure-pocketbase-admin-env.sh',
    'deploy/imac/run-interactive-production-gates.command',
    'deploy/oracle/reset-pocketbase-superuser.sh',
    'deploy/imac/restore-pocketbase-backup.sh',
    'deploy/imac/pocketbase-admin.env.example',
    'pb_schema.json',
  ]) {
    requireCondition(`required file ${file}`, fs.existsSync(path.join(root, file)));
  }

  const schema = JSON.parse(readText('pb_schema.json'));
  requireCondition('pb_schema.json has collections', Array.isArray(schema) ? schema.length > 0 : Array.isArray(schema.collections));

  try {
    const trackedData = run('git', ['ls-files', 'pb_data', 'migration_backups']).trim();
    requireCondition('pb_data and migration_backups are not tracked', trackedData.length === 0, trackedData || 'not tracked');
  } catch (error) {
    record('pb_data and migration_backups are not tracked', false, error.message);
  }

  const pocketbase = path.join(root, '.local-bin', 'pocketbase');
  requireCondition('local PocketBase binary exists', fs.existsSync(pocketbase), '.local-bin/pocketbase');
  if (fs.existsSync(pocketbase)) {
    try {
      fs.accessSync(pocketbase, fs.constants.X_OK);
      record('local PocketBase binary executable', true);
    } catch {
      record('local PocketBase binary executable', false, '.local-bin/pocketbase');
    }
  }

  const interactiveGates = path.join(root, 'deploy/imac/run-interactive-production-gates.command');
  if (fs.existsSync(interactiveGates)) {
    try {
      fs.accessSync(interactiveGates, fs.constants.X_OK);
      record('interactive production gates executable', true);
    } catch {
      record('interactive production gates executable', false, 'deploy/imac/run-interactive-production-gates.command');
    }

    try {
      run('bash', ['-n', 'deploy/imac/run-interactive-production-gates.command']);
      record('interactive production gates shell syntax', true);
    } catch (error) {
      record('interactive production gates shell syntax', false, error.message);
    }
  }

  const resetSuperuser = path.join(root, 'deploy/oracle/reset-pocketbase-superuser.sh');
  if (fs.existsSync(resetSuperuser)) {
    try {
      fs.accessSync(resetSuperuser, fs.constants.X_OK);
      record('Oracle superuser reset executable', true);
    } catch {
      record('Oracle superuser reset executable', false, 'deploy/oracle/reset-pocketbase-superuser.sh');
    }

    try {
      run('bash', ['-n', 'deploy/oracle/reset-pocketbase-superuser.sh']);
      record('Oracle superuser reset shell syntax', true);
    } catch (error) {
      record('Oracle superuser reset shell syntax', false, error.message);
    }
  }
}

function verifyMigrationFreeze() {
  try {
    const output = run(process.execPath, ['scripts/verify-migration-freeze.mjs']);
    const lastLine = output.split(/\r?\n/).filter(Boolean).at(-1) || '';
    record('migration freeze gate passes', true, lastLine);
  } catch (error) {
    record('migration freeze gate passes', false, error.message);
  }
}

function verifyEnvTemplate() {
  const template = parseEnvFile(path.join(root, 'deploy/imac/pocketbase-admin.env.example'));
  requireCondition('env template has PB_URL', template.PB_URL === 'https://api.coldwaterkim.com');
  requireCondition('env template has PB_ADMIN_EMAIL', Boolean(template.PB_ADMIN_EMAIL));
  requireCondition('env template has PB_ADMIN_PASSWORD', Boolean(template.PB_ADMIN_PASSWORD));
  requireCondition('env template is ignored when copied bare', readText('.gitignore').includes('pocketbase-admin.env'));
}

function verifyAdminEnv() {
  const exists = fs.existsSync(envFile);
  if (!exists) {
    record(
      allowMissingEnv ? 'production admin env file missing allowed' : 'production admin env file present',
      allowMissingEnv,
      envFile,
    );
    return;
  }

  record('production admin env file present', true, envFile);

  const dirCheck = modeAtMost(path.dirname(envFile), 0o700);
  requireCondition(
    'production admin env directory is private',
    dirCheck.ok,
    `${path.dirname(envFile)} mode ${formatMode(dirCheck.current)}`,
  );

  const fileCheck = modeAtMost(envFile, 0o600);
  requireCondition(
    'production admin env file is private',
    fileCheck.ok,
    `${envFile} mode ${formatMode(fileCheck.current)}`,
  );

  const values = parseEnvFile(envFile);
  const requiredKeys = ['PB_URL', 'PB_ADMIN_EMAIL', 'PB_ADMIN_PASSWORD'];
  for (const key of requiredKeys) {
    requireCondition(`production admin env has ${key}`, Boolean(values[key]));
  }

  if (values.PB_URL) {
    let url = null;
    try {
      url = new URL(values.PB_URL);
    } catch {
      // handled below
    }
    requireCondition('PB_URL is a valid URL', Boolean(url));
    if (url) {
      requireCondition('PB_URL uses HTTPS', url.protocol === 'https:');
    }
  }

  for (const key of ['PB_ADMIN_EMAIL', 'PB_ADMIN_PASSWORD']) {
    if (values[key]) {
      const placeholder = isPlaceholder(values[key]);
      requireCondition(
        placeholder && allowMissingEnv ? `${key} template placeholder allowed` : `${key} is not a template placeholder`,
        allowMissingEnv || !placeholder,
      );
    }
  }
}

function verifyReadme() {
  const readme = readText('deploy/imac/README.md');
  requireCondition('README documents env template', readme.includes('pocketbase-admin.env.example'));
  requireCondition('README documents production preflight', readme.includes('npm run pb:preflight:production'));
  requireCondition('README documents migration go/no-go QA', readme.includes('npm run qa:migration-go'));
  requireCondition('README documents readiness QA', readme.includes('npm run qa:production-readiness'));
  requireCondition('README documents interactive production gates', readme.includes('run-interactive-production-gates.command'));
  requireCondition('README documents superuser recovery', readme.includes('reset-pocketbase-superuser.sh'));
}

function printSummary() {
  const failed = checks.filter(check => !check.ok);
  for (const check of checks) {
    const status = check.ok ? 'ok' : 'FAIL';
    console.log(`${status}  ${check.name}${check.detail ? ` - ${check.detail}` : ''}`);
  }

  if (failed.length) {
    console.error(`Production migration readiness failed (${failed.length}/${checks.length})`);
    process.exitCode = 1;
    return;
  }

  console.log(`Production migration readiness passed (${checks.length} checks)`);
}

function main() {
  verifyPackageScripts();
  verifyToolingFiles();
  verifyMigrationFreeze();
  verifyEnvTemplate();
  verifyAdminEnv();
  verifyReadme();
  printSummary();
}

main();

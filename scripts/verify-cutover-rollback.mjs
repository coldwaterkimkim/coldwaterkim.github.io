import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const checks = [];

function record(name, ok, detail = '') {
  checks.push({ name, ok, detail });
}

function requireCondition(name, condition, detail = '') {
  record(name, Boolean(condition), detail);
}

function readText(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function run(command, commandArgs, allowFailure = false) {
  const result = spawnSync(command, commandArgs, {
    cwd: root,
    encoding: 'utf8',
  });
  const output = [result.stdout, result.stderr].filter(Boolean).join('\n').trim();
  if (result.status !== 0 && !allowFailure) {
    throw new Error(`${command} ${commandArgs.join(' ')} failed${output ? `:\n${output}` : ''}`);
  }
  return {
    ok: result.status === 0,
    output,
  };
}

function verifyPackageScripts() {
  const packageJson = JSON.parse(readText('package.json'));
  const scripts = packageJson.scripts || {};
  for (const name of ['cutover:snapshot', 'cutover:snapshot:dry-run', 'qa:rollback']) {
    requireCondition(`package script ${name}`, Boolean(scripts[name]), scripts[name] || 'missing');
  }
}

function verifySnapshotScript() {
  const relativePath = 'scripts/capture-cutover-snapshot.mjs';
  const scriptPath = path.join(root, relativePath);
  requireCondition('cutover snapshot script exists', fs.existsSync(scriptPath), relativePath);
  if (!fs.existsSync(scriptPath)) return;

  try {
    run(process.execPath, ['--check', relativePath]);
    record('cutover snapshot script syntax', true);
  } catch (error) {
    record('cutover snapshot script syntax', false, error.message);
  }

  const script = readText(relativePath);
  requireCondition('snapshot captures coldwaterkim.com DNS', script.includes("'coldwaterkim.com'"));
  requireCondition('snapshot captures www DNS', script.includes("'www.coldwaterkim.com'"));
  requireCondition('snapshot captures api DNS', script.includes("'api.coldwaterkim.com'"));
  requireCondition('snapshot probes api health', script.includes("'/api/health'"));
  requireCondition('snapshot records git head', script.includes("['rev-parse', 'HEAD']"));
  requireCondition('snapshot records local IPv4s', script.includes('localIPv4s'));
  requireCondition('snapshot writes into migration_backups by default', script.includes('migration_backups/cutover'));
  requireCondition('snapshot writes private file mode', script.includes('mode: 0o600'));

  const dryRun = run(process.execPath, [relativePath, '--dry-run', '--allow-network-failures'], true);
  requireCondition('snapshot dry-run succeeds', dryRun.ok, dryRun.output);
  if (dryRun.ok) {
    try {
      const parsed = JSON.parse(dryRun.output);
      requireCondition('snapshot has capturedAt', Boolean(parsed.capturedAt));
      requireCondition('snapshot has git head', Boolean(parsed.git?.head));
      requireCondition('snapshot has rollback DNS records', Boolean(parsed.rollbackTargets?.dnsRecords));
      requireCondition('snapshot has route probes', Boolean(parsed.probes?.routes));
      requireCondition('snapshot has rollback notes', Array.isArray(parsed.notes) && parsed.notes.length >= 3);
    } catch (error) {
      record('snapshot dry-run emits JSON', false, error.message);
    }
  }
}

function verifyReadme() {
  const readme = readText('deploy/imac/README.md');
  requireCondition('README documents cutover snapshot', readme.includes('npm run cutover:snapshot'));
  requireCondition('README documents snapshot dry-run', readme.includes('npm run cutover:snapshot:dry-run'));
  requireCondition('README documents rollback QA', readme.includes('npm run qa:rollback'));
  requireCondition('README documents keeping Oracle online', readme.includes('Oracle API 서버와 GitHub Pages 배포는 7일 이상'));
}

function verifyIgnore() {
  const gitignore = readText('.gitignore');
  requireCondition('migration_backups ignored', gitignore.includes('migration_backups'));

  try {
    const tracked = run('git', ['ls-files', 'migration_backups']).output;
    requireCondition('migration_backups not tracked', tracked.length === 0, tracked || 'not tracked');
  } catch (error) {
    record('migration_backups not tracked', false, error.message);
  }
}

function printSummary() {
  const failed = checks.filter(check => !check.ok);
  for (const check of checks) {
    const status = check.ok ? 'ok' : 'FAIL';
    console.log(`${status}  ${check.name}${check.detail ? ` - ${check.detail}` : ''}`);
  }

  if (failed.length) {
    console.error(`Cutover rollback verification failed (${failed.length}/${checks.length})`);
    process.exitCode = 1;
    return;
  }

  console.log(`Cutover rollback verification passed (${checks.length} checks)`);
}

function main() {
  verifyPackageScripts();
  verifySnapshotScript();
  verifyReadme();
  verifyIgnore();
  printSummary();
}

main();

import fs from 'node:fs';
import os from 'node:os';
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

function run(command, commandArgs, allowFailure = false, cwd = root) {
  const result = spawnSync(command, commandArgs, {
    cwd,
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

function verifyDetachedHeadSnapshot(relativePath) {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cwk-cutover-detached-'));
  try {
    fs.mkdirSync(path.join(fixtureRoot, 'scripts'));
    fs.copyFileSync(path.join(root, relativePath), path.join(fixtureRoot, relativePath));
    fs.writeFileSync(path.join(fixtureRoot, 'fixture.txt'), 'detached HEAD fixture\n');

    run('git', ['init'], false, fixtureRoot);
    run('git', ['config', 'user.name', 'Cutover QA'], false, fixtureRoot);
    run('git', ['config', 'user.email', 'cutover-qa@example.invalid'], false, fixtureRoot);
    run('git', ['add', '.'], false, fixtureRoot);
    run('git', ['commit', '-m', 'detached fixture'], false, fixtureRoot);
    const head = run('git', ['rev-parse', 'HEAD'], false, fixtureRoot).output;
    run('git', ['checkout', '--detach', 'HEAD'], false, fixtureRoot);

    const detachedRun = run(
      process.execPath,
      [
        relativePath,
        '--dry-run',
        '--allow-network-failures',
        '--origin',
        'http://127.0.0.1:1',
        '--lan-ip',
        '192.0.2.10',
        '--public-ip',
        '203.0.113.10',
        '--network-env-file',
        path.join(fixtureRoot, 'missing.env'),
      ],
      true,
      fixtureRoot,
    );
    requireCondition('snapshot detached HEAD dry-run succeeds', detachedRun.ok, detachedRun.output);
    if (!detachedRun.ok) return;

    try {
      const parsed = JSON.parse(detachedRun.output);
      requireCondition(
        'snapshot labels detached HEAD with commit',
        parsed.git?.branch === `detached@${head.slice(0, 12)}`,
        parsed.git?.branch || 'missing',
      );
    } catch (error) {
      record('snapshot detached HEAD emits JSON', false, error.message);
    }
  } catch (error) {
    record('snapshot detached HEAD fixture', false, error.message);
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
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
  requireCondition(
    'snapshot uses Apple Git compatible branch detection',
    script.includes("['symbolic-ref', '--quiet', '--short', 'HEAD']"),
  );
  requireCondition(
    'snapshot does not use unsupported branch show-current',
    !script.includes("['branch', '--show-current']"),
  );
  requireCondition('snapshot has detached HEAD fallback', script.includes('detached@'));
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
      const currentBranch = run('git', ['symbolic-ref', '--quiet', '--short', 'HEAD'], true);
      const expectedBranch = currentBranch.ok && currentBranch.output
        ? currentBranch.output
        : `detached@${parsed.git.head.slice(0, 12)}`;
      requireCondition(
        'snapshot records compatible current branch label',
        parsed.git?.branch === expectedBranch,
        parsed.git?.branch || 'missing',
      );
      requireCondition('snapshot has expected home server public IP', Boolean(parsed.expectedHomeServer?.publicIp));
      requireCondition('snapshot has rollback DNS records', Boolean(parsed.rollbackTargets?.dnsRecords));
      requireCondition('snapshot has route probes', Boolean(parsed.probes?.routes));
      requireCondition('snapshot has rollback notes', Array.isArray(parsed.notes) && parsed.notes.length >= 3);
    } catch (error) {
      record('snapshot dry-run emits JSON', false, error.message);
    }
  }

  verifyDetachedHeadSnapshot(relativePath);
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

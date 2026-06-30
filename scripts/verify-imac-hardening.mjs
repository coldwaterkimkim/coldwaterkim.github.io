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

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: 'utf8',
    ...options,
  });
  if (result.status !== 0) {
    const output = [result.stdout, result.stderr].filter(Boolean).join('\n').trim();
    throw new Error(`${command} ${args.join(' ')} failed${output ? `:\n${output}` : ''}`);
  }
  return result.stdout.trim();
}

function isExecutable(file) {
  try {
    fs.accessSync(file, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function verifyPackageScripts() {
  const packageJson = JSON.parse(readText('package.json'));
  const scripts = packageJson.scripts || {};
  requireCondition('package script qa:hardening', Boolean(scripts['qa:hardening']), scripts['qa:hardening'] || 'missing');
  requireCondition('package script qa:launchd', Boolean(scripts['qa:launchd']), scripts['qa:launchd'] || 'missing');
  requireCondition('package script qa:launchd:tooling', Boolean(scripts['qa:launchd:tooling']), scripts['qa:launchd:tooling'] || 'missing');
}

function verifyBackupScript() {
  const scriptPath = path.join(root, 'deploy/imac/backup-pocketbase.sh');
  const script = readText('deploy/imac/backup-pocketbase.sh');

  requireCondition('launchd verifier exists', fs.existsSync(path.join(root, 'scripts/verify-imac-launchd.mjs')));
  requireCondition('backup script executable', isExecutable(scriptPath));
  try {
    run('bash', ['-n', 'deploy/imac/backup-pocketbase.sh']);
    record('backup script syntax', true);
  } catch (error) {
    record('backup script syntax', false, error.message);
  }

  requireCondition('backup script defaults to pb_data', script.includes('PB_DATA_DIR="${PB_DATA_DIR:-$REPO_ROOT/pb_data}"'));
  requireCondition('backup script keeps at least 30 days by default', script.includes('RETENTION_DAYS="${RETENTION_DAYS:-30}"'));
  requireCondition('backup script makes cold backup', script.includes('stop_service_if_needed') && script.includes('start_service_if_needed'));
  requireCondition('backup script validates tar archive', script.includes('tar -tzf "$BACKUP_FILE"'));
  requireCondition('backup script writes sha256 sidecar', script.includes('shasum -a 256 "$BACKUP_FILE" > "$CHECKSUM_FILE"'));
  requireCondition('backup script sets macOS UTF-8 locale', script.includes('en_US.UTF-8'));
}

function verifyBackupPlist() {
  const plistPath = 'deploy/imac/com.coldwaterkim.pocketbase-backup.plist';
  const plist = readText(plistPath);

  try {
    run('plutil', ['-lint', plistPath]);
    record('backup plist valid', true);
  } catch (error) {
    record('backup plist valid', false, error.message);
  }

  requireCondition('backup plist label set', plist.includes('com.coldwaterkim.pocketbase-backup'));
  requireCondition('backup plist runs backup script', plist.includes('deploy/imac/backup-pocketbase.sh'));
  requireCondition('backup plist runs daily at 03:30', plist.includes('<integer>3</integer>') && plist.includes('<integer>30</integer>'));
  requireCondition('backup plist sets UTF-8 locale', plist.includes('<key>LANG</key>') && plist.includes('en_US.UTF-8'));
  requireCondition('backup plist logs stdout', plist.includes('coldwaterkim-pocketbase-backup.log'));
  requireCondition('backup plist logs stderr', plist.includes('coldwaterkim-pocketbase-backup.err.log'));
}

function verifyReadme() {
  const readme = readText('deploy/imac/README.md');
  requireCondition('README documents backup launchd install', readme.includes('com.coldwaterkim.pocketbase-backup.plist'));
  requireCondition('README documents sha256 verification', readme.includes('shasum -a 256 -c'));
  requireCondition('README documents qa:hardening', readme.includes('npm run qa:hardening'));
}

function printSummary() {
  const failed = checks.filter(check => !check.ok);
  for (const check of checks) {
    const status = check.ok ? 'ok' : 'FAIL';
    console.log(`${status}  ${check.name}${check.detail ? ` - ${check.detail}` : ''}`);
  }

  if (failed.length) {
    console.error(`iMac hardening verification failed (${failed.length}/${checks.length})`);
    process.exitCode = 1;
    return;
  }

  console.log(`iMac hardening verification passed (${checks.length} checks)`);
}

function main() {
  verifyPackageScripts();
  verifyBackupScript();
  verifyBackupPlist();
  verifyReadme();
  printSummary();
}

main();

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const runtimeRoot = path.join(os.homedir(), '.local', 'share', 'coldwaterkim', 'home-server');
const expectedPocketBaseVersion = '0.40.1';
const expectedGoVersion = '1.27.0';
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

function verifyPocketBaseBuildPins() {
  const module = readText('deploy/imac/pocketbase-custom/go.mod');
  const buildScript = readText('deploy/imac/build-pocketbase-custom.sh');
  const installScript = readText('deploy/imac/install-runtime.sh');

  requireCondition(
    'PocketBase module uses the audited version',
    module.includes(`github.com/pocketbase/pocketbase v${expectedPocketBaseVersion}`),
  );
  requireCondition(
    'PocketBase module uses the audited Go version',
    module.includes(`go ${expectedGoVersion.replace(/\.0$/, '')}`),
  );
  requireCondition(
    'custom build pins the audited PocketBase version',
    buildScript.includes(`POCKETBASE_VERSION="${'${POCKETBASE_VERSION:-'}${expectedPocketBaseVersion}}"`),
  );
  requireCondition(
    'custom build pins the audited Go version',
    buildScript.includes(`GO_VERSION="${'${GO_VERSION:-'}${expectedGoVersion}}"`),
  );
  requireCondition(
    'runtime install matches the custom PocketBase version',
    installScript.includes(`POCKETBASE_VERSION="${'${POCKETBASE_VERSION:-'}${expectedPocketBaseVersion}}"`),
  );
  requireCondition(
    'custom build verifies the exact PocketBase version',
    buildScript.includes('[[ "$VERSION_OUTPUT" != "pocketbase version ${POCKETBASE_VERSION}" ]]'),
  );
  requireCondition(
    'custom build verifies module integrity without rewriting dependencies',
    buildScript.includes('mod tidy -diff')
      && buildScript.includes('mod verify')
      && !/^\s*GOTOOLCHAIN=.*\bmod tidy\s*$/m.test(buildScript),
  );
}

function verifyBackupScript() {
  const scriptPath = path.join(root, 'deploy/imac/backup-pocketbase.sh');
  const script = readText('deploy/imac/backup-pocketbase.sh');
  const programPath = path.join(root, 'deploy/imac/backup-pocketbase.py');
  const program = readText('deploy/imac/backup-pocketbase.py');

  requireCondition('launchd verifier exists', fs.existsSync(path.join(root, 'scripts/verify-imac-launchd.mjs')));
  requireCondition('backup script executable', isExecutable(scriptPath));
  requireCondition('incremental backup program exists', fs.existsSync(programPath));
  try {
    run('bash', ['-n', 'deploy/imac/backup-pocketbase.sh']);
    record('backup script syntax', true);
  } catch (error) {
    record('backup script syntax', false, error.message);
  }

  requireCondition('backup script defaults to runtime pb_data', script.includes('PB_DATA_DIR="${PB_DATA_DIR:-$RUNTIME_ROOT/pb_data}"'));
  requireCondition('backup script keeps 30 days of DB snapshots', script.includes('DATABASE_RETENTION_DAYS="${DATABASE_RETENTION_DAYS:-30}"'));
  requireCondition('backup script delegates to incremental program', script.includes('backup-pocketbase.py') && script.includes('/usr/bin/python3'));
  requireCondition('backup does not stop PocketBase', !script.includes('launchctl bootout') && !program.includes('launchctl'));
  requireCondition('backup uses SQLite online snapshot API', program.includes('source.backup(destination)'));
  requireCondition('backup validates SQLite snapshot', program.includes('PRAGMA quick_check'));
  requireCondition('backup excludes video derivatives', program.includes('("media", "web_video")') && program.includes('("media", "video_poster")'));
  requireCondition('backup originals are append-only', program.includes('append-only backup checksum conflict'));
  requireCondition('backup uses an execution lock', program.includes('fcntl.flock'));
  requireCondition('backup writes sha256 metadata', program.includes('sha256'));
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
  requireCondition('backup plist runs runtime backup script', plist.includes(`${runtimeRoot}/backup-pocketbase.sh`));
  requireCondition(
    'backup plist runs as the non-root service user',
    plist.includes('<key>UserName</key>') && plist.includes('<string>kimchansu</string>'),
  );
  requireCondition(
    'backup plist runs as the staff group',
    plist.includes('<key>GroupName</key>') && plist.includes('<string>staff</string>'),
  );
  requireCondition(
    'backup plist applies umask 077',
    /<key>Umask<\/key>\s*<integer>63<\/integer>/.test(plist),
  );
  requireCondition('backup plist avoids Documents TCC path', !plist.includes('/Documents/'));
  requireCondition('backup plist runs daily at 03:30', plist.includes('<integer>3</integer>') && plist.includes('<integer>30</integer>'));
  requireCondition('backup plist sets UTF-8 locale', plist.includes('<key>LANG</key>') && plist.includes('en_US.UTF-8'));
  requireCondition('backup plist logs stdout', plist.includes('coldwaterkim-pocketbase-backup.log'));
  requireCondition('backup plist logs stderr', plist.includes('coldwaterkim-pocketbase-backup.err.log'));
}

function verifyBackupInstaller() {
  const installer = readText('deploy/imac/install-launchd-services.sh');

  requireCondition('launchd installer supports backup-only mode', installer.includes('--backup-only'));
  requireCondition(
    'backup ownership gate is pinned to the launchd backup root',
    installer.includes('BACKUP_ROOT="/Users/kimchansu/Backups/coldwaterkim-pocketbase"'),
  );
  requireCondition(
    'launchd installer installs runtime backup executables as 0700',
    installer.includes('install -m 700 "$LOCAL_BACKUP_SCRIPT" "$RUNTIME_BACKUP_SCRIPT"')
      && installer.includes('install -m 700 "$LOCAL_BACKUP_PROGRAM" "$RUNTIME_BACKUP_PROGRAM"'),
  );
  requireCondition(
    'backup activation rejects entries not owned by the service user',
    installer.includes('verify_backup_root_ownership')
      && installer.includes('find "$BACKUP_ROOT" ! -user "$BACKUP_OWNER_USER" -print -quit')
      && installer.includes('[[ -L "$BACKUP_ROOT" ]]'),
  );
  requireCondition(
    'backup ownership gate never automatically changes backup ownership',
    !/chown[^\n]*(?:BACKUP_ROOT|BACKUP_DIR)/.test(installer),
  );
}

function verifyReadme() {
  const readme = readText('deploy/imac/README.md');
  requireCondition('README documents backup launchd install', readme.includes('com.coldwaterkim.pocketbase-backup.plist'));
  requireCondition('README documents incremental originals', readme.includes('incremental/originals'));
  requireCondition('README documents DB quick check', readme.includes('PRAGMA quick_check'));
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
  verifyPocketBaseBuildPins();
  verifyBackupScript();
  verifyBackupPlist();
  verifyBackupInstaller();
  verifyReadme();
  printSummary();
}

main();

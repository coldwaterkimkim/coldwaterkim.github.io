import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { migrationTreeSha256, sha256File } from './pocketbase-release-lib.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const allowMissingLive = args.includes('--allow-missing-live');
const checks = [];
const uid = typeof process.getuid === 'function' ? process.getuid() : '';
const runtimeRoot = path.join(os.homedir(), '.local', 'share', 'coldwaterkim', 'home-server');

const services = [
  {
    name: 'PocketBase',
    label: 'com.coldwaterkim.pocketbase',
    domain: 'system',
    plist: 'deploy/imac/com.coldwaterkim.pocketbase.plist',
    expectedProgram: path.join(runtimeRoot, 'bin', 'pocketbase'),
    logFiles: [
      '~/Library/Logs/coldwaterkim-pocketbase.log',
      '~/Library/Logs/coldwaterkim-pocketbase.err.log',
    ],
  },
  {
    name: 'Caddy',
    label: 'com.coldwaterkim.caddy',
    domain: 'system',
    plist: 'deploy/imac/com.coldwaterkim.caddy.plist',
    expectedProgram: '/usr/local/bin/caddy',
    logFiles: [
      '~/Library/Logs/coldwaterkim-caddy.log',
      '~/Library/Logs/coldwaterkim-caddy.err.log',
    ],
  },
  {
    name: 'PocketBase backup',
    label: 'com.coldwaterkim.pocketbase-backup',
    domain: 'system',
    plist: 'deploy/imac/com.coldwaterkim.pocketbase-backup.plist',
    expectedProgram: '/bin/bash',
    logFiles: [
      '~/Library/Logs/coldwaterkim-pocketbase-backup.log',
      '~/Library/Logs/coldwaterkim-pocketbase-backup.err.log',
    ],
  },
];

function usage(exitCode = 0) {
  console.log(`iMac launchd verifier

Usage:
  node scripts/verify-imac-launchd.mjs
  node scripts/verify-imac-launchd.mjs --allow-missing-live

Options:
  --allow-missing-live  verify files/tooling without requiring installed launchd jobs
`);
  process.exit(exitCode);
}

if (args.includes('-h') || args.includes('--help')) usage(0);

function expandHome(input) {
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

function run(command, commandArgs, options = {}) {
  const { allowFailure = false, ...spawnOptions } = options;
  const result = spawnSync(command, commandArgs, {
    cwd: root,
    encoding: 'utf8',
    ...spawnOptions,
  });
  const output = [result.stdout, result.stderr].filter(Boolean).join('\n').trim();
  if (result.status !== 0 && !allowFailure) {
    throw new Error(`${command} ${commandArgs.join(' ')} failed${output ? `:\n${output}` : ''}`);
  }
  return {
    ok: result.status === 0,
    output,
    stdout: result.stdout.trim(),
    stderr: result.stderr.trim(),
  };
}

function createReleaseFixture() {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cwk-release-qa-'));
  const binary = path.join(fixtureRoot, 'pocketbase');
  const caddy = path.join(fixtureRoot, 'caddy');
  const goTool = path.join(fixtureRoot, 'go');
  const manifest = path.join(fixtureRoot, 'pocketbase-release.json');
  const migrations = path.join(root, 'pb_migrations');
  const commit = run('git', ['rev-parse', 'HEAD']).stdout;
  const pocketbaseVersion = '0.40.1';

  fs.writeFileSync(binary, `#!/bin/sh\nprintf '%s\\n' 'pocketbase version ${pocketbaseVersion}'\n`, { mode: 0o755 });
  fs.writeFileSync(caddy, '#!/bin/sh\nexit 0\n', { mode: 0o755 });
  fs.writeFileSync(goTool, `#!/bin/sh
cat <<'BUILD_INFO'
fixture: go1.27.0
\tdep\tgithub.com/pocketbase/pocketbase\tv${pocketbaseVersion}
\tbuild\tvcs=git
\tbuild\tvcs.revision=${commit}
\tbuild\tvcs.modified=false
BUILD_INFO
`, { mode: 0o755 });
  fs.writeFileSync(manifest, `${JSON.stringify({
    schemaVersion: 1,
    commit,
    pocketbaseVersion,
    goVersion: '1.27.0',
    binarySha256: sha256File(binary),
    migrationTreeSha256: migrationTreeSha256(migrations),
    builtAt: new Date().toISOString(),
  }, null, 2)}\n`, { mode: 0o600 });

  return {
    root: fixtureRoot,
    commit,
    generationId: `${commit}-${sha256File(binary)}`,
    binary,
    caddy,
    goTool,
    manifest,
    migrations,
    env: {
      ...process.env,
      IMAC_BACKEND_BINARY: binary,
      IMAC_BACKEND_MANIFEST: manifest,
      IMAC_BACKEND_MIGRATIONS: migrations,
      IMAC_CADDY_BINARY: caddy,
      IMAC_GO_VERSION_TOOL: goTool,
      GO_VERSION_TOOL: goTool,
    },
  };
}

function plistProgramArguments(plist) {
  const programArguments = plist.match(/<key>ProgramArguments<\/key>\s*<array>([\s\S]*?)<\/array>/);
  if (!programArguments) return [];

  const matches = [...programArguments[1].matchAll(/<string>([\s\S]*?)<\/string>/g)].map(match => match[1]);
  const programIndex = matches.findIndex(value => value.includes('pocketbase')
    || value === '/usr/local/bin/caddy'
    || value === '/bin/bash');
  return programIndex === -1 ? [] : matches.slice(programIndex);
}

function verifyPackageScripts() {
  const packageJson = JSON.parse(readText('package.json'));
  const scripts = packageJson.scripts || {};
  for (const name of [
    'imac:install-services',
    'imac:install-services:dry-run',
    'imac:install-caddy',
    'imac:install-caddy:no-start',
    'imac:install-caddy:dry-run',
    'imac:sync-runtime',
    'imac:sync-runtime:dry-run',
    'imac:build-backend-release',
    'imac:stage-backend',
    'imac:stage-backend:dry-run',
    'imac:activate-backend',
    'imac:activate-backend:dry-run',
    'imac:activate-backend:no-start',
    'imac:backup:local',
    'qa:backend-release',
    'qa:launchd',
    'qa:launchd:tooling',
  ]) {
    requireCondition(`package script ${name}`, Boolean(scripts[name]), scripts[name] || 'missing');
  }
  requireCondition(
    'local iMac backup command targets the runtime backup script',
    scripts['imac:backup:local'] === 'bash deploy/imac/backup-pocketbase.sh',
    scripts['imac:backup:local'] || 'missing',
  );
}

function verifyInstallerScript() {
  const relativePath = 'deploy/imac/install-launchd-services.sh';
  const installerPath = path.join(root, relativePath);
  const releaseFixture = createReleaseFixture();
  const fullRuntimeRoot = path.join(releaseFixture.root, 'full-runtime');
  const fullGeneration = path.join(fullRuntimeRoot, 'releases', 'pocketbase', 'generations', releaseFixture.generationId);
  fs.mkdirSync(path.join(fullRuntimeRoot, 'bin'), { recursive: true });
  fs.mkdirSync(fullGeneration, { recursive: true });
  fs.copyFileSync(releaseFixture.binary, path.join(fullGeneration, 'pocketbase'));
  fs.chmodSync(path.join(fullGeneration, 'pocketbase'), 0o755);
  fs.cpSync(releaseFixture.migrations, path.join(fullGeneration, 'pb_migrations'), { recursive: true });
  fs.copyFileSync(releaseFixture.manifest, path.join(fullGeneration, 'manifest.json'));
  fs.symlinkSync(`generations/${releaseFixture.generationId}`, path.join(fullRuntimeRoot, 'releases', 'pocketbase', 'current'));
  fs.copyFileSync(path.join(root, 'deploy/imac/run-pocketbase-release.sh'), path.join(fullRuntimeRoot, 'bin', 'pocketbase'));
  fs.chmodSync(path.join(fullRuntimeRoot, 'bin', 'pocketbase'), 0o755);
  const fullInstallEnv = {
    ...releaseFixture.env,
    IMAC_RUNTIME_ROOT: fullRuntimeRoot,
  };
  requireCondition('launchd installer exists', fs.existsSync(installerPath), relativePath);
  if (!fs.existsSync(installerPath)) return;

  const stat = fs.statSync(installerPath);
  requireCondition('launchd installer executable', Boolean(stat.mode & 0o111), relativePath);

  const script = readText(relativePath);
  const buildScript = readText('deploy/imac/build-pocketbase-custom.sh');
  const launcherScript = readText('deploy/imac/run-pocketbase-release.sh');
  const linkPublisher = readText('deploy/imac/publish-pocketbase-link.py');
  const filePublisher = readText('deploy/imac/publish-pocketbase-file.py');
  requireCondition('launchd installer supports dry run', script.includes('--dry-run'));
  requireCondition('launchd installer supports no-start mode', script.includes('--no-start'));
  requireCondition('launchd installer protects normal user launchd setup', script.includes('Run this as the normal iMac user'));
  requireCondition('launchd installer supports Caddy-only mode', script.includes('--caddy-only'));
  requireCondition('launchd installer supports runtime-only mode', script.includes('--runtime-only'));
  requireCondition('launchd installer supports backup-only mode', script.includes('--backup-only'));
  requireCondition('launchd installer supports backend staging', script.includes('--backend-stage'));
  requireCondition('launchd installer supports backend activation', script.includes('--backend-activate'));
  requireCondition('launchd installer defines runtime root', script.includes('RUNTIME_ROOT="${IMAC_RUNTIME_ROOT:-$HOME/.local/share/coldwaterkim/home-server}"'));
  requireCondition('launchd installer pins the exact backup root', script.includes('BACKUP_ROOT="/Users/kimchansu/Backups/coldwaterkim-pocketbase"'));
  requireCondition('launchd installer creates private file tool jobs directory', script.includes('RUNTIME_TOOL_JOBS="$RUNTIME_ROOT/tool-jobs"') && script.includes('chmod 700 "$RUNTIME_TOOL_JOBS"'));
  requireCondition('launchd installer syncs optional file tool runtimes', script.includes('sync_optional_file_tools'));
  requireCondition('launchd installer relies on verified bundled HWP extension', !script.includes('RUNTIME_H2ORESTART') && !script.includes(' unopkg '));
  requireCondition('launchd installer renders explicit OWNER user id', script.includes('CWK_OWNER_USER_ID') && script.includes('__CWK_OWNER_USER_ID__'));
  requireCondition('launchd installer verifies the sole live OWNER users record', script.includes('SELECT count(*) FROM users') && script.includes('user_count'));
  requireCondition('PocketBase manifest generator exists', fs.existsSync(path.join(root, 'scripts/create-pocketbase-release-manifest.mjs')));
  requireCondition('PocketBase manifest verifier exists', fs.existsSync(path.join(root, 'scripts/verify-pocketbase-release.mjs')));
  requireCondition(
    'PocketBase launcher resolves one immutable generation',
    launcherScript.includes('CWK_ATOMIC_POCKETBASE_LAUNCHER_V1')
      && launcherScript.includes('release_dir="$(cd -P "$CURRENT_LINK"')
      && launcherScript.includes('--migrationsDir=$release_dir/pb_migrations'),
  );
  requireCondition(
    'PocketBase pointer publication is atomic and durable',
    linkPublisher.includes('os.replace(source, destination)')
      && linkPublisher.includes('os.fsync(directory_fd)'),
  );
  requireCondition(
    'PocketBase launcher publication is atomic and durable',
    filePublisher.includes('os.fsync(source_fd)')
      && filePublisher.includes('os.replace(source, destination)')
      && filePublisher.includes('os.fsync(directory_fd)'),
  );
  requireCondition('PocketBase build checks committed source before compiling', buildScript.includes('--check-source-only'));
  requireCondition('PocketBase build emits a release manifest', buildScript.includes('pocketbase-release.json') && buildScript.includes('create-pocketbase-release-manifest.mjs'));
  requireCondition('backend staging verifies release provenance', script.includes('verify_backend_release "$LOCAL_POCKETBASE" "$LOCAL_MIGRATIONS" "$LOCAL_BACKEND_MANIFEST"'));
  requireCondition('backend activation verifies the staged release again', script.includes('verify_backend_release "$STAGED_POCKETBASE" "$STAGED_MIGRATIONS" "$STAGED_BACKEND_MANIFEST"'));
  requireCondition('backend verifier inspects Go build metadata', buildScript.includes('--go-command "$GO_BIN"'));
  requireCondition('backend activation reads the prior PocketBase PID', script.includes('read_pocketbase_pid'));
  requireCondition(
    'backend activation requires a new PID and exact PocketBase loopback health JSON',
    script.includes('wait_for_pocketbase_restart')
      && script.includes('http://127.0.0.1:8090/api/health')
      && script.includes('value.code === 200')
      && script.includes('value.message === "API is healthy."'),
  );
  requireCondition(
    'launchd installer keeps one previous frontend generation',
    script.includes('activate_runtime_dir "$LOCAL_DIST" "$RUNTIME_DIST" "$RUNTIME_DIST_PREVIOUS"'),
  );
  const fullRuntimeSync = script.match(/^sync_runtime_files\(\) \{\n([\s\S]*?)^\}/m)?.[1] || '';
  requireCondition(
    'full service install cannot bypass backend stage and activation',
    Boolean(fullRuntimeSync)
      && !fullRuntimeSync.includes('LOCAL_POCKETBASE')
      && !fullRuntimeSync.includes('LOCAL_BACKEND_MANIFEST')
      && !fullRuntimeSync.includes('LOCAL_MIGRATIONS')
      && script.includes('require_prepared_runtime_backend')
      && script.includes('resolve_backend_release_link "$RUNTIME_BACKEND_CURRENT_LINK"'),
  );
  requireCondition(
    'backend activation publishes one atomic generation pointer',
    script.includes('RUNTIME_BACKEND_GENERATIONS_ROOT')
      && script.includes('"$LOCAL_BACKEND_LINK_PUBLISHER" "$next_current" "$RUNTIME_BACKEND_CURRENT_LINK"')
      && !script.includes('mv -f "$next_manifest"')
      && !script.includes('mv -f "$next_pocketbase"'),
  );
  requireCondition(
    'installed generations may be verified independently of current HEAD',
    script.includes('verify_installed_backend_release') && script.includes('--allow-non-head'),
  );
  requireCondition('launchd installer syncs runtime backup script privately', script.includes('install -m 700 "$LOCAL_BACKUP_SCRIPT" "$RUNTIME_BACKUP_SCRIPT"'));
  requireCondition('launchd installer syncs incremental backup program privately', script.includes('install -m 700 "$LOCAL_BACKUP_PROGRAM" "$RUNTIME_BACKUP_PROGRAM"'));
  requireCondition(
    'launchd installer rejects foreign-owned backup entries',
    script.includes('verify_backup_root_ownership')
      && script.includes('find "$BACKUP_ROOT" ! -user "$BACKUP_OWNER_USER" -print -quit')
      && script.includes('[[ -L "$BACKUP_ROOT" ]]'),
  );
  requireCondition(
    'launchd installer never automatically changes backup ownership',
    !/chown[^\n]*(?:BACKUP_ROOT|BACKUP_DIR)/.test(script),
  );
  requireCondition('launchd installer installs PocketBase LaunchDaemon', script.includes('PB_LABEL="com.coldwaterkim.pocketbase"') && script.includes('SYSTEM_DAEMON_DIR="/Library/LaunchDaemons"'));
  requireCondition('launchd installer installs backup LaunchDaemon', script.includes('BACKUP_LABEL="com.coldwaterkim.pocketbase-backup"') && script.includes('SYSTEM_DAEMON_DIR="/Library/LaunchDaemons"'));
  requireCondition('launchd installer unloads legacy user agents', script.includes('uninstall_old_user_agent "$PB_LABEL"') && script.includes('uninstall_old_user_agent "$BACKUP_LABEL"'));
  requireCondition('launchd installer installs Caddy LaunchDaemon', script.includes('/Library/LaunchDaemons'));
  requireCondition('launchd installer installs root-owned Caddy binary', script.includes('/usr/local/bin/caddy') && script.includes('"$RUNTIME_CADDY"') && script.includes('-o root -g wheel'));
  requireCondition('launchd installer bootstraps system domain', script.includes('launchctl bootstrap system'));
  requireCondition('launchd installer kickstarts services', script.includes('launchctl kickstart -k'));

  try {
    run('bash', ['-n', relativePath]);
    record('launchd installer shell syntax', true);
  } catch (error) {
    record('launchd installer shell syntax', false, error.message);
  }

  const dryRun = run('bash', [relativePath, '--dry-run', '--no-start'], {
    allowFailure: true,
    env: fullInstallEnv,
  });
  requireCondition('launchd installer dry-run succeeds', dryRun.ok, dryRun.output);
  if (dryRun.ok) {
    requireCondition('launchd installer dry-run previews PocketBase daemon install', dryRun.output.includes('/Library/LaunchDaemons/com.coldwaterkim.pocketbase.plist'));
    requireCondition('launchd installer dry-run previews backup daemon install', dryRun.output.includes('/Library/LaunchDaemons/com.coldwaterkim.pocketbase-backup.plist'));
    requireCondition('launchd installer dry-run previews runtime root', dryRun.output.includes(fullRuntimeRoot));
    requireCondition('launchd installer dry-run previews runtime dist sync', dryRun.output.includes(`${fullRuntimeRoot}/dist`));
    requireCondition(
      'launchd installer dry-run preserves the verified backend payload',
      !dryRun.output.includes(`install -m 755 ${releaseFixture.binary}`)
        && !dryRun.output.includes(`ditto ${releaseFixture.migrations}`),
    );
    requireCondition('launchd installer dry-run previews Caddy daemon install', dryRun.output.includes('/Library/LaunchDaemons/com.coldwaterkim.caddy.plist'));
    requireCondition('launchd installer dry-run previews Caddy binary install', dryRun.output.includes('/usr/local/bin/caddy'));
    requireCondition('launchd installer dry-run changes nothing', dryRun.output.includes('Dry run only. No files were changed.'));
  }

  const runtimeBinary = path.join(fullGeneration, 'pocketbase');
  fs.appendFileSync(runtimeBinary, '\n# tampered runtime artifact\n');
  const tamperedRuntimeDryRun = run('bash', [relativePath, '--dry-run', '--no-start'], {
    allowFailure: true,
    env: fullInstallEnv,
  });
  requireCondition(
    'full service install rejects a tampered prepared runtime binary',
    !tamperedRuntimeDryRun.ok && tamperedRuntimeDryRun.output.includes('binary SHA-256'),
    tamperedRuntimeDryRun.output,
  );
  fs.copyFileSync(releaseFixture.binary, runtimeBinary);
  fs.chmodSync(runtimeBinary, 0o755);

  const runtimeManifest = path.join(fullGeneration, 'manifest.json');
  const staleRuntimeManifest = JSON.parse(fs.readFileSync(releaseFixture.manifest, 'utf8'));
  staleRuntimeManifest.commit = run('git', ['rev-parse', 'HEAD^']).stdout;
  fs.writeFileSync(runtimeManifest, `${JSON.stringify(staleRuntimeManifest, null, 2)}\n`, { mode: 0o600 });
  const staleRuntimeDryRun = run('bash', [relativePath, '--dry-run', '--no-start'], {
    allowFailure: true,
    env: fullInstallEnv,
  });
  requireCondition(
    'full service install rejects a stale prepared runtime manifest',
    !staleRuntimeDryRun.ok && staleRuntimeDryRun.output.includes('binary vcs.revision'),
    staleRuntimeDryRun.output,
  );
  fs.copyFileSync(releaseFixture.manifest, runtimeManifest);

  const caddyDryRun = run('bash', [relativePath, '--dry-run', '--no-start', '--caddy-only'], {
    allowFailure: true,
    env: releaseFixture.env,
  });
  requireCondition('Caddy-only installer dry-run succeeds', caddyDryRun.ok, caddyDryRun.output);
  if (caddyDryRun.ok) {
    requireCondition('Caddy-only dry-run previews Caddy binary install', caddyDryRun.output.includes('/usr/local/bin/caddy'));
    requireCondition('Caddy-only dry-run previews Caddy daemon install', caddyDryRun.output.includes('/Library/LaunchDaemons/com.coldwaterkim.caddy.plist'));
    requireCondition(
      'Caddy-only dry-run revalidates the copied runtime pair before restart',
      caddyDryRun.output.includes(`${runtimeRoot}/bin/caddy validate --config ${runtimeRoot}/Caddyfile`),
    );
    requireCondition('Caddy-only dry-run skips PocketBase plist install', !caddyDryRun.output.includes('com.coldwaterkim.pocketbase.plist'));
    requireCondition('Caddy-only dry-run skips frontend dist', !caddyDryRun.output.includes(`${runtimeRoot}/dist`));
    requireCondition('Caddy-only dry-run skips PocketBase binary', !caddyDryRun.output.includes(`${runtimeRoot}/bin/pocketbase`));
    requireCondition('Caddy-only dry-run skips migrations', !caddyDryRun.output.includes(`${runtimeRoot}/pb_migrations`));
    requireCondition('Caddy-only dry-run skips backup executables', !caddyDryRun.output.includes('backup-pocketbase'));
    requireCondition('Caddy-only dry-run skips OWNER state', !caddyDryRun.output.includes('.cwk-owner-user-id'));
  }

  const invalidCaddy = path.join(releaseFixture.root, 'invalid-caddy');
  fs.writeFileSync(invalidCaddy, '#!/bin/sh\nexit 42\n', { mode: 0o755 });
  const invalidCaddyDryRun = run('bash', [relativePath, '--dry-run', '--no-start', '--caddy-only'], {
    allowFailure: true,
    env: { ...releaseFixture.env, IMAC_CADDY_BINARY: invalidCaddy },
  });
  requireCondition(
    'Caddy install rejects an invalid candidate before copying or restarting it',
    !invalidCaddyDryRun.ok
      && invalidCaddyDryRun.output.includes('candidate binary and config did not validate together')
      && !invalidCaddyDryRun.output.includes(`install -m 755 ${invalidCaddy}`),
    invalidCaddyDryRun.output,
  );

  const runtimeDryRun = run('bash', [relativePath, '--dry-run', '--runtime-only'], {
    allowFailure: true,
    env: releaseFixture.env,
  });
  requireCondition('runtime-only installer dry-run succeeds', runtimeDryRun.ok, runtimeDryRun.output);
  if (runtimeDryRun.ok) {
    requireCondition('runtime-only dry-run previews runtime dist replacement', runtimeDryRun.output.includes(`${runtimeRoot}/dist.staged.`) && runtimeDryRun.output.includes(`${runtimeRoot}/dist.previous`));
    requireCondition('runtime-only dry-run skips LaunchDaemon install', !runtimeDryRun.output.includes('/Library/LaunchDaemons/'));
    requireCondition('runtime-only dry-run skips sudo', !runtimeDryRun.output.includes('sudo '));
    requireCondition('runtime-only dry-run skips PocketBase binary', !runtimeDryRun.output.includes(`${runtimeRoot}/bin/pocketbase`));
    requireCondition('runtime-only dry-run skips migrations', !runtimeDryRun.output.includes(`${runtimeRoot}/pb_migrations`));
    requireCondition('runtime-only dry-run skips Caddy config', !runtimeDryRun.output.includes(`${runtimeRoot}/Caddyfile`));
    requireCondition('runtime-only dry-run skips backup executables', !runtimeDryRun.output.includes('backup-pocketbase'));
    requireCondition('runtime-only dry-run skips OWNER state', !runtimeDryRun.output.includes('.cwk-owner-user-id'));
  }

  const backendRuntimeRoot = path.join(releaseFixture.root, 'runtime');
  const backendEnv = {
    ...releaseFixture.env,
    IMAC_RUNTIME_ROOT: backendRuntimeRoot,
  };
  const backendStageDryRun = run('bash', [relativePath, '--dry-run', '--backend-stage'], {
    allowFailure: true,
    env: backendEnv,
  });
  requireCondition('backend stage dry-run succeeds', backendStageDryRun.ok, backendStageDryRun.output);
  if (backendStageDryRun.ok) {
    const stagedRoot = path.join(backendRuntimeRoot, 'releases', 'pocketbase', 'staged');
    requireCondition('backend stage dry-run verifies and stages a manifest', backendStageDryRun.output.includes(`${stagedRoot}.staged.`) && backendStageDryRun.output.includes('manifest.json'));
    requireCondition('backend stage dry-run stages PocketBase binary', backendStageDryRun.output.includes('/pocketbase'));
    requireCondition('backend stage dry-run stages migrations', backendStageDryRun.output.includes('/pb_migrations'));
    requireCondition('backend stage dry-run skips frontend dist', !backendStageDryRun.output.includes(`${backendRuntimeRoot}/dist`));
    requireCondition('backend stage dry-run skips Caddy', !backendStageDryRun.output.includes('caddy'));
    requireCondition('backend stage dry-run skips backup executables', !backendStageDryRun.output.includes('backup-pocketbase'));
    requireCondition('backend stage dry-run skips OWNER state', !backendStageDryRun.output.includes('.cwk-owner-user-id'));
    requireCondition('backend stage dry-run skips sudo and launchd', !backendStageDryRun.output.includes('sudo ') && !backendStageDryRun.output.includes('launchctl'));
    requireCondition('backend stage dry-run previews the shared release lock', backendStageDryRun.output.includes('/usr/bin/shlock'));
  }

  const lockedRuntimeRoot = path.join(releaseFixture.root, 'locked-runtime');
  fs.mkdirSync(lockedRuntimeRoot);
  const releaseLock = path.join(lockedRuntimeRoot, '.pocketbase-release.lock');
  const heldLock = run('/usr/bin/shlock', ['-p', String(process.pid), '-f', releaseLock], { allowFailure: true });
  requireCondition('release lock fixture acquired', heldLock.ok, heldLock.output);
  const lockedStage = run('bash', [relativePath, '--backend-stage'], {
    allowFailure: true,
    env: { ...releaseFixture.env, IMAC_RUNTIME_ROOT: lockedRuntimeRoot },
  });
  requireCondition(
    'backend stage and activation share a single-writer lock',
    !lockedStage.ok && lockedStage.output.includes('another stage or activation is already running')
      && !fs.existsSync(path.join(lockedRuntimeRoot, 'releases')),
    lockedStage.output,
  );
  fs.unlinkSync(releaseLock);

  const manifestSourceCheck = run('node', [
    'scripts/create-pocketbase-release-manifest.mjs',
    '--check-source-only',
    '--pocketbase-version', '0.40.1',
    '--go-version', '1.27.0',
  ], { allowFailure: true });
  requireCondition('manifest generator requires committed clean backend source', manifestSourceCheck.ok, manifestSourceCheck.output);

  const sourceFixtureRoot = path.join(releaseFixture.root, 'source-repo');
  fs.mkdirSync(path.join(sourceFixtureRoot, 'deploy', 'imac', 'pocketbase-custom'), { recursive: true });
  fs.mkdirSync(path.join(sourceFixtureRoot, 'pb_migrations'), { recursive: true });
  fs.writeFileSync(path.join(sourceFixtureRoot, 'deploy', 'imac', 'pocketbase-custom', 'go.mod'), [
    'module example.invalid/pocketbase-custom',
    '',
    'go 1.27',
    '',
    'require (',
    '\tgithub.com/pocketbase/pocketbase v0.40.1',
    ')',
    '',
  ].join('\n'));
  fs.writeFileSync(path.join(sourceFixtureRoot, 'deploy', 'imac', 'pocketbase-custom', 'main.go'), 'package main\n');
  fs.writeFileSync(path.join(sourceFixtureRoot, 'pb_migrations', '1_test.js'), 'migrate(() => {}, () => {})\n');
  fs.writeFileSync(path.join(sourceFixtureRoot, '.gitignore'), 'pb_migrations/ignored.js\n');
  run('git', ['init', '-q', sourceFixtureRoot]);
  run('git', ['-C', sourceFixtureRoot, 'config', 'user.name', 'release-qa']);
  run('git', ['-C', sourceFixtureRoot, 'config', 'user.email', 'release-qa@example.invalid']);
  run('git', ['-C', sourceFixtureRoot, 'add', '.gitignore', 'deploy/imac/pocketbase-custom', 'pb_migrations']);
  run('git', ['-C', sourceFixtureRoot, 'commit', '-q', '-m', 'fixture']);
  const staleRevision = run('git', ['-C', sourceFixtureRoot, 'rev-parse', 'HEAD']).stdout;
  fs.writeFileSync(path.join(sourceFixtureRoot, 'release-note.txt'), 'new release commit\n');
  run('git', ['-C', sourceFixtureRoot, 'add', 'release-note.txt']);
  run('git', ['-C', sourceFixtureRoot, 'commit', '-q', '-m', 'new release']);
  const staleBinary = path.join(sourceFixtureRoot, 'pocketbase');
  const staleGoTool = path.join(sourceFixtureRoot, 'fake-go');
  fs.writeFileSync(staleBinary, '#!/bin/sh\nprintf \'%s\\n\' \'pocketbase version 0.40.1\'\n', { mode: 0o755 });
  fs.writeFileSync(staleGoTool, `#!/bin/sh
cat <<'BUILD_INFO'
fixture: go1.27.0
\tdep\tgithub.com/pocketbase/pocketbase\tv0.40.1
\tbuild\tvcs=git
\tbuild\tvcs.revision=${staleRevision}
\tbuild\tvcs.modified=false
BUILD_INFO
`, { mode: 0o755 });
  const staleBinaryCheck = run('node', [
    'scripts/create-pocketbase-release-manifest.mjs',
    '--repo-root', sourceFixtureRoot,
    '--binary', staleBinary,
    '--migrations', path.join(sourceFixtureRoot, 'pb_migrations'),
    '--output', path.join(sourceFixtureRoot, 'release.json'),
    '--pocketbase-version', '0.40.1',
    '--go-version', '1.27.0',
    '--go-command', staleGoTool,
  ], { allowFailure: true });
  requireCondition('manifest generator rejects a stale same-version binary revision', !staleBinaryCheck.ok && staleBinaryCheck.output.includes('vcs.revision'), staleBinaryCheck.output);
  const currentFixtureRevision = run('git', ['-C', sourceFixtureRoot, 'rev-parse', 'HEAD']).stdout;
  const modifiedGoTool = path.join(sourceFixtureRoot, 'fake-go-modified');
  fs.writeFileSync(modifiedGoTool, `#!/bin/sh
cat <<'BUILD_INFO'
fixture: go1.27.0
\tdep\tgithub.com/pocketbase/pocketbase\tv0.40.1
\tbuild\tvcs=git
\tbuild\tvcs.revision=${currentFixtureRevision}
\tbuild\tvcs.modified=true
BUILD_INFO
`, { mode: 0o755 });
  const modifiedBinaryManifest = path.join(sourceFixtureRoot, 'modified-release.json');
  const modifiedBinaryCreateCheck = run('node', [
    'scripts/create-pocketbase-release-manifest.mjs',
    '--repo-root', sourceFixtureRoot,
    '--binary', staleBinary,
    '--migrations', path.join(sourceFixtureRoot, 'pb_migrations'),
    '--output', modifiedBinaryManifest,
    '--pocketbase-version', '0.40.1',
    '--go-version', '1.27.0',
    '--go-command', modifiedGoTool,
  ], { allowFailure: true });
  requireCondition(
    'manifest generator rejects a binary built from modified source',
    !modifiedBinaryCreateCheck.ok && modifiedBinaryCreateCheck.output.includes('vcs.modified'),
    modifiedBinaryCreateCheck.output,
  );
  requireCondition('modified binary rejection does not publish a manifest', !fs.existsSync(modifiedBinaryManifest));
  const staleVerifierManifest = path.join(sourceFixtureRoot, 'stale-verifier-release.json');
  fs.writeFileSync(staleVerifierManifest, `${JSON.stringify({
    schemaVersion: 1,
    commit: currentFixtureRevision,
    pocketbaseVersion: '0.40.1',
    goVersion: '1.27.0',
    binarySha256: sha256File(staleBinary),
    migrationTreeSha256: migrationTreeSha256(path.join(sourceFixtureRoot, 'pb_migrations')),
    builtAt: new Date().toISOString(),
  }, null, 2)}\n`, { mode: 0o600 });
  const staleVerifierCheck = run('node', [
    'scripts/verify-pocketbase-release.mjs',
    '--repo-root', sourceFixtureRoot,
    '--binary', staleBinary,
    '--migrations', path.join(sourceFixtureRoot, 'pb_migrations'),
    '--manifest', staleVerifierManifest,
    '--go-command', staleGoTool,
    '--quiet',
  ], { allowFailure: true });
  requireCondition('release verifier rejects a stale same-version binary revision', !staleVerifierCheck.ok && staleVerifierCheck.output.includes('vcs.revision'), staleVerifierCheck.output);
  const modifiedVerifierCheck = run('node', [
    'scripts/verify-pocketbase-release.mjs',
    '--repo-root', sourceFixtureRoot,
    '--binary', staleBinary,
    '--migrations', path.join(sourceFixtureRoot, 'pb_migrations'),
    '--manifest', staleVerifierManifest,
    '--go-command', modifiedGoTool,
    '--quiet',
  ], { allowFailure: true });
  requireCondition(
    'release verifier rejects a binary built from modified source',
    !modifiedVerifierCheck.ok && modifiedVerifierCheck.output.includes('vcs.modified'),
    modifiedVerifierCheck.output,
  );
  fs.appendFileSync(path.join(sourceFixtureRoot, 'deploy', 'imac', 'pocketbase-custom', 'main.go'), '// dirty\n');
  const dirtySourceCheck = run('node', [
    'scripts/create-pocketbase-release-manifest.mjs',
    '--repo-root', sourceFixtureRoot,
    '--check-source-only',
    '--pocketbase-version', '0.40.1',
    '--go-version', '1.27.0',
  ], { allowFailure: true });
  requireCondition('manifest generator rejects uncommitted backend source', !dirtySourceCheck.ok, dirtySourceCheck.output);
  fs.writeFileSync(path.join(sourceFixtureRoot, 'deploy', 'imac', 'pocketbase-custom', 'main.go'), 'package main\n');
  fs.writeFileSync(path.join(sourceFixtureRoot, 'pb_migrations', 'ignored.js'), 'migrate(() => {}, () => {})\n');
  const ignoredSourceCheck = run('node', [
    'scripts/create-pocketbase-release-manifest.mjs',
    '--repo-root', sourceFixtureRoot,
    '--check-source-only',
    '--pocketbase-version', '0.40.1',
    '--go-version', '1.27.0',
  ], { allowFailure: true });
  requireCondition('manifest generator rejects ignored uncommitted migrations', !ignoredSourceCheck.ok, ignoredSourceCheck.output);

  const tamperedBinary = path.join(releaseFixture.root, 'pocketbase-tampered');
  fs.copyFileSync(releaseFixture.binary, tamperedBinary);
  fs.appendFileSync(tamperedBinary, '\n# tampered\n');
  fs.chmodSync(tamperedBinary, 0o755);
  const tamperedBinaryCheck = run('node', [
    'scripts/verify-pocketbase-release.mjs',
    '--binary', tamperedBinary,
    '--migrations', releaseFixture.migrations,
    '--manifest', releaseFixture.manifest,
    '--quiet',
  ], { allowFailure: true, env: releaseFixture.env });
  requireCondition('release verifier rejects a tampered binary', !tamperedBinaryCheck.ok, tamperedBinaryCheck.output);

  const tamperedMigrations = path.join(releaseFixture.root, 'pb_migrations');
  fs.cpSync(releaseFixture.migrations, tamperedMigrations, { recursive: true });
  fs.appendFileSync(path.join(tamperedMigrations, '1787830300_retire_program_records.js'), '\n// tampered\n');
  const tamperedMigrationCheck = run('node', [
    'scripts/verify-pocketbase-release.mjs',
    '--binary', releaseFixture.binary,
    '--migrations', tamperedMigrations,
    '--manifest', releaseFixture.manifest,
    '--quiet',
  ], { allowFailure: true, env: releaseFixture.env });
  requireCondition('release verifier rejects a tampered migration tree', !tamperedMigrationCheck.ok, tamperedMigrationCheck.output);

  const secretManifest = path.join(releaseFixture.root, 'secret-manifest.json');
  const secretManifestData = JSON.parse(fs.readFileSync(releaseFixture.manifest, 'utf8'));
  secretManifestData.secret = 'must-not-be-accepted';
  fs.writeFileSync(secretManifest, `${JSON.stringify(secretManifestData, null, 2)}\n`, { mode: 0o600 });
  const secretManifestCheck = run('node', [
    'scripts/verify-pocketbase-release.mjs',
    '--binary', releaseFixture.binary,
    '--migrations', releaseFixture.migrations,
    '--manifest', secretManifest,
    '--quiet',
  ], { allowFailure: true, env: releaseFixture.env });
  requireCondition('release verifier rejects non-allowlisted manifest fields', !secretManifestCheck.ok, secretManifestCheck.output);

  const stagedRoot = path.join(backendRuntimeRoot, 'releases', 'pocketbase', 'staged');
  fs.mkdirSync(stagedRoot, { recursive: true });
  fs.copyFileSync(releaseFixture.binary, path.join(stagedRoot, 'pocketbase'));
  fs.chmodSync(path.join(stagedRoot, 'pocketbase'), 0o755);
  fs.cpSync(releaseFixture.migrations, path.join(stagedRoot, 'pb_migrations'), { recursive: true });
  fs.copyFileSync(releaseFixture.manifest, path.join(stagedRoot, 'manifest.json'));
  const existingGeneration = path.join(backendRuntimeRoot, 'releases', 'pocketbase', 'generations', releaseFixture.generationId);
  fs.mkdirSync(existingGeneration, { recursive: true });
  fs.copyFileSync(releaseFixture.binary, path.join(existingGeneration, 'pocketbase'));
  fs.chmodSync(path.join(existingGeneration, 'pocketbase'), 0o755);
  fs.cpSync(releaseFixture.migrations, path.join(existingGeneration, 'pb_migrations'), { recursive: true });
  fs.copyFileSync(releaseFixture.manifest, path.join(existingGeneration, 'manifest.json'));
  fs.symlinkSync(`generations/${releaseFixture.generationId}`, path.join(backendRuntimeRoot, 'releases', 'pocketbase', 'current'));
  const backendActivateDryRun = run('bash', [relativePath, '--dry-run', '--backend-activate'], {
    allowFailure: true,
    env: backendEnv,
  });
  requireCondition('backend activation dry-run succeeds', backendActivateDryRun.ok, backendActivateDryRun.output);
  if (backendActivateDryRun.ok) {
    requireCondition('backend activation requires exact commit confirmation', backendActivateDryRun.output.includes('CWK_BACKEND_ACTIVATE_COMMIT='));
    requireCondition('backend activation keeps one previous generation pointer', backendActivateDryRun.output.includes(`${backendRuntimeRoot}/releases/pocketbase/previous`));
    requireCondition('backend activation switches one current generation pointer', backendActivateDryRun.output.includes(`${backendRuntimeRoot}/releases/pocketbase/current`));
    requireCondition('backend activation installs the generation launcher atomically', backendActivateDryRun.output.includes(`${backendRuntimeRoot}/bin/pocketbase.staged.`));
    requireCondition('backend activation restarts only PocketBase', backendActivateDryRun.output.includes('launchctl kickstart -k system/com.coldwaterkim.pocketbase'));
    requireCondition('backend activation reads the previous PocketBase PID', backendActivateDryRun.output.includes('launchctl print system/com.coldwaterkim.pocketbase'));
    requireCondition('backend activation waits for a different PID', backendActivateDryRun.output.includes('new PocketBase PID must differ'));
    requireCondition('backend activation checks direct loopback health JSON', backendActivateDryRun.output.includes('http://127.0.0.1:8090/api/health'));
    requireCondition(
      'backend activation re-verifies the published current tuple',
      backendActivateDryRun.output.includes(`--binary ${existingGeneration}/pocketbase`)
        && backendActivateDryRun.output.includes(`--manifest ${existingGeneration}/manifest.json`),
    );
    requireCondition('backend activation skips other services', !backendActivateDryRun.output.includes('com.coldwaterkim.caddy') && !backendActivateDryRun.output.includes('com.coldwaterkim.pocketbase-backup'));
    requireCondition('backend activation skips frontend dist', !backendActivateDryRun.output.includes(`${backendRuntimeRoot}/dist`));
    requireCondition('backend activation never reinstalls plists', !backendActivateDryRun.output.includes('/Library/LaunchDaemons/') && !backendActivateDryRun.output.includes('launchctl bootstrap') && !backendActivateDryRun.output.includes('launchctl bootout'));
  }

  const backendNoStartDryRun = run('bash', [relativePath, '--dry-run', '--backend-activate', '--no-start'], {
    allowFailure: true,
    env: backendEnv,
  });
  requireCondition('backend no-start dry-run succeeds', backendNoStartDryRun.ok, backendNoStartDryRun.output);
  if (backendNoStartDryRun.ok) {
    requireCondition('backend no-start explicitly skips restart postconditions', backendNoStartDryRun.output.includes('--no-start: PocketBase restart and PID/health postcondition are intentionally skipped.'));
    requireCondition('backend no-start proves the launchd job is absent', backendNoStartDryRun.output.includes('launchctl print system/com.coldwaterkim.pocketbase'));
    requireCondition('backend no-start proves the loopback listener is absent', backendNoStartDryRun.output.includes('/usr/sbin/lsof -nP -iTCP:8090 -sTCP:LISTEN'));
    requireCondition('backend no-start never mutates launchd', !backendNoStartDryRun.output.includes('launchctl kickstart') && !backendNoStartDryRun.output.includes('launchctl bootout') && !backendNoStartDryRun.output.includes('launchctl bootstrap'));
    requireCondition('backend no-start never probes runtime health', !backendNoStartDryRun.output.includes('http://127.0.0.1:8090/api/health'));
  }

  const runningToolDir = path.join(releaseFixture.root, 'running-tools');
  fs.mkdirSync(runningToolDir);
  fs.writeFileSync(path.join(runningToolDir, 'launchctl'), '#!/bin/sh\nexit 0\n', { mode: 0o755 });
  fs.writeFileSync(path.join(runningToolDir, 'nc'), '#!/bin/sh\nexit 1\n', { mode: 0o755 });
  const runningNoStart = run('bash', [relativePath, '--backend-activate', '--no-start'], {
    allowFailure: true,
    env: {
      ...backendEnv,
      CWK_BACKEND_ACTIVATE_COMMIT: releaseFixture.commit,
      PATH: `${runningToolDir}:${process.env.PATH}`,
    },
  });
  requireCondition(
    'backend no-start rejects a loaded PocketBase job before replacing files',
    !runningNoStart.ok && runningNoStart.output.includes('launchd job is loaded')
      && !fs.existsSync(path.join(backendRuntimeRoot, 'bin', 'pocketbase')),
    runningNoStart.output,
  );
  fs.writeFileSync(path.join(runningToolDir, 'launchctl'), '#!/bin/sh\nexit 77\n', { mode: 0o755 });
  const launchctlErrorNoStart = run('bash', [relativePath, '--backend-activate', '--no-start'], {
    allowFailure: true,
    env: {
      ...backendEnv,
      CWK_BACKEND_ACTIVATE_COMMIT: releaseFixture.commit,
      PATH: `${runningToolDir}:${process.env.PATH}`,
    },
  });
  requireCondition(
    'backend no-start fails closed when launchd absence cannot be proven',
    !launchctlErrorNoStart.ok && launchctlErrorNoStart.output.includes('unable to prove the PocketBase launchd job is absent'),
    launchctlErrorNoStart.output,
  );
  fs.writeFileSync(path.join(runningToolDir, 'launchctl'), '#!/bin/sh\nexit 113\n', { mode: 0o755 });
  const lsofErrorTool = path.join(runningToolDir, 'lsof-error');
  fs.writeFileSync(lsofErrorTool, '#!/bin/sh\nexit 2\n', { mode: 0o755 });
  const lsofErrorNoStart = run('bash', [relativePath, '--backend-activate', '--no-start'], {
    allowFailure: true,
    env: {
      ...backendEnv,
      CWK_BACKEND_ACTIVATE_COMMIT: releaseFixture.commit,
      PATH: `${runningToolDir}:${process.env.PATH}`,
      IMAC_LSOF_TOOL: lsofErrorTool,
    },
  });
  requireCondition(
    'backend no-start fails closed when listener absence cannot be proven',
    !lsofErrorNoStart.ok && lsofErrorNoStart.output.includes('unable to prove port 8090 is unused'),
    lsofErrorNoStart.output,
  );
  const noisyLsofErrorTool = path.join(runningToolDir, 'lsof-noisy-error');
  fs.writeFileSync(noisyLsofErrorTool, '#!/bin/sh\necho kernel-read-failed >&2\nexit 1\n', { mode: 0o755 });
  const noisyLsofErrorNoStart = run('bash', [relativePath, '--backend-activate', '--no-start'], {
    allowFailure: true,
    env: {
      ...backendEnv,
      CWK_BACKEND_ACTIVATE_COMMIT: releaseFixture.commit,
      PATH: `${runningToolDir}:${process.env.PATH}`,
      IMAC_LSOF_TOOL: noisyLsofErrorTool,
    },
  });
  requireCondition(
    'backend no-start rejects lsof status one when the tool reports an error',
    !noisyLsofErrorNoStart.ok && noisyLsofErrorNoStart.output.includes('unable to prove port 8090 is unused'),
    noisyLsofErrorNoStart.output,
  );

  const atomicRuntimeRoot = path.join(releaseFixture.root, 'atomic-runtime');
  const atomicStagedRoot = path.join(atomicRuntimeRoot, 'releases', 'pocketbase', 'staged');
  fs.mkdirSync(atomicStagedRoot, { recursive: true });
  fs.copyFileSync(releaseFixture.binary, path.join(atomicStagedRoot, 'pocketbase'));
  fs.chmodSync(path.join(atomicStagedRoot, 'pocketbase'), 0o755);
  fs.cpSync(releaseFixture.migrations, path.join(atomicStagedRoot, 'pb_migrations'), { recursive: true });
  fs.copyFileSync(releaseFixture.manifest, path.join(atomicStagedRoot, 'manifest.json'));
  const absentLsofTool = path.join(runningToolDir, 'lsof-absent');
  fs.writeFileSync(absentLsofTool, '#!/bin/sh\nexit 1\n', { mode: 0o755 });
  const atomicActivation = run('bash', [relativePath, '--backend-activate', '--no-start'], {
    allowFailure: true,
    env: {
      ...releaseFixture.env,
      IMAC_RUNTIME_ROOT: atomicRuntimeRoot,
      CWK_BACKEND_ACTIVATE_COMMIT: releaseFixture.commit,
      PATH: `${runningToolDir}:${process.env.PATH}`,
      IMAC_LSOF_TOOL: absentLsofTool,
    },
  });
  const atomicReleaseRoot = path.join(atomicRuntimeRoot, 'releases', 'pocketbase');
  const atomicGeneration = path.join(atomicReleaseRoot, 'generations', releaseFixture.generationId);
  requireCondition('backend no-start publishes a complete atomic generation', atomicActivation.ok
    && fs.statSync(atomicGeneration).isDirectory()
    && sha256File(path.join(atomicGeneration, 'pocketbase')) === sha256File(releaseFixture.binary)
    && migrationTreeSha256(path.join(atomicGeneration, 'pb_migrations')) === migrationTreeSha256(releaseFixture.migrations), atomicActivation.output);
  const atomicCurrent = path.join(atomicReleaseRoot, 'current');
  const atomicLauncher = path.join(atomicRuntimeRoot, 'bin', 'pocketbase');
  requireCondition('backend no-start publishes current as one relative symlink', atomicActivation.ok
    && fs.existsSync(atomicCurrent)
    && fs.lstatSync(atomicCurrent).isSymbolicLink()
    && fs.readlinkSync(atomicCurrent) === `generations/${releaseFixture.generationId}`, atomicActivation.output);
  requireCondition('backend no-start installs the atomic launcher last', atomicActivation.ok
    && fs.existsSync(atomicLauncher)
    && fs.readFileSync(atomicLauncher, 'utf8').includes('CWK_ATOMIC_POCKETBASE_LAUNCHER_V1'), atomicActivation.output);
  const launcherRun = run(atomicLauncher, ['--version'], {
    allowFailure: true,
    env: { ...process.env, IMAC_RUNTIME_ROOT: atomicRuntimeRoot },
  });
  requireCondition('atomic launcher executes one complete current generation',
    launcherRun.ok && launcherRun.output.includes('pocketbase version 0.40.1'), launcherRun.output);

  const unsafeLauncherRoot = path.join(releaseFixture.root, 'unsafe-launcher-runtime');
  const unsafeReleaseRoot = path.join(unsafeLauncherRoot, 'releases', 'pocketbase');
  fs.mkdirSync(path.join(unsafeReleaseRoot, 'generations'), { recursive: true });
  fs.mkdirSync(path.join(unsafeLauncherRoot, 'bin'), { recursive: true });
  fs.copyFileSync(path.join(root, 'deploy/imac/run-pocketbase-release.sh'), path.join(unsafeLauncherRoot, 'bin', 'pocketbase'));
  fs.chmodSync(path.join(unsafeLauncherRoot, 'bin', 'pocketbase'), 0o755);
  fs.symlinkSync('../../outside-generation', path.join(unsafeReleaseRoot, 'current'));
  const unsafeLauncherRun = run(path.join(unsafeLauncherRoot, 'bin', 'pocketbase'), ['--version'], {
    allowFailure: true,
    env: { ...process.env, IMAC_RUNTIME_ROOT: unsafeLauncherRoot },
  });
  requireCondition('atomic launcher rejects escaping current pointers',
    !unsafeLauncherRun.ok && unsafeLauncherRun.output.includes('pointer target is invalid'), unsafeLauncherRun.output);

  const priorBinary = path.join(releaseFixture.root, 'prior-pocketbase');
  fs.copyFileSync(releaseFixture.binary, priorBinary);
  fs.appendFileSync(priorBinary, '# prior reproducible artifact\n');
  fs.chmodSync(priorBinary, 0o755);
  const priorManifest = {
    ...JSON.parse(fs.readFileSync(releaseFixture.manifest, 'utf8')),
    binarySha256: sha256File(priorBinary),
  };
  const priorGenerationId = `${releaseFixture.commit}-${priorManifest.binarySha256}`;
  const prepareTransitionRuntime = runtime => {
    const releaseRoot = path.join(runtime, 'releases', 'pocketbase');
    const generation = path.join(releaseRoot, 'generations', priorGenerationId);
    const staged = path.join(releaseRoot, 'staged');
    fs.mkdirSync(generation, { recursive: true });
    fs.copyFileSync(priorBinary, path.join(generation, 'pocketbase'));
    fs.chmodSync(path.join(generation, 'pocketbase'), 0o755);
    fs.cpSync(releaseFixture.migrations, path.join(generation, 'pb_migrations'), { recursive: true });
    fs.writeFileSync(path.join(generation, 'manifest.json'), `${JSON.stringify(priorManifest, null, 2)}\n`, { mode: 0o600 });
    fs.symlinkSync(`generations/${priorGenerationId}`, path.join(releaseRoot, 'current'));
    fs.mkdirSync(path.join(runtime, 'bin'), { recursive: true });
    fs.copyFileSync(path.join(root, 'deploy/imac/run-pocketbase-release.sh'), path.join(runtime, 'bin', 'pocketbase'));
    fs.chmodSync(path.join(runtime, 'bin', 'pocketbase'), 0o755);
    fs.mkdirSync(staged, { recursive: true });
    fs.copyFileSync(releaseFixture.binary, path.join(staged, 'pocketbase'));
    fs.chmodSync(path.join(staged, 'pocketbase'), 0o755);
    fs.cpSync(releaseFixture.migrations, path.join(staged, 'pb_migrations'), { recursive: true });
    fs.copyFileSync(releaseFixture.manifest, path.join(staged, 'manifest.json'));
    return { releaseRoot, generation };
  };

  const transitionRuntimeRoot = path.join(releaseFixture.root, 'transition-runtime');
  const transition = prepareTransitionRuntime(transitionRuntimeRoot);
  const priorBinaryHash = sha256File(path.join(transition.generation, 'pocketbase'));
  const transitionActivation = run('bash', [relativePath, '--backend-activate', '--no-start'], {
    allowFailure: true,
    env: {
      ...releaseFixture.env,
      IMAC_RUNTIME_ROOT: transitionRuntimeRoot,
      CWK_BACKEND_ACTIVATE_COMMIT: releaseFixture.commit,
      PATH: `${runningToolDir}:${process.env.PATH}`,
      IMAC_LSOF_TOOL: absentLsofTool,
    },
  });
  requireCondition('existing generation switches A to B and retains previous A', transitionActivation.ok
    && fs.readlinkSync(path.join(transition.releaseRoot, 'current')) === `generations/${releaseFixture.generationId}`
    && fs.readlinkSync(path.join(transition.releaseRoot, 'previous')) === `generations/${priorGenerationId}`,
  transitionActivation.output);
  requireCondition('previous generation remains byte-for-byte immutable after activation',
    sha256File(path.join(transition.generation, 'pocketbase')) === priorBinaryHash);

  const rollbackRuntimeRoot = path.join(releaseFixture.root, 'rollback-runtime');
  const rollback = prepareTransitionRuntime(rollbackRuntimeRoot);
  const rollbackPriorPrevious = path.join(rollback.releaseRoot, 'generations', releaseFixture.generationId);
  fs.mkdirSync(rollbackPriorPrevious, { recursive: true });
  fs.copyFileSync(releaseFixture.binary, path.join(rollbackPriorPrevious, 'pocketbase'));
  fs.chmodSync(path.join(rollbackPriorPrevious, 'pocketbase'), 0o755);
  fs.cpSync(releaseFixture.migrations, path.join(rollbackPriorPrevious, 'pb_migrations'), { recursive: true });
  fs.copyFileSync(releaseFixture.manifest, path.join(rollbackPriorPrevious, 'manifest.json'));
  fs.symlinkSync(`generations/${releaseFixture.generationId}`, path.join(rollback.releaseRoot, 'previous'));
  const failingPublisher = path.join(releaseFixture.root, 'fail-file-publisher.py');
  const publisherMarker = path.join(releaseFixture.root, 'file-publisher-failed-once');
  fs.writeFileSync(failingPublisher, `#!/usr/bin/python3
import os
import sys
from pathlib import Path
marker = Path(${JSON.stringify(publisherMarker)})
if not marker.exists():
    marker.write_text('failed once')
    raise SystemExit(42)
os.execv('/usr/bin/python3', ['/usr/bin/python3', ${JSON.stringify(path.join(root, 'deploy/imac/publish-pocketbase-file.py'))}, *sys.argv[1:]])
`, { mode: 0o755 });
  const failedPublication = run('bash', [relativePath, '--backend-activate', '--no-start'], {
    allowFailure: true,
    env: {
      ...releaseFixture.env,
      IMAC_RUNTIME_ROOT: rollbackRuntimeRoot,
      IMAC_BACKEND_FILE_PUBLISHER: failingPublisher,
      CWK_BACKEND_ACTIVATE_COMMIT: releaseFixture.commit,
      PATH: `${runningToolDir}:${process.env.PATH}`,
      IMAC_LSOF_TOOL: absentLsofTool,
    },
  });
  requireCondition('pre-restart publication failure restores prior current generation',
    !failedPublication.ok
      && fs.readlinkSync(path.join(rollback.releaseRoot, 'current')) === `generations/${priorGenerationId}`
      && fs.readlinkSync(path.join(rollback.releaseRoot, 'previous')) === `generations/${releaseFixture.generationId}`,
    failedPublication.output);
  requireCondition('pre-restart publication failure leaves the prior launcher bootable',
    fs.readFileSync(path.join(rollbackRuntimeRoot, 'bin', 'pocketbase'), 'utf8').includes('CWK_ATOMIC_POCKETBASE_LAUNCHER_V1'));

  const pointerRoot = path.join(releaseFixture.root, 'pointer-publication');
  const oldGenerationId = `${'a'.repeat(40)}-${'1'.repeat(64)}`;
  const newGenerationId = `${'b'.repeat(40)}-${'2'.repeat(64)}`;
  fs.mkdirSync(path.join(pointerRoot, 'generations', oldGenerationId), { recursive: true });
  fs.mkdirSync(path.join(pointerRoot, 'generations', newGenerationId), { recursive: true });
  fs.symlinkSync(`generations/${oldGenerationId}`, path.join(pointerRoot, 'current'));
  fs.symlinkSync(`generations/${newGenerationId}`, path.join(pointerRoot, 'current.staged'));
  const pointerPublish = run('/usr/bin/python3', [
    'deploy/imac/publish-pocketbase-link.py',
    path.join(pointerRoot, 'current.staged'),
    path.join(pointerRoot, 'current'),
  ], { allowFailure: true });
  requireCondition('existing directory symlink is atomically replaced without being followed',
    pointerPublish.ok
      && fs.readlinkSync(path.join(pointerRoot, 'current')) === `generations/${newGenerationId}`
      && !fs.existsSync(path.join(pointerRoot, 'generations', oldGenerationId, 'current.staged')),
    pointerPublish.output);

  const backupDryRun = run('bash', [relativePath, '--dry-run', '--backup-only'], { allowFailure: true });
  requireCondition('backup-only installer dry-run succeeds', backupDryRun.ok, backupDryRun.output);
  if (backupDryRun.ok) {
    requireCondition('backup-only dry-run previews private backup executables', backupDryRun.output.includes('install -m 700') && backupDryRun.output.includes('backup-pocketbase.py'));
    requireCondition('backup-only dry-run previews backup daemon install', backupDryRun.output.includes('/Library/LaunchDaemons/com.coldwaterkim.pocketbase-backup.plist'));
    requireCondition('backup-only dry-run previews exact backup root ownership gate', backupDryRun.output.includes(`${os.homedir()}/Backups/coldwaterkim-pocketbase`));
    requireCondition('backup-only dry-run skips PocketBase daemon install', !backupDryRun.output.includes('/Library/LaunchDaemons/com.coldwaterkim.pocketbase.plist'));
    requireCondition('backup-only dry-run skips Caddy daemon install', !backupDryRun.output.includes('/Library/LaunchDaemons/com.coldwaterkim.caddy.plist'));
    requireCondition('backup-only dry-run skips Caddy binary install', !backupDryRun.output.includes('/usr/local/bin/caddy'));
  }

  const caddyCommand = path.join(root, 'deploy/imac/run-caddy-system-install.command');
  requireCondition('Caddy system install command exists', fs.existsSync(caddyCommand), 'deploy/imac/run-caddy-system-install.command');
  if (fs.existsSync(caddyCommand)) {
    const caddyCommandText = readText('deploy/imac/run-caddy-system-install.command');
    requireCondition('Caddy system install command preflights sudo', caddyCommandText.includes('sudo -v'));
    requireCondition('Caddy system install command explains hidden password input', caddyCommandText.includes('Password input is hidden'));

    try {
      fs.accessSync(caddyCommand, fs.constants.X_OK);
      record('Caddy system install command executable', true);
    } catch {
      record('Caddy system install command executable', false, 'deploy/imac/run-caddy-system-install.command');
    }

    try {
      run('bash', ['-n', 'deploy/imac/run-caddy-system-install.command']);
      record('Caddy system install command shell syntax', true);
    } catch (error) {
      record('Caddy system install command shell syntax', false, error.message);
    }
  }
  fs.rmSync(releaseFixture.root, { recursive: true, force: true });
}

function verifyStaticService(service) {
  const plistPath = path.join(root, service.plist);
  requireCondition(`${service.name} plist exists`, fs.existsSync(plistPath), service.plist);
  if (!fs.existsSync(plistPath)) return;

  try {
    run('plutil', ['-lint', service.plist]);
    record(`${service.name} plist valid`, true);
  } catch (error) {
    record(`${service.name} plist valid`, false, error.message);
  }

  const plist = readText(service.plist);
  requireCondition(`${service.name} label set`, plist.includes(`<string>${service.label}</string>`));

  const args = plistProgramArguments(plist);
  const program = args[0] || '';
  requireCondition(`${service.name} program path set`, program === service.expectedProgram, program || 'missing');
  requireCondition(`${service.name} launchd avoids Documents TCC path`, !plist.includes('/Documents/'));

  for (const logFile of service.logFiles) {
    requireCondition(`${service.name} logs to ${logFile}`, plist.includes(expandHome(logFile)), logFile);
  }

  if (service.label === 'com.coldwaterkim.pocketbase') {
    requireCondition('PocketBase launchd runs as kimchansu', plist.includes('<key>UserName</key>') && plist.includes('<string>kimchansu</string>'));
    requireCondition('PocketBase launchd has HOME env', plist.includes('<key>HOME</key>') && plist.includes(os.homedir()));
    requireCondition('PocketBase launchd binds localhost', plist.includes('--http=127.0.0.1:8090'));
    requireCondition('PocketBase launchd allows 3 hour media uploads', plist.includes('--httpRequestTimeout=3h'));
    requireCondition('PocketBase launchd uses resumable upload staging outside pb_data', plist.includes(`--tusUploadDir=${runtimeRoot}/tus-uploads`));
    requireCondition('PocketBase launchd uses file tool staging outside pb_data', plist.includes(`--toolJobDir=${runtimeRoot}/tool-jobs`));
    requireCondition('PocketBase launchd requires explicit OWNER user id rendering', plist.includes('<key>CWK_OWNER_USER_ID</key>') && plist.includes('__CWK_OWNER_USER_ID__'));
    requireCondition('PocketBase launchd uses runtime pb_data', plist.includes(`${runtimeRoot}/pb_data`));
    requireCondition('PocketBase launchd uses runtime migrations', plist.includes(`--migrationsDir=${runtimeRoot}/pb_migrations`));
    requireCondition('PocketBase launchd uses runtime dist for SEO rendering', plist.includes(`--siteDir=${runtimeRoot}/dist`));
  }

  if (service.label === 'com.coldwaterkim.caddy') {
    requireCondition('Caddy launchd uses runtime Caddyfile', plist.includes(`${runtimeRoot}/Caddyfile`));
    requireCondition('Caddy launchd has HOME env', plist.includes('<key>HOME</key>') && plist.includes(os.homedir()));
  }

  if (service.label === 'com.coldwaterkim.pocketbase-backup') {
    requireCondition('Backup launchd runs runtime backup script', plist.includes(`${runtimeRoot}/backup-pocketbase.sh`));
    requireCondition('Backup launchd runs as kimchansu', plist.includes('<key>UserName</key>') && plist.includes('<string>kimchansu</string>'));
    requireCondition('Backup launchd runs as staff', plist.includes('<key>GroupName</key>') && plist.includes('<string>staff</string>'));
    requireCondition('Backup launchd uses umask 077', /<key>Umask<\/key>\s*<integer>63<\/integer>/.test(plist));
    requireCondition('Backup launchd runs daily at 03:30', plist.includes('<integer>3</integer>') && plist.includes('<integer>30</integer>'));
    requireCondition('Backup launchd has HOME env', plist.includes('<key>HOME</key>') && plist.includes(os.homedir()));
  }
}

function verifyLaunchctlService(service) {
  if (!service.domain) {
    record(`${service.name} launchd domain known`, false, 'missing uid');
    return;
  }

  const target = `${service.domain}/${service.label}`;
  const result = run('launchctl', ['print', target], { allowFailure: true });
  if (!result.ok) {
    record(
      `${service.name} launchd job loaded`,
      allowMissingLive,
      allowMissingLive ? `missing allowed: ${target}` : result.output || target,
    );
    return;
  }

  record(`${service.name} launchd job loaded`, true, target);
  const output = result.output;
  requireCondition(`${service.name} live launchd avoids Documents TCC path`, !output.includes('/Documents/'));
  requireCondition(`${service.name} launchd has pid or scheduled state`, /pid\s*=\s*\d+|state\s*=|next scheduled run/.test(output));

  if (service.label !== 'com.coldwaterkim.pocketbase-backup') {
    requireCondition(`${service.name} launchd is not crashed`, !/last exit code\s*=\s*[1-9]\d*/.test(output));
  }
}

function verifyLiveServices() {
  for (const service of services) {
    verifyLaunchctlService(service);
  }
}

function printSummary() {
  const failed = checks.filter(check => !check.ok);
  for (const check of checks) {
    const status = check.ok ? 'ok' : 'FAIL';
    console.log(`${status}  ${check.name}${check.detail ? ` - ${check.detail}` : ''}`);
  }

  if (failed.length) {
    console.error(`iMac launchd verification failed (${failed.length}/${checks.length})`);
    process.exitCode = 1;
    return;
  }

  console.log(`iMac launchd verification passed (${checks.length} checks)`);
}

function main() {
  verifyPackageScripts();
  verifyInstallerScript();
  for (const service of services) verifyStaticService(service);
  verifyLiveServices();
  printSummary();
}

main();

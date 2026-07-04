import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

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
  const result = spawnSync(command, commandArgs, {
    cwd: root,
    encoding: 'utf8',
  });
  const output = [result.stdout, result.stderr].filter(Boolean).join('\n').trim();
  if (result.status !== 0 && !options.allowFailure) {
    throw new Error(`${command} ${commandArgs.join(' ')} failed${output ? `:\n${output}` : ''}`);
  }
  return {
    ok: result.status === 0,
    output,
    stdout: result.stdout.trim(),
    stderr: result.stderr.trim(),
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
    'qa:launchd',
    'qa:launchd:tooling',
  ]) {
    requireCondition(`package script ${name}`, Boolean(scripts[name]), scripts[name] || 'missing');
  }
}

function verifyInstallerScript() {
  const relativePath = 'deploy/imac/install-launchd-services.sh';
  const installerPath = path.join(root, relativePath);
  requireCondition('launchd installer exists', fs.existsSync(installerPath), relativePath);
  if (!fs.existsSync(installerPath)) return;

  const stat = fs.statSync(installerPath);
  requireCondition('launchd installer executable', Boolean(stat.mode & 0o111), relativePath);

  const script = readText(relativePath);
  requireCondition('launchd installer supports dry run', script.includes('--dry-run'));
  requireCondition('launchd installer supports no-start mode', script.includes('--no-start'));
  requireCondition('launchd installer protects normal user launchd setup', script.includes('Run this as the normal iMac user'));
  requireCondition('launchd installer supports Caddy-only mode', script.includes('--caddy-only'));
  requireCondition('launchd installer supports runtime-only mode', script.includes('--runtime-only'));
  requireCondition('launchd installer defines runtime root', script.includes('RUNTIME_ROOT="${IMAC_RUNTIME_ROOT:-$HOME/.local/share/coldwaterkim/home-server}"'));
  requireCondition('launchd installer replaces runtime dist cleanly', script.includes('replace_runtime_dir "$LOCAL_DIST" "$RUNTIME_DIST"'));
  requireCondition('launchd installer syncs runtime migrations', script.includes('ditto "$LOCAL_MIGRATIONS" "$RUNTIME_MIGRATIONS"'));
  requireCondition('launchd installer syncs runtime backup script', script.includes('install -m 755 "$LOCAL_BACKUP_SCRIPT" "$RUNTIME_BACKUP_SCRIPT"'));
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

  const dryRun = run('bash', [relativePath, '--dry-run', '--no-start'], { allowFailure: true });
  requireCondition('launchd installer dry-run succeeds', dryRun.ok, dryRun.output);
  if (dryRun.ok) {
    requireCondition('launchd installer dry-run previews PocketBase daemon install', dryRun.output.includes('/Library/LaunchDaemons/com.coldwaterkim.pocketbase.plist'));
    requireCondition('launchd installer dry-run previews backup daemon install', dryRun.output.includes('/Library/LaunchDaemons/com.coldwaterkim.pocketbase-backup.plist'));
    requireCondition('launchd installer dry-run previews runtime root', dryRun.output.includes(runtimeRoot));
    requireCondition('launchd installer dry-run previews runtime dist sync', dryRun.output.includes(`${runtimeRoot}/dist`));
    requireCondition('launchd installer dry-run previews runtime migrations sync', dryRun.output.includes(`${runtimeRoot}/pb_migrations`));
    requireCondition('launchd installer dry-run previews Caddy daemon install', dryRun.output.includes('/Library/LaunchDaemons/com.coldwaterkim.caddy.plist'));
    requireCondition('launchd installer dry-run previews Caddy binary install', dryRun.output.includes('/usr/local/bin/caddy'));
    requireCondition('launchd installer dry-run changes nothing', dryRun.output.includes('Dry run only. No files were changed.'));
  }

  const caddyDryRun = run('bash', [relativePath, '--dry-run', '--no-start', '--caddy-only'], { allowFailure: true });
  requireCondition('Caddy-only installer dry-run succeeds', caddyDryRun.ok, caddyDryRun.output);
  if (caddyDryRun.ok) {
    requireCondition('Caddy-only dry-run previews Caddy binary install', caddyDryRun.output.includes('/usr/local/bin/caddy'));
    requireCondition('Caddy-only dry-run previews Caddy daemon install', caddyDryRun.output.includes('/Library/LaunchDaemons/com.coldwaterkim.caddy.plist'));
    requireCondition('Caddy-only dry-run skips PocketBase plist install', !caddyDryRun.output.includes('com.coldwaterkim.pocketbase.plist'));
  }

  const runtimeDryRun = run('bash', [relativePath, '--dry-run', '--runtime-only'], { allowFailure: true });
  requireCondition('runtime-only installer dry-run succeeds', runtimeDryRun.ok, runtimeDryRun.output);
  if (runtimeDryRun.ok) {
    requireCondition('runtime-only dry-run previews runtime dist replacement', runtimeDryRun.output.includes(`${runtimeRoot}/dist.tmp.`) && runtimeDryRun.output.includes(`${runtimeRoot}/dist.old.`));
    requireCondition('runtime-only dry-run skips LaunchDaemon install', !runtimeDryRun.output.includes('/Library/LaunchDaemons/'));
    requireCondition('runtime-only dry-run skips sudo', !runtimeDryRun.output.includes('sudo '));
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
    requireCondition('PocketBase launchd uses runtime pb_data', plist.includes(`${runtimeRoot}/pb_data`));
    requireCondition('PocketBase launchd uses runtime migrations', plist.includes(`--migrationsDir=${runtimeRoot}/pb_migrations`));
  }

  if (service.label === 'com.coldwaterkim.caddy') {
    requireCondition('Caddy launchd uses runtime Caddyfile', plist.includes(`${runtimeRoot}/Caddyfile`));
    requireCondition('Caddy launchd has HOME env', plist.includes('<key>HOME</key>') && plist.includes(os.homedir()));
  }

  if (service.label === 'com.coldwaterkim.pocketbase-backup') {
    requireCondition('Backup launchd runs runtime backup script', plist.includes(`${runtimeRoot}/backup-pocketbase.sh`));
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

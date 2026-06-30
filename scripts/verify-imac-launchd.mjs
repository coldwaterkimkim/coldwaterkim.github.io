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

const services = [
  {
    name: 'PocketBase',
    label: 'com.coldwaterkim.pocketbase',
    domain: uid === '' ? '' : `gui/${uid}`,
    plist: 'deploy/imac/com.coldwaterkim.pocketbase.plist',
    expectedProgram: '.local-bin/pocketbase',
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
    domain: uid === '' ? '' : `gui/${uid}`,
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
  for (const name of ['qa:launchd', 'qa:launchd:tooling']) {
    requireCondition(`package script ${name}`, Boolean(scripts[name]), scripts[name] || 'missing');
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
  const expectedProgram = service.expectedProgram.startsWith('.')
    ? path.join(root, service.expectedProgram)
    : service.expectedProgram;
  requireCondition(`${service.name} program path set`, program === expectedProgram, program || 'missing');

  for (const logFile of service.logFiles) {
    requireCondition(`${service.name} logs to ${logFile}`, plist.includes(expandHome(logFile)), logFile);
  }

  if (service.label === 'com.coldwaterkim.pocketbase') {
    requireCondition('PocketBase launchd binds localhost', plist.includes('--http=127.0.0.1:8090'));
    requireCondition('PocketBase launchd uses pb_data', plist.includes(`${root}/pb_data`));
    requireCondition('PocketBase launchd uses repo migrations', plist.includes(`${root}/pb_migrations`));
  }

  if (service.label === 'com.coldwaterkim.caddy') {
    requireCondition('Caddy launchd uses production Caddyfile', plist.includes(`${root}/deploy/imac/Caddyfile`));
    requireCondition('Caddy launchd has HOME env', plist.includes('<key>HOME</key>') && plist.includes(os.homedir()));
  }

  if (service.label === 'com.coldwaterkim.pocketbase-backup') {
    requireCondition('Backup launchd runs backup script', plist.includes(`${root}/deploy/imac/backup-pocketbase.sh`));
    requireCondition('Backup launchd runs daily at 03:30', plist.includes('<integer>3</integer>') && plist.includes('<integer>30</integer>'));
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
  for (const service of services) verifyStaticService(service);
  verifyLiveServices();
  printSummary();
}

main();

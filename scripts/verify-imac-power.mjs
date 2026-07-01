import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const uid = typeof process.getuid === 'function' ? process.getuid() : '';
const checks = [];

function record(name, ok, detail = '') {
  checks.push({ name, ok, detail });
}

function requireCondition(name, condition, detail = '') {
  record(name, Boolean(condition), detail);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: 'utf8',
  });
  const output = [result.stdout, result.stderr].filter(Boolean).join('\n').trim();
  if (result.status !== 0 && !options.allowFailure) {
    throw new Error(`${command} ${args.join(' ')} failed${output ? `:\n${output}` : ''}`);
  }
  return {
    ok: result.status === 0,
    output,
  };
}

function readText(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function parsePmset(output) {
  const settings = new Map();
  for (const line of output.split(/\r?\n/)) {
    const match = line.trim().match(/^([A-Za-z0-9_]+)\s+(.+)$/);
    if (match) settings.set(match[1], match[2].trim());
  }
  return settings;
}

function verifyPowerSettings() {
  const pmset = run('pmset', ['-g', 'custom']);
  const settings = parsePmset(pmset.output);
  const expected = new Map([
    ['sleep', '0'],
    ['disksleep', '0'],
    ['standby', '0'],
    ['autopoweroff', '0'],
    ['autorestart', '1'],
    ['womp', '1'],
    ['tcpkeepalive', '1'],
  ]);

  for (const [key, value] of expected) {
    requireCondition(`pmset ${key}=${value}`, settings.get(key) === value, `${key}=${settings.get(key) || 'missing'}`);
  }

  const schedule = run('pmset', ['-g', 'sched'], { allowFailure: true });
  requireCondition('pmset has no scheduled shutdown', !/\bshutdown\b|\bsleep\b/i.test(schedule.output), schedule.output);
}

function verifyFileVault() {
  const result = run('fdesetup', ['status'], { allowFailure: true });
  requireCondition('FileVault does not block unattended boot', /FileVault is Off\./.test(result.output), result.output);
}

function verifySystemDaemons() {
  for (const label of [
    'com.coldwaterkim.caddy',
    'com.coldwaterkim.pocketbase',
    'com.coldwaterkim.pocketbase-backup',
  ]) {
    const result = run('launchctl', ['print', `system/${label}`], { allowFailure: true });
    requireCondition(`system launchd ${label} loaded`, result.ok, result.output);
  }

  if (uid !== '') {
    const legacy = run('launchctl', ['print', `gui/${uid}/com.coldwaterkim.pocketbase`], { allowFailure: true });
    requireCondition('legacy user PocketBase LaunchAgent unloaded', !legacy.ok, legacy.ok ? 'still loaded in login session' : '');
  }

  const plist = readText('deploy/imac/com.coldwaterkim.pocketbase.plist');
  requireCondition('PocketBase daemon runs as kimchansu', plist.includes('<key>UserName</key>') && plist.includes('<string>kimchansu</string>'));
  requireCondition('PocketBase daemon keeps user HOME', plist.includes('<key>HOME</key>') && plist.includes(os.homedir()));
}

function printSummary() {
  const failed = checks.filter(check => !check.ok);
  for (const check of checks) {
    const status = check.ok ? 'ok' : 'FAIL';
    console.log(`${status}  ${check.name}${check.detail ? ` - ${check.detail}` : ''}`);
  }

  if (failed.length) {
    console.error(`iMac power verification failed (${failed.length}/${checks.length})`);
    process.exitCode = 1;
    return;
  }

  console.log(`iMac power verification passed (${checks.length} checks)`);
}

function main() {
  verifyPowerSettings();
  verifyFileVault();
  verifySystemDaemons();
  printSummary();
}

main();

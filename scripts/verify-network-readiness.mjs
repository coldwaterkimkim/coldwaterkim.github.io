import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const allowMissingLive = args.includes('--allow-missing-live');
const valueOptions = new Set(['--network-env-file', '--lan-ip', '--public-ip']);
const options = new Map();

for (let index = 0; index < args.length; index += 1) {
  const arg = args[index];
  if (valueOptions.has(arg)) {
    options.set(arg, args[index + 1] || '');
    index += 1;
  }
}

const checks = [];
const networkEnvFile = expandHome(
  optionValue('--network-env-file', process.env.HOME_SERVER_ENV_FILE || '~/.config/coldwaterkim/home-server.env'),
);
const networkEnv = readEnvFileIfExists(networkEnvFile);
const expectedLanIp = optionValue(
  '--lan-ip',
  process.env.HOME_SERVER_LAN_IP || networkEnv.HOME_SERVER_LAN_IP || '192.168.0.11',
);
const expectedPublicIp = optionValue(
  '--public-ip',
  process.env.HOME_SERVER_PUBLIC_IP || networkEnv.HOME_SERVER_PUBLIC_IP || '',
);

function optionValue(name, fallback = '') {
  return options.get(name) || fallback;
}

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

function readEnvFileIfExists(file) {
  if (!fs.existsSync(file)) return {};
  return parseEnvFile(file);
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

function isExecutable(file) {
  try {
    fs.accessSync(file, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function isIPv4(value) {
  return /^(\d{1,3}\.){3}\d{1,3}$/.test(value)
    && value.split('.').every(part => Number(part) >= 0 && Number(part) <= 255);
}

function isPrivateIPv4(value) {
  if (!isIPv4(value)) return false;
  const [first, second] = value.split('.').map(Number);
  return first === 10
    || (first === 172 && second >= 16 && second <= 31)
    || (first === 192 && second === 168);
}

function isPublicIPv4(value) {
  if (!isIPv4(value) || isPrivateIPv4(value)) return false;
  const [first, second, third] = value.split('.').map(Number);
  if (first === 0 || first === 127 || first >= 224) return false;
  if (first === 100 && second >= 64 && second <= 127) return false;
  if (first === 169 && second === 254) return false;
  if (first === 192 && second === 0 && third === 2) return false;
  if (first === 198 && second === 51 && third === 100) return false;
  if (first === 203 && second === 0 && third === 113) return false;
  return true;
}

function localIPv4s() {
  return Object.values(os.networkInterfaces())
    .flat()
    .filter(Boolean)
    .filter(entry => entry.family === 'IPv4' && !entry.internal)
    .map(entry => entry.address)
    .sort();
}

function verifyPackageScripts() {
  const packageJson = JSON.parse(readText('package.json'));
  const scripts = packageJson.scripts || {};
  for (const name of [
    'cutover:snapshot',
    'cutover:snapshot:dry-run',
    'imac:configure-network',
    'imac:configure-network:auto',
    'qa:migration-go',
    'qa:migration-go:tooling',
    'qa:rollback',
    'qa:network-preflight',
    'qa:network-readiness',
    'qa:cutover:network',
  ]) {
    requireCondition(`package script ${name}`, Boolean(scripts[name]), scripts[name] || 'missing');
  }
}

function verifyStaticConfig() {
  const caddyfile = readText('deploy/imac/Caddyfile');
  const caddyPlist = readText('deploy/imac/com.coldwaterkim.caddy.plist');
  const pocketbasePlist = readText('deploy/imac/com.coldwaterkim.pocketbase.plist');

  requireCondition('Caddyfile serves coldwaterkim.com', caddyfile.includes('coldwaterkim.com'));
  requireCondition('Caddyfile serves www.coldwaterkim.com', caddyfile.includes('www.coldwaterkim.com'));
  requireCondition('Caddyfile proxies /api locally', caddyfile.includes('handle /api/*') && caddyfile.includes('127.0.0.1:8090'));
  requireCondition('Caddyfile allows 2GB uploads', /request_body[\s\S]*max_size\s+2GB/.test(caddyfile));
  requireCondition('Caddy LaunchDaemon uses production Caddy path', caddyPlist.includes('/usr/local/bin/caddy'));
  requireCondition('Caddy LaunchDaemon keeps service alive', caddyPlist.includes('<key>KeepAlive</key>'));
  requireCondition('PocketBase binds localhost only', pocketbasePlist.includes('--http=127.0.0.1:8090'));

  try {
    run('plutil', ['-lint', 'deploy/imac/com.coldwaterkim.caddy.plist']);
    record('Caddy plist valid', true);
  } catch (error) {
    record('Caddy plist valid', false, error.message);
  }
}

function verifyReadme() {
  const readme = readText('deploy/imac/README.md');
  requireCondition('README documents cutover snapshot', readme.includes('npm run cutover:snapshot'));
  requireCondition('README documents network env configuration', readme.includes('npm run imac:configure-network'));
  requireCondition('README documents automatic network env configuration', readme.includes('npm run imac:configure-network:auto'));
  requireCondition('README documents rollback QA', readme.includes('npm run qa:rollback'));
  requireCondition('README documents migration go/no-go QA', readme.includes('npm run qa:migration-go'));
  requireCondition('README documents LAN IP env', readme.includes('HOME_SERVER_LAN_IP'));
  requireCondition('README documents public IP env', readme.includes('HOME_SERVER_PUBLIC_IP'));
  requireCondition('README documents network preflight', readme.includes('npm run qa:network-preflight'));
  requireCondition('README documents post-DNS network QA', readme.includes('npm run qa:cutover:network'));
}

function verifyNetworkEnvFile() {
  if (!fs.existsSync(networkEnvFile)) {
    record('home-server network env file optional', true, networkEnvFile);
    return;
  }

  record('home-server network env file present', true, networkEnvFile);

  const dirCheck = modeAtMost(path.dirname(networkEnvFile), 0o700);
  requireCondition(
    'home-server network env directory is private',
    dirCheck.ok,
    `${path.dirname(networkEnvFile)} mode ${formatMode(dirCheck.current)}`,
  );

  const fileCheck = modeAtMost(networkEnvFile, 0o600);
  requireCondition(
    'home-server network env file is private',
    fileCheck.ok,
    `${networkEnvFile} mode ${formatMode(fileCheck.current)}`,
  );

  requireCondition('home-server env has HOME_SERVER_LAN_IP', Boolean(networkEnv.HOME_SERVER_LAN_IP));
  requireCondition('home-server env has HOME_SERVER_PUBLIC_IP', Boolean(networkEnv.HOME_SERVER_PUBLIC_IP));
}

function verifyLiveInputs() {
  if (allowMissingLive) {
    record('live network inputs required', true, 'allowed for tooling QA');
    return;
  }

  requireCondition('HOME_SERVER_LAN_IP is private IPv4', isPrivateIPv4(expectedLanIp), expectedLanIp);
  requireCondition(
    'HOME_SERVER_PUBLIC_IP is public IPv4',
    isPublicIPv4(expectedPublicIp),
    expectedPublicIp || `missing; run npm run imac:configure-network or pass --public-ip`,
  );

  const addresses = localIPv4s();
  requireCondition(
    'iMac currently has expected LAN IP',
    addresses.includes(expectedLanIp),
    addresses.length ? addresses.join(', ') : 'no non-loopback IPv4 found',
  );

  requireCondition('production Caddy binary installed', isExecutable('/usr/local/bin/caddy'), '/usr/local/bin/caddy');
}

function printSummary() {
  const failed = checks.filter(check => !check.ok);
  for (const check of checks) {
    const status = check.ok ? 'ok' : 'FAIL';
    console.log(`${status}  ${check.name}${check.detail ? ` - ${check.detail}` : ''}`);
  }

  if (failed.length) {
    console.error(`Network readiness verification failed (${failed.length}/${checks.length})`);
    process.exitCode = 1;
    return;
  }

  console.log(`Network readiness verification passed (${checks.length} checks)`);
}

function main() {
  verifyPackageScripts();
  verifyStaticConfig();
  verifyReadme();
  verifyNetworkEnvFile();
  verifyLiveInputs();
  printSummary();
}

main();

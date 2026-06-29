import dns from 'node:dns/promises';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const valueOptions = new Set(['--origin', '--expected-ip', '--profile', '--data', '--schema', '--allow-missing']);
const flags = new Set();
const options = new Map();

for (let index = 0; index < args.length; index += 1) {
  const arg = args[index];
  if (valueOptions.has(arg)) {
    options.set(arg, args[index + 1] || '');
    index += 1;
  } else if (arg.startsWith('-')) {
    flags.add(arg);
  }
}

const checks = [];

function usage(exitCode = 0) {
  console.log(`iMac cutover verifier

Usage:
  node scripts/verify-imac-cutover.mjs
  node scripts/verify-imac-cutover.mjs --profile production
  node scripts/verify-imac-cutover.mjs --network --expected-ip <public-ip>
  node scripts/verify-imac-cutover.mjs --data pb_data --schema pb_schema.json

Options:
  --profile <local|production>  local checks repo binaries; production also requires /usr/local/bin/caddy
  --network                     verify DNS and public HTTPS routes
  --origin <url>                default: https://coldwaterkim.com
  --expected-ip <ip>            public IP that coldwaterkim.com/www should resolve to
  --data <pb_data-or-zip>       verify PocketBase data as part of cutover QA
  --schema <file>               schema for --data verification, default: pb_schema.json
  --allow-missing <a,b,c>       passed to verify-pocketbase-data.mjs for transitional rehearsals
`);
  process.exit(exitCode);
}

if (flags.has('-h') || flags.has('--help')) usage(0);

function optionValue(name, fallback = '') {
  return options.get(name) || fallback;
}

function displayPath(file) {
  const relative = path.relative(root, file);
  return relative.startsWith('..') ? file : relative;
}

function record(name, ok, detail = '') {
  checks.push({ name, ok, detail });
}

function requireCondition(name, condition, detail = '') {
  record(name, Boolean(condition), detail);
}

function run(command, commandArgs, runOptions = {}) {
  const result = spawnSync(command, commandArgs, {
    cwd: root,
    encoding: 'utf8',
    ...runOptions,
  });
  if (result.status !== 0) {
    const output = [result.stdout, result.stderr].filter(Boolean).join('\n').trim();
    throw new Error(`${command} ${commandArgs.join(' ')} failed${output ? `:\n${output}` : ''}`);
  }
  return result.stdout.trim();
}

function fileExists(relativePath) {
  return fs.existsSync(path.join(root, relativePath));
}

function isExecutable(file) {
  try {
    fs.accessSync(file, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function readText(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function verifyPackageScripts() {
  const packageJson = JSON.parse(readText('package.json'));
  const scripts = packageJson.scripts || {};
  for (const name of [
    'build:imac',
    'qa:home-server',
    'pb:rehearse:production',
    'pb:verify:data',
    'qa:cutover',
    'qa:cutover:network',
  ]) {
    requireCondition(`package script ${name}`, Boolean(scripts[name]), scripts[name] || 'missing');
  }
}

function verifyCaddyfile() {
  const caddyfile = readText('deploy/imac/Caddyfile');
  const rootPath = path.join(root, 'dist');
  requireCondition('Caddyfile includes coldwaterkim.com', caddyfile.includes('coldwaterkim.com'));
  requireCondition('Caddyfile includes www.coldwaterkim.com', caddyfile.includes('www.coldwaterkim.com'));
  requireCondition('Caddyfile proxies /api to local PocketBase', caddyfile.includes('handle /api/*') && caddyfile.includes('reverse_proxy 127.0.0.1:8090'));
  requireCondition('Caddyfile proxies /_ to local PocketBase admin', caddyfile.includes('handle /_/*') && caddyfile.includes('reverse_proxy 127.0.0.1:8090'));
  requireCondition('Caddyfile allows 2GB request bodies', /request_body[\s\S]*max_size\s+2GB/.test(caddyfile));
  requireCondition('Caddyfile serves dist root', caddyfile.includes(rootPath));
}

function verifyPlists() {
  for (const plist of [
    'deploy/imac/com.coldwaterkim.caddy.plist',
    'deploy/imac/com.coldwaterkim.pocketbase.plist',
  ]) {
    try {
      run('plutil', ['-lint', plist]);
      record(`plist valid ${plist}`, true);
    } catch (error) {
      record(`plist valid ${plist}`, false, error.message);
    }
  }

  const caddyPlist = readText('deploy/imac/com.coldwaterkim.caddy.plist');
  const pocketbasePlist = readText('deploy/imac/com.coldwaterkim.pocketbase.plist');
  requireCondition('Caddy launchd uses LaunchDaemon binary path', caddyPlist.includes('/usr/local/bin/caddy'));
  requireCondition('PocketBase launchd binds localhost', pocketbasePlist.includes('--http=127.0.0.1:8090'));
  requireCondition('PocketBase launchd points at pb_data', pocketbasePlist.includes(`${root}/pb_data`));
}

function verifyLocalArtifacts(profile) {
  const hasDist = fileExists('dist/index.html');
  requireCondition('dist/index.html exists', hasDist, hasDist ? '' : 'run build:imac first');
  requireCondition('local PocketBase binary executable', isExecutable(path.join(root, '.local-bin', 'pocketbase')));
  requireCondition('local Caddy binary executable', isExecutable(path.join(root, '.local-bin', 'caddy')));

  if (profile === 'production') {
    const hasProductionCaddy = isExecutable('/usr/local/bin/caddy');
    requireCondition('production Caddy binary installed', hasProductionCaddy, hasProductionCaddy ? '' : '/usr/local/bin/caddy');
  }
}

function verifyDist() {
  try {
    run(process.execPath, ['scripts/verify-home-server-build.mjs']);
    record('home server dist uses same-origin API only', true);
  } catch (error) {
    record('home server dist uses same-origin API only', false, error.message);
  }
}

function verifyDataIfRequested() {
  const data = optionValue('--data');
  if (!data) return;

  const schema = optionValue('--schema', 'pb_schema.json');
  const allowMissing = optionValue('--allow-missing');
  const commandArgs = ['scripts/verify-pocketbase-data.mjs', data, '--schema', schema];
  if (allowMissing) commandArgs.push('--allow-missing', allowMissing);

  try {
    run(process.execPath, commandArgs);
    record(`PocketBase data verified ${data}`, true);
  } catch (error) {
    record(`PocketBase data verified ${data}`, false, error.message);
  }
}

async function fetchOk(url) {
  const response = await fetch(url, { redirect: 'follow' });
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }
  return response;
}

async function verifyNetwork() {
  const origin = optionValue('--origin', 'https://coldwaterkim.com').replace(/\/+$/, '');
  const expectedIp = optionValue('--expected-ip', process.env.HOME_SERVER_PUBLIC_IP || '');

  for (const host of ['coldwaterkim.com', 'www.coldwaterkim.com']) {
    try {
      const addresses = await dns.resolve4(host);
      const detail = addresses.join(', ');
      record(`DNS A ${host}`, expectedIp ? addresses.includes(expectedIp) : addresses.length > 0, detail);
    } catch (error) {
      record(`DNS A ${host}`, false, error.message);
    }
  }

  for (const route of ['/api/health', '/', '/posts/', '/daily/', '/programs/', '/nasajab/', '/guestbook.html', '/about.html']) {
    try {
      await fetchOk(`${origin}${route}`);
      record(`public route ${route}`, true);
    } catch (error) {
      record(`public route ${route}`, false, error.message);
    }
  }
}

function printSummary() {
  const failed = checks.filter(check => !check.ok);
  for (const check of checks) {
    const status = check.ok ? 'ok' : 'FAIL';
    console.log(`${status}  ${check.name}${check.detail ? ` - ${check.detail}` : ''}`);
  }

  if (failed.length) {
    console.error(`iMac cutover verification failed (${failed.length}/${checks.length})`);
    process.exitCode = 1;
    return;
  }

  console.log(`iMac cutover verification passed (${checks.length} checks)`);
}

async function main() {
  const profile = optionValue('--profile', 'local');
  if (!['local', 'production'].includes(profile)) {
    throw new Error(`Invalid --profile: ${profile}`);
  }

  verifyPackageScripts();
  verifyCaddyfile();
  verifyPlists();
  verifyLocalArtifacts(profile);
  verifyDist();
  verifyDataIfRequested();
  if (flags.has('--network')) await verifyNetwork();
  printSummary();
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});

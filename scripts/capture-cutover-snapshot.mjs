import dns from 'node:dns/promises';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const flags = new Set();
const options = new Map();
const valueOptions = new Set(['--output', '--lan-ip', '--public-ip', '--origin']);

for (let index = 0; index < args.length; index += 1) {
  const arg = args[index];
  if (valueOptions.has(arg)) {
    options.set(arg, args[index + 1] || '');
    index += 1;
  } else if (arg.startsWith('-')) {
    flags.add(arg);
  }
}

function usage(exitCode = 0) {
  console.log(`Cutover rollback snapshot

Usage:
  node scripts/capture-cutover-snapshot.mjs
  node scripts/capture-cutover-snapshot.mjs --dry-run
  node scripts/capture-cutover-snapshot.mjs --output migration_backups/cutover/snapshot.json

Options:
  --dry-run          print the snapshot JSON without writing a file
  --allow-network-failures  keep going when DNS/HTTP probes fail
  --output <file>    default: migration_backups/cutover/cutover-snapshot-<timestamp>.json
  --lan-ip <ip>      expected iMac LAN IP, default HOME_SERVER_LAN_IP or 192.168.0.11
  --public-ip <ip>   intended home public IP, default HOME_SERVER_PUBLIC_IP
  --origin <url>     current public site origin, default https://coldwaterkim.com
`);
  process.exit(exitCode);
}

if (flags.has('-h') || flags.has('--help')) usage(0);

const dryRun = flags.has('--dry-run');
const allowNetworkFailures = flags.has('--allow-network-failures') || dryRun;

function optionValue(name, fallback = '') {
  return options.get(name) || fallback;
}

function timestamp() {
  return new Date().toISOString().replace(/\D/g, '').slice(0, 14);
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

function localIPv4s() {
  return Object.values(os.networkInterfaces())
    .flat()
    .filter(Boolean)
    .filter(entry => entry.family === 'IPv4' && !entry.internal)
    .map(entry => entry.address)
    .sort();
}

async function resolve4(host) {
  try {
    const addresses = await dns.resolve4(host);
    return { ok: true, addresses };
  } catch (error) {
    if (!allowNetworkFailures) throw error;
    return { ok: false, error: error.message, addresses: [] };
  }
}

async function probe(url) {
  try {
    const response = await fetch(url, { redirect: 'manual' });
    return {
      ok: response.ok || (response.status >= 300 && response.status < 400),
      status: response.status,
      location: response.headers.get('location') || '',
      server: response.headers.get('server') || '',
    };
  } catch (error) {
    if (!allowNetworkFailures) throw error;
    return {
      ok: false,
      error: error.message,
    };
  }
}

async function main() {
  const origin = optionValue('--origin', 'https://coldwaterkim.com').replace(/\/+$/, '');
  const outputFile = path.resolve(
    root,
    optionValue('--output', `migration_backups/cutover/cutover-snapshot-${timestamp()}.json`),
  );
  const lanIp = optionValue('--lan-ip', process.env.HOME_SERVER_LAN_IP || '192.168.0.11');
  const publicIp = optionValue('--public-ip', process.env.HOME_SERVER_PUBLIC_IP || '');
  const gitHead = run('git', ['rev-parse', 'HEAD']).output;
  const gitBranch = run('git', ['branch', '--show-current']).output;
  const gitStatus = run('git', ['status', '--short'], true).output;

  const hosts = ['coldwaterkim.com', 'www.coldwaterkim.com', 'api.coldwaterkim.com'];
  const routes = ['/', '/api/health', '/posts/', '/daily/', '/programs/', '/nasajab/', '/guestbook.html', '/about.html'];
  const dnsRecords = {};
  const httpProbes = {};

  for (const host of hosts) {
    dnsRecords[host] = await resolve4(host);
  }

  for (const route of routes) {
    httpProbes[route] = await probe(`${origin}${route}`);
  }

  const snapshot = {
    capturedAt: new Date().toISOString(),
    purpose: 'coldwaterkim.com iMac cutover rollback snapshot',
    git: {
      branch: gitBranch,
      head: gitHead,
      status: gitStatus,
    },
    expectedHomeServer: {
      lanIp,
      publicIp,
      localIPv4s: localIPv4s(),
    },
    rollbackTargets: {
      frontendHosts: ['coldwaterkim.com', 'www.coldwaterkim.com'],
      apiHost: 'api.coldwaterkim.com',
      dnsRecords,
    },
    probes: {
      origin,
      routes: httpProbes,
    },
    notes: [
      'Keep GitHub Pages and the Oracle PocketBase API online for at least 7 days after DNS cutover.',
      'If cutover fails, restore the frontend host A records and api.coldwaterkim.com DNS record to the captured values.',
      'If iMac pb_data is bad, restore the latest verified PocketBase backup before reattempting cutover.',
    ],
  };

  const json = `${JSON.stringify(snapshot, null, 2)}\n`;
  if (dryRun) {
    process.stdout.write(json);
    return;
  }

  await fsp.mkdir(path.dirname(outputFile), { recursive: true });
  await fsp.writeFile(outputFile, json, { mode: 0o600 });
  console.log(`Wrote ${path.relative(root, outputFile)}`);
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});

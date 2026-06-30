import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const toolingMode = args.includes('--tooling');
const checks = [];

function usage(exitCode = 0) {
  console.log(`iMac migration go/no-go verifier

Usage:
  node scripts/verify-imac-migration-go-no-go.mjs
  node scripts/verify-imac-migration-go-no-go.mjs --tooling

Modes:
  default    strict go/no-go: requires real production admin env, launchd jobs, LAN/public IP
  --tooling  verifies scripts/docs/build gates while allowing live secrets/services to be absent
`);
  process.exit(exitCode);
}

if (args.includes('-h') || args.includes('--help')) usage(0);

function record(label, command, ok, output) {
  checks.push({ label, command, ok, output });
}

function run(label, commandArgs) {
  const result = spawnSync(process.execPath, commandArgs, { cwd: root, encoding: 'utf8' });
  const output = [result.stdout, result.stderr].filter(Boolean).join('\n').trim();
  record(label, `node ${commandArgs.join(' ')}`, result.status === 0, output);
}

function lastLine(output) {
  return output.split(/\r?\n/).filter(Boolean).at(-1) || '';
}

function printSummary() {
  const failed = checks.filter(check => !check.ok);
  for (const check of checks) {
    const status = check.ok ? 'ok' : 'FAIL';
    console.log(`${status}  ${check.label} - ${check.command}`);
    const summary = lastLine(check.output);
    if (summary) console.log(`      ${summary}`);
  }

  if (failed.length) {
    console.error(`iMac migration go/no-go failed (${failed.length}/${checks.length})`);
    console.error('Remaining blockers:');
    for (const check of failed) {
      console.error(`- ${check.label}: ${lastLine(check.output) || check.command}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log(`iMac migration go/no-go passed (${checks.length} checks)`);
}

function main() {
  run('migration freeze', ['scripts/verify-migration-freeze.mjs']);
  run('production data readiness', [
    'scripts/verify-production-readiness.mjs',
    ...(toolingMode ? ['--allow-missing-env'] : []),
  ]);
  run('launchd services', [
    'scripts/verify-imac-launchd.mjs',
    ...(toolingMode ? ['--allow-missing-live'] : []),
  ]);
  run('rollback snapshot readiness', ['scripts/verify-cutover-rollback.mjs']);
  run('cutover static readiness', ['scripts/verify-imac-cutover.mjs']);
  run('network readiness', [
    'scripts/verify-network-readiness.mjs',
    ...(toolingMode ? ['--allow-missing-live'] : []),
  ]);
  run('hardening readiness', ['scripts/verify-imac-hardening.mjs']);
  run('cutover snapshot dry-run', [
    'scripts/capture-cutover-snapshot.mjs',
    '--dry-run',
    '--allow-network-failures',
  ]);
  printSummary();
}

main();

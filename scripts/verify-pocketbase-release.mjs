import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  assertExecutableFile,
  assertReleaseBinary,
  committedMigrationTreeSha256,
  inspectGoBuildInfo,
  migrationTreeSha256,
  normalizeGoVersion,
  parseGoModuleVersions,
  run,
  sha256File,
} from './pocketbase-release-lib.mjs';

const scriptRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const options = {
  repoRoot: scriptRoot,
  binary: null,
  migrations: null,
  manifest: null,
  quiet: false,
  printCommit: false,
  printGenerationId: false,
  allowNonHead: false,
  goCommand: process.env.GO_VERSION_TOOL || 'go',
};

function usage(exitCode = 0) {
  console.log(`Verify a PocketBase release against its Git commit and SHA-256 manifest.

Usage:
  node scripts/verify-pocketbase-release.mjs [options]

Options:
  --repo-root <path>   Git repository root (default: current project)
  --binary <path>      PocketBase binary (default: .local-bin/pocketbase)
  --migrations <path>  migration tree (default: pb_migrations)
  --manifest <path>    manifest (default: .local-bin/pocketbase-release.json)
  --quiet              suppress the verification summary
  --print-commit       print only the verified release commit
  --print-generation-id
                       print commit and binary SHA-256 as one immutable id
  --allow-non-head     verify an already-installed historical generation
  --go-command <path>  go command used for "go version -m"
`);
  process.exit(exitCode);
}

const args = process.argv.slice(2);
for (let index = 0; index < args.length; index += 1) {
  const arg = args[index];
  if (arg === '-h' || arg === '--help') usage(0);
  if (arg === '--quiet') {
    options.quiet = true;
    continue;
  }
  if (arg === '--print-commit') {
    options.printCommit = true;
    continue;
  }
  if (arg === '--print-generation-id') {
    options.printGenerationId = true;
    continue;
  }
  if (arg === '--allow-non-head') {
    options.allowNonHead = true;
    continue;
  }
  const key = {
    '--repo-root': 'repoRoot',
    '--binary': 'binary',
    '--migrations': 'migrations',
    '--manifest': 'manifest',
    '--go-command': 'goCommand',
  }[arg];
  if (!key || !args[index + 1]) usage(2);
  options[key] = args[index + 1];
  index += 1;
}

options.repoRoot = path.resolve(options.repoRoot);
options.binary = path.resolve(options.binary || path.join(options.repoRoot, '.local-bin', 'pocketbase'));
options.migrations = path.resolve(options.migrations || path.join(options.repoRoot, 'pb_migrations'));
options.manifest = path.resolve(options.manifest || path.join(options.repoRoot, '.local-bin', 'pocketbase-release.json'));

function main() {
  const manifest = JSON.parse(fs.readFileSync(options.manifest, 'utf8'));
  const expectedKeys = [
    'binarySha256',
    'builtAt',
    'commit',
    'goVersion',
    'migrationTreeSha256',
    'pocketbaseVersion',
    'schemaVersion',
  ];
  const actualKeys = Object.keys(manifest).sort();
  if (JSON.stringify(actualKeys) !== JSON.stringify(expectedKeys)) {
    throw new Error(`manifest fields are not the secret-free v1 allowlist: ${actualKeys.join(', ')}`);
  }
  if (manifest.schemaVersion !== 1) throw new Error(`unsupported manifest schema: ${manifest.schemaVersion}`);
  if (!/^[0-9a-f]{40,64}$/.test(manifest.commit)) throw new Error('manifest commit must be a full Git object id');
  if (!/^\d+\.\d+(?:\.\d+)?$/.test(manifest.goVersion)) throw new Error('manifest Go version is invalid');
  if (!/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(manifest.pocketbaseVersion)) throw new Error('manifest PocketBase version is invalid');
  for (const field of ['binarySha256', 'migrationTreeSha256']) {
    if (!/^[0-9a-f]{64}$/.test(manifest[field])) throw new Error(`manifest ${field} is not SHA-256`);
  }
  const builtAt = new Date(manifest.builtAt);
  if (!Number.isFinite(builtAt.getTime()) || builtAt.toISOString() !== manifest.builtAt) {
    throw new Error('manifest builtAt must be a normalized UTC timestamp');
  }
  if (builtAt.getTime() > Date.now() + 5 * 60_000) throw new Error('manifest builtAt is unexpectedly in the future');

  run('git', ['-C', options.repoRoot, 'cat-file', '-e', `${manifest.commit}^{commit}`]);
  const currentCommit = run('git', ['-C', options.repoRoot, 'rev-parse', 'HEAD']).trim();
  if (!options.allowNonHead && manifest.commit !== currentCommit) {
    throw new Error('manifest commit does not match current Git HEAD');
  }
  const moduleText = run('git', [
    '-C', options.repoRoot,
    'show', `${manifest.commit}:deploy/imac/pocketbase-custom/go.mod`,
  ]);
  const moduleVersions = parseGoModuleVersions(moduleText);
  if (moduleVersions.pocketbaseVersion !== manifest.pocketbaseVersion) {
    throw new Error(`manifest PocketBase ${manifest.pocketbaseVersion} does not match commit ${moduleVersions.pocketbaseVersion}`);
  }
  if (normalizeGoVersion(moduleVersions.goVersion) !== normalizeGoVersion(manifest.goVersion)) {
    throw new Error(`manifest Go ${manifest.goVersion} does not match commit ${moduleVersions.goVersion}`);
  }

  assertExecutableFile(options.binary);
  const binarySha256 = sha256File(options.binary);
  if (binarySha256 !== manifest.binarySha256) throw new Error('PocketBase binary SHA-256 does not match manifest');
  assertReleaseBinary(options.binary, manifest.pocketbaseVersion);
  const buildInfo = inspectGoBuildInfo(options.binary, options.goCommand);
  if (buildInfo.revision !== manifest.commit) throw new Error('binary vcs.revision does not match manifest commit');
  if (buildInfo.modified) throw new Error('binary vcs.modified is true');
  if (normalizeGoVersion(buildInfo.goVersion) !== normalizeGoVersion(manifest.goVersion)) {
    throw new Error('binary Go toolchain does not match manifest Go version');
  }
  if (buildInfo.pocketbaseVersion !== manifest.pocketbaseVersion) {
    throw new Error('binary PocketBase module does not match manifest PocketBase version');
  }
  const migrationSha256 = migrationTreeSha256(options.migrations);
  if (migrationSha256 !== manifest.migrationTreeSha256) throw new Error('migration tree SHA-256 does not match manifest');
  const committedMigrationSha256 = committedMigrationTreeSha256(options.repoRoot, manifest.commit);
  if (committedMigrationSha256 !== manifest.migrationTreeSha256) {
    throw new Error('migration tree does not match the manifest Git commit');
  }

  if (options.printGenerationId) {
    console.log(`${manifest.commit}-${manifest.binarySha256}`);
  } else if (options.printCommit) {
    console.log(manifest.commit);
  } else if (!options.quiet) {
    console.log('PocketBase release verified.');
    console.log(`commit: ${manifest.commit}`);
    console.log(`PocketBase: ${manifest.pocketbaseVersion}; Go: ${manifest.goVersion}`);
  }
}

try {
  main();
} catch (error) {
  console.error(`PocketBase release verification failed: ${error.message}`);
  process.exitCode = 1;
}

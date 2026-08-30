import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  assertReleaseBinary,
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
  output: null,
  pocketbaseVersion: null,
  goVersion: null,
  checkSourceOnly: false,
  goCommand: process.env.GO_VERSION_TOOL || 'go',
};

function usage(exitCode = 0) {
  console.log(`Create a secret-free PocketBase release manifest.

Usage:
  node scripts/create-pocketbase-release-manifest.mjs [options]

Options:
  --repo-root <path>          Git repository root (default: current project)
  --binary <path>             PocketBase binary (default: .local-bin/pocketbase)
  --migrations <path>         migration tree (default: pb_migrations)
  --output <path>             manifest path (default: .local-bin/pocketbase-release.json)
  --pocketbase-version <ver>  expected PocketBase version
  --go-version <ver>          expected Go version
  --check-source-only         verify committed source without reading an artifact
  --go-command <path>         go command used for "go version -m"
`);
  process.exit(exitCode);
}

for (let index = 0; index < process.argv.slice(2).length; index += 1) {
  const args = process.argv.slice(2);
  const arg = args[index];
  if (arg === '-h' || arg === '--help') usage(0);
  if (arg === '--check-source-only') {
    options.checkSourceOnly = true;
    continue;
  }
  const key = {
    '--repo-root': 'repoRoot',
    '--binary': 'binary',
    '--migrations': 'migrations',
    '--output': 'output',
    '--pocketbase-version': 'pocketbaseVersion',
    '--go-version': 'goVersion',
    '--go-command': 'goCommand',
  }[arg];
  if (!key || !args[index + 1]) usage(2);
  options[key] = args[index + 1];
  index += 1;
}

options.repoRoot = path.resolve(options.repoRoot);
options.binary = path.resolve(options.binary || path.join(options.repoRoot, '.local-bin', 'pocketbase'));
options.migrations = path.resolve(options.migrations || path.join(options.repoRoot, 'pb_migrations'));
options.output = path.resolve(options.output || path.join(options.repoRoot, '.local-bin', 'pocketbase-release.json'));

function gitText(args) {
  return run('git', ['-C', options.repoRoot, ...args]).trim();
}

function trackedFiles(relativeRoot) {
  const output = gitText(['ls-files', '--', relativeRoot]);
  return new Set(output.split('\n').filter(Boolean));
}

function assertCommittedCleanTree(relativeRoot) {
  const absoluteRoot = path.join(options.repoRoot, relativeRoot);
  const status = gitText(['status', '--porcelain=v1', '--untracked-files=all', '--', relativeRoot]);
  if (status) throw new Error(`release source has uncommitted changes in ${relativeRoot}:\n${status}`);

  const tracked = trackedFiles(relativeRoot);
  const diskFiles = [];
  const walk = current => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const absolute = path.join(current, entry.name);
      if (entry.isSymbolicLink()) throw new Error(`release source contains a symbolic link: ${absolute}`);
      if (entry.isDirectory()) walk(absolute);
      else if (entry.isFile()) diskFiles.push(path.relative(options.repoRoot, absolute).split(path.sep).join('/'));
      else throw new Error(`release source contains a non-regular file: ${absolute}`);
    }
  };
  walk(absoluteRoot);
  const untrackedOrIgnored = diskFiles.filter(file => !tracked.has(file));
  if (untrackedOrIgnored.length) {
    throw new Error(`release source contains files that are not committed:\n${untrackedOrIgnored.join('\n')}`);
  }
}

function main() {
  gitText(['rev-parse', '--is-inside-work-tree']);
  const commit = gitText(['rev-parse', 'HEAD']);
  if (!/^[0-9a-f]{40,64}$/.test(commit)) throw new Error(`unexpected Git commit id: ${commit}`);

  assertCommittedCleanTree('deploy/imac/pocketbase-custom');
  assertCommittedCleanTree('pb_migrations');

  const moduleText = fs.readFileSync(path.join(options.repoRoot, 'deploy/imac/pocketbase-custom/go.mod'), 'utf8');
  const moduleVersions = parseGoModuleVersions(moduleText);
  const pocketbaseVersion = options.pocketbaseVersion || moduleVersions.pocketbaseVersion;
  const goVersion = options.goVersion || normalizeGoVersion(moduleVersions.goVersion);
  if (pocketbaseVersion !== moduleVersions.pocketbaseVersion) {
    throw new Error(`PocketBase build pin ${pocketbaseVersion} does not match go.mod ${moduleVersions.pocketbaseVersion}`);
  }
  if (normalizeGoVersion(goVersion) !== normalizeGoVersion(moduleVersions.goVersion)) {
    throw new Error(`Go build pin ${goVersion} does not match go.mod ${moduleVersions.goVersion}`);
  }

  if (options.checkSourceOnly) {
    console.log(`PocketBase release source is committed and clean at ${commit}.`);
    return;
  }

  assertReleaseBinary(options.binary, pocketbaseVersion);
  const buildInfo = inspectGoBuildInfo(options.binary, options.goCommand);
  if (buildInfo.revision !== commit) {
    throw new Error(`binary vcs.revision ${buildInfo.revision} does not match manifest commit ${commit}`);
  }
  if (buildInfo.modified) {
    throw new Error('binary vcs.modified is true; rebuild from committed source');
  }
  if (normalizeGoVersion(buildInfo.goVersion) !== normalizeGoVersion(goVersion)) {
    throw new Error(`binary Go toolchain ${buildInfo.goVersion} does not match build pin ${goVersion}`);
  }
  if (buildInfo.pocketbaseVersion !== pocketbaseVersion) {
    throw new Error(`binary PocketBase module ${buildInfo.pocketbaseVersion} does not match build pin ${pocketbaseVersion}`);
  }
  const manifest = {
    schemaVersion: 1,
    commit,
    pocketbaseVersion,
    goVersion: buildInfo.goVersion,
    binarySha256: sha256File(options.binary),
    migrationTreeSha256: migrationTreeSha256(options.migrations),
    builtAt: new Date().toISOString(),
  };

  fs.mkdirSync(path.dirname(options.output), { recursive: true, mode: 0o700 });
  const temporary = `${options.output}.tmp.${process.pid}`;
  fs.writeFileSync(temporary, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(temporary, options.output);
  console.log(`PocketBase release manifest created: ${options.output}`);
  console.log(`commit: ${manifest.commit}`);
  console.log(`PocketBase: ${manifest.pocketbaseVersion}; Go: ${manifest.goVersion}`);
}

try {
  main();
} catch (error) {
  console.error(`PocketBase release manifest creation failed: ${error.message}`);
  process.exitCode = 1;
}

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

export function fail(message) {
  throw new Error(message);
}

export function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: options.binary ? null : 'utf8',
    timeout: options.timeout ?? 10_000,
    cwd: options.cwd,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const output = [result.stdout, result.stderr]
      .filter(Boolean)
      .map(value => Buffer.isBuffer(value) ? value.toString('utf8') : value)
      .join('\n')
      .trim();
    fail(`${command} ${args.join(' ')} failed${output ? `:\n${output}` : ''}`);
  }
  return result.stdout;
}

export function sha256Buffer(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

export function sha256File(file) {
  return sha256Buffer(fs.readFileSync(file));
}

export function listRegularFiles(root) {
  const files = [];
  const walk = current => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const absolute = path.join(current, entry.name);
      if (entry.isSymbolicLink()) fail(`release trees must not contain symbolic links: ${absolute}`);
      if (entry.isDirectory()) {
        walk(absolute);
      } else if (entry.isFile()) {
        files.push(path.relative(root, absolute).split(path.sep).join('/'));
      } else {
        fail(`release trees must contain regular files only: ${absolute}`);
      }
    }
  };
  walk(root);
  return files.sort();
}

export function treeSha256FromEntries(entries) {
  const tree = crypto.createHash('sha256');
  for (const entry of entries) {
    tree.update(entry.relativePath);
    tree.update('\0');
    tree.update(sha256Buffer(entry.contents));
    tree.update('\n');
  }
  return tree.digest('hex');
}

export function migrationTreeSha256(directory) {
  if (!fs.statSync(directory).isDirectory()) fail(`migration path is not a directory: ${directory}`);
  const files = listRegularFiles(directory);
  if (!files.length) fail(`migration tree is empty: ${directory}`);
  return treeSha256FromEntries(files.map(relativePath => ({
    relativePath,
    contents: fs.readFileSync(path.join(directory, relativePath)),
  })));
}

export function committedMigrationTreeSha256(repoRoot, commit, migrationRelativePath = 'pb_migrations') {
  const output = run('git', [
    '-C', repoRoot,
    'ls-tree', '-r', '--name-only', commit, '--', migrationRelativePath,
  ]).trim();
  const prefix = `${migrationRelativePath.replace(/\/$/, '')}/`;
  const files = output.split('\n').filter(Boolean).sort();
  if (!files.length) fail(`commit ${commit} has no tracked migrations`);
  return treeSha256FromEntries(files.map(file => {
    if (!file.startsWith(prefix)) fail(`unexpected migration path in commit: ${file}`);
    return {
      relativePath: file.slice(prefix.length),
      contents: run('git', ['-C', repoRoot, 'show', `${commit}:${file}`], { binary: true }),
    };
  }));
}

export function parseGoModuleVersions(moduleText) {
  const goMatch = moduleText.match(/^go\s+(\d+\.\d+(?:\.\d+)?)\s*$/m);
  const pocketBaseMatch = moduleText.match(/^\s*github\.com\/pocketbase\/pocketbase\s+v([^\s]+)\s*$/m);
  if (!goMatch || !pocketBaseMatch) fail('unable to read Go/PocketBase versions from go.mod');
  return {
    goVersion: goMatch[1],
    pocketbaseVersion: pocketBaseMatch[1],
  };
}

export function normalizeGoVersion(version) {
  return /^\d+\.\d+$/.test(version) ? `${version}.0` : version;
}

export function assertExecutableFile(binary) {
  const stat = fs.statSync(binary);
  if (!stat.isFile() || !(stat.mode & 0o111)) fail(`release binary is not executable: ${binary}`);
}

export function assertReleaseBinary(binary, pocketbaseVersion) {
  assertExecutableFile(binary);
  const output = run(binary, ['--version'], { timeout: 5_000 }).trim();
  const expected = `pocketbase version ${pocketbaseVersion}`;
  if (output !== expected) fail(`unexpected PocketBase version: ${output || '<empty>'}; expected ${expected}`);
}

export function inspectGoBuildInfo(binary, goCommand = 'go') {
  assertExecutableFile(binary);
  const output = run(goCommand, ['version', '-m', binary]);
  const toolchainMatch = output.match(/^.*:\s+go([^\s]+)\s*$/m);
  if (!toolchainMatch) fail('go version -m did not report the binary toolchain');

  const settings = new Map();
  let pocketbaseVersion = '';
  for (const rawLine of output.split('\n')) {
    const line = rawLine.trim();
    const dependencyMatch = line.match(/^dep\s+github\.com\/pocketbase\/pocketbase\s+v([^\s]+)(?:\s|$)/);
    if (dependencyMatch) pocketbaseVersion = dependencyMatch[1];
    const settingMatch = line.match(/^build\s+([^=\s]+)=(.*)$/);
    if (settingMatch) settings.set(settingMatch[1], settingMatch[2]);
  }

  if (settings.get('vcs') !== 'git') fail('Go binary does not contain Git VCS build metadata');
  const revision = settings.get('vcs.revision') || '';
  if (!/^[0-9a-f]{40,64}$/.test(revision)) fail('Go binary does not contain a full vcs.revision');
  if (!pocketbaseVersion) fail('Go binary does not contain the PocketBase module version');

  return {
    goVersion: normalizeGoVersion(toolchainMatch[1]),
    revision,
    modified: settings.get('vcs.modified') === 'true',
    pocketbaseVersion,
  };
}

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const tagPatternIndex = args.indexOf('--tag-pattern');
const tagPattern = tagPatternIndex === -1
  ? 'pre-imac-migration-*'
  : args[tagPatternIndex + 1] || '';
const checks = [];

function record(name, ok, detail = '') {
  checks.push({ name, ok, detail });
}

function requireCondition(name, condition, detail = '') {
  record(name, Boolean(condition), detail);
}

function git(commandArgs, options = {}) {
  const result = spawnSync('git', commandArgs, {
    cwd: root,
    encoding: 'utf8',
  });
  const output = [result.stdout, result.stderr].filter(Boolean).join('\n').trim();
  if (result.status !== 0 && !options.allowFailure) {
    throw new Error(`git ${commandArgs.join(' ')} failed${output ? `:\n${output}` : ''}`);
  }
  return {
    ok: result.status === 0,
    status: result.status,
    stdout: result.stdout.trim(),
    stderr: result.stderr.trim(),
    output,
  };
}

function verifyRepository() {
  try {
    const topLevel = git(['rev-parse', '--show-toplevel']).stdout;
    requireCondition('running inside expected repository', topLevel === root, topLevel);
  } catch (error) {
    record('running inside expected repository', false, error.message);
  }
}

function latestFreezeTag() {
  if (!tagPattern) return '';
  const result = git(['tag', '--list', tagPattern, '--sort=-creatordate']);
  return result.stdout.split(/\r?\n/).find(Boolean) || '';
}

function verifyFreezeTag() {
  try {
    const tag = latestFreezeTag();
    requireCondition('pre-migration freeze tag exists', Boolean(tag), tagPattern || 'missing pattern');
    if (!tag) return;

    const tagCommit = git(['rev-parse', `${tag}^{commit}`]).stdout;
    requireCondition('pre-migration freeze tag resolves', Boolean(tagCommit), tag);

    const ancestor = git(['merge-base', '--is-ancestor', tag, 'HEAD'], { allowFailure: true });
    requireCondition('pre-migration freeze tag is an ancestor of HEAD', ancestor.ok, tag);
  } catch (error) {
    record('pre-migration freeze tag valid', false, error.message);
  }
}

function verifyRemoteAlignment() {
  try {
    const refs = git(['rev-parse', 'HEAD', 'origin/main']).stdout.split(/\r?\n/);
    const [head, originMain] = refs;
    requireCondition('local HEAD matches origin/main', head === originMain, `HEAD ${head || 'missing'} / origin/main ${originMain || 'missing'}`);
  } catch (error) {
    record('local HEAD matches origin/main', false, error.message);
  }
}

function verifyTrackedWorktree() {
  const unstaged = git(['diff', '--quiet'], { allowFailure: true });
  requireCondition('no unstaged tracked file changes', unstaged.ok);

  const staged = git(['diff', '--cached', '--quiet'], { allowFailure: true });
  requireCondition('no staged tracked file changes', staged.ok);

  const trackedData = git(['ls-files', 'pb_data', 'migration_backups']).stdout;
  requireCondition('runtime data directories are not tracked', trackedData.length === 0, trackedData || 'not tracked');
}

function printSummary() {
  const failed = checks.filter(check => !check.ok);
  for (const check of checks) {
    const status = check.ok ? 'ok' : 'FAIL';
    console.log(`${status}  ${check.name}${check.detail ? ` - ${check.detail}` : ''}`);
  }

  if (failed.length) {
    console.error(`Migration freeze verification failed (${failed.length}/${checks.length})`);
    process.exitCode = 1;
    return;
  }

  console.log(`Migration freeze verification passed (${checks.length} checks)`);
}

function main() {
  verifyRepository();
  verifyFreezeTag();
  verifyRemoteAlignment();
  verifyTrackedWorktree();
  printSummary();
}

main();

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const toolingOnly = process.argv.includes('--tooling');
const checks = [];

function check(name, fn) {
  try {
    fn();
    checks.push({ name, ok: true });
  } catch (error) {
    checks.push({ name, ok: false, detail: error.message });
  }
}

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: options.cwd || root, encoding: 'utf8', env: { ...process.env, ...options.env } });
  if (result.status !== 0) {
    throw new Error([result.stdout, result.stderr].filter(Boolean).join('\n').trim() || `${command} exited ${result.status}`);
  }
  return result.stdout.trim();
}

check('PocketBase file tool Go tests', () => {
  run('go', ['test', './...'], { cwd: path.join(root, 'deploy/imac/pocketbase-custom') });
});

check('file tool installer shell syntax', () => {
  run('bash', ['-n', 'deploy/imac/install-file-tools-runtime.sh']);
  const installer = read('deploy/imac/install-file-tools-runtime.sh');
  for (const expected of ['MICROMAMBA_VERSION="2.9.0"', 'qpdf=12.3.2', 'poppler=26.07.0', 'ghostscript=10.07.1', 'tesseract=5.5.3', 'TEMURIN_VERSION="21.0.10+7"', '7484d5d4cdb02fc17a842ab86ddac2524a0365066659c46b2e258c64152379cd', 'LIBREOFFICE_VERSION="26.2.5"', 'pdfinfo', 'pdftoppm', 'pdftotext', 'soffice', 'java', 'H2Orestart', 'H2ORESTART_BUNDLED_DIR', '726230215dabe450bd617f9acac52376fd76f57c77158bd03b3ef9fe0c7e64fd', '7fc83e85cc6b0ab8be1dcdd8d6da30f137199212ec88a493c033b58e6fcfde67']) {
    assert.ok(installer.includes(expected), `missing ${expected}`);
  }
});

check('launchd installer and plist contract', () => {
  run('bash', ['-n', 'deploy/imac/install-launchd-services.sh']);
  run('plutil', ['-lint', 'deploy/imac/com.coldwaterkim.pocketbase.plist']);
  const installer = read('deploy/imac/install-launchd-services.sh');
  const plist = read('deploy/imac/com.coldwaterkim.pocketbase.plist');
  assert.ok(installer.includes('chmod 700 "$RUNTIME_TOOL_JOBS"'));
  assert.ok(installer.includes('CWK_OWNER_USER_ID'));
  assert.ok(installer.includes('SELECT count(*) FROM users'));
  assert.ok(installer.includes('file-tools-root.sentinel'));
  assert.ok(plist.includes('--toolJobDir=/Users/kimchansu/.local/share/coldwaterkim/home-server/tool-jobs'));
  assert.ok(plist.includes('<key>CWK_OWNER_USER_ID</key>'));
});

check('Caddy has a narrower file tool upload limit', () => {
  for (const relativePath of ['deploy/imac/Caddyfile', 'deploy/imac/Caddyfile.local']) {
    const caddy = read(relativePath);
    const toolsIndex = caddy.indexOf('handle /api/cwk/tools/*');
    const genericIndex = caddy.indexOf('handle /api/*');
    assert.ok(toolsIndex >= 0 && toolsIndex < genericIndex, `${relativePath} route order`);
    assert.ok(caddy.slice(toolsIndex, genericIndex).includes('max_size 202MiB'), `${relativePath} body limit`);
  }
});

check('signup lock and program retirement migrations are scoped', () => {
  const signup = read('pb_migrations/1787830200_lock_users_public_signup.js');
  const retirement = read('pb_migrations/1787830300_retire_program_records.js');
  assert.match(signup, /users\.createRule = null/g);
  assert.ok(!signup.includes('users.createRule = ""'));
  assert.ok(retirement.includes('content_kind = \'program\''));
  assert.ok(retirement.includes('app.findRecordsByFilter("programs"'));
  assert.ok(!retirement.includes('app.delete(app.findCollectionByNameOrId("post_views"))'));
  const visible = run('git', ['ls-files', '--cached', '--others', '--exclude-standard', '--',
    'pb_migrations/1787830200_lock_users_public_signup.js',
    'pb_migrations/1787830300_retire_program_records.js',
  ]);
  assert.ok(visible.includes('1787830200_lock_users_public_signup.js'));
  assert.ok(visible.includes('1787830300_retire_program_records.js'));
});

if (!toolingOnly) {
  check('installed document conversion runtimes', () => {
    run('bash', ['deploy/imac/install-file-tools-runtime.sh', '--check-only']);
  });
  check('real document conversion runtime E2E', () => {
    run('node', ['scripts/verify-file-tools-runtime-e2e.mjs'], {
      env: { FILE_TOOLS_BIN_DIR: path.join(root, '.local-bin') },
    });
  });
}

for (const result of checks) {
  console.log(`${result.ok ? 'PASS' : 'FAIL'} ${result.name}${result.detail ? `: ${result.detail}` : ''}`);
}
const failed = checks.filter(result => !result.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} file tool backend checks passed.`);
if (failed.length) process.exit(1);

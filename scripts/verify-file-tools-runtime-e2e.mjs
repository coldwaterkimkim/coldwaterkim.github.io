import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const binDir = path.resolve(process.env.FILE_TOOLS_BIN_DIR || path.join(root, '.local-bin'));

for (const name of ['CWK_DOCX_FIXTURE', 'CWK_XLSX_FIXTURE', 'CWK_PPTX_FIXTURE', 'CWK_HWP_FIXTURE', 'CWK_HWPX_FIXTURE']) {
  const fixture = process.env[name];
  if (!fixture || !path.isAbsolute(fixture)) {
    throw new Error(`${name} must be an absolute path to a public test fixture`);
  }
  const info = fs.statSync(fixture);
  if (!info.isFile()) throw new Error(`${name} is not a regular file: ${fixture}`);
}

const result = spawnSync(
  'go',
  ['test', '-run', '^TestFileToolRuntimeE2E$', '-count=1', '-v'],
  {
    cwd: path.join(root, 'deploy/imac/pocketbase-custom'),
    encoding: 'utf8',
    env: {
      ...process.env,
      CWK_FILE_TOOLS_E2E: '1',
      FILE_TOOLS_BIN_DIR: binDir,
    },
  },
);

process.stdout.write(result.stdout || '');
process.stderr.write(result.stderr || '');
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status || 1);

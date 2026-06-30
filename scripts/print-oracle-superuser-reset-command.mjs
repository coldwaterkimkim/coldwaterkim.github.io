import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourcePath = path.join(root, 'deploy/oracle/reset-pocketbase-superuser.sh');
const source = fs.readFileSync(sourcePath, 'utf8');

function makeDelimiter(content) {
  let delimiter = 'COLDWATERKIM_POCKETBASE_SUPERUSER_RESET';
  let suffix = 0;
  while (content.includes(delimiter)) {
    suffix += 1;
    delimiter = `COLDWATERKIM_POCKETBASE_SUPERUSER_RESET_${suffix}`;
  }
  return delimiter;
}

const delimiter = makeDelimiter(source);

const command = [
  '# Paste this whole block into the Oracle VM Browser SSH terminal.',
  '# It does not contain credentials; the reset script prompts for them on the VM.',
  'set -euo pipefail',
  'tmp_script="${TMPDIR:-/tmp}/coldwaterkim-reset-pocketbase-superuser.sh"',
  `cat > "$tmp_script" <<'${delimiter}'`,
  source.trimEnd(),
  delimiter,
  'chmod 700 "$tmp_script"',
  '"$tmp_script"',
  'rm -f "$tmp_script"',
  '',
].join('\n');

process.stdout.write(command);

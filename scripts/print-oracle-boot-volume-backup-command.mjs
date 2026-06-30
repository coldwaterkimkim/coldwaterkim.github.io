import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourcePath = path.join(root, 'deploy/oracle/create-boot-volume-backup.sh');
const source = fs.readFileSync(sourcePath, 'utf8');

function makeDelimiter(content) {
  let delimiter = 'COLDWATERKIM_ORACLE_BOOT_VOLUME_BACKUP';
  let suffix = 0;
  while (content.includes(delimiter)) {
    suffix += 1;
    delimiter = `COLDWATERKIM_ORACLE_BOOT_VOLUME_BACKUP_${suffix}`;
  }
  return delimiter;
}

const delimiter = makeDelimiter(source);

const command = [
  '# Paste this whole block into Oracle Cloud Shell.',
  '# First run is inspect-only. To create the backup, rerun the printed CREATE_BACKUP=1 command.',
  'set -euo pipefail',
  'tmp_script="${TMPDIR:-/tmp}/coldwaterkim-create-boot-volume-backup.sh"',
  `cat > "$tmp_script" <<'${delimiter}'`,
  source.trimEnd(),
  delimiter,
  'chmod 700 "$tmp_script"',
  '"$tmp_script"',
  'echo "Temporary script kept at: $tmp_script"',
  '',
].join('\n');

process.stdout.write(command);

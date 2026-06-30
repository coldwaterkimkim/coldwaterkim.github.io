const rawScriptUrl = 'https://raw.githubusercontent.com/coldwaterkimkim/coldwaterkim.github.io/main/deploy/oracle/create-boot-volume-backup.sh';
const scriptPath = '${TMPDIR:-/tmp}/coldwaterkim-create-boot-volume-backup.sh';

const command = [
  '# Paste this short block into Oracle Cloud Shell.',
  '# First run is inspect-only. To create the backup, rerun the printed CREATE_BACKUP=1 command.',
  'set -euo pipefail',
  `tmp_script="${scriptPath}"`,
  `curl -fsSL "${rawScriptUrl}" -o "$tmp_script"`,
  'chmod 700 "$tmp_script"',
  '"$tmp_script"',
  'echo "Temporary script kept at: $tmp_script"',
  '',
].join('\n');

process.stdout.write(command);

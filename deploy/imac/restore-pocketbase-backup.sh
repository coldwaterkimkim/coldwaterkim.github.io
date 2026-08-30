#!/usr/bin/env bash
set -euo pipefail

BACKUP_FILE="${1:-}"
TARGET_DIR="${2:-migration_backups/restore-rehearsal-pb_data}"

usage() {
  cat <<'EOF'
Usage:
  deploy/imac/restore-pocketbase-backup.sh <backup.zip> [target-dir]

Default target-dir:
  migration_backups/restore-rehearsal-pb_data

Safety:
  - Existing targets are always refused.
  - Repository and live runtime pb_data paths are always refused.
  - Archive paths and SQLite integrity are checked before the new target is published.
EOF
}

if [[ -z "$BACKUP_FILE" || "$BACKUP_FILE" == "-h" || "$BACKUP_FILE" == "--help" ]]; then
  usage
  exit 1
fi

if [[ ! -f "$BACKUP_FILE" ]]; then
  echo "Backup file not found: $BACKUP_FILE" >&2
  exit 1
fi

if ! command -v unzip >/dev/null 2>&1; then
  echo "unzip is required." >&2
  exit 1
fi
if ! command -v sqlite3 >/dev/null 2>&1; then
  echo "sqlite3 is required." >&2
  exit 1
fi

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

BACKUP_ABS="$(cd "$(dirname "$BACKUP_FILE")" && pwd -P)/$(basename "$BACKUP_FILE")"
PRODUCTION_RUNTIME_PB_DATA_ABS="$(/usr/bin/python3 -c 'import pathlib; print(pathlib.Path("/Users/kimchansu/.local/share/coldwaterkim/home-server/pb_data").resolve())')"
RESTORE_RESERVE_BYTES=$((10 * 1024 * 1024 * 1024))

if [[ "$TARGET_DIR" = /* ]]; then
  TARGET_ABS="$TARGET_DIR"
else
  TARGET_ABS="$ROOT_DIR/$TARGET_DIR"
fi
TARGET_ABS="$(/usr/bin/python3 -c 'import pathlib, sys; print(pathlib.Path(sys.argv[1]).resolve())' "$TARGET_ABS")"
TARGET_PARENT="$(dirname "$TARGET_ABS")"
TARGET_NAME="$(basename "$TARGET_ABS")"
PB_DATA_ABS="$ROOT_DIR/pb_data"
HOME_ABS="$(cd "$HOME" && pwd -P)"

refuse_protected_target() {
  local candidate="$1"
  case "$candidate" in
    /|"$HOME_ABS"|"$ROOT_DIR"|"$PB_DATA_ABS"|"$PB_DATA_ABS"/*|"$PRODUCTION_RUNTIME_PB_DATA_ABS"|"$PRODUCTION_RUNTIME_PB_DATA_ABS"/*)
      echo "Refusing protected restore target: $candidate" >&2
      exit 1
      ;;
  esac
}

refuse_protected_target "$TARGET_ABS"

if [[ -e "$TARGET_ABS" || -L "$TARGET_ABS" ]]; then
  echo "Target already exists: $TARGET_ABS" >&2
  exit 1
fi

mkdir -p "$TARGET_PARENT"
TARGET_PARENT="$(cd "$TARGET_PARENT" && pwd -P)"
TARGET_ABS="$TARGET_PARENT/$TARGET_NAME"
refuse_protected_target "$TARGET_ABS"

echo "Checking backup archive paths and restore capacity..."
if ! ARCHIVE_UNCOMPRESSED_BYTES="$(
  /usr/bin/python3 - "$BACKUP_ABS" "$TARGET_PARENT" "$RESTORE_RESERVE_BYTES" <<'PY'
import shutil
import stat
import sys
import unicodedata
import zipfile


MAX_ARCHIVE_ENTRIES = 1_000_000
MAX_ARCHIVE_BYTES = (1 << 63) - 1
MINIMUM_RESERVE_BYTES = 10 * 1024 * 1024 * 1024


def fail(message):
    print(message, file=sys.stderr)
    raise SystemExit(1)


archive_path, target_parent, reserve_text = sys.argv[1:]
try:
    reserve_bytes = int(reserve_text)
except ValueError:
    fail("Invalid restore reserve size.")
if reserve_bytes < MINIMUM_RESERVE_BYTES:
    fail("Restore reserve must be at least 10 GiB.")

try:
    with zipfile.ZipFile(archive_path) as archive:
        entries = archive.infolist()
except (OSError, ValueError, zipfile.BadZipFile) as error:
    fail("Invalid backup ZIP central directory: %s" % error)

if not entries:
    fail("Backup ZIP has no entries.")
if len(entries) > MAX_ARCHIVE_ENTRIES:
    fail("Backup ZIP has too many entries: %d" % len(entries))

total_bytes = 0
normalized_entries = {}
regular_paths = set()
has_root_database = False
for entry in entries:
    raw_name = entry.filename
    trimmed_name = raw_name[:-1] if raw_name.endswith("/") else raw_name
    parts = trimmed_name.split("/")
    if (
        not trimmed_name
        or raw_name.startswith("/")
        or "\\" in raw_name
        or any(part in ("", ".", "..") for part in parts)
    ):
        fail("Backup contains an unsafe path: %s" % raw_name)

    collision_key = unicodedata.normalize("NFD", trimmed_name).casefold()
    if collision_key in normalized_entries:
        fail("Backup contains colliding paths: %s and %s" % (normalized_entries[collision_key], raw_name))
    normalized_entries[collision_key] = raw_name

    unix_mode = (entry.external_attr >> 16) & 0xFFFF
    file_type = stat.S_IFMT(unix_mode)
    if stat.S_ISLNK(unix_mode):
        fail("Backup contains a symbolic link, which is not allowed: %s" % raw_name)
    if entry.flag_bits & 0x1:
        fail("Backup contains an encrypted entry, which is not allowed: %s" % raw_name)

    if entry.is_dir():
        if file_type not in (0, stat.S_IFDIR):
            fail("Backup directory has an invalid file type: %s" % raw_name)
        continue
    if file_type not in (0, stat.S_IFREG):
        fail("Backup contains a special file, which is not allowed: %s" % raw_name)
    if entry.file_size < 0 or entry.compress_size < 0:
        fail("Backup contains an invalid member size: %s" % raw_name)
    if entry.file_size > MAX_ARCHIVE_BYTES - total_bytes:
        fail("Backup declared size exceeds the supported restore limit.")

    total_bytes += entry.file_size
    regular_paths.add(collision_key)
    if trimmed_name == "data.db":
        has_root_database = True

for collision_key, raw_name in normalized_entries.items():
    parts = collision_key.split("/")
    for index in range(1, len(parts)):
        if "/".join(parts[:index]) in regular_paths:
            fail("Backup path is nested below a regular file: %s" % raw_name)

if not has_root_database:
    fail("Backup does not contain data.db at the archive root.")

try:
    free_bytes = shutil.disk_usage(target_parent).free
except OSError as error:
    fail("Could not inspect restore target capacity: %s" % error)
if free_bytes < reserve_bytes or total_bytes > free_bytes - reserve_bytes:
    fail(
        "Insufficient restore space: need %d bytes plus %d reserve, have %d"
        % (total_bytes, reserve_bytes, free_bytes)
    )

print(total_bytes)
PY
)"; then
  exit 1
fi

echo "Testing backup archive..."
unzip -tq "$BACKUP_ABS" >/dev/null

while IFS= read -r archive_entry; do
  normalized_entry="${archive_entry//\\//}"
  if [[ "$normalized_entry" == /* || "/$normalized_entry/" == *"/../"* ]]; then
    echo "Backup contains an unsafe path: $archive_entry" >&2
    exit 1
  fi
done < <(unzip -Z1 "$BACKUP_ABS")

echo "Archive preflight passed (${ARCHIVE_UNCOMPRESSED_BYTES} uncompressed bytes; 10 GiB reserve preserved)."

STAGING_DIR="$(mktemp -d "$TARGET_PARENT/.${TARGET_NAME}.restore.XXXXXX")"
cleanup() {
  if [[ -n "${STAGING_DIR:-}" && -d "$STAGING_DIR" ]]; then
    rm -rf "$STAGING_DIR"
  fi
}
trap cleanup EXIT

unzip -q "$BACKUP_ABS" -d "$STAGING_DIR"

if [[ ! -f "$STAGING_DIR/data.db" || -L "$STAGING_DIR/data.db" ]]; then
  echo "Backup does not contain data.db at the archive root." >&2
  exit 1
fi
if [[ -n "$(find "$STAGING_DIR" -type l -print -quit)" ]]; then
  echo "Backup contains symbolic links, which are not allowed." >&2
  exit 1
fi
if [[ "$(sqlite3 "$STAGING_DIR/data.db" 'PRAGMA quick_check;')" != "ok" ]]; then
  echo "Restored data.db failed SQLite quick_check." >&2
  exit 1
fi

chmod 700 "$STAGING_DIR"
mv "$STAGING_DIR" "$TARGET_ABS"
STAGING_DIR=""

echo "PocketBase backup restored to: $TARGET_ABS"
echo "Rehearsal run example:"
echo "  .local-bin/pocketbase serve --http=127.0.0.1:8090 --dir \"$TARGET_ABS\" --migrationsDir pb_migrations"

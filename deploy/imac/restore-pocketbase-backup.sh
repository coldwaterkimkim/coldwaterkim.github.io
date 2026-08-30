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

if [[ "$TARGET_DIR" = /* ]]; then
  TARGET_ABS="$TARGET_DIR"
else
  TARGET_ABS="$ROOT_DIR/$TARGET_DIR"
fi
TARGET_ABS="$(/usr/bin/python3 -c 'import pathlib, sys; print(pathlib.Path(sys.argv[1]).resolve())' "$TARGET_ABS")"
TARGET_PARENT="$(dirname "$TARGET_ABS")"
TARGET_NAME="$(basename "$TARGET_ABS")"
PB_DATA_ABS="$ROOT_DIR/pb_data"
RUNTIME_PB_DATA_ABS="$(cd "$HOME" && pwd -P)/.local/share/coldwaterkim/home-server/pb_data"
HOME_ABS="$(cd "$HOME" && pwd -P)"

case "$TARGET_ABS" in
  /|"$HOME_ABS"|"$ROOT_DIR"|"$PB_DATA_ABS"|"$PB_DATA_ABS"/*|"$RUNTIME_PB_DATA_ABS"|"$RUNTIME_PB_DATA_ABS"/*)
    echo "Refusing protected restore target: $TARGET_ABS" >&2
    exit 1
    ;;
esac

if [[ -e "$TARGET_ABS" || -L "$TARGET_ABS" ]]; then
  echo "Target already exists: $TARGET_ABS" >&2
  exit 1
fi

mkdir -p "$TARGET_PARENT"
TARGET_PARENT="$(cd "$TARGET_PARENT" && pwd -P)"
TARGET_ABS="$TARGET_PARENT/$TARGET_NAME"

echo "Testing backup archive..."
unzip -tq "$BACKUP_ABS" >/dev/null

while IFS= read -r archive_entry; do
  normalized_entry="${archive_entry//\\//}"
  if [[ "$normalized_entry" == /* || "/$normalized_entry/" == *"/../"* ]]; then
    echo "Backup contains an unsafe path: $archive_entry" >&2
    exit 1
  fi
done < <(unzip -Z1 "$BACKUP_ABS")

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

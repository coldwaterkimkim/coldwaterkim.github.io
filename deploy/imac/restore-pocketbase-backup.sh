#!/usr/bin/env bash
set -euo pipefail

BACKUP_FILE="${1:-}"
TARGET_DIR="${2:-migration_backups/restore-rehearsal-pb_data}"
ALLOW_OVERWRITE="${ALLOW_OVERWRITE:-0}"
ALLOW_PRODUCTION_RESTORE="${ALLOW_PRODUCTION_RESTORE:-0}"

usage() {
  cat <<'EOF'
Usage:
  deploy/imac/restore-pocketbase-backup.sh <backup.zip> [target-dir]

Default target-dir:
  migration_backups/restore-rehearsal-pb_data

Safety:
  - Existing target dirs are refused unless ALLOW_OVERWRITE=1 is set.
  - Restoring directly into ./pb_data is refused unless ALLOW_PRODUCTION_RESTORE=1 is set.
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

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

if [[ "$TARGET_DIR" = /* ]]; then
  TARGET_ABS="$TARGET_DIR"
else
  TARGET_ABS="$ROOT_DIR/$TARGET_DIR"
fi
mkdir -p "$(dirname "$TARGET_ABS")"
TARGET_ABS="$(cd "$(dirname "$TARGET_ABS")" && pwd -P)/$(basename "$TARGET_ABS")"
PB_DATA_ABS="$ROOT_DIR/pb_data"

if [[ "$TARGET_ABS" == "$PB_DATA_ABS" && "$ALLOW_PRODUCTION_RESTORE" != "1" ]]; then
  echo "Refusing to restore directly into ./pb_data without ALLOW_PRODUCTION_RESTORE=1." >&2
  exit 1
fi

if [[ -e "$TARGET_ABS" ]]; then
  if [[ "$ALLOW_OVERWRITE" != "1" ]]; then
    echo "Target already exists: $TARGET_ABS" >&2
    echo "Set ALLOW_OVERWRITE=1 only after checking that this is safe." >&2
    exit 1
  fi
  rm -rf "$TARGET_ABS"
fi

echo "Testing backup archive..."
unzip -tq "$BACKUP_FILE" >/dev/null

TMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/coldwaterkim-pb-restore.XXXXXX")"
trap 'rm -rf "$TMP_DIR"' EXIT

unzip -q "$BACKUP_FILE" -d "$TMP_DIR"

if [[ ! -f "$TMP_DIR/data.db" ]]; then
  echo "Backup does not contain data.db at the archive root." >&2
  exit 1
fi

mv "$TMP_DIR" "$TARGET_ABS"

echo "PocketBase backup restored to: $TARGET_ABS"
echo "Rehearsal run example:"
echo "  .local-bin/pocketbase serve --http=127.0.0.1:8090 --dir \"$TARGET_ABS\""

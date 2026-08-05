#!/bin/bash
set -euo pipefail

RUNTIME_ROOT="${IMAC_RUNTIME_ROOT:-$HOME/.local/share/coldwaterkim/home-server}"
PB_DATA_DIR="${PB_DATA_DIR:-$RUNTIME_ROOT/pb_data}"
BACKUP_DIR="${BACKUP_DIR:-$HOME/Backups/coldwaterkim-pocketbase}"
BACKUP_PROGRAM="${BACKUP_PROGRAM:-$RUNTIME_ROOT/backup-pocketbase.py}"
DATABASE_RETENTION_DAYS="${DATABASE_RETENTION_DAYS:-30}"

exec /usr/bin/python3 "$BACKUP_PROGRAM" \
  --pb-data-dir "$PB_DATA_DIR" \
  --backup-dir "$BACKUP_DIR" \
  --database-retention-days "$DATABASE_RETENTION_DAYS" \
  "$@"

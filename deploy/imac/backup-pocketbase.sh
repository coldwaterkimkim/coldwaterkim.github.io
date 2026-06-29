#!/bin/bash
set -euo pipefail

REPO_ROOT="${REPO_ROOT:-/Users/kimchansu/Documents/개인/6. codex/01.개인 웹사이트}"
PB_DATA_DIR="${PB_DATA_DIR:-$REPO_ROOT/pb_data}"
BACKUP_DIR="${BACKUP_DIR:-$HOME/Backups/coldwaterkim-pocketbase}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"
LABEL="${LABEL:-com.coldwaterkim.pocketbase}"
PLIST="${PLIST:-$REPO_ROOT/deploy/imac/$LABEL.plist}"
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
BACKUP_FILE="$BACKUP_DIR/pb_data_$TIMESTAMP.tar.gz"
LOG_FILE="$BACKUP_DIR/backup.log"
SERVICE_WAS_RUNNING=0

mkdir -p "$BACKUP_DIR"

log() {
    printf '%s - %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$1" | tee -a "$LOG_FILE"
}

service_is_running() {
    launchctl print "gui/$(id -u)/$LABEL" >/dev/null 2>&1
}

stop_service_if_needed() {
    if service_is_running; then
        SERVICE_WAS_RUNNING=1
        log "Stopping $LABEL for a consistent cold backup"
        launchctl bootout "gui/$(id -u)/$LABEL"
        sleep 3
    fi
}

start_service_if_needed() {
    if [ "$SERVICE_WAS_RUNNING" -eq 1 ]; then
        log "Starting $LABEL after backup"
        launchctl bootstrap "gui/$(id -u)" "$PLIST"
    fi
}

trap start_service_if_needed EXIT

if [ ! -d "$PB_DATA_DIR" ]; then
    log "ERROR: missing PB_DATA_DIR: $PB_DATA_DIR"
    exit 1
fi

stop_service_if_needed

log "Backup started: $PB_DATA_DIR"
tar -czf "$BACKUP_FILE" -C "$(dirname "$PB_DATA_DIR")" "$(basename "$PB_DATA_DIR")"

SIZE="$(du -h "$BACKUP_FILE" | awk '{print $1}')"
log "Backup created: $BACKUP_FILE ($SIZE)"

find "$BACKUP_DIR" -name 'pb_data_*.tar.gz' -mtime +"$RETENTION_DAYS" -print -delete | while read -r old_backup; do
    log "Deleted old backup: $old_backup"
done

log "Backup completed"

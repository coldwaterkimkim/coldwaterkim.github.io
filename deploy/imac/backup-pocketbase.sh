#!/bin/bash
set -euo pipefail

RUNTIME_ROOT="${IMAC_RUNTIME_ROOT:-$HOME/.local/share/coldwaterkim/home-server}"
PB_DATA_DIR="${PB_DATA_DIR:-$RUNTIME_ROOT/pb_data}"
BACKUP_DIR="${BACKUP_DIR:-$HOME/Backups/coldwaterkim-pocketbase}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"
LABEL="${LABEL:-com.coldwaterkim.pocketbase}"
SERVICE_TARGET="${SERVICE_TARGET:-system/$LABEL}"
SERVICE_DOMAIN="${SERVICE_DOMAIN:-system}"
PLIST="${PLIST:-/Library/LaunchDaemons/$LABEL.plist}"
BACKUP_OWNER="${BACKUP_OWNER:-kimchansu:staff}"
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
BACKUP_FILE="$BACKUP_DIR/pb_data_$TIMESTAMP.tar.gz"
CHECKSUM_FILE="$BACKUP_FILE.sha256"
LOG_FILE="$BACKUP_DIR/backup.log"
SERVICE_WAS_RUNNING=0

export LANG="${BACKUP_LANG:-en_US.UTF-8}"
export LC_ALL="${BACKUP_LC_ALL:-en_US.UTF-8}"

umask 077
mkdir -p "$BACKUP_DIR"

log() {
    printf '%s - %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$1" | tee -a "$LOG_FILE"
}

service_is_running() {
    launchctl print "$SERVICE_TARGET" >/dev/null 2>&1
}

stop_service_if_needed() {
    if service_is_running; then
        SERVICE_WAS_RUNNING=1
        log "Stopping $SERVICE_TARGET for a consistent cold backup"
        launchctl bootout "$SERVICE_TARGET"
        sleep 3
    fi
}

start_service_if_needed() {
    if [ "$SERVICE_WAS_RUNNING" -eq 1 ]; then
        log "Starting $SERVICE_TARGET after backup"
        launchctl bootstrap "$SERVICE_DOMAIN" "$PLIST"
        launchctl kickstart -k "$SERVICE_TARGET" >/dev/null 2>&1 || true
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
tar -tzf "$BACKUP_FILE" >/dev/null
shasum -a 256 "$BACKUP_FILE" > "$CHECKSUM_FILE"

if [ "$(id -u)" -eq 0 ] && [ -n "$BACKUP_OWNER" ]; then
    chown "$BACKUP_OWNER" "$BACKUP_FILE" "$CHECKSUM_FILE" "$LOG_FILE" 2>/dev/null || true
fi

SIZE="$(du -h "$BACKUP_FILE" | awk '{print $1}')"
log "Backup created: $BACKUP_FILE ($SIZE)"
log "Backup verified: $CHECKSUM_FILE"

find "$BACKUP_DIR" -name 'pb_data_*.tar.gz' -mtime +"$RETENTION_DAYS" -print -delete | while read -r old_backup; do
    log "Deleted old backup: $old_backup"
    if [ -f "$old_backup.sha256" ]; then
        rm -f "$old_backup.sha256"
        log "Deleted old checksum: $old_backup.sha256"
    fi
done

log "Backup completed"

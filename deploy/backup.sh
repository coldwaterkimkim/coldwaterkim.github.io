#!/bin/bash
# coldwaterkim.com PocketBase 백업 스크립트
# 매일 03:00에 cron으로 실행
# crontab -e → 0 3 * * * /home/pocketbase/backup.sh

set -e

BACKUP_DIR="/home/pocketbase/backups"
PB_DATA_DIR="/home/pocketbase/pb_data"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/pb_backup_$TIMESTAMP.tar.gz"
LOG_FILE="/home/pocketbase/backup.log"
RETENTION_DAYS=7

# 백업 디렉토리 생성
mkdir -p "$BACKUP_DIR"

# 로그 시작
echo "$(date '+%Y-%m-%d %H:%M:%S') - Backup started" >> "$LOG_FILE"

# 백업 생성
if tar -czf "$BACKUP_FILE" -C /home/pocketbase pb_data; then
    SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
    echo "$(date '+%Y-%m-%d %H:%M:%S') - Backup created: $BACKUP_FILE ($SIZE)" >> "$LOG_FILE"
else
    echo "$(date '+%Y-%m-%d %H:%M:%S') - ERROR: Backup failed!" >> "$LOG_FILE"
    exit 1
fi

# 오래된 백업 삭제
DELETED_COUNT=$(find "$BACKUP_DIR" -name "pb_backup_*.tar.gz" -mtime +$RETENTION_DAYS -delete -print | wc -l)
if [ "$DELETED_COUNT" -gt 0 ]; then
    echo "$(date '+%Y-%m-%d %H:%M:%S') - Deleted $DELETED_COUNT old backup(s)" >> "$LOG_FILE"
fi

# 현재 백업 현황
BACKUP_COUNT=$(ls -1 "$BACKUP_DIR"/pb_backup_*.tar.gz 2>/dev/null | wc -l)
TOTAL_SIZE=$(du -sh "$BACKUP_DIR" | cut -f1)
echo "$(date '+%Y-%m-%d %H:%M:%S') - Total backups: $BACKUP_COUNT (Size: $TOTAL_SIZE)" >> "$LOG_FILE"

echo "$(date '+%Y-%m-%d %H:%M:%S') - Backup completed" >> "$LOG_FILE"
echo "" >> "$LOG_FILE"

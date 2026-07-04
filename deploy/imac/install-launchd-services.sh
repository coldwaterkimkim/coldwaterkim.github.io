#!/bin/bash
set -euo pipefail

DRY_RUN=0
NO_START=0
SKIP_CADDY=0
CADDY_ONLY=0
RUNTIME_ONLY=0

usage() {
    cat <<'USAGE'
Install coldwaterkim.com launchd services on the iMac.

Usage:
  bash deploy/imac/install-launchd-services.sh [--dry-run] [--no-start] [--skip-caddy] [--caddy-only] [--runtime-only]

Options:
  --dry-run       Print the install/bootstrap commands without changing files.
  --no-start      Install plist files but do not bootstrap or kickstart launchd jobs.
  --skip-caddy    Install only PocketBase and backups.
  --caddy-only    Install only the Caddy runtime, binary, and LaunchDaemon.
  --runtime-only  Sync runtime files only; do not use sudo or restart launchd jobs.
USAGE
}

while (($#)); do
    case "$1" in
        --dry-run)
            DRY_RUN=1
            ;;
        --no-start)
            NO_START=1
            ;;
        --skip-caddy)
            SKIP_CADDY=1
            ;;
        --caddy-only)
            CADDY_ONLY=1
            ;;
        --runtime-only)
            RUNTIME_ONLY=1
            ;;
        -h|--help)
            usage
            exit 0
            ;;
        *)
            echo "Unknown option: $1" >&2
            usage >&2
            exit 2
            ;;
    esac
    shift
done

if [[ "$CADDY_ONLY" -eq 1 && "$SKIP_CADDY" -eq 1 ]]; then
    echo "--caddy-only and --skip-caddy cannot be used together." >&2
    exit 2
fi

if [[ "$CADDY_ONLY" -eq 1 && "$RUNTIME_ONLY" -eq 1 ]]; then
    echo "--caddy-only and --runtime-only cannot be used together." >&2
    exit 2
fi

if [[ "$(uname -s)" != "Darwin" ]]; then
    echo "This installer is intended for macOS launchd only." >&2
    exit 1
fi

if [[ "${EUID:-$(id -u)}" -eq 0 ]]; then
    echo "Run this as the normal iMac user. The script will ask sudo only for the Caddy LaunchDaemon." >&2
    exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
USER_ID="$(id -u)"
USER_DOMAIN="gui/${USER_ID}"
RUNTIME_ROOT="${IMAC_RUNTIME_ROOT:-$HOME/.local/share/coldwaterkim/home-server}"
RUNTIME_BIN_DIR="$RUNTIME_ROOT/bin"
RUNTIME_POCKETBASE="$RUNTIME_BIN_DIR/pocketbase"
RUNTIME_CADDY="$RUNTIME_BIN_DIR/caddy"
RUNTIME_CADDYFILE="$RUNTIME_ROOT/Caddyfile"
RUNTIME_BACKUP_SCRIPT="$RUNTIME_ROOT/backup-pocketbase.sh"
RUNTIME_DIST="$RUNTIME_ROOT/dist"
RUNTIME_MIGRATIONS="$RUNTIME_ROOT/pb_migrations"
RUNTIME_PB_DATA="$RUNTIME_ROOT/pb_data"

PB_LABEL="com.coldwaterkim.pocketbase"
CADDY_LABEL="com.coldwaterkim.caddy"
BACKUP_LABEL="com.coldwaterkim.pocketbase-backup"

LOCAL_POCKETBASE="$REPO_ROOT/.local-bin/pocketbase"
LOCAL_CADDY="$REPO_ROOT/.local-bin/caddy"
LOCAL_DIST="$REPO_ROOT/dist"
LOCAL_MIGRATIONS="$REPO_ROOT/pb_migrations"
LOCAL_CADDYFILE="$REPO_ROOT/deploy/imac/Caddyfile"
LOCAL_BACKUP_SCRIPT="$REPO_ROOT/deploy/imac/backup-pocketbase.sh"
PB_PLIST_SRC="$REPO_ROOT/deploy/imac/${PB_LABEL}.plist"
CADDY_PLIST_SRC="$REPO_ROOT/deploy/imac/${CADDY_LABEL}.plist"
BACKUP_PLIST_SRC="$REPO_ROOT/deploy/imac/${BACKUP_LABEL}.plist"

USER_AGENT_DIR="$HOME/Library/LaunchAgents"
SYSTEM_DAEMON_DIR="/Library/LaunchDaemons"
LOG_DIR="$HOME/Library/Logs"
OLD_PB_AGENT="$USER_AGENT_DIR/${PB_LABEL}.plist"
OLD_BACKUP_AGENT="$USER_AGENT_DIR/${BACKUP_LABEL}.plist"
PB_PLIST_DST="$SYSTEM_DAEMON_DIR/${PB_LABEL}.plist"
BACKUP_PLIST_DST="$SYSTEM_DAEMON_DIR/${BACKUP_LABEL}.plist"
CADDY_PLIST_DST="$SYSTEM_DAEMON_DIR/${CADDY_LABEL}.plist"

print_command() {
    printf '+'
    printf ' %q' "$@"
    printf '\n'
}

run_cmd() {
    if [[ "$DRY_RUN" -eq 1 ]]; then
        print_command "$@"
    else
        "$@"
    fi
}

run_sudo_cmd() {
    if [[ "$DRY_RUN" -eq 1 ]]; then
        print_command sudo "$@"
    else
        sudo "$@"
    fi
}

run_optional_cmd() {
    if [[ "$DRY_RUN" -eq 1 ]]; then
        print_command "$@"
    else
        "$@" >/dev/null 2>&1 || true
    fi
}

run_optional_sudo_cmd() {
    if [[ "$DRY_RUN" -eq 1 ]]; then
        print_command sudo "$@"
    else
        sudo "$@" >/dev/null 2>&1 || true
    fi
}

require_file() {
    local file="$1"
    if [[ ! -f "$file" ]]; then
        echo "Missing required file: $file" >&2
        exit 1
    fi
}

require_dir() {
    local dir="$1"
    if [[ ! -d "$dir" ]]; then
        echo "Missing required directory: $dir" >&2
        exit 1
    fi
}

require_executable() {
    local file="$1"
    if [[ ! -x "$file" ]]; then
        echo "Missing executable: $file" >&2
        echo "Run deploy/imac/install-runtime.sh first." >&2
        exit 1
    fi
}

lint_plist() {
    local file="$1"
    plutil -lint "$file" >/dev/null
}

replace_runtime_dir() {
    local source="$1"
    local target="$2"
    local parent
    local tmp
    local old

    parent="$(dirname "$target")"
    tmp="${target}.tmp.$$"
    old="${target}.old.$$"

    run_cmd rm -rf "$tmp" "$old"
    run_cmd mkdir -p "$parent"
    run_cmd ditto "$source" "$tmp"
    if [[ -e "$target" ]]; then
        run_cmd mv "$target" "$old"
    fi
    run_cmd mv "$tmp" "$target"
    run_cmd rm -rf "$old"
}

sync_runtime_files() {
    run_cmd mkdir -p "$RUNTIME_BIN_DIR" "$RUNTIME_PB_DATA"
    run_cmd install -m 755 "$LOCAL_POCKETBASE" "$RUNTIME_POCKETBASE"
    if [[ "$SKIP_CADDY" -eq 0 ]]; then
        run_cmd install -m 755 "$LOCAL_CADDY" "$RUNTIME_CADDY"
    fi
    replace_runtime_dir "$LOCAL_DIST" "$RUNTIME_DIST"
    run_cmd ditto "$LOCAL_MIGRATIONS" "$RUNTIME_MIGRATIONS"
    run_cmd install -m 644 "$LOCAL_CADDYFILE" "$RUNTIME_CADDYFILE"
    run_cmd install -m 755 "$LOCAL_BACKUP_SCRIPT" "$RUNTIME_BACKUP_SCRIPT"
}

sync_caddy_runtime_files() {
    run_cmd mkdir -p "$RUNTIME_BIN_DIR" "$LOG_DIR"
    run_cmd install -m 755 "$LOCAL_CADDY" "$RUNTIME_CADDY"
    replace_runtime_dir "$LOCAL_DIST" "$RUNTIME_DIST"
    run_cmd install -m 644 "$LOCAL_CADDYFILE" "$RUNTIME_CADDYFILE"
}

uninstall_old_user_agent() {
    local label="$1"
    local old_plist="$2"

    if [[ "$NO_START" -eq 1 ]]; then
        return
    fi

    run_optional_cmd launchctl bootout "$USER_DOMAIN" "$old_plist"
    run_optional_cmd launchctl bootout "${USER_DOMAIN}/${label}"
}

install_system_daemon() {
    local label="$1"
    local source_plist="$2"
    local target_plist="$3"

    run_sudo_cmd install -m 644 -o root -g wheel "$source_plist" "$target_plist"

    if [[ "$NO_START" -eq 1 ]]; then
        return
    fi

    run_optional_sudo_cmd launchctl bootout system "$target_plist"
    run_optional_sudo_cmd launchctl bootout "system/${label}"
    run_sudo_cmd launchctl bootstrap system "$target_plist"
    run_sudo_cmd launchctl kickstart -k "system/${label}"
}

install_caddy_daemon() {
    run_sudo_cmd mkdir -p /usr/local/bin /Library/LaunchDaemons
    run_sudo_cmd install -m 755 -o root -g wheel "$RUNTIME_CADDY" /usr/local/bin/caddy
    run_sudo_cmd install -m 644 -o root -g wheel "$CADDY_PLIST_SRC" "$CADDY_PLIST_DST"

    if [[ "$NO_START" -eq 1 ]]; then
        return
    fi

    run_optional_sudo_cmd launchctl bootout system "$CADDY_PLIST_DST"
    run_sudo_cmd launchctl bootstrap system "$CADDY_PLIST_DST"
    run_sudo_cmd launchctl kickstart -k "system/${CADDY_LABEL}"
}

require_file "$CADDY_PLIST_SRC"
require_file "$LOCAL_CADDYFILE"
require_dir "$LOCAL_DIST"
if [[ "$SKIP_CADDY" -eq 0 ]]; then
    require_executable "$LOCAL_CADDY"
fi

lint_plist "$CADDY_PLIST_SRC"

if [[ "$CADDY_ONLY" -eq 1 ]]; then
    sync_caddy_runtime_files
    install_caddy_daemon

    if [[ "$DRY_RUN" -eq 1 ]]; then
        echo "Dry run only. No files were changed."
    else
        echo "Installed coldwaterkim.com Caddy system service."
        echo "Next: npm run qa:network-preflight && npm run qa:launchd"
    fi
    exit 0
fi

require_file "$PB_PLIST_SRC"
require_file "$BACKUP_PLIST_SRC"
require_file "$LOCAL_BACKUP_SCRIPT"
require_dir "$LOCAL_MIGRATIONS"
require_executable "$LOCAL_POCKETBASE"

lint_plist "$PB_PLIST_SRC"
lint_plist "$BACKUP_PLIST_SRC"

if [[ "$RUNTIME_ONLY" -eq 1 ]]; then
    sync_runtime_files

    if [[ "$DRY_RUN" -eq 1 ]]; then
        echo "Dry run only. No files were changed."
    else
        echo "Synced coldwaterkim.com runtime files."
        echo "Next: npm run qa:service-smoke"
    fi
    exit 0
fi

sync_runtime_files
run_cmd mkdir -p "$USER_AGENT_DIR" "$LOG_DIR"
uninstall_old_user_agent "$PB_LABEL" "$OLD_PB_AGENT"
uninstall_old_user_agent "$BACKUP_LABEL" "$OLD_BACKUP_AGENT"
install_system_daemon "$PB_LABEL" "$PB_PLIST_SRC" "$PB_PLIST_DST"
install_system_daemon "$BACKUP_LABEL" "$BACKUP_PLIST_SRC" "$BACKUP_PLIST_DST"

if [[ "$SKIP_CADDY" -eq 0 ]]; then
    install_caddy_daemon
fi

if [[ "$DRY_RUN" -eq 1 ]]; then
    echo "Dry run only. No files were changed."
else
    echo "Installed coldwaterkim.com launchd services."
    echo "Next: npm run qa:launchd"
fi

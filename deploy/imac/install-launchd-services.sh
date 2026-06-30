#!/bin/bash
set -euo pipefail

DRY_RUN=0
NO_START=0
SKIP_CADDY=0

usage() {
    cat <<'USAGE'
Install coldwaterkim.com launchd services on the iMac.

Usage:
  bash deploy/imac/install-launchd-services.sh [--dry-run] [--no-start] [--skip-caddy]

Options:
  --dry-run     Print the install/bootstrap commands without changing files.
  --no-start    Install plist files but do not bootstrap or kickstart launchd jobs.
  --skip-caddy  Install only user LaunchAgents for PocketBase and backups.
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

PB_LABEL="com.coldwaterkim.pocketbase"
CADDY_LABEL="com.coldwaterkim.caddy"
BACKUP_LABEL="com.coldwaterkim.pocketbase-backup"

LOCAL_POCKETBASE="$REPO_ROOT/.local-bin/pocketbase"
LOCAL_CADDY="$REPO_ROOT/.local-bin/caddy"
PB_PLIST_SRC="$REPO_ROOT/deploy/imac/${PB_LABEL}.plist"
CADDY_PLIST_SRC="$REPO_ROOT/deploy/imac/${CADDY_LABEL}.plist"
BACKUP_PLIST_SRC="$REPO_ROOT/deploy/imac/${BACKUP_LABEL}.plist"

USER_AGENT_DIR="$HOME/Library/LaunchAgents"
LOG_DIR="$HOME/Library/Logs"
PB_PLIST_DST="$USER_AGENT_DIR/${PB_LABEL}.plist"
BACKUP_PLIST_DST="$USER_AGENT_DIR/${BACKUP_LABEL}.plist"
CADDY_PLIST_DST="/Library/LaunchDaemons/${CADDY_LABEL}.plist"

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

install_user_agent() {
    local label="$1"
    local source_plist="$2"
    local target_plist="$3"

    run_cmd install -m 644 "$source_plist" "$target_plist"

    if [[ "$NO_START" -eq 1 ]]; then
        return
    fi

    run_optional_cmd launchctl bootout "$USER_DOMAIN" "$target_plist"
    run_cmd launchctl bootstrap "$USER_DOMAIN" "$target_plist"
    run_cmd launchctl kickstart -k "${USER_DOMAIN}/${label}"
}

install_caddy_daemon() {
    run_sudo_cmd mkdir -p /usr/local/bin /Library/LaunchDaemons
    run_sudo_cmd install -m 755 -o root -g wheel "$LOCAL_CADDY" /usr/local/bin/caddy
    run_sudo_cmd install -m 644 -o root -g wheel "$CADDY_PLIST_SRC" "$CADDY_PLIST_DST"

    if [[ "$NO_START" -eq 1 ]]; then
        return
    fi

    run_optional_sudo_cmd launchctl bootout system "$CADDY_PLIST_DST"
    run_sudo_cmd launchctl bootstrap system "$CADDY_PLIST_DST"
    run_sudo_cmd launchctl kickstart -k "system/${CADDY_LABEL}"
}

require_file "$PB_PLIST_SRC"
require_file "$CADDY_PLIST_SRC"
require_file "$BACKUP_PLIST_SRC"
require_executable "$LOCAL_POCKETBASE"
if [[ "$SKIP_CADDY" -eq 0 ]]; then
    require_executable "$LOCAL_CADDY"
fi

lint_plist "$PB_PLIST_SRC"
lint_plist "$CADDY_PLIST_SRC"
lint_plist "$BACKUP_PLIST_SRC"

run_cmd mkdir -p "$USER_AGENT_DIR" "$LOG_DIR" "$REPO_ROOT/pb_data"
install_user_agent "$PB_LABEL" "$PB_PLIST_SRC" "$PB_PLIST_DST"
install_user_agent "$BACKUP_LABEL" "$BACKUP_PLIST_SRC" "$BACKUP_PLIST_DST"

if [[ "$SKIP_CADDY" -eq 0 ]]; then
    install_caddy_daemon
fi

if [[ "$DRY_RUN" -eq 1 ]]; then
    echo "Dry run only. No files were changed."
else
    echo "Installed coldwaterkim.com launchd services."
    echo "Next: npm run qa:launchd"
fi

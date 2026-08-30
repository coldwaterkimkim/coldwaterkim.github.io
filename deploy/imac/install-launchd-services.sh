#!/bin/bash
set -euo pipefail

DRY_RUN=0
NO_START=0
SKIP_CADDY=0
CADDY_ONLY=0
RUNTIME_ONLY=0
BACKUP_ONLY=0
BACKEND_STAGE=0
BACKEND_ACTIVATE=0

usage() {
    cat <<'USAGE'
Install coldwaterkim.com launchd services on the iMac.

Usage:
  bash deploy/imac/install-launchd-services.sh [--dry-run] [--no-start] [--skip-caddy] [--caddy-only] [--runtime-only] [--backup-only] [--backend-stage] [--backend-activate]

Options:
  --dry-run       Print the install/bootstrap commands without changing files.
  --no-start      Install plist files but do not bootstrap or kickstart launchd jobs.
  --skip-caddy    Install only PocketBase and backups.
  --caddy-only    Install only the Caddy binary/config and LaunchDaemon.
  --runtime-only  Atomically sync only dist; keep one previous generation.
  --backup-only   Install only the backup runtime and LaunchDaemon; do not restart PocketBase or Caddy.
  --backend-stage Verify and stage only the manifest-bound PocketBase release.
  --backend-activate
                  Activate the staged PocketBase binary/migrations and restart only PocketBase.
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
        --backup-only)
            BACKUP_ONLY=1
            ;;
        --backend-stage)
            BACKEND_STAGE=1
            ;;
        --backend-activate)
            BACKEND_ACTIVATE=1
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

EXCLUSIVE_MODE_COUNT=$((CADDY_ONLY + RUNTIME_ONLY + BACKUP_ONLY + BACKEND_STAGE + BACKEND_ACTIVATE))
if [[ "$EXCLUSIVE_MODE_COUNT" -gt 1 ]]; then
    echo "Choose only one of --caddy-only, --runtime-only, --backup-only, --backend-stage, or --backend-activate." >&2
    exit 2
fi

if [[ "$SKIP_CADDY" -eq 1 && "$EXCLUSIVE_MODE_COUNT" -gt 0 ]]; then
    echo "--skip-caddy is only valid for the initial full service install." >&2
    exit 2
fi

if [[ "$(uname -s)" != "Darwin" ]]; then
    echo "This installer is intended for macOS launchd only." >&2
    exit 1
fi

if [[ "${EUID:-$(id -u)}" -eq 0 ]]; then
    echo "Run this as the normal iMac user. The script asks sudo only when installing system LaunchDaemons." >&2
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
RUNTIME_BACKUP_PROGRAM="$RUNTIME_ROOT/backup-pocketbase.py"
RUNTIME_DIST="$RUNTIME_ROOT/dist"
RUNTIME_DIST_PREVIOUS="$RUNTIME_ROOT/dist.previous"
RUNTIME_MIGRATIONS="$RUNTIME_ROOT/pb_migrations"
RUNTIME_MIGRATIONS_PREVIOUS="$RUNTIME_ROOT/pb_migrations.previous"
RUNTIME_POCKETBASE_PREVIOUS="$RUNTIME_BIN_DIR/pocketbase.previous"
RUNTIME_BACKEND_MANIFEST="$RUNTIME_ROOT/pocketbase-release.json"
RUNTIME_BACKEND_MANIFEST_PREVIOUS="$RUNTIME_ROOT/pocketbase-release.previous.json"
RUNTIME_BACKEND_STAGE_DIR="$RUNTIME_ROOT/releases/pocketbase/staged"
STAGED_POCKETBASE="$RUNTIME_BACKEND_STAGE_DIR/pocketbase"
STAGED_MIGRATIONS="$RUNTIME_BACKEND_STAGE_DIR/pb_migrations"
STAGED_BACKEND_MANIFEST="$RUNTIME_BACKEND_STAGE_DIR/manifest.json"
RUNTIME_PB_DATA="$RUNTIME_ROOT/pb_data"
RUNTIME_TUS_UPLOADS="$RUNTIME_ROOT/tus-uploads"
RUNTIME_TOOL_JOBS="$RUNTIME_ROOT/tool-jobs"
RUNTIME_TOOL_SENTINEL="$RUNTIME_TOOL_JOBS/.cwk-file-tools-root-v1"
RUNTIME_OWNER_ID_FILE="$RUNTIME_ROOT/.cwk-owner-user-id"
BACKUP_ROOT="/Users/kimchansu/Backups/coldwaterkim-pocketbase"
BACKUP_OWNER_USER="kimchansu"

PB_LABEL="com.coldwaterkim.pocketbase"
CADDY_LABEL="com.coldwaterkim.caddy"
BACKUP_LABEL="com.coldwaterkim.pocketbase-backup"

LOCAL_POCKETBASE="${IMAC_BACKEND_BINARY:-$REPO_ROOT/.local-bin/pocketbase}"
LOCAL_BACKEND_MANIFEST="${IMAC_BACKEND_MANIFEST:-$REPO_ROOT/.local-bin/pocketbase-release.json}"
LOCAL_CADDY="${IMAC_CADDY_BINARY:-$REPO_ROOT/.local-bin/caddy}"
LOCAL_DIST="$REPO_ROOT/dist"
LOCAL_MIGRATIONS="${IMAC_BACKEND_MIGRATIONS:-$REPO_ROOT/pb_migrations}"
LOCAL_CADDYFILE="$REPO_ROOT/deploy/imac/Caddyfile"
LOCAL_BACKUP_SCRIPT="$REPO_ROOT/deploy/imac/backup-pocketbase.sh"
LOCAL_BACKUP_PROGRAM="$REPO_ROOT/deploy/imac/backup-pocketbase.py"
PB_PLIST_SRC="$REPO_ROOT/deploy/imac/${PB_LABEL}.plist"
CADDY_PLIST_SRC="$REPO_ROOT/deploy/imac/${CADDY_LABEL}.plist"
BACKUP_PLIST_SRC="$REPO_ROOT/deploy/imac/${BACKUP_LABEL}.plist"
LOCAL_FILE_TOOL_DIR="$REPO_ROOT/.local-bin"
FILE_TOOL_NAMES=(qpdf pdfinfo pdftoppm pdftotext tesseract gs soffice java sips)
LOCAL_TOOL_SENTINEL="$REPO_ROOT/deploy/imac/file-tools-root.sentinel"
BACKEND_RELEASE_VERIFIER="$REPO_ROOT/scripts/verify-pocketbase-release.mjs"
BACKEND_GO_VERSION_TOOL="${IMAC_GO_VERSION_TOOL:-$(command -v go 2>/dev/null || true)}"
if [[ -z "$BACKEND_GO_VERSION_TOOL" && -x "${TMPDIR:-/tmp}/coldwaterkim-pocketbase-build/go/bin/go" ]]; then
    BACKEND_GO_VERSION_TOOL="${TMPDIR:-/tmp}/coldwaterkim-pocketbase-build/go/bin/go"
fi
POCKETBASE_HEALTH_URL="http://127.0.0.1:8090/api/health"
POCKETBASE_RESTART_TIMEOUT_SECONDS="${IMAC_POCKETBASE_RESTART_TIMEOUT_SECONDS:-30}"

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

verify_owner_database() {
    local database="$RUNTIME_PB_DATA/data.db"
    local owner_count
    local user_count
    require_file "$database"
    if ! command -v sqlite3 >/dev/null 2>&1; then
        echo "sqlite3 is required to verify the OWNER users record." >&2
        exit 1
    fi
    owner_count="$(sqlite3 -readonly "$database" "SELECT count(*) FROM users WHERE id = '${CWK_OWNER_USER_ID}';")"
    user_count="$(sqlite3 -readonly "$database" "SELECT count(*) FROM users;")"
    if [[ "$owner_count" != "1" ]]; then
        echo "CWK_OWNER_USER_ID does not match exactly one live users record." >&2
        exit 1
    fi
    if [[ "$user_count" != "1" ]]; then
        echo "Refusing install: users contains $user_count records; audit and remove unauthorized accounts/tokens first." >&2
        exit 1
    fi
}

activate_runtime_dir() {
    local source="$1"
    local target="$2"
    local previous="$3"
    local parent
    local staged

    parent="$(dirname "$target")"
    staged="${target}.staged.$$"

    run_cmd rm -rf "$staged"
    run_cmd mkdir -p "$parent"
    run_cmd ditto "$source" "$staged"
    if [[ "$DRY_RUN" -eq 1 ]]; then
        print_command rm -rf "$previous"
        print_command mv "$target" "$previous"
        print_command mv "$staged" "$target"
        return
    fi

    rm -rf "$previous"
    if [[ -e "$target" ]]; then
        mv "$target" "$previous"
    fi
    if ! mv "$staged" "$target"; then
        if [[ -e "$previous" && ! -e "$target" ]]; then
            mv "$previous" "$target"
        fi
        echo "Failed to activate runtime directory: $target" >&2
        exit 1
    fi
}

sync_optional_file_tools() {
    local tool
    local source
    local target
    for tool in "${FILE_TOOL_NAMES[@]}"; do
        source="$LOCAL_FILE_TOOL_DIR/$tool"
        target="$RUNTIME_BIN_DIR/$tool"
        if [[ ! -x "$source" ]]; then
            continue
        fi
        if [[ -L "$source" ]]; then
            run_cmd ln -sfn "$(readlink "$source")" "$target"
        else
            run_cmd install -m 755 "$source" "$target"
        fi
    done
}

sync_owner_id_file() {
    if [[ "$DRY_RUN" -eq 1 ]]; then
        print_command install -m 600 '<CWK_OWNER_USER_ID>' "$RUNTIME_OWNER_ID_FILE"
        return
    fi
    if [[ ! "${CWK_OWNER_USER_ID:-}" =~ ^[a-zA-Z0-9]{15}$ ]]; then
        echo "Set CWK_OWNER_USER_ID to the explicit 15-character OWNER users record id." >&2
        exit 1
    fi
    verify_owner_database
    local temporary_owner_file
    temporary_owner_file="$(mktemp -t cwk-owner-user-id)"
    chmod 600 "$temporary_owner_file"
    printf '%s\n' "$CWK_OWNER_USER_ID" > "$temporary_owner_file"
    install -m 600 "$temporary_owner_file" "$RUNTIME_OWNER_ID_FILE"
    rm -f "$temporary_owner_file"
}

sync_runtime_files() {
    run_cmd mkdir -p "$RUNTIME_BIN_DIR" "$RUNTIME_PB_DATA" "$RUNTIME_TUS_UPLOADS" "$RUNTIME_TOOL_JOBS"
    run_cmd chmod 700 "$RUNTIME_TOOL_JOBS"
    run_cmd install -m 600 "$LOCAL_TOOL_SENTINEL" "$RUNTIME_TOOL_SENTINEL"
    sync_owner_id_file
    sync_optional_file_tools
    if [[ "$SKIP_CADDY" -eq 0 ]]; then
        run_cmd install -m 755 "$LOCAL_CADDY" "$RUNTIME_CADDY"
        run_cmd install -m 644 "$LOCAL_CADDYFILE" "$RUNTIME_CADDYFILE"
    fi
    activate_runtime_dir "$LOCAL_DIST" "$RUNTIME_DIST" "$RUNTIME_DIST_PREVIOUS"
    run_cmd install -m 700 "$LOCAL_BACKUP_SCRIPT" "$RUNTIME_BACKUP_SCRIPT"
    run_cmd install -m 700 "$LOCAL_BACKUP_PROGRAM" "$RUNTIME_BACKUP_PROGRAM"
}

require_prepared_runtime_backend() {
    if [[ ! -x "$RUNTIME_POCKETBASE" || ! -d "$RUNTIME_MIGRATIONS" || ! -f "$RUNTIME_BACKEND_MANIFEST" ]]; then
        echo "Refusing full service install: prepare the runtime PocketBase binary, migrations, and provenance manifest through --backend-stage and --backend-activate first." >&2
        echo "For a new host with no running PocketBase job, use --backend-activate --no-start before installing the LaunchDaemons." >&2
        exit 1
    fi

    verify_backend_release "$RUNTIME_POCKETBASE" "$RUNTIME_MIGRATIONS" "$RUNTIME_BACKEND_MANIFEST"
}

sync_frontend_runtime_files() {
    activate_runtime_dir "$LOCAL_DIST" "$RUNTIME_DIST" "$RUNTIME_DIST_PREVIOUS"
}

sync_backup_runtime_files() {
    run_cmd mkdir -p "$RUNTIME_ROOT" "$LOG_DIR"
    run_cmd install -m 700 "$LOCAL_BACKUP_SCRIPT" "$RUNTIME_BACKUP_SCRIPT"
    run_cmd install -m 700 "$LOCAL_BACKUP_PROGRAM" "$RUNTIME_BACKUP_PROGRAM"
}

verify_backup_root_ownership() {
    local foreign_entry

    if [[ "$DRY_RUN" -eq 1 ]]; then
        print_command find "$BACKUP_ROOT" ! -user "$BACKUP_OWNER_USER" -print -quit
        return
    fi

    if [[ ! -e "$BACKUP_ROOT" ]]; then
        return
    fi
    if [[ -L "$BACKUP_ROOT" ]]; then
        echo "Refusing backup activation: the exact backup root must not be a symbolic link: $BACKUP_ROOT" >&2
        exit 1
    fi
    if [[ ! -d "$BACKUP_ROOT" ]]; then
        echo "Refusing backup activation: backup root is not a directory: $BACKUP_ROOT" >&2
        exit 1
    fi
    if ! foreign_entry="$(find "$BACKUP_ROOT" ! -user "$BACKUP_OWNER_USER" -print -quit 2>/dev/null)"; then
        echo "Refusing backup activation: unable to verify every entry below the exact backup root: $BACKUP_ROOT" >&2
        exit 1
    fi
    if [[ -n "$foreign_entry" ]]; then
        echo "Refusing backup activation: the exact backup root contains entries not owned by $BACKUP_OWNER_USER: $BACKUP_ROOT" >&2
        echo "Review ownership manually; this installer will not run chown automatically." >&2
        exit 1
    fi
}

sync_caddy_runtime_files() {
    run_cmd mkdir -p "$RUNTIME_BIN_DIR" "$LOG_DIR"
    run_cmd install -m 755 "$LOCAL_CADDY" "$RUNTIME_CADDY"
    run_cmd install -m 644 "$LOCAL_CADDYFILE" "$RUNTIME_CADDYFILE"
}

verify_backend_release() {
    local binary="$1"
    local migrations="$2"
    local manifest="$3"
    if [[ -z "$BACKEND_GO_VERSION_TOOL" || ! -x "$BACKEND_GO_VERSION_TOOL" ]]; then
        echo "A Go command is required to inspect PocketBase build metadata with 'go version -m'." >&2
        exit 1
    fi
    node "$BACKEND_RELEASE_VERIFIER" \
        --binary "$binary" \
        --migrations "$migrations" \
        --manifest "$manifest" \
        --go-command "$BACKEND_GO_VERSION_TOOL" \
        --quiet
}

stage_backend_release() {
    local staged="${RUNTIME_BACKEND_STAGE_DIR}.staged.$$"

    verify_backend_release "$LOCAL_POCKETBASE" "$LOCAL_MIGRATIONS" "$LOCAL_BACKEND_MANIFEST"
    run_cmd rm -rf "$staged"
    run_cmd mkdir -p "$staged"
    run_cmd install -m 755 "$LOCAL_POCKETBASE" "$staged/pocketbase"
    run_cmd ditto "$LOCAL_MIGRATIONS" "$staged/pb_migrations"
    run_cmd install -m 600 "$LOCAL_BACKEND_MANIFEST" "$staged/manifest.json"
    if [[ "$DRY_RUN" -eq 1 ]]; then
        print_command rm -rf "$RUNTIME_BACKEND_STAGE_DIR"
        print_command mv "$staged" "$RUNTIME_BACKEND_STAGE_DIR"
        return
    fi

    mkdir -p "$(dirname "$RUNTIME_BACKEND_STAGE_DIR")"
    rm -rf "$RUNTIME_BACKEND_STAGE_DIR"
    mv "$staged" "$RUNTIME_BACKEND_STAGE_DIR"
    verify_backend_release "$STAGED_POCKETBASE" "$STAGED_MIGRATIONS" "$STAGED_BACKEND_MANIFEST"
}

read_pocketbase_pid() {
    launchctl print "system/${PB_LABEL}" 2>/dev/null \
        | awk '$1 == "pid" && $2 == "=" && $3 ~ /^[0-9]+$/ { print $3; exit }'
}

is_healthy_pocketbase_json() {
    node -e '
        let body = "";
        process.stdin.setEncoding("utf8");
        process.stdin.on("data", chunk => { body += chunk; });
        process.stdin.on("end", () => {
            try {
                const value = JSON.parse(body);
                const healthy = value && typeof value === "object" && !Array.isArray(value)
                    && value.code === 200
                    && value.message === "API is healthy.";
                process.exit(healthy ? 0 : 1);
            } catch {
                process.exit(1);
            }
        });
    '
}

wait_for_pocketbase_restart() {
    local previous_pid="$1"
    local deadline
    local current_pid
    local health_body

    if [[ "$DRY_RUN" -eq 1 ]]; then
        print_command launchctl print "system/${PB_LABEL}"
        echo "Postcondition: new PocketBase PID must differ from $previous_pid within ${POCKETBASE_RESTART_TIMEOUT_SECONDS}s."
        print_command /usr/bin/curl --fail --silent --show-error --max-time 2 "$POCKETBASE_HEALTH_URL"
        echo "Postcondition: direct loopback response must be healthy PocketBase JSON."
        return
    fi

    deadline=$((SECONDS + POCKETBASE_RESTART_TIMEOUT_SECONDS))
    while ((SECONDS <= deadline)); do
        current_pid="$(read_pocketbase_pid || true)"
        if [[ "$current_pid" =~ ^[0-9]+$ && "$current_pid" != "$previous_pid" ]]; then
            if health_body="$(/usr/bin/curl --fail --silent --show-error --max-time 2 "$POCKETBASE_HEALTH_URL" 2>/dev/null)" \
                && printf '%s' "$health_body" | is_healthy_pocketbase_json; then
                echo "PocketBase restarted with PID $current_pid and healthy direct loopback JSON."
                return
            fi
        fi
        sleep 1
    done

    echo "PocketBase restart postcondition failed: no different healthy PID appeared within ${POCKETBASE_RESTART_TIMEOUT_SECONDS}s." >&2
    return 1
}

activate_backend_release() {
    local release_commit
    local next_migrations="${RUNTIME_MIGRATIONS}.staged.$$"
    local next_pocketbase="${RUNTIME_POCKETBASE}.staged.$$"
    local next_manifest="${RUNTIME_BACKEND_MANIFEST}.staged.$$"
    local had_migrations=0
    local had_pocketbase=0
    local had_manifest=0
    local previous_pid=""

    verify_backend_release "$STAGED_POCKETBASE" "$STAGED_MIGRATIONS" "$STAGED_BACKEND_MANIFEST"
    release_commit="$(node "$BACKEND_RELEASE_VERIFIER" \
        --binary "$STAGED_POCKETBASE" \
        --migrations "$STAGED_MIGRATIONS" \
        --manifest "$STAGED_BACKEND_MANIFEST" \
        --go-command "$BACKEND_GO_VERSION_TOOL" \
        --print-commit)"

    if [[ "$DRY_RUN" -eq 1 ]]; then
        echo "Activation requires CWK_BACKEND_ACTIVATE_COMMIT=$release_commit"
    elif [[ "${CWK_BACKEND_ACTIVATE_COMMIT:-}" != "$release_commit" ]]; then
        echo "Refusing backend activation: set CWK_BACKEND_ACTIVATE_COMMIT=$release_commit after backup and migration rehearsal." >&2
        exit 1
    fi

    if ! [[ "$POCKETBASE_RESTART_TIMEOUT_SECONDS" =~ ^[0-9]+$ ]] \
        || ((POCKETBASE_RESTART_TIMEOUT_SECONDS < 5 || POCKETBASE_RESTART_TIMEOUT_SECONDS > 120)); then
        echo "IMAC_POCKETBASE_RESTART_TIMEOUT_SECONDS must be an integer from 5 to 120." >&2
        exit 1
    fi
    if [[ "$NO_START" -eq 0 ]]; then
        if [[ "$DRY_RUN" -eq 1 ]]; then
            print_command launchctl print "system/${PB_LABEL}"
            previous_pid="<previous-pocketbase-pid>"
        else
            previous_pid="$(read_pocketbase_pid || true)"
            if ! [[ "$previous_pid" =~ ^[0-9]+$ ]]; then
                echo "Refusing backend activation: unable to read the currently running PocketBase launchd PID before replacing files." >&2
                exit 1
            fi
        fi
    fi

    run_cmd rm -rf "$next_migrations"
    run_cmd rm -f "$next_pocketbase" "$next_manifest"
    run_cmd mkdir -p "$RUNTIME_BIN_DIR"
    run_cmd ditto "$STAGED_MIGRATIONS" "$next_migrations"
    run_cmd install -m 755 "$STAGED_POCKETBASE" "$next_pocketbase"
    run_cmd install -m 600 "$STAGED_BACKEND_MANIFEST" "$next_manifest"

    if [[ "$DRY_RUN" -eq 1 ]]; then
        print_command rm -rf "$RUNTIME_MIGRATIONS_PREVIOUS"
        print_command ditto "$RUNTIME_MIGRATIONS" "$RUNTIME_MIGRATIONS_PREVIOUS"
        print_command rm -f "$RUNTIME_POCKETBASE_PREVIOUS" "$RUNTIME_BACKEND_MANIFEST_PREVIOUS"
        print_command install -m 755 "$RUNTIME_POCKETBASE" "$RUNTIME_POCKETBASE_PREVIOUS"
        print_command install -m 600 "$RUNTIME_BACKEND_MANIFEST" "$RUNTIME_BACKEND_MANIFEST_PREVIOUS"
        print_command rm -rf "$RUNTIME_MIGRATIONS"
        print_command mv "$next_migrations" "$RUNTIME_MIGRATIONS"
        print_command mv -f "$next_pocketbase" "$RUNTIME_POCKETBASE"
        print_command mv -f "$next_manifest" "$RUNTIME_BACKEND_MANIFEST"
    else
        verify_backend_release "$next_pocketbase" "$next_migrations" "$next_manifest"
        rm -rf "$RUNTIME_MIGRATIONS_PREVIOUS"
        rm -f "$RUNTIME_POCKETBASE_PREVIOUS" "$RUNTIME_BACKEND_MANIFEST_PREVIOUS"
        if [[ -d "$RUNTIME_MIGRATIONS" ]]; then
            ditto "$RUNTIME_MIGRATIONS" "$RUNTIME_MIGRATIONS_PREVIOUS"
            had_migrations=1
        fi
        if [[ -f "$RUNTIME_POCKETBASE" ]]; then
            install -m 755 "$RUNTIME_POCKETBASE" "$RUNTIME_POCKETBASE_PREVIOUS"
            had_pocketbase=1
        fi
        if [[ -f "$RUNTIME_BACKEND_MANIFEST" ]]; then
            install -m 600 "$RUNTIME_BACKEND_MANIFEST" "$RUNTIME_BACKEND_MANIFEST_PREVIOUS"
            had_manifest=1
        fi

        rm -rf "$RUNTIME_MIGRATIONS"
        if ! mv "$next_migrations" "$RUNTIME_MIGRATIONS"; then
            if [[ "$had_migrations" -eq 1 ]]; then
                mv "$RUNTIME_MIGRATIONS_PREVIOUS" "$RUNTIME_MIGRATIONS"
            fi
            echo "Backend activation failed before replacing the PocketBase binary; the prior release was restored." >&2
            exit 1
        fi
        if ! mv -f "$next_pocketbase" "$RUNTIME_POCKETBASE"; then
            rm -rf "$RUNTIME_MIGRATIONS"
            if [[ "$had_migrations" -eq 1 ]]; then
                mv "$RUNTIME_MIGRATIONS_PREVIOUS" "$RUNTIME_MIGRATIONS"
            fi
            echo "Backend activation failed while replacing the PocketBase binary; the prior migrations were restored." >&2
            exit 1
        fi
        if ! mv -f "$next_manifest" "$RUNTIME_BACKEND_MANIFEST"; then
            if [[ "$had_pocketbase" -eq 1 ]]; then
                mv -f "$RUNTIME_POCKETBASE_PREVIOUS" "$RUNTIME_POCKETBASE"
            else
                rm -f "$RUNTIME_POCKETBASE"
            fi
            rm -rf "$RUNTIME_MIGRATIONS"
            if [[ "$had_migrations" -eq 1 ]]; then
                mv "$RUNTIME_MIGRATIONS_PREVIOUS" "$RUNTIME_MIGRATIONS"
            fi
            if [[ "$had_manifest" -eq 1 ]]; then
                mv -f "$RUNTIME_BACKEND_MANIFEST_PREVIOUS" "$RUNTIME_BACKEND_MANIFEST"
            fi
            echo "Backend activation failed while recording provenance; the prior release was restored." >&2
            exit 1
        fi
    fi

    if [[ "$NO_START" -eq 1 ]]; then
        echo "--no-start: PocketBase restart and PID/health postcondition are intentionally skipped."
    else
        if ! run_sudo_cmd launchctl kickstart -k "system/${PB_LABEL}"; then
            echo "PocketBase kickstart failed after activation. The verified new release remains current; do not auto-rollback after possible DB migration. Inspect launchd/logs and choose manual recovery." >&2
            exit 1
        fi
        if ! wait_for_pocketbase_restart "$previous_pid"; then
            echo "Backend activation postcondition failed. The verified new release remains current and *.previous is retained for a migration-aware manual recovery decision." >&2
            exit 1
        fi
    fi
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

    if [[ "$label" == "$PB_LABEL" && "$DRY_RUN" -eq 0 ]]; then
        if [[ ! "${CWK_OWNER_USER_ID:-}" =~ ^[a-zA-Z0-9]{15}$ ]]; then
            echo "Set CWK_OWNER_USER_ID to the explicit 15-character OWNER users record id." >&2
            exit 1
        fi
        verify_owner_database
        local rendered_plist
        rendered_plist="$(mktemp -t cwk-pocketbase-plist)"
        /usr/bin/sed "s/__CWK_OWNER_USER_ID__/${CWK_OWNER_USER_ID}/g" "$source_plist" > "$rendered_plist"
        run_sudo_cmd install -m 644 -o root -g wheel "$rendered_plist" "$target_plist"
        rm -f "$rendered_plist"
    else
        run_sudo_cmd install -m 644 -o root -g wheel "$source_plist" "$target_plist"
    fi

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

if [[ "$BACKUP_ONLY" -eq 1 ]]; then
    require_file "$BACKUP_PLIST_SRC"
    require_file "$LOCAL_BACKUP_SCRIPT"
    require_file "$LOCAL_BACKUP_PROGRAM"
    lint_plist "$BACKUP_PLIST_SRC"
    verify_backup_root_ownership
    sync_backup_runtime_files
    uninstall_old_user_agent "$BACKUP_LABEL" "$OLD_BACKUP_AGENT"
    install_system_daemon "$BACKUP_LABEL" "$BACKUP_PLIST_SRC" "$BACKUP_PLIST_DST"

    if [[ "$DRY_RUN" -eq 1 ]]; then
        echo "Dry run only. No files were changed."
    else
        echo "Installed the coldwaterkim.com backup service without restarting PocketBase or Caddy."
        echo "Next: npm run qa:launchd"
    fi
    exit 0
fi

if [[ "$RUNTIME_ONLY" -eq 1 ]]; then
    require_dir "$LOCAL_DIST"
    sync_frontend_runtime_files

    if [[ "$DRY_RUN" -eq 1 ]]; then
        echo "Dry run only. No files were changed."
    else
        echo "Activated coldwaterkim.com dist and retained dist.previous."
        echo "Next: npm run qa:service-smoke"
    fi
    exit 0
fi

if [[ "$BACKEND_STAGE" -eq 1 ]]; then
    require_file "$BACKEND_RELEASE_VERIFIER"
    require_file "$LOCAL_BACKEND_MANIFEST"
    require_dir "$LOCAL_MIGRATIONS"
    require_executable "$LOCAL_POCKETBASE"
    stage_backend_release

    if [[ "$DRY_RUN" -eq 1 ]]; then
        echo "Dry run only. No files were changed."
    else
        echo "Staged the verified PocketBase release without changing services."
        echo "Next: rehearse migrations and run npm run imac:activate-backend:dry-run"
    fi
    exit 0
fi

if [[ "$BACKEND_ACTIVATE" -eq 1 ]]; then
    require_file "$BACKEND_RELEASE_VERIFIER"
    require_file "$STAGED_BACKEND_MANIFEST"
    require_dir "$STAGED_MIGRATIONS"
    require_executable "$STAGED_POCKETBASE"
    activate_backend_release

    if [[ "$DRY_RUN" -eq 1 ]]; then
        echo "Dry run only. No files were changed."
    else
        echo "Activated the verified PocketBase binary and migrations."
        if [[ "$NO_START" -eq 1 ]]; then
            echo "PocketBase was not restarted because --no-start was set."
        else
            echo "Only PocketBase was restarted. Next: npm run qa:service-smoke"
        fi
    fi
    exit 0
fi

if [[ "$CADDY_ONLY" -eq 1 ]]; then
    require_file "$CADDY_PLIST_SRC"
    require_file "$LOCAL_CADDYFILE"
    require_executable "$LOCAL_CADDY"
    lint_plist "$CADDY_PLIST_SRC"
    sync_caddy_runtime_files
    install_caddy_daemon

    if [[ "$DRY_RUN" -eq 1 ]]; then
        echo "Dry run only. No files were changed."
    else
        echo "Installed only the coldwaterkim.com Caddy binary/config and system service."
        echo "Next: npm run qa:network-preflight && npm run qa:launchd"
    fi
    exit 0
fi

require_dir "$LOCAL_DIST"
if [[ "$SKIP_CADDY" -eq 0 ]]; then
    require_file "$CADDY_PLIST_SRC"
    require_file "$LOCAL_CADDYFILE"
    require_executable "$LOCAL_CADDY"
    lint_plist "$CADDY_PLIST_SRC"
fi

require_file "$PB_PLIST_SRC"
require_file "$BACKUP_PLIST_SRC"
require_file "$LOCAL_BACKUP_SCRIPT"
require_file "$LOCAL_BACKUP_PROGRAM"
require_file "$LOCAL_TOOL_SENTINEL"

lint_plist "$PB_PLIST_SRC"
lint_plist "$BACKUP_PLIST_SRC"

verify_backup_root_ownership
require_prepared_runtime_backend
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

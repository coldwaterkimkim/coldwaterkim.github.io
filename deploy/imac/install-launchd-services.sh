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
RUNTIME_POCKETBASE_LAUNCHER="$RUNTIME_POCKETBASE"
RUNTIME_CADDY="$RUNTIME_BIN_DIR/caddy"
RUNTIME_CADDYFILE="$RUNTIME_ROOT/Caddyfile"
RUNTIME_BACKUP_SCRIPT="$RUNTIME_ROOT/backup-pocketbase.sh"
RUNTIME_BACKUP_PROGRAM="$RUNTIME_ROOT/backup-pocketbase.py"
RUNTIME_DIST="$RUNTIME_ROOT/dist"
RUNTIME_DIST_PREVIOUS="$RUNTIME_ROOT/dist.previous"
RUNTIME_BACKEND_RELEASES_ROOT="$RUNTIME_ROOT/releases/pocketbase"
RUNTIME_BACKEND_GENERATIONS_ROOT="$RUNTIME_BACKEND_RELEASES_ROOT/generations"
RUNTIME_BACKEND_CURRENT_LINK="$RUNTIME_BACKEND_RELEASES_ROOT/current"
RUNTIME_BACKEND_PREVIOUS_LINK="$RUNTIME_BACKEND_RELEASES_ROOT/previous"
RUNTIME_BACKEND_STAGE_DIR="$RUNTIME_BACKEND_RELEASES_ROOT/staged"
BACKEND_RELEASE_LOCK="$RUNTIME_ROOT/.pocketbase-release.lock"
BACKEND_RELEASE_LOCK_HELD=0
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
LOCAL_POCKETBASE_LAUNCHER="$REPO_ROOT/deploy/imac/run-pocketbase-release.sh"
LOCAL_BACKEND_LINK_PUBLISHER="${IMAC_BACKEND_LINK_PUBLISHER:-$REPO_ROOT/deploy/imac/publish-pocketbase-link.py}"
LOCAL_BACKEND_FILE_PUBLISHER="${IMAC_BACKEND_FILE_PUBLISHER:-$REPO_ROOT/deploy/imac/publish-pocketbase-file.py}"
LOCAL_BACKEND_GENERATION_PUBLISHER="${IMAC_BACKEND_GENERATION_PUBLISHER:-$REPO_ROOT/deploy/imac/publish-pocketbase-generation.py}"
LOCAL_LAUNCHD_PLIST_PUBLISHER="$REPO_ROOT/deploy/imac/publish-launchd-plist.py"
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
POCKETBASE_LSOF_TOOL="${IMAC_LSOF_TOOL:-/usr/sbin/lsof}"

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

release_backend_release_lock() {
    if [[ "$BACKEND_RELEASE_LOCK_HELD" -eq 1 ]]; then
        rm -f "$BACKEND_RELEASE_LOCK"
        BACKEND_RELEASE_LOCK_HELD=0
    fi
}

acquire_backend_release_lock() {
    if [[ "$DRY_RUN" -eq 1 ]]; then
        print_command mkdir -p "$RUNTIME_ROOT"
        print_command /usr/bin/shlock -p "$$" -f "$BACKEND_RELEASE_LOCK"
        return
    fi

    mkdir -p "$RUNTIME_ROOT"
    if [[ -L "$BACKEND_RELEASE_LOCK" ]]; then
        echo "Refusing backend release: lock path is a symbolic link." >&2
        exit 1
    fi
    if ! /usr/bin/shlock -p "$$" -f "$BACKEND_RELEASE_LOCK"; then
        echo "Refusing backend release: another stage or activation is already running." >&2
        exit 1
    fi
    BACKEND_RELEASE_LOCK_HELD=1
    trap release_backend_release_lock EXIT
    trap 'exit 130' HUP INT TERM
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
    local counts
    local owner_count
    local user_count
    require_file "$database"
    if ! command -v sqlite3 >/dev/null 2>&1; then
        echo "sqlite3 is required to verify the OWNER users record." >&2
        exit 1
    fi
    # A freshly migrated WAL database may not have its -wal/-shm sidecars yet.
    # Open it normally with query_only enabled so SQLite can create those
    # operational sidecars without allowing the verification query to mutate data.
    counts="$(sqlite3 -separator '|' "$database" "PRAGMA query_only = ON; SELECT (SELECT count(*) FROM users WHERE id = '${CWK_OWNER_USER_ID}'), (SELECT count(*) FROM users);")"
    IFS='|' read -r owner_count user_count <<< "$counts"
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
        validate_runtime_caddy_config
    fi
    activate_runtime_dir "$LOCAL_DIST" "$RUNTIME_DIST" "$RUNTIME_DIST_PREVIOUS"
}

require_prepared_runtime_backend() {
    local release_dir
    release_dir="$(resolve_backend_release_link "$RUNTIME_BACKEND_CURRENT_LINK")" || {
        echo "Refusing full service install: prepare an atomic current PocketBase generation through --backend-stage and --backend-activate first." >&2
        echo "For a new host with no running PocketBase job, use --backend-activate --no-start before installing the LaunchDaemons." >&2
        exit 1
    }
    if [[ ! -x "$RUNTIME_POCKETBASE_LAUNCHER" ]] \
        || ! /usr/bin/grep -q 'CWK_ATOMIC_POCKETBASE_LAUNCHER_V1' "$RUNTIME_POCKETBASE_LAUNCHER" 2>/dev/null; then
        echo "Refusing full service install: the atomic PocketBase launcher is missing." >&2
        exit 1
    fi
    verify_installed_backend_release "$release_dir/pocketbase" "$release_dir/pb_migrations" "$release_dir/manifest.json"
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
    local symlink_entry

    if [[ "$DRY_RUN" -eq 1 ]]; then
        print_command find "$BACKUP_ROOT" -type l -print -quit
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
    if ! symlink_entry="$(find "$BACKUP_ROOT" -type l -print -quit 2>/dev/null)"; then
        echo "Refusing backup activation: unable to inspect symlinks below the exact backup root: $BACKUP_ROOT" >&2
        exit 1
    fi
    if [[ -n "$symlink_entry" ]]; then
        echo "Refusing backup activation: the exact backup root contains a symbolic link: $symlink_entry" >&2
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
    validate_runtime_caddy_config
}

validate_caddy_config() {
    local binary="$1"
    local config="$2"
    if ! "$binary" validate --config "$config" >/dev/null; then
        echo "Refusing Caddy install: candidate binary and config did not validate together." >&2
        exit 1
    fi
}

validate_runtime_caddy_config() {
    if [[ "$DRY_RUN" -eq 1 ]]; then
        print_command "$RUNTIME_CADDY" validate --config "$RUNTIME_CADDYFILE"
    else
        validate_caddy_config "$RUNTIME_CADDY" "$RUNTIME_CADDYFILE"
    fi
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

verify_installed_backend_release() {
    local binary="$1"
    local migrations="$2"
    local manifest="$3"
    if [[ -z "$BACKEND_GO_VERSION_TOOL" || ! -x "$BACKEND_GO_VERSION_TOOL" ]]; then
        echo "A Go command is required to inspect PocketBase build metadata with 'go version -m'." >&2
        return 1
    fi
    local verified_generation_id
    local expected_generation_id
    verified_generation_id="$(node "$BACKEND_RELEASE_VERIFIER" \
        --binary "$binary" \
        --migrations "$migrations" \
        --manifest "$manifest" \
        --go-command "$BACKEND_GO_VERSION_TOOL" \
        --allow-non-head \
        --print-generation-id)" || return 1
    expected_generation_id="$(basename "$(dirname "$binary")")"
    if [[ "$verified_generation_id" != "$expected_generation_id" ]]; then
        echo "PocketBase installed generation id does not match its verified manifest." >&2
        return 1
    fi
}

resolve_backend_release_link() {
    local link_path="$1"
    local resolved
    local generations_root_real
    local target
    if [[ ! -L "$link_path" ]]; then
        return 1
    fi
    target="$(readlink "$link_path")" || return 1
    if [[ ! "$target" =~ ^generations/[0-9a-f]{40,64}-[0-9a-f]{64}$ ]]; then
        return 1
    fi
    if [[ ! -d "$RUNTIME_BACKEND_RELEASES_ROOT/$target" || -L "$RUNTIME_BACKEND_RELEASES_ROOT/$target" ]]; then
        return 1
    fi
    generations_root_real="$(cd -P "$RUNTIME_BACKEND_GENERATIONS_ROOT" 2>/dev/null && pwd)" || return 1
    resolved="$(cd -P "$link_path" 2>/dev/null && pwd)" || return 1
    if [[ "$resolved" != "$generations_root_real/${target#generations/}" ]]; then
        return 1
    fi
    printf '%s\n' "$resolved"
}

verify_runtime_backend_current() {
    local release_dir
    release_dir="$(resolve_backend_release_link "$RUNTIME_BACKEND_CURRENT_LINK")" || {
        echo "PocketBase current release pointer is missing or unsafe." >&2
        return 1
    }
    verify_installed_backend_release "$release_dir/pocketbase" "$release_dir/pb_migrations" "$release_dir/manifest.json"
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

require_offline_pocketbase_for_no_start() {
    local launchctl_status
    local listener_output
    local listener_status
    if [[ "$DRY_RUN" -eq 1 ]]; then
        print_command launchctl print "system/${PB_LABEL}"
        print_command "$POCKETBASE_LSOF_TOOL" -nP -iTCP:8090 -sTCP:LISTEN
        echo "Precondition: --no-start requires an unloaded PocketBase job and no listener on 127.0.0.1:8090."
        return
    fi

    if launchctl print "system/${PB_LABEL}" >/dev/null 2>&1; then
        echo "Refusing --no-start backend activation: the PocketBase launchd job is loaded." >&2
        exit 1
    else
        launchctl_status=$?
        if [[ "$launchctl_status" -ne 113 ]]; then
            echo "Refusing --no-start backend activation: unable to prove the PocketBase launchd job is absent." >&2
            exit 1
        fi
    fi
    if [[ ! -x "$POCKETBASE_LSOF_TOOL" ]]; then
        echo "Refusing --no-start backend activation: lsof is required to prove port 8090 is unused." >&2
        exit 1
    fi
    if listener_output="$("$POCKETBASE_LSOF_TOOL" -nP -iTCP:8090 -sTCP:LISTEN 2>&1)"; then
        if [[ -n "$listener_output" ]]; then
            echo "Refusing --no-start backend activation: a process is listening on 127.0.0.1:8090." >&2
        else
            echo "Refusing --no-start backend activation: unable to prove port 8090 is unused." >&2
        fi
        exit 1
    else
        listener_status=$?
        if [[ "$listener_status" -ne 1 || -n "$listener_output" ]]; then
            echo "Refusing --no-start backend activation: unable to prove port 8090 is unused." >&2
            exit 1
        fi
    fi
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
    local release_generation_id
    local generation_dir
    local next_generation
    local current_release=""
    local current_target=""
    local previous_release=""
    local previous_target=""
    local next_current="${RUNTIME_BACKEND_CURRENT_LINK}.staged.$$"
    local next_previous="${RUNTIME_BACKEND_PREVIOUS_LINK}.staged.$$"
    local next_launcher="${RUNTIME_POCKETBASE_LAUNCHER}.staged.$$"
    local rollback_previous="${RUNTIME_BACKEND_PREVIOUS_LINK}.rollback.$$"
    local rollback_launcher="${RUNTIME_POCKETBASE_LAUNCHER}.rollback.$$"
    local legacy_dir="$RUNTIME_BACKEND_RELEASES_ROOT/legacy-before-generations"
    local next_legacy="${legacy_dir}.staged.$$"
    local previous_pid=""
    local had_launcher=0
    local precommit_publication_failed=0

    verify_backend_release "$STAGED_POCKETBASE" "$STAGED_MIGRATIONS" "$STAGED_BACKEND_MANIFEST"
    release_generation_id="$(node "$BACKEND_RELEASE_VERIFIER" \
        --binary "$STAGED_POCKETBASE" \
        --migrations "$STAGED_MIGRATIONS" \
        --manifest "$STAGED_BACKEND_MANIFEST" \
        --go-command "$BACKEND_GO_VERSION_TOOL" \
        --print-generation-id)"
    release_commit="${release_generation_id%%-*}"

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

    if [[ "$NO_START" -eq 1 ]]; then
        require_offline_pocketbase_for_no_start
    else
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

    if [[ "$NO_START" -eq 0 ]] \
        && [[ ! -e "$RUNTIME_BACKEND_CURRENT_LINK" ]] \
        && [[ ! -L "$RUNTIME_BACKEND_CURRENT_LINK" ]]; then
        echo "Refusing the first atomic backend conversion while PocketBase is live." >&2
        echo "Unload the PocketBase job, prove port 8090 is unused, and use --backend-activate --no-start before reinstalling the LaunchDaemon." >&2
        exit 1
    fi

    generation_dir="$RUNTIME_BACKEND_GENERATIONS_ROOT/$release_generation_id"
    next_generation="${generation_dir}.staged.$$"
    if [[ -e "$generation_dir" || -L "$generation_dir" ]]; then
        if [[ ! -d "$generation_dir" || -L "$generation_dir" ]]; then
            echo "Refusing backend activation: release generation path is not a real directory: $generation_dir" >&2
            exit 1
        fi
        verify_backend_release "$generation_dir/pocketbase" "$generation_dir/pb_migrations" "$generation_dir/manifest.json"
    else
        run_cmd rm -rf "$next_generation"
        run_cmd mkdir -p "$next_generation"
        run_cmd install -m 755 "$STAGED_POCKETBASE" "$next_generation/pocketbase"
        run_cmd ditto "$STAGED_MIGRATIONS" "$next_generation/pb_migrations"
        run_cmd install -m 600 "$STAGED_BACKEND_MANIFEST" "$next_generation/manifest.json"
        if [[ "$DRY_RUN" -eq 1 ]]; then
            print_command node "$BACKEND_RELEASE_VERIFIER" \
                --binary "$next_generation/pocketbase" \
                --migrations "$next_generation/pb_migrations" \
                --manifest "$next_generation/manifest.json" \
                --go-command "$BACKEND_GO_VERSION_TOOL" \
                --quiet
            print_command mkdir -p "$RUNTIME_BACKEND_GENERATIONS_ROOT"
            print_command /usr/bin/python3 "$LOCAL_BACKEND_GENERATION_PUBLISHER" "$next_generation" "$generation_dir"
        else
            verify_backend_release "$next_generation/pocketbase" "$next_generation/pb_migrations" "$next_generation/manifest.json"
            mkdir -p "$RUNTIME_BACKEND_GENERATIONS_ROOT"
            /usr/bin/python3 "$LOCAL_BACKEND_GENERATION_PUBLISHER" "$next_generation" "$generation_dir"
        fi
    fi

    if [[ -e "$RUNTIME_BACKEND_CURRENT_LINK" && ! -L "$RUNTIME_BACKEND_CURRENT_LINK" ]]; then
        echo "Refusing backend activation: current release path is not a symbolic link." >&2
        exit 1
    fi
    if [[ -L "$RUNTIME_BACKEND_CURRENT_LINK" ]]; then
        current_release="$(resolve_backend_release_link "$RUNTIME_BACKEND_CURRENT_LINK")" || {
            echo "Refusing backend activation: current release pointer is unsafe or broken." >&2
            exit 1
        }
        verify_installed_backend_release "$current_release/pocketbase" "$current_release/pb_migrations" "$current_release/manifest.json"
        current_target="$(readlink "$RUNTIME_BACKEND_CURRENT_LINK")"
        if [[ ! "$current_target" =~ ^generations/[0-9a-f]{40,64}-[0-9a-f]{64}$ ]]; then
            echo "Refusing backend activation: current release pointer is not an exact relative generation target." >&2
            exit 1
        fi
        if [[ "$current_target" == "generations/$release_generation_id" ]]; then
            echo "Refusing redundant backend activation: the staged release is already current; previous was preserved." >&2
            exit 1
        fi
    fi
    if [[ -e "$RUNTIME_BACKEND_PREVIOUS_LINK" && ! -L "$RUNTIME_BACKEND_PREVIOUS_LINK" ]]; then
        echo "Refusing backend activation: previous release path is not a symbolic link." >&2
        exit 1
    fi
    if [[ -L "$RUNTIME_BACKEND_PREVIOUS_LINK" ]]; then
        if [[ -z "$current_target" ]]; then
            echo "Refusing backend activation: previous release pointer exists without a current release pointer." >&2
            exit 1
        fi
        previous_release="$(resolve_backend_release_link "$RUNTIME_BACKEND_PREVIOUS_LINK")" || {
            echo "Refusing backend activation: previous release pointer is unsafe or broken." >&2
            exit 1
        }
        verify_installed_backend_release "$previous_release/pocketbase" "$previous_release/pb_migrations" "$previous_release/manifest.json"
        previous_target="$(readlink "$RUNTIME_BACKEND_PREVIOUS_LINK")"
    fi

    if [[ -z "$current_target" && "$NO_START" -eq 0 ]]; then
        echo "Refusing the first atomic backend conversion while PocketBase is live." >&2
        echo "Unload the PocketBase job, prove port 8090 is unused, and use --backend-activate --no-start before reinstalling the LaunchDaemon." >&2
        exit 1
    fi

    run_cmd mkdir -p "$RUNTIME_BIN_DIR"
    run_cmd rm -f "$next_current" "$next_previous" "$next_launcher" "$rollback_previous" "$rollback_launcher"
    run_cmd ln -s "generations/$release_generation_id" "$next_current"
    if [[ -n "$current_target" ]]; then
        run_cmd ln -s "$current_target" "$next_previous"
    fi
    if [[ -n "$previous_target" ]]; then
        run_cmd ln -s "$previous_target" "$rollback_previous"
    fi
    run_cmd install -m 755 "$LOCAL_POCKETBASE_LAUNCHER" "$next_launcher"

    if [[ -e "$RUNTIME_POCKETBASE_LAUNCHER" || -L "$RUNTIME_POCKETBASE_LAUNCHER" ]]; then
        if [[ ! -f "$RUNTIME_POCKETBASE_LAUNCHER" || -L "$RUNTIME_POCKETBASE_LAUNCHER" ]]; then
            echo "Refusing backend activation: the existing PocketBase runtime entry is not a regular file." >&2
            exit 1
        fi
        run_cmd install -m 755 "$RUNTIME_POCKETBASE_LAUNCHER" "$rollback_launcher"
        had_launcher=1
    fi

    if [[ -f "$RUNTIME_POCKETBASE_LAUNCHER" ]] \
        && [[ ! -L "$RUNTIME_POCKETBASE_LAUNCHER" ]] \
        && ! /usr/bin/grep -q 'CWK_ATOMIC_POCKETBASE_LAUNCHER_V1' "$RUNTIME_POCKETBASE_LAUNCHER" 2>/dev/null \
        && [[ ! -e "$legacy_dir" ]]; then
        run_cmd rm -rf "$next_legacy"
        run_cmd mkdir -p "$next_legacy"
        run_cmd install -m 755 "$RUNTIME_POCKETBASE_LAUNCHER" "$next_legacy/pocketbase"
        if [[ -d "$RUNTIME_ROOT/pb_migrations" && ! -L "$RUNTIME_ROOT/pb_migrations" ]]; then
            run_cmd ditto "$RUNTIME_ROOT/pb_migrations" "$next_legacy/pb_migrations"
        fi
        if [[ -f "$RUNTIME_ROOT/pocketbase-release.json" && ! -L "$RUNTIME_ROOT/pocketbase-release.json" ]]; then
            run_cmd install -m 600 "$RUNTIME_ROOT/pocketbase-release.json" "$next_legacy/manifest.json"
        fi
        run_cmd mv "$next_legacy" "$legacy_dir"
    fi

    if [[ "$DRY_RUN" -eq 1 ]]; then
        if [[ -n "$current_target" ]]; then
            print_command /usr/bin/python3 "$LOCAL_BACKEND_FILE_PUBLISHER" "$next_launcher" "$RUNTIME_POCKETBASE_LAUNCHER"
            print_command /usr/bin/python3 "$LOCAL_BACKEND_LINK_PUBLISHER" "$next_previous" "$RUNTIME_BACKEND_PREVIOUS_LINK"
            print_command /usr/bin/python3 "$LOCAL_BACKEND_LINK_PUBLISHER" "$next_current" "$RUNTIME_BACKEND_CURRENT_LINK"
        else
            print_command /usr/bin/python3 "$LOCAL_BACKEND_LINK_PUBLISHER" "$next_current" "$RUNTIME_BACKEND_CURRENT_LINK"
            print_command /usr/bin/python3 "$LOCAL_BACKEND_FILE_PUBLISHER" "$next_launcher" "$RUNTIME_POCKETBASE_LAUNCHER"
        fi
        print_command node "$BACKEND_RELEASE_VERIFIER" \
            --binary "$generation_dir/pocketbase" \
            --migrations "$generation_dir/pb_migrations" \
            --manifest "$generation_dir/manifest.json" \
            --go-command "$BACKEND_GO_VERSION_TOOL" \
            --quiet
    else
        if [[ -n "$current_target" ]]; then
            if ! /usr/bin/python3 "$LOCAL_BACKEND_FILE_PUBLISHER" "$next_launcher" "$RUNTIME_POCKETBASE_LAUNCHER"; then
                precommit_publication_failed=1
            elif ! /usr/bin/python3 "$LOCAL_BACKEND_LINK_PUBLISHER" "$next_previous" "$RUNTIME_BACKEND_PREVIOUS_LINK"; then
                precommit_publication_failed=1
            fi
        fi
        if [[ "$precommit_publication_failed" -eq 1 ]]; then
            if [[ "$had_launcher" -eq 1 ]]; then
                /usr/bin/python3 "$LOCAL_BACKEND_FILE_PUBLISHER" "$rollback_launcher" "$RUNTIME_POCKETBASE_LAUNCHER" || {
                    echo "CRITICAL: pre-commit activation failed and the prior launcher could not be restored." >&2
                    exit 1
                }
            elif [[ -f "$RUNTIME_POCKETBASE_LAUNCHER" && ! -L "$RUNTIME_POCKETBASE_LAUNCHER" ]]; then
                /usr/bin/python3 "$LOCAL_BACKEND_FILE_PUBLISHER" --remove "$RUNTIME_POCKETBASE_LAUNCHER" || {
                    echo "CRITICAL: pre-commit activation failed and the new launcher could not be removed." >&2
                    exit 1
                }
            fi
            if [[ -n "$previous_target" ]]; then
                /usr/bin/python3 "$LOCAL_BACKEND_LINK_PUBLISHER" "$rollback_previous" "$RUNTIME_BACKEND_PREVIOUS_LINK" || {
                    echo "CRITICAL: pre-commit activation failed and the prior previous pointer could not be restored." >&2
                    exit 1
                }
            elif [[ -L "$RUNTIME_BACKEND_PREVIOUS_LINK" ]]; then
                /usr/bin/python3 "$LOCAL_BACKEND_LINK_PUBLISHER" --remove "$RUNTIME_BACKEND_PREVIOUS_LINK" || {
                    echo "CRITICAL: pre-commit activation failed and the new previous pointer could not be removed." >&2
                    exit 1
                }
            fi
            echo "Backend activation failed before the current-pointer commit; the prior bootable runtime state was restored." >&2
            exit 1
        fi

        # Publishing current is the migration safety commit point. Once this call
        # starts, never auto-rollback: os.replace may have succeeded before a
        # later durability error, and launchd may already have run the new binary.
        if ! /usr/bin/python3 "$LOCAL_BACKEND_LINK_PUBLISHER" "$next_current" "$RUNTIME_BACKEND_CURRENT_LINK"; then
            echo "Backend activation reached the current-pointer commit but publication did not complete cleanly." >&2
            echo "The launcher/current state was intentionally preserved; inspect it and use migration-aware manual recovery. Do not auto-rollback." >&2
            exit 1
        fi
        if [[ -z "$current_target" ]] \
            && ! /usr/bin/python3 "$LOCAL_BACKEND_FILE_PUBLISHER" "$next_launcher" "$RUNTIME_POCKETBASE_LAUNCHER"; then
            echo "Initial backend conversion committed current but could not finish launcher publication." >&2
            echo "PocketBase is offline by precondition; inspect current and the launcher before loading the job. Do not auto-rollback." >&2
            exit 1
        fi
        if ! verify_runtime_backend_current; then
            echo "Backend activation committed current but post-publication verification failed." >&2
            echo "The verified generation remains selected; use migration-aware manual recovery. Do not auto-rollback." >&2
            exit 1
        fi
        rm -f "$rollback_previous" "$rollback_launcher"
    fi

    if [[ "$NO_START" -eq 1 ]]; then
        echo "--no-start: PocketBase restart and PID/health postcondition are intentionally skipped."
    else
        if ! run_sudo_cmd launchctl kickstart -k "system/${PB_LABEL}"; then
            echo "PocketBase kickstart failed after activation. The verified new release remains current; do not auto-rollback after possible DB migration. Inspect launchd/logs and choose manual recovery." >&2
            exit 1
        fi
        if ! wait_for_pocketbase_restart "$previous_pid"; then
            echo "Backend activation postcondition failed. The verified new release remains current and the previous generation pointer is retained for a migration-aware manual recovery decision." >&2
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

require_system_job_absent() {
    local label="$1"
    local launchctl_status

    if [[ "$DRY_RUN" -eq 1 ]]; then
        print_command sudo launchctl print "system/${label}"
        echo "Postcondition: system/${label} must be absent before protected runtime files are replaced."
        return
    fi

    if sudo launchctl print "system/${label}" >/dev/null 2>&1; then
        echo "Refusing protected runtime replacement: system/${label} is still loaded." >&2
        exit 1
    else
        launchctl_status=$?
        if [[ "$launchctl_status" -ne 113 ]]; then
            echo "Refusing protected runtime replacement: unable to prove system/${label} is absent." >&2
            exit 1
        fi
    fi
}

publish_system_daemon_plist() {
    local source_plist="$1"
    local target_plist="$2"
    local staged_plist="${target_plist}.staged.$$"

    run_sudo_cmd install -m 644 -o root -g wheel "$source_plist" "$staged_plist"
    run_sudo_cmd /usr/bin/python3 "$LOCAL_LAUNCHD_PLIST_PUBLISHER" "$staged_plist" "$target_plist"
}

stop_backup_system_job_before_runtime_change() {
    local launchctl_status

    if [[ "$DRY_RUN" -eq 1 ]]; then
        print_command sudo launchctl print "system/${BACKUP_LABEL}"
        print_command sudo launchctl bootout "system/${BACKUP_LABEL}"
        require_system_job_absent "$BACKUP_LABEL"
        return
    fi

    if sudo launchctl print "system/${BACKUP_LABEL}" >/dev/null 2>&1; then
        if ! sudo launchctl bootout "system/${BACKUP_LABEL}"; then
            echo "Refusing backup runtime replacement: the existing system backup job could not be unloaded." >&2
            exit 1
        fi
    else
        launchctl_status=$?
        if [[ "$launchctl_status" -ne 113 ]]; then
            echo "Refusing backup runtime replacement: unable to inspect the existing system backup job." >&2
            exit 1
        fi
    fi
    require_system_job_absent "$BACKUP_LABEL"
}

install_system_daemon_plist() {
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
        publish_system_daemon_plist "$rendered_plist" "$target_plist"
        rm -f "$rendered_plist"
    else
        publish_system_daemon_plist "$source_plist" "$target_plist"
    fi
}

start_system_daemon() {
    local label="$1"
    local target_plist="$2"

    if [[ "$NO_START" -eq 1 ]]; then
        return
    fi

    if [[ "$label" == "$BACKUP_LABEL" ]]; then
        require_system_job_absent "$label"
    else
        run_optional_sudo_cmd launchctl bootout system "$target_plist"
        run_optional_sudo_cmd launchctl bootout "system/${label}"
    fi
    run_sudo_cmd launchctl bootstrap system "$target_plist"
    run_sudo_cmd launchctl kickstart -k "system/${label}"
}

install_system_daemon() {
    local label="$1"
    local source_plist="$2"
    local target_plist="$3"

    install_system_daemon_plist "$label" "$source_plist" "$target_plist"
    start_system_daemon "$label" "$target_plist"
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
    require_file "$LOCAL_LAUNCHD_PLIST_PUBLISHER"
    lint_plist "$BACKUP_PLIST_SRC"
    verify_backup_root_ownership
    install_system_daemon_plist "$BACKUP_LABEL" "$BACKUP_PLIST_SRC" "$BACKUP_PLIST_DST"
    stop_backup_system_job_before_runtime_change
    uninstall_old_user_agent "$BACKUP_LABEL" "$OLD_BACKUP_AGENT"
    sync_backup_runtime_files
    start_system_daemon "$BACKUP_LABEL" "$BACKUP_PLIST_DST"

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
    acquire_backend_release_lock
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
    acquire_backend_release_lock
    require_file "$BACKEND_RELEASE_VERIFIER"
    require_file "$LOCAL_POCKETBASE_LAUNCHER"
    require_file "$LOCAL_BACKEND_LINK_PUBLISHER"
    require_file "$LOCAL_BACKEND_FILE_PUBLISHER"
    require_file "$LOCAL_BACKEND_GENERATION_PUBLISHER"
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
    validate_caddy_config "$LOCAL_CADDY" "$LOCAL_CADDYFILE"
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
    validate_caddy_config "$LOCAL_CADDY" "$LOCAL_CADDYFILE"
fi

require_file "$PB_PLIST_SRC"
require_file "$BACKUP_PLIST_SRC"
require_file "$LOCAL_POCKETBASE_LAUNCHER"
require_file "$LOCAL_BACKEND_LINK_PUBLISHER"
require_file "$LOCAL_BACKEND_FILE_PUBLISHER"
require_file "$LOCAL_BACKUP_SCRIPT"
require_file "$LOCAL_BACKUP_PROGRAM"
require_file "$LOCAL_LAUNCHD_PLIST_PUBLISHER"
require_file "$LOCAL_TOOL_SENTINEL"

lint_plist "$PB_PLIST_SRC"
lint_plist "$BACKUP_PLIST_SRC"

verify_backup_root_ownership
require_prepared_runtime_backend
sync_runtime_files
install_system_daemon_plist "$BACKUP_LABEL" "$BACKUP_PLIST_SRC" "$BACKUP_PLIST_DST"
stop_backup_system_job_before_runtime_change
sync_backup_runtime_files
run_cmd mkdir -p "$USER_AGENT_DIR" "$LOG_DIR"
uninstall_old_user_agent "$PB_LABEL" "$OLD_PB_AGENT"
uninstall_old_user_agent "$BACKUP_LABEL" "$OLD_BACKUP_AGENT"
install_system_daemon "$PB_LABEL" "$PB_PLIST_SRC" "$PB_PLIST_DST"
start_system_daemon "$BACKUP_LABEL" "$BACKUP_PLIST_DST"

if [[ "$SKIP_CADDY" -eq 0 ]]; then
    install_caddy_daemon
fi

if [[ "$DRY_RUN" -eq 1 ]]; then
    echo "Dry run only. No files were changed."
else
    echo "Installed coldwaterkim.com launchd services."
    echo "Next: npm run qa:launchd"
fi

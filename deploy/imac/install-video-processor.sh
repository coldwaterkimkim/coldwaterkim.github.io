#!/usr/bin/env bash
set -euo pipefail

DRY_RUN=0
NO_START=0
while (($#)); do
  case "$1" in
    --dry-run) DRY_RUN=1 ;;
    --no-start) NO_START=1 ;;
    -h|--help)
      echo "Usage: bash deploy/imac/install-video-processor.sh [--dry-run] [--no-start]"
      exit 0
      ;;
    *) echo "Unknown option: $1" >&2; exit 2 ;;
  esac
  shift
done

if [[ "$(uname -s)" != "Darwin" || "${EUID:-$(id -u)}" -eq 0 ]]; then
  echo "Run this on macOS as the normal iMac user." >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
RUNTIME_ROOT="${IMAC_RUNTIME_ROOT:-$HOME/.local/share/coldwaterkim/home-server}"
LABEL="com.coldwaterkim.video-processor"
PLIST_SRC="$SCRIPT_DIR/${LABEL}.plist"
PLIST_DST="$HOME/Library/LaunchAgents/${LABEL}.plist"
USER_DOMAIN="gui/$(id -u)"

run_cmd() {
  if [[ "$DRY_RUN" -eq 1 ]]; then
    printf '+'; printf ' %q' "$@"; printf '\n'
  else
    "$@"
  fi
}

run_optional_cmd() {
  if [[ "$DRY_RUN" -eq 1 ]]; then
    printf '+'; printf ' %q' "$@"; printf '\n'
  else
    "$@" >/dev/null 2>&1 || true
  fi
}

for file in "$REPO_ROOT/.local-bin/ffmpeg" "$REPO_ROOT/.local-bin/ffprobe" "$SCRIPT_DIR/process-video-media.py" "$PLIST_SRC"; do
  if [[ ! -f "$file" ]]; then
    echo "Missing required file: $file" >&2
    echo "Run npm run imac:install-ffmpeg first when FFmpeg is missing." >&2
    exit 1
  fi
done
plutil -lint "$PLIST_SRC" >/dev/null

run_cmd mkdir -p "$RUNTIME_ROOT/bin" "$HOME/Library/LaunchAgents" "$HOME/Library/Logs"
run_cmd install -m 755 "$REPO_ROOT/.local-bin/ffmpeg" "$RUNTIME_ROOT/bin/ffmpeg"
run_cmd install -m 755 "$REPO_ROOT/.local-bin/ffprobe" "$RUNTIME_ROOT/bin/ffprobe"
run_cmd install -m 755 "$SCRIPT_DIR/process-video-media.py" "$RUNTIME_ROOT/process-video-media.py"
run_cmd install -m 644 "$PLIST_SRC" "$PLIST_DST"

if [[ "$NO_START" -eq 0 ]]; then
  run_optional_cmd launchctl bootout "$USER_DOMAIN" "$PLIST_DST"
  run_optional_cmd launchctl bootout "${USER_DOMAIN}/${LABEL}"
  run_cmd launchctl bootstrap "$USER_DOMAIN" "$PLIST_DST"
  run_cmd launchctl kickstart -k "${USER_DOMAIN}/${LABEL}"
fi

if [[ "$DRY_RUN" -eq 1 ]]; then
  echo "Dry run only. No files were changed."
else
  echo "Installed the coldwaterkim video processor."
fi

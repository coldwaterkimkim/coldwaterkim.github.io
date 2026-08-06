#!/usr/bin/env bash
set -euo pipefail

DRY_RUN=0
if [[ "${1:-}" == "--dry-run" ]]; then
  DRY_RUN=1
  shift
fi
if (($#)); then
  echo "Usage: sudo bash deploy/imac/install-split-dns.sh [--dry-run]" >&2
  exit 2
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
DNSMASQ_SRC="$REPO_ROOT/.local-bin/dnsmasq"
CONFIG_SRC="$SCRIPT_DIR/dnsmasq-split-dns.conf"
PLIST_SRC="$SCRIPT_DIR/com.coldwaterkim.split-dns.plist"
DNSMASQ_DST="/usr/local/libexec/coldwaterkim/dnsmasq"
CONFIG_DST="/usr/local/etc/coldwaterkim/dnsmasq.conf"
PLIST_DST="/Library/LaunchDaemons/com.coldwaterkim.split-dns.plist"
LABEL="com.coldwaterkim.split-dns"

for required in "$DNSMASQ_SRC" "$CONFIG_SRC" "$PLIST_SRC"; do
  if [[ ! -f "$required" ]]; then
    echo "Missing required file: $required" >&2
    exit 1
  fi
done
plutil -lint "$PLIST_SRC" >/dev/null
"$DNSMASQ_SRC" --test --conf-file="$CONFIG_SRC"

if [[ "$DRY_RUN" -eq 1 ]]; then
  printf '+ install -m 755 %q %q\n' "$DNSMASQ_SRC" "$DNSMASQ_DST"
  printf '+ install -m 644 %q %q\n' "$CONFIG_SRC" "$CONFIG_DST"
  printf '+ install -m 644 -o root -g wheel %q %q\n' "$PLIST_SRC" "$PLIST_DST"
  printf '+ launchctl bootstrap system %q\n' "$PLIST_DST"
  echo "Dry run only. No files were changed."
  exit 0
fi

if [[ "$EUID" -ne 0 ]]; then
  echo "Run the installer with sudo so dnsmasq can bind TCP/UDP port 53." >&2
  exit 1
fi

console_user="${SUDO_USER:-kimchansu}"
console_home="$(dscl . -read "/Users/$console_user" NFSHomeDirectory | awk '{print $2}')"
backup_dir="$console_home/.local/share/coldwaterkim/home-server/migration_backups/split-dns/pre-install-$(date +%Y%m%d-%H%M%S)"
install -d -m 755 -o "$console_user" -g staff "$backup_dir"
for existing in "$DNSMASQ_DST" "$CONFIG_DST" "$PLIST_DST"; do
  if [[ -f "$existing" ]]; then
    cp -p "$existing" "$backup_dir/$(basename "$existing")"
  fi
done

launchctl bootout "system/$LABEL" >/dev/null 2>&1 || true
launchctl bootout system "$PLIST_DST" >/dev/null 2>&1 || true

install -d -m 755 -o root -g wheel /usr/local/libexec/coldwaterkim /usr/local/etc/coldwaterkim
install -m 755 -o root -g wheel "$DNSMASQ_SRC" "$DNSMASQ_DST"
install -m 644 -o root -g wheel "$CONFIG_SRC" "$CONFIG_DST"
install -m 644 -o root -g wheel "$PLIST_SRC" "$PLIST_DST"

"$DNSMASQ_DST" --test --conf-file="$CONFIG_DST"
launchctl bootstrap system "$PLIST_DST"
launchctl kickstart -k "system/$LABEL"

echo "Installed and started $LABEL. Rollback files: $backup_dir"

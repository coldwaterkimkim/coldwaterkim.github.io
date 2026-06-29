#!/bin/bash
set -euo pipefail

POCKETBASE_VERSION="${POCKETBASE_VERSION:-0.23.5}"
CADDY_VERSION="${CADDY_VERSION:-2.11.4}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
BIN_DIR="$REPO_ROOT/.local-bin"
WORK_DIR="${TMPDIR:-/tmp}/coldwaterkim-runtime-install"

case "$(uname -m)" in
    x86_64)
        PB_ARCH="amd64"
        CADDY_ARCH="amd64"
        ;;
    arm64)
        PB_ARCH="arm64"
        CADDY_ARCH="arm64"
        ;;
    *)
        echo "Unsupported macOS architecture: $(uname -m)" >&2
        exit 1
        ;;
esac

mkdir -p "$BIN_DIR" "$WORK_DIR"
rm -rf "$WORK_DIR"/*

PB_ZIP="pocketbase_${POCKETBASE_VERSION}_darwin_${PB_ARCH}.zip"
PB_URL="https://github.com/pocketbase/pocketbase/releases/download/v${POCKETBASE_VERSION}/${PB_ZIP}"
CADDY_TARBALL="caddy_${CADDY_VERSION}_mac_${CADDY_ARCH}.tar.gz"
CADDY_URL="https://github.com/caddyserver/caddy/releases/download/v${CADDY_VERSION}/${CADDY_TARBALL}"
CADDY_CHECKSUMS_URL="https://github.com/caddyserver/caddy/releases/download/v${CADDY_VERSION}/caddy_${CADDY_VERSION}_checksums.txt"

echo "Installing PocketBase v${POCKETBASE_VERSION} for darwin_${PB_ARCH}"
curl -fsSL "$PB_URL" -o "$WORK_DIR/$PB_ZIP"
unzip -q -o "$WORK_DIR/$PB_ZIP" -d "$WORK_DIR/pocketbase"
cp "$WORK_DIR/pocketbase/pocketbase" "$BIN_DIR/pocketbase"
chmod +x "$BIN_DIR/pocketbase"

echo "Installing Caddy v${CADDY_VERSION} for mac_${CADDY_ARCH}"
curl -fsSL "$CADDY_URL" -o "$WORK_DIR/$CADDY_TARBALL"
curl -fsSL "$CADDY_CHECKSUMS_URL" -o "$WORK_DIR/caddy_checksums.txt"
(
    cd "$WORK_DIR"
    grep " ${CADDY_TARBALL}$" caddy_checksums.txt > caddy.sha256
    shasum -a 256 -c caddy.sha256
    mkdir -p caddy
    tar -xzf "$CADDY_TARBALL" -C caddy
)
cp "$WORK_DIR/caddy/caddy" "$BIN_DIR/caddy"
chmod +x "$BIN_DIR/caddy"

"$BIN_DIR/pocketbase" --version
"$BIN_DIR/caddy" version

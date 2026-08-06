#!/usr/bin/env bash
set -euo pipefail

DNSMASQ_VERSION="2.93"
DNSMASQ_SHA256="cc967771abdafeb43d10db18932d6b59fd4bed2c69c22acf8cb96aff6920d55f"
DNSMASQ_URL="https://thekelleys.org.uk/dnsmasq/dnsmasq-${DNSMASQ_VERSION}.tar.gz"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
OUTPUT="$REPO_ROOT/.local-bin/dnsmasq"
BUILD_ROOT="$(mktemp -d /tmp/cwk-dnsmasq-build.XXXXXX)"
ARCHIVE="$BUILD_ROOT/dnsmasq.tar.gz"

cleanup() {
  find "$BUILD_ROOT" -depth -mindepth 1 -delete 2>/dev/null || true
  rmdir "$BUILD_ROOT" 2>/dev/null || true
}
trap cleanup EXIT

curl --fail --location --silent --show-error "$DNSMASQ_URL" --output "$ARCHIVE"
actual_sha="$(shasum -a 256 "$ARCHIVE" | awk '{print $1}')"
if [[ "$actual_sha" != "$DNSMASQ_SHA256" ]]; then
  echo "dnsmasq checksum mismatch: expected $DNSMASQ_SHA256, got $actual_sha" >&2
  exit 1
fi

tar -xzf "$ARCHIVE" -C "$BUILD_ROOT"
make -C "$BUILD_ROOT/dnsmasq-${DNSMASQ_VERSION}" CFLAGS="-O2"
mkdir -p "$(dirname "$OUTPUT")"
install -m 755 "$BUILD_ROOT/dnsmasq-${DNSMASQ_VERSION}/src/dnsmasq" "$OUTPUT"
"$OUTPUT" --version | head -1
echo "Built $OUTPUT"

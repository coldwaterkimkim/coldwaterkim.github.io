#!/bin/bash
set -euo pipefail

POCKETBASE_VERSION="${POCKETBASE_VERSION:-0.40.1}"
GO_VERSION="${GO_VERSION:-1.27.0}"
GO_DARWIN_AMD64_SHA256="${GO_DARWIN_AMD64_SHA256:-d3314e25496e4381d71a5c51d2907e7af655d199f6780b549f015bd85fef4986}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
SOURCE_DIR="$SCRIPT_DIR/pocketbase-custom"
OUTPUT_DIR="$REPO_ROOT/.local-bin"
WORK_DIR="${TMPDIR:-/tmp}/coldwaterkim-pocketbase-build"
GO_ROOT="$WORK_DIR/go"
GO_TARBALL="$WORK_DIR/go${GO_VERSION}.darwin-amd64.tar.gz"
MANIFEST_SCRIPT="$REPO_ROOT/scripts/create-pocketbase-release-manifest.mjs"
RELEASE_MANIFEST="$OUTPUT_DIR/pocketbase-release.json"

if [[ "$(uname -s)" != "Darwin" || "$(uname -m)" != "x86_64" ]]; then
    echo "This build is pinned for the Intel iMac (darwin/amd64)." >&2
    exit 1
fi

node "$MANIFEST_SCRIPT" \
    --check-source-only \
    --pocketbase-version "$POCKETBASE_VERSION" \
    --go-version "$GO_VERSION"

mkdir -p "$WORK_DIR" "$OUTPUT_DIR"

go_version_matches() {
    [[ -x "$1" ]] && "$1" version | grep -Fq "go${GO_VERSION} "
}

SYSTEM_GO="$(command -v go 2>/dev/null || true)"
if [[ -n "$SYSTEM_GO" ]] && go_version_matches "$SYSTEM_GO"; then
    GO_BIN="$SYSTEM_GO"
else
    if ! go_version_matches "$GO_ROOT/bin/go"; then
        rm -rf "$GO_ROOT"
        curl -fsSL "https://go.dev/dl/go${GO_VERSION}.darwin-amd64.tar.gz" -o "$GO_TARBALL"
        echo "${GO_DARWIN_AMD64_SHA256}  ${GO_TARBALL}" | shasum -a 256 -c -
        tar -xzf "$GO_TARBALL" -C "$WORK_DIR"
    fi
    GO_BIN="$GO_ROOT/bin/go"
fi

"$GO_BIN" version | grep -F "go${GO_VERSION} "

(
    cd "$SOURCE_DIR"
    GOTOOLCHAIN=local "$GO_BIN" mod tidy -diff
    GOTOOLCHAIN=local "$GO_BIN" mod verify
    CGO_ENABLED=0 GOOS=darwin GOARCH=amd64 GOTOOLCHAIN=local "$GO_BIN" build \
        -trimpath \
        -ldflags "-s -w -X github.com/pocketbase/pocketbase.Version=${POCKETBASE_VERSION}" \
        -o "$OUTPUT_DIR/pocketbase" \
        .
)

chmod 755 "$OUTPUT_DIR/pocketbase"
VERSION_OUTPUT="$("$OUTPUT_DIR/pocketbase" --version)"
if [[ "$VERSION_OUTPUT" != "pocketbase version ${POCKETBASE_VERSION}" ]]; then
    echo "Unexpected PocketBase build version: $VERSION_OUTPUT" >&2
    exit 1
fi
echo "$VERSION_OUTPUT"
"$OUTPUT_DIR/pocketbase" serve --help | grep -F -- "--httpRequestTimeout"
"$OUTPUT_DIR/pocketbase" serve --help | grep -F -- "--tusUploadDir"
"$OUTPUT_DIR/pocketbase" serve --help | grep -F -- "--siteDir"
"$OUTPUT_DIR/pocketbase" serve --help | grep -F -- "--toolJobDir"
"$OUTPUT_DIR/pocketbase" serve --help | grep -F -- "--ownerUserId"
node "$MANIFEST_SCRIPT" \
    --binary "$OUTPUT_DIR/pocketbase" \
    --migrations "$REPO_ROOT/pb_migrations" \
    --output "$RELEASE_MANIFEST" \
    --pocketbase-version "$POCKETBASE_VERSION" \
    --go-version "$GO_VERSION" \
    --go-command "$GO_BIN"

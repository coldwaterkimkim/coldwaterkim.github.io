#!/bin/bash
set -euo pipefail

POCKETBASE_VERSION="${POCKETBASE_VERSION:-0.23.5}"
GO_VERSION="${GO_VERSION:-1.25.12}"
GO_DARWIN_AMD64_SHA256="${GO_DARWIN_AMD64_SHA256:-00a2e743b82bccec03c51c4b0f7e46d5fec52184075fd6c5183c3bb39ae9fb00}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
SOURCE_DIR="$SCRIPT_DIR/pocketbase-custom"
OUTPUT_DIR="$REPO_ROOT/.local-bin"
WORK_DIR="${TMPDIR:-/tmp}/coldwaterkim-pocketbase-build"
GO_ROOT="$WORK_DIR/go"
GO_TARBALL="$WORK_DIR/go${GO_VERSION}.darwin-amd64.tar.gz"

if [[ "$(uname -s)" != "Darwin" || "$(uname -m)" != "x86_64" ]]; then
    echo "This build is pinned for the Intel iMac (darwin/amd64)." >&2
    exit 1
fi

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
    GOTOOLCHAIN=local "$GO_BIN" mod tidy
    CGO_ENABLED=0 GOOS=darwin GOARCH=amd64 GOTOOLCHAIN=local "$GO_BIN" build \
        -trimpath \
        -ldflags "-s -w -X github.com/pocketbase/pocketbase.Version=${POCKETBASE_VERSION}" \
        -o "$OUTPUT_DIR/pocketbase" \
        .
)

chmod 755 "$OUTPUT_DIR/pocketbase"
"$OUTPUT_DIR/pocketbase" --version
"$OUTPUT_DIR/pocketbase" serve --help | grep -F -- "--httpRequestTimeout"
"$OUTPUT_DIR/pocketbase" serve --help | grep -F -- "--tusUploadDir"

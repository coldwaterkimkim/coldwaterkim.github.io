#!/usr/bin/env bash
set -euo pipefail

FFMPEG_VERSION="8.1.2"
FFMPEG_ZIP_SHA256="e91df72a1ee7c26606f90dd2dd4dcccc6a75140ff9ea6fdd50faae828b82ba69"
FFPROBE_ZIP_SHA256="399b93f0b9862f69767afa343e90c2f48d7e7958cadbb6deb76a012d0e3b7ce3"
TARGET_DIR="${FFMPEG_TARGET_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)/.local-bin}"

if [[ "$(uname -s)" != "Darwin" || "$(uname -m)" != "x86_64" ]]; then
  echo "This installer is pinned for the Intel iMac (macOS x86_64)." >&2
  exit 1
fi

work_dir="$(mktemp -d /tmp/cwk-ffmpeg.XXXXXX)"
trap 'rm -rf "$work_dir"' EXIT

download_and_verify() {
  local tool="$1"
  local expected_sha="$2"
  local zip_path="$work_dir/${tool}.zip"
  local unpack_dir="$work_dir/${tool}"
  local actual_sha

  curl -fL --retry 3 -o "$zip_path" "https://evermeet.cx/ffmpeg/${tool}-${FFMPEG_VERSION}.zip"
  actual_sha="$(shasum -a 256 "$zip_path" | awk '{print $1}')"
  if [[ "$actual_sha" != "$expected_sha" ]]; then
    echo "$tool archive checksum mismatch." >&2
    exit 1
  fi

  mkdir -p "$unpack_dir"
  unzip -q "$zip_path" -d "$unpack_dir"
  test -x "$unpack_dir/$tool"
  install -m 755 "$unpack_dir/$tool" "$TARGET_DIR/$tool"
}

mkdir -p "$TARGET_DIR"
download_and_verify ffmpeg "$FFMPEG_ZIP_SHA256"
download_and_verify ffprobe "$FFPROBE_ZIP_SHA256"

"$TARGET_DIR/ffmpeg" -version | head -n 1
"$TARGET_DIR/ffprobe" -version | head -n 1
echo "Installed pinned FFmpeg tools in $TARGET_DIR"

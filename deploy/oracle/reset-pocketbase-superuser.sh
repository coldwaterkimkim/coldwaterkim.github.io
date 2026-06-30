#!/usr/bin/env bash
set -euo pipefail

PB_BIN="${PB_BIN:-/home/pocketbase/pocketbase}"
PB_DATA_DIR="${PB_DATA_DIR:-/home/pocketbase/pb_data}"
PB_USER="${PB_USER:-pocketbase}"

usage() {
  cat <<'EOF'
Reset or create the PocketBase superuser on the Oracle VM.

Run this on the server that owns the production pb_data directory.
The password is read interactively and is not written to shell history.

Usage:
  deploy/oracle/reset-pocketbase-superuser.sh

Environment:
  PB_BIN       default: /home/pocketbase/pocketbase
  PB_DATA_DIR  default: /home/pocketbase/pb_data
  PB_USER      default: pocketbase
EOF
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

if [[ ! -x "$PB_BIN" ]]; then
  echo "PocketBase binary not found or not executable: $PB_BIN" >&2
  exit 1
fi

if [[ ! -d "$PB_DATA_DIR" ]]; then
  echo "PocketBase data directory not found: $PB_DATA_DIR" >&2
  exit 1
fi

if [[ ! -t 0 ]]; then
  echo "This script prompts for credentials and must run in an interactive terminal." >&2
  exit 1
fi

printf "PocketBase superuser email: "
read -r superuser_email

printf "PocketBase superuser password: "
read -r -s superuser_password
printf "\n"

if [[ -z "$superuser_email" || -z "$superuser_password" ]]; then
  echo "Email and password are required." >&2
  exit 1
fi

sudo -u "$PB_USER" "$PB_BIN" superuser upsert "$superuser_email" "$superuser_password" --dir "$PB_DATA_DIR"

echo "PocketBase superuser is ready."

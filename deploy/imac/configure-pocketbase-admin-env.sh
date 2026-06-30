#!/usr/bin/env bash
set -euo pipefail

ENV_FILE="${PB_ADMIN_ENV_FILE:-$HOME/.config/coldwaterkim/pocketbase-admin.env}"
DEFAULT_PB_URL="${PB_URL:-https://api.coldwaterkim.com}"

usage() {
  cat <<'EOF'
Usage:
  deploy/imac/configure-pocketbase-admin-env.sh

Writes the local PocketBase admin env file used for production backup rehearsal.
Secrets are written only to the local machine, never to the repo.

Environment:
  PB_ADMIN_ENV_FILE  default: ~/.config/coldwaterkim/pocketbase-admin.env
  PB_URL             default: https://api.coldwaterkim.com
EOF
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

is_placeholder() {
  local value="$1"
  [[ "$value" =~ ^you@example\.com$ ]] ||
    [[ "$value" =~ your- ]] ||
    [[ "$value" =~ example ]] ||
    [[ "$value" =~ changeme ]] ||
    [[ "$value" =~ password$ ]]
}

require_value() {
  local name="$1"
  local value="$2"
  if [[ -z "$value" ]]; then
    echo "$name is required." >&2
    exit 1
  fi
  if is_placeholder "$value"; then
    echo "$name still looks like a template placeholder." >&2
    exit 1
  fi
}

if [[ ! -t 0 ]]; then
  echo "This script prompts for secrets and must run in an interactive terminal." >&2
  exit 1
fi

printf "PocketBase URL [%s]: " "$DEFAULT_PB_URL"
read -r input_url
pb_url="${input_url:-$DEFAULT_PB_URL}"

printf "PocketBase admin email: "
read -r admin_email

printf "PocketBase admin password: "
read -r -s admin_password
printf "\n"

require_value "PB_URL" "$pb_url"
require_value "PB_ADMIN_EMAIL" "$admin_email"
require_value "PB_ADMIN_PASSWORD" "$admin_password"

if [[ "$pb_url" != https://* ]]; then
  echo "PB_URL must start with https:// for production backup rehearsal." >&2
  exit 1
fi

env_dir="$(dirname "$ENV_FILE")"
install -d -m 700 "$env_dir"
tmp_file="$(mktemp "$env_dir/.pocketbase-admin.env.XXXXXX")"
trap 'rm -f "$tmp_file"' EXIT

{
  printf "PB_URL=%s\n" "$pb_url"
  printf "PB_ADMIN_EMAIL=%s\n" "$admin_email"
  printf "PB_ADMIN_PASSWORD=%s\n" "$admin_password"
} >"$tmp_file"

chmod 600 "$tmp_file"
mv "$tmp_file" "$ENV_FILE"
trap - EXIT

chmod 700 "$env_dir"
chmod 600 "$ENV_FILE"

cat <<EOF
PocketBase admin env configured:
  $ENV_FILE

Next checks:
  npm run pb:preflight:production
  npm run pb:rehearse:production
EOF

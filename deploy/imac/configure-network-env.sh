#!/usr/bin/env bash
set -euo pipefail

ENV_FILE="${HOME_SERVER_ENV_FILE:-$HOME/.config/coldwaterkim/home-server.env}"
AUTO=0
DEFAULT_LAN_IP="${HOME_SERVER_LAN_IP:-}"
DEFAULT_PUBLIC_IP="${HOME_SERVER_PUBLIC_IP:-}"

usage() {
  cat <<'EOF'
Usage:
  deploy/imac/configure-network-env.sh [--auto]

Writes the local home-server network env file used by cutover QA.
The file is local-only and should not be committed.

Options:
  --auto  Use detected/default LAN and public IP values without prompts.

Environment:
  HOME_SERVER_ENV_FILE   default: ~/.config/coldwaterkim/home-server.env
  HOME_SERVER_LAN_IP     default: 192.168.0.11
  HOME_SERVER_PUBLIC_IP  optional default
EOF
}

while (($#)); do
  case "$1" in
    --auto)
      AUTO=1
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

is_ipv4() {
  local value="$1"
  [[ "$value" =~ ^([0-9]{1,3}\.){3}[0-9]{1,3}$ ]] || return 1

  local part
  IFS=. read -r -a parts <<<"$value"
  for part in "${parts[@]}"; do
    [[ "$part" -ge 0 && "$part" -le 255 ]] || return 1
  done
}

is_private_ipv4() {
  local value="$1"
  is_ipv4 "$value" || return 1

  local first second
  IFS=. read -r first second _ <<<"$value"
  [[ "$first" -eq 10 ]] ||
    [[ "$first" -eq 172 && "$second" -ge 16 && "$second" -le 31 ]] ||
    [[ "$first" -eq 192 && "$second" -eq 168 ]]
}

is_public_ipv4() {
  local value="$1"
  is_ipv4 "$value" || return 1
  is_private_ipv4 "$value" && return 1

  local first second third
  IFS=. read -r first second third _ <<<"$value"
  [[ "$first" -ne 0 && "$first" -ne 127 && "$first" -lt 224 ]] || return 1
  [[ ! ( "$first" -eq 100 && "$second" -ge 64 && "$second" -le 127 ) ]] || return 1
  [[ ! ( "$first" -eq 169 && "$second" -eq 254 ) ]] || return 1
  [[ ! ( "$first" -eq 192 && "$second" -eq 0 && "$third" -eq 2 ) ]] || return 1
  [[ ! ( "$first" -eq 198 && "$second" -eq 51 && "$third" -eq 100 ) ]] || return 1
  [[ ! ( "$first" -eq 203 && "$second" -eq 0 && "$third" -eq 113 ) ]] || return 1
}

detect_public_ip() {
  command -v curl >/dev/null 2>&1 || return 0
  curl -4fsS --max-time 5 https://api.ipify.org 2>/dev/null || true
}

detect_lan_ip() {
  command -v route >/dev/null 2>&1 || return 0
  command -v ipconfig >/dev/null 2>&1 || return 0

  local interface
  interface="$(route get default 2>/dev/null | awk '/interface:/{print $2; exit}')"
  [[ -n "$interface" ]] || return 0
  ipconfig getifaddr "$interface" 2>/dev/null || true
}

detected_lan_ip="$(detect_lan_ip)"
if [[ -z "$DEFAULT_LAN_IP" && -n "$detected_lan_ip" ]] && is_private_ipv4 "$detected_lan_ip"; then
  DEFAULT_LAN_IP="$detected_lan_ip"
fi
DEFAULT_LAN_IP="${DEFAULT_LAN_IP:-192.168.0.11}"

detected_public_ip="$(detect_public_ip)"
if [[ -z "$DEFAULT_PUBLIC_IP" && -n "$detected_public_ip" ]] && is_public_ipv4 "$detected_public_ip"; then
  DEFAULT_PUBLIC_IP="$detected_public_ip"
fi

if [[ "$AUTO" -eq 1 ]]; then
  lan_ip="$DEFAULT_LAN_IP"
  public_ip="$DEFAULT_PUBLIC_IP"
else
  if [[ ! -t 0 ]]; then
    echo "This script prompts for network values and must run in an interactive terminal, or use --auto." >&2
    exit 1
  fi

  printf "iMac LAN IP [%s]: " "$DEFAULT_LAN_IP"
  read -r input_lan_ip
  lan_ip="${input_lan_ip:-$DEFAULT_LAN_IP}"

  if [[ -n "$DEFAULT_PUBLIC_IP" ]]; then
    printf "Home public IPv4 [%s]: " "$DEFAULT_PUBLIC_IP"
  else
    printf "Home public IPv4: "
  fi
  read -r input_public_ip
  public_ip="${input_public_ip:-$DEFAULT_PUBLIC_IP}"
fi

if ! is_private_ipv4 "$lan_ip"; then
  echo "HOME_SERVER_LAN_IP must be a private IPv4 address." >&2
  exit 1
fi

if ! is_public_ipv4 "$public_ip"; then
  echo "HOME_SERVER_PUBLIC_IP must be a public IPv4 address. Set HOME_SERVER_PUBLIC_IP or run without --auto to type it." >&2
  exit 1
fi

env_dir="$(dirname "$ENV_FILE")"
install -d -m 700 "$env_dir"
tmp_file="$(mktemp "$env_dir/.home-server.env.XXXXXX")"
trap 'rm -f "$tmp_file"' EXIT

{
  printf "HOME_SERVER_LAN_IP=%s\n" "$lan_ip"
  printf "HOME_SERVER_PUBLIC_IP=%s\n" "$public_ip"
} >"$tmp_file"

chmod 600 "$tmp_file"
mv "$tmp_file" "$ENV_FILE"
trap - EXIT

chmod 700 "$env_dir"
chmod 600 "$ENV_FILE"

cat <<EOF
Home-server network env configured:
  $ENV_FILE

Next checks:
  npm run qa:network-preflight
  npm run qa:migration-go
EOF

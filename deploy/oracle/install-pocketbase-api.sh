#!/usr/bin/env bash
set -euo pipefail

DOMAIN="${PB_DOMAIN:-api.coldwaterkim.com}"
PB_VERSION="${PB_VERSION:-0.23.5}"
PB_USER="${PB_USER:-pocketbase}"
PB_HOME="${PB_HOME:-/home/pocketbase}"
PB_DATA_DIR="${PB_DATA_DIR:-$PB_HOME/pb_data}"
OPEN_HOST_FIREWALL="${OPEN_HOST_FIREWALL:-1}"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run with sudo: sudo deploy/oracle/install-pocketbase-api.sh"
  exit 1
fi

case "$(uname -m)" in
  x86_64)
    PB_ARCH="linux_amd64"
    ;;
  aarch64|arm64)
    PB_ARCH="linux_arm64"
    ;;
  *)
    echo "Unsupported architecture: $(uname -m)"
    exit 1
    ;;
esac

export DEBIAN_FRONTEND="${DEBIAN_FRONTEND:-noninteractive}"

apt-get update
apt-get install -y ca-certificates curl nginx unzip

open_iptables_port() {
  local port="$1"

  if ! command -v iptables >/dev/null 2>&1; then
    return
  fi

  if iptables -C INPUT -p tcp -m state --state NEW -m tcp --dport "$port" -j ACCEPT 2>/dev/null; then
    return
  fi

  local reject_line
  reject_line="$(iptables -L INPUT --line-numbers -n | awk '/REJECT/ { print $1; exit }')"

  if [[ -n "$reject_line" ]]; then
    iptables -I INPUT "$reject_line" -p tcp -m state --state NEW -m tcp --dport "$port" -j ACCEPT
  else
    iptables -A INPUT -p tcp -m state --state NEW -m tcp --dport "$port" -j ACCEPT
  fi
}

if [[ "$OPEN_HOST_FIREWALL" == "1" ]]; then
  open_iptables_port 80
  open_iptables_port 443

  if command -v debconf-set-selections >/dev/null 2>&1; then
    printf "iptables-persistent iptables-persistent/autosave_v4 boolean true\niptables-persistent iptables-persistent/autosave_v6 boolean true\n" \
      | debconf-set-selections
  fi

  apt-get install -y iptables-persistent
  if command -v netfilter-persistent >/dev/null 2>&1; then
    netfilter-persistent save
  fi
fi

if ! id -u "$PB_USER" >/dev/null 2>&1; then
  useradd --system --create-home --home-dir "$PB_HOME" --shell /usr/sbin/nologin "$PB_USER"
fi

mkdir -p "$PB_DATA_DIR" "$PB_HOME/backups"

curl -fsSL \
  "https://github.com/pocketbase/pocketbase/releases/download/v${PB_VERSION}/pocketbase_${PB_VERSION}_${PB_ARCH}.zip" \
  -o /tmp/pocketbase.zip
unzip -o /tmp/pocketbase.zip -d "$PB_HOME"
rm /tmp/pocketbase.zip

chmod 0755 "$PB_HOME/pocketbase"
chown -R "$PB_USER:$PB_USER" "$PB_HOME"

install -m 0644 "$REPO_ROOT/deploy/pocketbase.service" /etc/systemd/system/pocketbase.service
install -m 0755 "$REPO_ROOT/deploy/backup.sh" "$PB_HOME/backup.sh"
chown "$PB_USER:$PB_USER" "$PB_HOME/backup.sh"

sed "s/server_name api.coldwaterkim.com;/server_name ${DOMAIN};/" \
  "$REPO_ROOT/deploy/nginx-api-subdomain.conf" \
  > /etc/nginx/sites-available/coldwaterkim-api.conf

rm -f /etc/nginx/sites-enabled/default
ln -sf /etc/nginx/sites-available/coldwaterkim-api.conf /etc/nginx/sites-enabled/coldwaterkim-api.conf

systemctl daemon-reload
systemctl enable --now pocketbase

nginx -t
systemctl reload nginx

cat <<EOF

PocketBase API server installed.

Next:
1. In Oracle Cloud, make sure TCP 80 and 443 are open in the VCN security list.
2. Point DNS A record:
   ${DOMAIN} -> this VM public IPv4
3. After DNS propagation, enable HTTPS:
   sudo apt-get install -y certbot python3-certbot-nginx
   sudo certbot --nginx -d ${DOMAIN}
4. Create the first PocketBase superuser:
   sudo -u ${PB_USER} ${PB_HOME}/pocketbase superuser upsert YOUR_EMAIL YOUR_PASSWORD --dir ${PB_DATA_DIR}
5. Open:
   https://${DOMAIN}/_/
EOF

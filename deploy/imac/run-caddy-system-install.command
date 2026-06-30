#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

cd "$REPO_ROOT"

cat <<'EOF'
coldwaterkim.com Caddy system install

This installs the Caddy binary and LaunchDaemon with sudo, but does not start
the public 80/443 service yet. Start Caddy only after DNS/router cutover is
ready.

You will be asked for the macOS administrator password by sudo.
Password input is hidden while typing; press Return after typing it.
EOF

sudo -v

bash deploy/imac/install-launchd-services.sh --caddy-only --no-start

cat <<'EOF'

Caddy system files are installed.

Next, after router/DNS cutover is ready:
  npm run imac:install-caddy
  npm run qa:migration-go
EOF

#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$REPO_ROOT"

cat <<'INTRO'
coldwaterkim.com iMac production gates

This window is for local-only secret entry.
Do not paste PocketBase passwords into chat or commit them to git.

Steps:
  1. Save the production PocketBase admin credentials locally.
  2. Install/restart the iMac launchd services, including Caddy.
  3. Run the local production gates that can run from this Mac.

For the PocketBase URL, press Enter to keep the default if it is correct.
INTRO

echo
bash deploy/imac/configure-pocketbase-admin-env.sh

echo
echo "Installing iMac launchd services. macOS may ask for the local admin password."
bash deploy/imac/install-launchd-services.sh

echo
if command -v node >/dev/null 2>&1; then
    echo "Running local production gates..."
    node scripts/verify-production-readiness.mjs
    node scripts/verify-imac-launchd.mjs
    node scripts/verify-network-readiness.mjs
else
    echo "Node.js was not found in this Terminal session."
    echo "Return to Codex so it can run the QA checks with its bundled Node.js."
fi

echo
echo "Done. Return to Codex so the migration can continue."
read -r -p "Press Return to close this window. "

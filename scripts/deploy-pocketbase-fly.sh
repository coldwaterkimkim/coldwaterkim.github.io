#!/usr/bin/env bash
set -euo pipefail

APP_NAME="${FLY_APP_NAME:-coldwaterkim-pocketbase}"
REGION="${FLY_REGION:-nrt}"
DOMAIN="${PB_DOMAIN:-api.coldwaterkim.com}"
VOLUME_NAME="${FLY_VOLUME_NAME:-pb_data}"
VOLUME_SIZE="${FLY_VOLUME_SIZE:-1}"

if ! command -v flyctl >/dev/null 2>&1; then
  echo "flyctl is not installed. Install it first: https://fly.io/docs/flyctl/install/"
  exit 1
fi

if ! flyctl auth whoami >/dev/null 2>&1; then
  echo "flyctl is not logged in. Run: flyctl auth login"
  exit 1
fi

if ! flyctl status --app "$APP_NAME" >/dev/null 2>&1; then
  flyctl apps create "$APP_NAME"
fi

if ! flyctl volumes list --app "$APP_NAME" | grep -q "$VOLUME_NAME"; then
  flyctl volumes create "$VOLUME_NAME" \
    --app "$APP_NAME" \
    --region "$REGION" \
    --size "$VOLUME_SIZE" \
    --yes
fi

flyctl deploy --app "$APP_NAME" --config fly.toml
flyctl certs add "$DOMAIN" --app "$APP_NAME" || true
flyctl certs setup "$DOMAIN" --app "$APP_NAME"

cat <<EOF

PocketBase deploy command finished.

Next:
1. Add the DNS records shown above for $DOMAIN.
2. Wait for DNS propagation.
3. Run:
   flyctl certs check $DOMAIN --app $APP_NAME
   curl https://$DOMAIN/api/health
4. Create the first PocketBase superuser:
   flyctl ssh console --app $APP_NAME
   /pb/pocketbase superuser upsert YOUR_EMAIL YOUR_PASSWORD --dir /data
EOF

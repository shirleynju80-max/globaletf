#!/usr/bin/env bash
# Deploy API to Fly.io (Hong Kong). Requires: flyctl auth login
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

APP="globaletf-api"
VOLUME="globaletf_data"
REGION="hkg"

if ! command -v fly >/dev/null 2>&1; then
  echo "Installing flyctl..."
  curl -fsSL https://fly.io/install.sh | sh
  export PATH="$HOME/.fly/bin:$PATH"
fi

if ! fly auth whoami >/dev/null 2>&1; then
  echo "Run: fly auth login"
  exit 1
fi

if ! fly apps list 2>/dev/null | grep -q "$APP"; then
  echo "Creating Fly app $APP ..."
  fly apps create "$APP" --org personal 2>/dev/null || fly apps create "$APP"
fi

if ! fly volumes list -a "$APP" 2>/dev/null | grep -q "$VOLUME"; then
  echo "Creating volume $VOLUME in $REGION ..."
  fly volumes create "$VOLUME" --region "$REGION" --size 1 -a "$APP" --yes
fi

echo "Deploying $APP to $REGION ..."
fly deploy -a "$APP"

echo ""
echo "API URL: https://${APP}.fly.dev"
echo "Health:  https://${APP}.fly.dev/api/health"
echo ""
echo "Seed data (first time, ~10–20 min):"
echo "  fly ssh console -a $APP -C 'npm run sync:daily'"
echo ""
echo "Set Cloudflare Pages env:"
echo "  VITE_API_BASE=https://${APP}.fly.dev"

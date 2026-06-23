#!/usr/bin/env bash
# Install cloudflared on Aliyun and enable systemd service (needs tunnel token from Cloudflare Zero Trust).
set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then
  echo "Run as root"
  exit 1
fi

BIN="/usr/local/bin/cloudflared"
if [ ! -x "$BIN" ]; then
  echo "Downloading cloudflared..."
  curl -fsSL --retry 3 --retry-delay 2 \
    -o "${BIN}.tmp" \
    "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64"
  mv "${BIN}.tmp" "$BIN"
  chmod +x "$BIN"
fi

"$BIN" --version

if [ -z "${CLOUDFLARE_TUNNEL_TOKEN:-}" ]; then
  echo ""
  echo "Next: Cloudflare Zero Trust → Networks → Tunnels → Create"
  echo "  Public hostname: api.globaletf.store → http://127.0.0.1:80"
  echo "  (use :8787 if globaletf.service sets PORT=8787)"
  echo "  Copy install token, then:"
  echo "  CLOUDFLARE_TUNNEL_TOKEN=<token> bash $0"
  exit 0
fi

"$BIN" service install "$CLOUDFLARE_TUNNEL_TOKEN"
systemctl enable --now cloudflared
systemctl status cloudflared --no-pager -l | tail -8
echo "Tunnel running. Set Pages env API_ORIGIN=https://api.globaletf.store"

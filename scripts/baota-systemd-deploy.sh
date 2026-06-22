#!/usr/bin/env bash
# globaletf on Aliyun + Baota panel (systemd + nginx reverse proxy).
# Run on the server as root after code is in /opt/globaletf.
set -euo pipefail

ROOT="/opt/globaletf"
DOMAIN="${GLOBALETF_DOMAIN:-globaletf.store}"
VHOST="/www/server/panel/vhost/nginx/globaletf.conf"
NGINX="/www/server/nginx/sbin/nginx"

cd "$ROOT"

install_node() {
  if command -v node >/dev/null 2>&1 && [[ "$(node -p 'process.versions.node.split(".")[0]')" -ge 20 ]]; then
    return
  fi
  echo "Installing Node 22..."
  if command -v yum >/dev/null 2>&1; then
    yum install -y python3 make gcc-c++ git curl
    curl -fsSL https://rpm.nodesource.com/setup_22.x | bash -
    yum install -y nodejs
  elif command -v apt-get >/dev/null 2>&1; then
    apt-get update
    apt-get install -y python3 make g++ git curl ca-certificates
    curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
    apt-get install -y nodejs
  else
    echo "Unsupported OS: install Node 22 manually"
    exit 1
  fi
}

install_node
node -v
npm -v

npm config set registry https://registry.npmmirror.com
npm ci
npm run build

mkdir -p "$ROOT/data" "$ROOT/logs"

install -m 644 "$ROOT/deploy/globaletf.service" /etc/systemd/system/globaletf.service
systemctl daemon-reload
systemctl enable --now globaletf

if [[ -f "$ROOT/deploy/nginx-globaletf.conf" ]]; then
  install -m 644 "$ROOT/deploy/nginx-globaletf.conf" "$VHOST"
  if [[ -x "$NGINX" ]]; then
    "$NGINX" -t
    "$NGINX" -s reload
  else
    echo "Baota nginx not found at $NGINX — add reverse proxy in panel manually."
  fi
fi

echo ""
echo "=== Health (local) ==="
curl -fsS "http://127.0.0.1:8787/api/health"
echo ""
if curl -fsS "http://127.0.0.1/api/health" >/dev/null 2>&1; then
  echo "Nginx proxy ok: http://127.0.0.1/api/health"
  curl -fsS "http://127.0.0.1/api/health"
  echo ""
fi

echo ""
echo "Next:"
echo "  1. DNS A @ and www -> this server public IP"
echo "  2. Baota firewall: allow 80, 443"
echo "  3. First data: cd $ROOT && npm run sync:daily   # 10-20 min"
echo "  4. HTTPS: Baota -> Website -> $DOMAIN -> SSL -> Let's Encrypt"
echo "     or: CERTBOT_EMAIL=you@example.com bash $ROOT/scripts/aliyun-enable-https.sh"

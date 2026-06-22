#!/usr/bin/env bash
# Bare-metal deploy on Aliyun (no Docker). Run on the server as root after code is in /opt/globaletf.
set -euo pipefail

ROOT="/opt/globaletf"
cd "$ROOT"

if ! command -v node >/dev/null 2>&1; then
  echo "Install Node 22 first, e.g.:"
  echo "  curl -fsSL https://rpm.nodesource.com/setup_22.x | bash -"
  echo "  yum install -y nodejs python3 make gcc-c++"
  exit 1
fi

npm config set registry https://registry.npmmirror.com
npm ci
npm run build

mkdir -p "$ROOT/data" "$ROOT/logs"

install -m 644 "$ROOT/deploy/globaletf.service" /etc/systemd/system/globaletf.service
systemctl daemon-reload
systemctl enable --now globaletf

echo "Health:"
curl -fsS "http://127.0.0.1:80/api/health"
echo ""
echo "First-time data (10–20 min): npm run sync:daily"
echo "Open http://<公网IP>/ (Aliyun lightweight firewall: use port 80)"

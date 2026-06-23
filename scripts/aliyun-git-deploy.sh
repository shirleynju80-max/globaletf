#!/usr/bin/env bash
# Pull latest globaletf from GitHub into /opt/globaletf and restart the API.
# Preserves data/ and logs/ (gitignored). Run on Aliyun as root.
set -euo pipefail

ROOT="${GLOBALETF_ROOT:-/opt/globaletf}"
REPO="${GLOBALETF_REPO:-https://github.com/shirleynju80-max/globaletf.git}"
BRANCH="${GLOBALETF_BRANCH:-main}"

usage() {
  echo "Usage: $0 install|update"
  echo "  install  — attach git to an existing ${ROOT} tree (first time)"
  echo "  update   — git pull + npm ci + build + restart globaletf"
}

require_root() {
  if [[ "$(id -u)" -ne 0 ]]; then
    echo "Run as root on the Aliyun server."
    exit 1
  fi
}

install_deps() {
  cd "$ROOT"
  npm config set registry https://registry.npmmirror.com
  npm ci
  npm run build
  mkdir -p "$ROOT/data" "$ROOT/logs"
}

cmd_install() {
  require_root
  if [[ ! -d "$ROOT" ]]; then
    echo "Missing $ROOT — copy the app there first or set GLOBALETF_ROOT."
    exit 1
  fi
  if [[ -d "$ROOT/.git" ]]; then
    echo "Git already initialized in $ROOT. Run: $0 update"
    exit 0
  fi

  cd "$ROOT"
  git init
  git remote add origin "$REPO"
  git fetch origin "$BRANCH"
  git checkout -B "$BRANCH" "origin/$BRANCH"

  install_deps

  if [[ ! -f /etc/systemd/system/globaletf.service ]]; then
    install -m 644 "$ROOT/deploy/globaletf.service" /etc/systemd/system/globaletf.service
    systemctl daemon-reload
    systemctl enable globaletf
  fi
  systemctl restart globaletf

  echo ""
  echo "Git deploy installed. Future updates: bash $ROOT/scripts/aliyun-git-deploy.sh update"
  curl -fsS "http://127.0.0.1/api/health" && echo ""
}

cmd_update() {
  require_root
  if [[ ! -d "$ROOT/.git" ]]; then
    echo "Git not initialized. Run: bash $0 install"
    exit 1
  fi

  cd "$ROOT"
  git fetch origin "$BRANCH"
  git reset --hard "origin/$BRANCH"

  install_deps
  systemctl restart globaletf

  echo ""
  echo "Updated to $(git rev-parse --short HEAD)"
  curl -fsS "http://127.0.0.1/api/health" && echo ""
}

case "${1:-update}" in
  install) cmd_install ;;
  update) cmd_update ;;
  -h|--help|help) usage ;;
  *) echo "Unknown command: $1"; usage; exit 1 ;;
esac

#!/usr/bin/env bash
# Pull latest globaletf from GitHub into /opt/globaletf and restart the API.
# Preserves data/ and logs/ (gitignored). Run on Aliyun as root.
#
# Note: mainland ECS often cannot reach github.com. If fetch fails, deploy from
# your laptop instead: bash scripts/deploy-to-aliyun.sh
set -euo pipefail

ROOT="${GLOBALETF_ROOT:-/opt/globaletf}"
REPO="${GLOBALETF_REPO:-https://github.com/shirleynju80-max/globaletf.git}"
BRANCH="${GLOBALETF_BRANCH:-main}"

usage() {
  echo "Usage: $0 install|update|record-deploy|status"
  echo "  install        — attach git to an existing ${ROOT} tree (first time)"
  echo "  update         — git pull + npm ci + build + restart globaletf"
  echo "  record-deploy  — commit deployed tree locally (no GitHub; used by deploy-to-aliyun.sh)"
  echo "  status         — show .deploy-rev and latest local deploy commit"
}

require_root() {
  if [[ "$(id -u)" -ne 0 ]]; then
    echo "Run as root on the Aliyun server."
    exit 1
  fi
}

prepare_git() {
  git config --global --add safe.directory "$ROOT" 2>/dev/null || true
}

ensure_local_repo() {
  cd "$ROOT"
  prepare_git
  if [[ ! -d "$ROOT/.git" ]]; then
    git init
  fi
  if ! git remote get-url origin >/dev/null 2>&1; then
    git remote add origin "$REPO"
  fi
  git checkout -B "$BRANCH" >/dev/null 2>&1 || git checkout -B "$BRANCH"
}

record_deploy_commit() {
  local rev subject
  rev="$(tr -d '[:space:]' < "${ROOT}/.deploy-rev" 2>/dev/null || true)"
  if [[ -z "$rev" ]]; then
    echo "Missing ${ROOT}/.deploy-rev — run deploy-to-aliyun.sh first."
    exit 1
  fi
  subject="$(tr -d '\r' < "${ROOT}/.deploy-subject" 2>/dev/null | head -1 || true)"
  if [[ -z "$subject" ]]; then
    subject="deploy ${rev:0:7}"
  fi

  ensure_local_repo
  cd "$ROOT"
  git add -A
  if git diff --cached --quiet; then
    if git rev-parse HEAD >/dev/null 2>&1; then
      echo "Git: no file changes; HEAD $(git rev-parse --short HEAD) matches deploy ${rev:0:7}"
    else
      echo "Git: no file changes to commit for deploy ${rev:0:7}"
    fi
    return 0
  fi

  GIT_AUTHOR_NAME="${GIT_AUTHOR_NAME:-globaletf-deploy}" \
  GIT_AUTHOR_EMAIL="${GIT_AUTHOR_EMAIL:-globaletf@localhost}" \
  GIT_COMMITTER_NAME="${GIT_COMMITTER_NAME:-globaletf-deploy}" \
  GIT_COMMITTER_EMAIL="${GIT_COMMITTER_EMAIL:-globaletf@localhost}" \
    git commit -m "$(cat <<EOF
deploy: ${rev:0:7} ${subject}

Upstream: ${REPO}@${rev}
Recorded by scripts/aliyun-git-deploy.sh record-deploy (no network).
EOF
)"
  echo "Git: recorded deploy ${rev:0:7} as $(git rev-parse --short HEAD)"
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

  cd "$ROOT"
  prepare_git
  if [[ -d "$ROOT/.git" ]] && git remote get-url origin >/dev/null 2>&1; then
    echo "Git already initialized in $ROOT. Run: $0 update"
    exit 0
  fi
  if [[ ! -d "$ROOT/.git" ]]; then
    git init
  fi
  if ! git remote get-url origin >/dev/null 2>&1; then
    git remote add origin "$REPO"
  fi
  git fetch origin "$BRANCH" || {
    echo "git fetch failed (GitHub often blocked on mainland ECS)."
    echo "From your laptop run: bash scripts/deploy-to-aliyun.sh"
    exit 1
  }
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
  prepare_git
  git fetch origin "$BRANCH" || {
    echo "git fetch failed (GitHub often blocked on mainland ECS)."
    echo "From your laptop run: bash scripts/deploy-to-aliyun.sh"
    exit 1
  }
  git reset --hard "origin/$BRANCH"

  install_deps
  systemctl restart globaletf

  echo ""
  echo "Updated to $(git rev-parse --short HEAD)"
  curl -fsS "http://127.0.0.1/api/health" && echo ""
}

cmd_record_deploy() {
  require_root
  record_deploy_commit
}

cmd_status() {
  require_root
  cd "$ROOT"
  prepare_git
  if [[ -f .deploy-rev ]]; then
    echo "deploy-rev: $(tr -d '[:space:]' < .deploy-rev)"
  else
    echo "deploy-rev: (missing)"
  fi
  if [[ -f .deploy-subject ]]; then
    echo "deploy-subject: $(tr -d '\r' < .deploy-subject | head -1)"
  fi
  if [[ -d .git ]] && git rev-parse HEAD >/dev/null 2>&1; then
    git log -1 --format="git HEAD: %h %s (%ci)"
  else
    echo "git HEAD: (no local deploy commits)"
  fi
}

case "${1:-update}" in
  install) cmd_install ;;
  update) cmd_update ;;
  record-deploy) cmd_record_deploy ;;
  status) cmd_status ;;
  -h|--help|help) usage ;;
  *) echo "Unknown command: $1"; usage; exit 1 ;;
esac

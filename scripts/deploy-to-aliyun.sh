#!/usr/bin/env bash
# Deploy the local git checkout to Aliyun (use when the server cannot reach GitHub).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
HOST="${GLOBALETF_HOST:-root@47.100.5.7}"
REMOTE="${GLOBALETF_ROOT:-/opt/globaletf}"
REV="$(git -C "$ROOT" rev-parse HEAD)"

echo "Deploying $(git -C "$ROOT" rev-parse --short HEAD) to ${HOST}:${REMOTE}"

COPYFILE_DISABLE=1 tar czf - -C "$ROOT" \
  --exclude node_modules \
  --exclude data \
  --exclude logs \
  --exclude dist \
  --exclude .git \
  . | ssh "$HOST" "mkdir -p '$REMOTE' && tar xzf - -C '$REMOTE'"

ssh "$HOST" "set -euo pipefail
cd '$REMOTE'
echo '$REV' > .deploy-rev
npm config set registry https://registry.npmmirror.com
npm ci
npm run build
systemctl restart globaletf
curl -fsS http://127.0.0.1/api/health && echo
"

echo "Done. Remote revision: $(git -C "$ROOT" rev-parse --short HEAD)"

#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

API_PID=""
API_PORT="${PORT:-8787}"

port_in_use() {
  lsof -iTCP:"$1" -sTCP:LISTEN >/dev/null 2>&1
}

pick_api_port() {
  if ! port_in_use "$API_PORT"; then
    echo "$API_PORT"
    return
  fi
  for candidate in 8788 8789 8790 8791; do
    if ! port_in_use "$candidate"; then
      echo "$candidate"
      return
    fi
  done
  echo "No free API port found (tried 8787-8791)." >&2
  exit 1
}

API_PORT="$(pick_api_port)"
export PORT="$API_PORT"
API_BASE="http://127.0.0.1:${API_PORT}"

cleanup() {
  if [[ -n "$API_PID" ]]; then
    kill "$API_PID" 2>/dev/null || true
    wait "$API_PID" 2>/dev/null || true
  fi
}

trap cleanup EXIT INT TERM

PORT="$API_PORT" npm run api &
API_PID=$!

echo "Waiting for API on ${API_BASE} ..."
for _ in $(seq 1 50); do
  if curl -sf "${API_BASE}/api/health" >/dev/null 2>&1; then
    echo "API ready."
    break
  fi
  sleep 0.2
done

if ! curl -sf "${API_BASE}/api/health" >/dev/null 2>&1; then
  echo "API did not start in time. Check logs above." >&2
  exit 1
fi

VITE_API_BASE="$API_BASE" npm run dev

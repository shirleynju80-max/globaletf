#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

API_PID=""

cleanup() {
  if [[ -n "$API_PID" ]]; then
    kill "$API_PID" 2>/dev/null || true
    wait "$API_PID" 2>/dev/null || true
  fi
}

trap cleanup EXIT INT TERM

npm run api &
API_PID=$!

echo "Waiting for API on http://127.0.0.1:8787 ..."
for _ in $(seq 1 50); do
  if curl -sf http://127.0.0.1:8787/api/health >/dev/null 2>&1; then
    echo "API ready."
    break
  fi
  sleep 0.2
done

if ! curl -sf http://127.0.0.1:8787/api/health >/dev/null 2>&1; then
  echo "API did not start in time. Check logs above." >&2
  exit 1
fi

npm run dev

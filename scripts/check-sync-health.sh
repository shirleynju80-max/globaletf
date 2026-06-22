#!/usr/bin/env bash
# Check sync_status + run acceptance. Exit 1 on failure; optional webhook notify.
# Usage:
#   bash scripts/check-sync-health.sh
#   NOTIFY_WEBHOOK_URL=https://... NOTIFY_WEBHOOK_FORMAT=wecom bash scripts/check-sync-health.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

mkdir -p logs
DATABASE_PATH="${DATABASE_PATH:-$ROOT/data/etflimit.sqlite}"
NOTIFY_WEBHOOK_URL="${NOTIFY_WEBHOOK_URL:-}"
NOTIFY_WEBHOOK_FORMAT="${NOTIFY_WEBHOOK_FORMAT:-json}"
LOG="logs/health-check.log"
TS="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"

FAIL=0
DETAILS=()

if [ ! -f "$DATABASE_PATH" ]; then
  DETAILS+=("database missing: $DATABASE_PATH")
  FAIL=1
else
  while IFS= read -r line; do
    [ -n "$line" ] || continue
    DETAILS+=("sync_status error: $line")
    FAIL=1
  done < <(sqlite3 "$DATABASE_PATH" \
    "SELECT area || ' | ' || coalesce(source,'') || ' | ' || coalesce(message,'') FROM sync_status WHERE status = 'error';" 2>/dev/null || true)

  while IFS= read -r line; do
    [ -n "$line" ] || continue
    DETAILS+=("sync_status fallback: $line")
  done < <(sqlite3 "$DATABASE_PATH" \
    "SELECT area || ' | ' || coalesce(source,'') || ' | ' || coalesce(message,'') FROM sync_status WHERE status = 'fallback';" 2>/dev/null || true)
fi

{
  echo "=== health-check start $TS ==="
  if [ "$FAIL" -eq 0 ]; then
    npm run acceptance
  else
    echo "skip acceptance: sync_status already failing"
    exit 1
  fi
  echo "=== health-check ok $(date -u +"%Y-%m-%dT%H:%M:%SZ") ==="
} >>"$LOG" 2>&1 || FAIL=1

if [ "$FAIL" -eq 1 ]; then
  SUMMARY="globaletf health check failed at $TS"
  for line in "${DETAILS[@]}"; do
    SUMMARY+=$'\n'"$line"
  done
  if [ -s "$LOG" ]; then
    SUMMARY+=$'\n'"tail: $(tail -3 "$LOG" | tr '\n' ' ')"
  fi

  printf '%s\n' "$SUMMARY"

  if [ -n "$NOTIFY_WEBHOOK_URL" ]; then
    if [ "$NOTIFY_WEBHOOK_FORMAT" = "wecom" ]; then
      PAYLOAD="$(SUMMARY="$SUMMARY" python3 -c 'import json,os; print(json.dumps({"msgtype":"text","text":{"content":os.environ["SUMMARY"]}}))')"
    else
      PAYLOAD="$(SUMMARY="$SUMMARY" python3 -c 'import json,os; print(json.dumps({"text":os.environ["SUMMARY"]}))')"
    fi
    curl -fsS -X POST "$NOTIFY_WEBHOOK_URL" -H "Content-Type: application/json" -d "$PAYLOAD" >>"$LOG" 2>&1 || true
  fi

  exit 1
fi

echo "sync health ok"

#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

mkdir -p logs
LOG="logs/limits-sync.log"
TS="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"

{
  echo "=== limits-sync start $TS ==="
  npm run sync:limits
  echo "=== limits-sync ok $(date -u +"%Y-%m-%dT%H:%M:%SZ") ==="
} >>"$LOG" 2>&1

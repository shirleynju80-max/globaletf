# Data sync and acceptance

## Commands

| Command | What it updates |
|---------|-----------------|
| `npm run sync:daily` | Funds, quotes, off-exchange limits/fees, holdings (full daily pass) |
| `npm run sync:quotes` | On-exchange quotes only |
| `npm run sync:limits` | Off-exchange purchase limits |
| `npm run sync:fees` | Off-exchange fee tiers |
| `npm run sync:holdings` | Quarterly holdings + stock-fund index |
| `npm run acceptance` | MVP gate — fails if snapshot is incomplete |

Database file: `data/etflimit.sqlite` (override with `DATABASE_PATH`).

## Recommended schedule (weekdays)

| Time (Beijing) | Command | Why |
|----------------|---------|-----|
| 08:30 | `sync:daily` + `acceptance` | After overnight fund data |
| 12:00 | `sync:limits` | Midday QDII limit announcements |
| 15:30 | `sync:limits` | Afternoon updates |

### Shell wrapper (logs to `logs/daily-sync.log`)

```sh
chmod +x scripts/daily-sync.sh
./scripts/daily-sync.sh
```

### macOS LaunchAgent

```sh
REPO="$(pwd)"
sed "s|ABSOLUTE_PATH_TO_REPO|$REPO|g" scripts/com.etflimit.daily-sync.plist.example > ~/Library/LaunchAgents/com.etflimit.daily-sync.plist
launchctl load ~/Library/LaunchAgents/com.etflimit.daily-sync.plist
```

Limits-only agent: `scripts/com.etflimit.limits-sync.plist.example` + `scripts/limits-sync.sh`.

### Linux cron（生产推荐 wrapper）

```cron
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
SHELL=/bin/bash
30 8 * * 1-5 /opt/globaletf/scripts/daily-sync.sh >> /var/log/globaletf-sync.log 2>&1
0 12 * * 1-5 /opt/globaletf/scripts/limits-sync.sh >> /var/log/globaletf-limits.log 2>&1
30 15 * * 1-5 /opt/globaletf/scripts/limits-sync.sh >> /var/log/globaletf-limits.log 2>&1
```

本地开发可直接：

```cron
30 8 * * 1-5 cd /path/to/etflimit && ./scripts/daily-sync.sh
0 12 * * 1-5 cd /path/to/etflimit && ./scripts/limits-sync.sh
```

## UI-driven refresh

While the index comparison page is open:

- `GET /api/live-premium/:targetCode` every **90s** (real-time premium)
- Status line: pending → timestamp (or unavailable on error)
- `POST /api/sync-limits/:targetCode` after **1 min**, then every **30 min**

These complement but do not replace scheduled `sync:daily` on the server.

## Acceptance

```sh
npm run sync:daily
npm run acceptance
```

Checks Nasdaq coverage, limits, fees, holdings surfaces, and sync audit tables. Run after deploy seed and after major sync changes.

## Health check and alerts

```sh
npm run health-check
```

Runs `acceptance` and fails if any `sync_status` row has `status = error`. Logs to `logs/health-check.log`.

Optional notification when the check fails:

```sh
NOTIFY_WEBHOOK_URL=https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=...
NOTIFY_WEBHOOK_FORMAT=wecom npm run health-check
```

Recommended after morning `sync:daily` (see [DEPLOY-ALIYUN.md](./DEPLOY-ALIYUN.md) cron example).

Web UI: **`/status`** shows `sync_status` for each data area (no push alerts).

## Troubleshooting tables

SQLite keeps audit rows:

- `sync_status` — per-area last run (fund, quote, purchaseLimit, fee, holding)
- `sync_runs` — daily run metadata
- `provider_results` — per-provider success/failure

Query locally:

```sh
sqlite3 data/etflimit.sqlite "SELECT area, status, data_date, updated_at FROM sync_status"
```

## Fund discovery

`sync:daily` verifies index-tagged funds against East Money F10 **跟踪标的 / 业绩比较基准**. Mismatches and excluded theme names (e.g. 汽车/科技 QDII) are set `enabled = 0` automatically. See `src/sync/trackingProfileSync.ts`.

## Data freshness notes

- **On-exchange premium**: IOPV alignment handles US close vs A-share session; see root README *Data Freshness*.
- **Off-exchange limits**: Merged from F10 + direct channels; may lag announcements by one sync cycle.
- **Stock holdings**: Quarterly report snapshots only — not real-time positions.

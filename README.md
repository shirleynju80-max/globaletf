# ETF Limit

Public web tool for comparing mainland China funds that track overseas indices and hold popular overseas stocks.

## Routes

- `/` — landing page with product overview
- `/indices` — index tracking (on-exchange premium/discount, off-exchange limits and fees)
- `/stocks` — stock holdings concentration from quarterly fund reports

## Commands

- `npm install`: install dependencies.
- `npm run build`: type-check and build the production UI into `dist/`.
- `npm run sync:daily`: write the latest available validated snapshots.
- `npm run acceptance`: check whether the local snapshot passes the first MVP acceptance gate.
- `npm run api`: start the local API at `http://127.0.0.1:8787`.
- `npm run dev`: start the Vite UI at `http://127.0.0.1:5173`.
- `npm test`: run unit and UI tests.

## Public deployment

The app has two parts:

1. **Static UI** (`dist/`) — can live on Cloudflare Pages, Vercel, or any static host.
2. **Node API + SQLite** (`src/api/server.ts`, `better-sqlite3`) — needs a small always-on host (Fly.io, Railway, VPS, etc.).

**Single-container option** (simplest):

```sh
npm run build
SERVE_STATIC=1 HOST=0.0.0.0 PORT=8787 npm run api
```

Or with Docker:

```sh
docker build -t etflimit .
docker run --rm -p 8787:8787 -v "$(pwd)/data:/app/data" etflimit
```

Set `VITE_API_BASE` only when the UI and API are on different origins. For same-origin deploys, leave it empty so the browser calls `/api/...`.

Schedule `npm run sync:daily` (and optionally `npm run sync:limits`) on the API host so public visitors see fresh data. See **Daily Scheduling** below.

For static-only hosting, copy `public/_redirects` so client-side routes (`/indices`, `/stocks`) resolve to `index.html`.

## Data Freshness

On-exchange ETF/LOF premium or discount is computed primarily against the real-time estimated reference NAV (IOPV / 实时估值). When the latest fundgz IOPV references a US close **newer** than the frozen A-share price (e.g. after A-shares close but before the next session), the tool **matches IOPV to the A-share trade date** (`gztime` at 04:00 Beijing on that session, reflecting the prior US close with timezone offset) instead of showing a misleading premium. The daily snapshot stores this matched IOPV for **昨日收盘折溢价** and related fields.

While the on-exchange comparison view is open, the UI **automatically refreshes live premium** in the background via `GET /api/live-premium/:targetCode` (same IOPV alignment logic as the snapshot). It fetches once on load, then every 90 seconds while the tab is visible; codes that still lack a live premium are retried after 5 seconds. The table shows **折溢价（实时）** and a **实时数据更新于** timestamp—no manual refresh control is needed.

Fund coverage per index is discovered automatically (East Money fund-code universe + ETF screener + F10 tracking-index verification + agency-channel search + share-class family expansion). A slim structural catalog (`src/domain/fundCatalog.ts`) only pins direct-channel I/F shares and cross-listed LOF parent links; anchor seed codes bias name search but do not guarantee breadth.

Off-exchange purchase limits are modeled by share class and sales channel (`channel_id` in SQLite). A/C use agency scope with union semantics (strictest limit wins across platforms; first row `eastmoney_aggregate`). I/F/E/Y/D/O use direct scope mapped to fund-company channels (e.g. Southern `nfjj` for 021000). Tracking index verification runs during live sync (`fund_tracking_profiles`) and is checked by acceptance.

## Daily Scheduling

Run the daily sync after mainland fund data is usually available, then run acceptance to catch stale or incomplete snapshots:

```sh
cd /Users/shuke-xl/Documents/etflimit
npm run sync:daily
npm run acceptance
```

Or use the bundled wrapper (appends to `logs/daily-sync.log`):

```sh
chmod +x scripts/daily-sync.sh
./scripts/daily-sync.sh
```

On macOS, install a user LaunchAgent from the example plist (edit `ABSOLUTE_PATH_TO_REPO` first):

```sh
REPO="$(pwd)"
sed "s|ABSOLUTE_PATH_TO_REPO|$REPO|g" scripts/com.etflimit.daily-sync.plist.example > ~/Library/LaunchAgents/com.etflimit.daily-sync.plist
launchctl load ~/Library/LaunchAgents/com.etflimit.daily-sync.plist
```

The agent runs `./scripts/daily-sync.sh` at 08:30 on weekdays. Logs land in `logs/daily-sync.log` and `logs/launchd-daily-sync.*.log`.

For intraday off-exchange limit updates (QDII announcements often land around midday), schedule limits-only sync at 12:00 and 15:30 on weekdays:

```sh
chmod +x scripts/limits-sync.sh
REPO="$(pwd)"
sed "s|ABSOLUTE_PATH_TO_REPO|$REPO|g" scripts/com.etflimit.limits-sync.plist.example > ~/Library/LaunchAgents/com.etflimit.limits-sync.plist
launchctl load ~/Library/LaunchAgents/com.etflimit.limits-sync.plist
```

Logs: `logs/limits-sync.log`. Cron equivalent:

```cron
0 12 * * 1-5 cd /path/to/etflimit && npm run sync:limits >> logs/limits-sync.log 2>&1
30 15 * * 1-5 cd /path/to/etflimit && npm run sync:limits >> logs/limits-sync.log 2>&1
```

While the index comparison view is open, the UI also triggers `POST /api/sync-limits/:targetCode` about one minute after load, then every 30 minutes, to re-scrape F10 and fund-company pages (no extra API keys required).

On Linux or other cron-based environments, use a cron entry with the project directory as the working directory:

```cron
30 8 * * 1-5 cd /Users/shuke-xl/Documents/etflimit && npm run sync:daily && npm run acceptance >> logs/daily-sync.log 2>&1
```

The sync records per-area status for fund discovery, quotes, purchase limits, fees, and holdings in SQLite (`sync_status`, `provider_results`).

For provider-level troubleshooting, the local SQLite database also keeps:

- `sync_runs`: one row per daily sync run, with completed or failed status.
- `provider_results`: each provider attempt by area, including success/failure, fetched time, data date, confidence, error category, message, and raw payload hash when available.

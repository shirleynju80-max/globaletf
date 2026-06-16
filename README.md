# ETF Limit

Local web tool for comparing mainland China funds that provide exposure to overseas indices and popular overseas stocks.

## Commands

- `npm install`: install dependencies.
- `npm run sync:daily`: write the latest available validated snapshots.
- `npm run acceptance`: check whether the local snapshot passes the first MVP acceptance gate.
- `npm run api`: start the local API at `http://127.0.0.1:8787`.
- `npm run dev`: start the Vite UI at `http://127.0.0.1:5173`.
- `npm test`: run unit and UI tests.

## Data Freshness

On-exchange ETF/LOF premium or discount is computed primarily against the real-time estimated reference NAV (IOPV / 实时估值). When the latest fundgz IOPV references a US close **newer** than the frozen A-share price (e.g. after A-shares close but before the next session), the tool **matches IOPV to the A-share trade date** (`gztime` at 04:00 Beijing on that session, reflecting the prior US close with timezone offset) instead of showing a misleading premium. The daily snapshot stores this matched IOPV; use the "实时刷新折溢价" button for on-demand live prices with the same logic.

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

On Linux or other cron-based environments, use a cron entry with the project directory as the working directory:

```cron
30 8 * * 1-5 cd /Users/shuke-xl/Documents/etflimit && npm run sync:daily && npm run acceptance >> logs/daily-sync.log 2>&1
```

The sync records per-area status for fund discovery, quotes, purchase limits, fees, and holdings. The UI status strip surfaces the provider, data date, row count, fallback state, error category, and last sync time.

For provider-level troubleshooting, the local SQLite database also keeps:

- `sync_runs`: one row per daily sync run, with completed or failed status.
- `provider_results`: each provider attempt by area, including success/failure, fetched time, data date, confidence, error category, message, and raw payload hash when available.

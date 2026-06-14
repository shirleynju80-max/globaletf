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

On-exchange ETF/LOF premium or discount data uses the previous trading day's closing premium or discount and is for reference only. The first release does not calculate intraday estimated NAV or real-time premium/discount.

Off-exchange purchase limits are modeled by share class. A and C classes usually share agency-channel limits; F classes usually represent direct-sale or special-channel products and may have higher limits.

## Daily Scheduling

Run the daily sync after mainland fund data is usually available, then run acceptance to catch stale or incomplete snapshots:

```sh
cd /Users/shuke-xl/Documents/etflimit
npm run sync:daily
npm run acceptance
```

On macOS, use `launchd` with a user LaunchAgent that runs the two commands above once per trading day. Keep logs under a local directory such as `logs/` so provider failures and fallback-source messages remain inspectable.

On Linux or other cron-based environments, use a cron entry with the project directory as the working directory:

```cron
30 8 * * 1-5 cd /Users/shuke-xl/Documents/etflimit && npm run sync:daily && npm run acceptance >> logs/daily-sync.log 2>&1
```

The sync records per-area status for fund discovery, quotes, purchase limits, fees, and holdings. The UI status strip surfaces the provider, data date, row count, fallback state, error category, and last sync time.

For provider-level troubleshooting, the local SQLite database also keeps:

- `sync_runs`: one row per daily sync run, with completed or failed status.
- `provider_results`: each provider attempt by area, including success/failure, data date, confidence, error category, message, and raw payload hash when available.

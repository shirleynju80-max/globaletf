# Architecture

## Runtime pieces

| Piece | Technology | Role |
|-------|------------|------|
| Web UI | React + Vite | Landing, index comparison, stock concentration |
| API | Express (`src/api/server.ts`) | JSON over HTTP for all clients |
| Database | SQLite (`data/etflimit.sqlite`) | Funds, quotes, limits, fees, holdings |
| Sync | `src/sync/` + `npm run sync:*` | Pull public data into SQLite |

Local development runs **two processes**:

```sh
npm run api    # :8787
npm run dev    # :5173
```

**Production** runs **Cloudflare Pages + Tunnel + Aliyun API**; see [DEPLOY-PAGES.md](./DEPLOY-PAGES.md) and [STATUS.md](./STATUS.md).  
Fly.io option B: [DEPLOY.md](./DEPLOY.md) (not in use).

## Your API routes

All paths are relative to the API origin (e.g. `https://api.yourdomain.com`).

| Method | Path | Used by UI | Purpose |
|--------|------|------------|---------|
| GET | `/api/health` | Ops / Fly check | Liveness |
| GET | `/api/targets` | Index + stock pages | Index and stock target list |
| GET | `/api/landing-stats` | Landing page | KPI labels (`4+` indices, `600+` stocks) |
| GET | `/api/index-comparison/:targetCode` | Index page | On/off-exchange comparison rows |
| GET | `/api/live-premium/:targetCode` | Index page | Real-time premium (hits East Money live) |
| POST | `/api/sync-limits/:targetCode` | Index page (background) | Refresh off-exchange limits |
| GET | `/api/stock-concentration/:stockCode` | Stock page | Holdings concentration ranking |
| GET | `/api/status` | — | Sync status map |
| GET | `/api/discovery-health/:targetCode` | — | Fund discovery coverage |

Client wrapper: `src/api/client.ts`.

## External data (not your API)

Sync and live-premium providers fetch **public** East Money pages/APIs and fund-company sites — no paid API keys. Main families:

- `fund.eastmoney.com` — fund universe search
- `fundf10.eastmoney.com` — limits, fees, quarterly holdings (jjfl / jjcc)
- `push2.eastmoney.com`, `push2his.eastmoney.com` — quotes, IOPV, klines
- Fund company sites / announcements — direct-channel limits

Implementations: `src/providers/`.

## Data flow (index page)

```
User opens /indices
  → GET /api/index-comparison/NASDAQ_100     (SQLite snapshot)
  → GET /api/live-premium/NASDAQ_100         (live quotes + IOPV alignment, every 90s)
  → POST /api/sync-limits/NASDAQ_100         (after 1 min, then every 30 min)
```

UI shows live status:「实时数据更新中...」→「实时数据更新于 HH:MM:SS」.  
Off-exchange-only data updates do **not** restart the live-premium poll (`IndexPage` depends on `onExchange.length`, not full `data`).

Index targets in `INDEX_TARGETS_PENDING_UNTIL_FUNDS` (e.g. `KOSPI`) stay disabled until funds exist — see `src/domain/indexTargetAvailability.ts`.

## Repo layout (high signal)

```
src/
  pages/          LandingPage, IndexPage, StockPage
  api/            Express server + browser client
  db/             SQLite schema + queries
  sync/           Daily sync orchestration
  providers/      East Money and channel scrapers
  domain/         Business rules (fees, limits, dedupe)
public/_redirects SPA fallback for static hosts
fly.toml          Fly.io API deploy (option B)
Dockerfile.api    API-only image
```

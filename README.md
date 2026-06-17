# globaletf

Public web tool for comparing mainland China funds that track overseas indices and hold popular overseas stocks.

| Route | Page |
|-------|------|
| `/` | Landing |
| `/indices` | Index tracking — premium/discount, limits, fees |
| `/stocks` | Stock holdings concentration (quarterly reports) |

## Local development

```sh
npm install
npm run dev:all       # API + UI together (recommended)
```

Or run separately:

```sh
npm run api          # API → http://127.0.0.1:8787
npm run dev          # UI  → http://127.0.0.1:5173
```

```sh
npm test             # unit + UI tests
npm run build        # production UI → dist/
npm run sync:daily   # refresh SQLite snapshot
npm run acceptance   # MVP data gate
```

## Documentation

Full docs index: **[docs/README.md](./docs/README.md)**

| Topic | Doc |
|-------|-----|
| **Production deploy (option B)** | [docs/DEPLOY.md](./docs/DEPLOY.md) — Cloudflare Pages + Fly.io API |
| Architecture & API list | [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) |
| Sync scheduling | [docs/DATA-SYNC.md](./docs/DATA-SYNC.md) |
| WeChat mini-program later | [docs/MINIPROGRAM.md](./docs/MINIPROGRAM.md) |

## Production (option B — recommended)

- **Web**: `www.yourdomain.com` — static `dist/` on Cloudflare Pages  
- **API**: `api.yourdomain.com` — Fly.io + `Dockerfile.api` + SQLite volume  
- **Build**: set `VITE_API_BASE=https://api.yourdomain.com` (see `.env.production.example`)

```sh
fly deploy                    # API (see fly.toml)
# Pages: connect repo, build command `npm ci && npm run build`, output `dist`
```

Step-by-step: [docs/DEPLOY.md](./docs/DEPLOY.md).

## Monolith (option A)

Single host for demos only — not ideal if you plan a mini-program:

```sh
npm run build
SERVE_STATIC=1 HOST=0.0.0.0 PORT=8787 npm run api
# or: docker build -t etflimit . && docker run -p 8787:8787 -v $(pwd)/data:/app/data etflimit
```

## Data freshness (summary)

- On-exchange **实时折溢价**: background `GET /api/live-premium/...` every 90s while the index page is open; IOPV aligned to A-share session rules.
- Off-exchange limits/fees: daily `sync:daily` plus optional `sync:limits`; UI may POST `/api/sync-limits/...` while the page is open.
- Stock weights: quarterly fund reports only — not live holdings.

Details: [docs/DATA-SYNC.md](./docs/DATA-SYNC.md).

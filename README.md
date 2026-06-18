# globaletf

Public web tool for comparing mainland China funds that track overseas indices and hold popular overseas stocks.

**Current snapshot (features, KPIs, known limits): [docs/STATUS.md](./docs/STATUS.md)**（中文，2026-06-18）

| Route | Page |
|-------|------|
| `/` | Landing — previews + KPIs (`4+` indices, `600+` stocks) |
| `/indices` | Index tracking — live premium/discount, limits, fees |
| `/stocks` | Stock holdings concentration (quarterly reports) |

## Local development

```sh
npm install
npm run dev:all       # API + UI together (recommended)
```

Or run separately:

```sh
npm run api          # API → http://127.0.0.1:8787
npm run dev          # UI  → http://localhost:5173
```

```sh
npm test             # unit + UI tests (270+)
npm run build        # production UI → dist/
npm run sync:daily   # refresh SQLite snapshot
npm run acceptance   # MVP data gate
```

## Documentation

Full docs index: **[docs/README.md](./docs/README.md)** · **状态收拢: [docs/STATUS.md](./docs/STATUS.md)**

| Topic | Doc |
|-------|-----|
| **Current state** | [docs/STATUS.md](./docs/STATUS.md) |
| **Production deploy (Aliyun)** | [docs/DEPLOY-ALIYUN.md](./docs/DEPLOY-ALIYUN.md) |
| Production deploy (CF + Fly) | [docs/DEPLOY.md](./docs/DEPLOY.md) |
| Architecture & API list | [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) |
| Sync scheduling | [docs/DATA-SYNC.md](./docs/DATA-SYNC.md) |
| WeChat mini-program later | [docs/MINIPROGRAM.md](./docs/MINIPROGRAM.md) |

## Production

| 方案 | 说明 |
|------|------|
| **[阿里云（推荐先跑通）](./docs/DEPLOY-ALIYUN.md)** | 香港轻量/ECS + Docker 单体，`docker-compose.aliyun.yml` |
| [Option B — CF Pages + Fly](./docs/DEPLOY.md) | 静态站 + 独立 API |
| [Monolith (option A)](#monolith-option-a) | 单机演示，`SERVE_STATIC=1` |

## Monolith (option A)

Single host for demos only — not ideal if you plan a mini-program:

```sh
npm run build
SERVE_STATIC=1 HOST=0.0.0.0 PORT=8787 npm run api
# or: docker build -t etflimit . && docker run -p 8787:8787 -v $(pwd)/data:/app/data etflimit
```

## Data freshness (summary)

- On-exchange **实时折溢价**: `GET /api/live-premium/...` every **90s** on the index page; UI shows「更新中…」then「实时数据更新于 HH:MM:SS」.
- Off-exchange limits/fees: daily `sync:daily` plus optional `sync:limits`; UI may POST `/api/sync-limits/...` while the page is open.
- Stock weights: quarterly fund reports only — not live holdings.
- Index tabs: **KOSPI** stays disabled until tracked funds exist in SQLite.

Details: [docs/DATA-SYNC.md](./docs/DATA-SYNC.md).

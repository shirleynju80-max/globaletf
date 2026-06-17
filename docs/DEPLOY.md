# Production deployment (option B)

Split hosting: **static web** on `www.yourdomain.com`, **API** on `api.yourdomain.com`.  
Same layout works for a future WeChat mini-program (it only needs the API origin).

```
                    ┌─────────────────────────┐
  Browser / 小程序   │  https://api.xxx.com    │
        ───────────►│  Express + SQLite       │
                    │  npm run sync:daily     │
                    └───────────▲─────────────┘
                                │ fetch JSON
                    ┌───────────┴─────────────┐
  Web users         │  https://www.xxx.com    │
        ───────────►│  Cloudflare Pages (dist) │
                    └─────────────────────────┘
```

## Prerequisites

- Domain with DNS access (two hostnames: `www` + `api`)
- **ICP 备案** if you target mainland China users or plan a WeChat mini-program
- GitHub (or GitLab) repo pushed to a remote — for Pages CI

Replace `yourdomain.com` below with your real domain.

### No custom domain yet?

You can still ship option B with free subdomains:

| Piece | Default URL | Build / config |
|-------|-------------|----------------|
| API | `https://<app-name>.fly.dev` | `fly deploy` — no `fly certs add` needed |
| Web | `https://<project>.pages.dev` | Set `VITE_API_BASE=https://<app-name>.fly.dev` |

Add a custom domain later without changing the architecture. Mainland WeChat mini-program and ICP 备案 still need your own domain when you get there.

---

## 1. API on Fly.io

### First-time setup

```sh
# Install flyctl: https://fly.io/docs/hands-on/install-flyctl/
fly auth login
fly apps create etflimit-api   # or edit fly.toml `app` name
fly volumes create etflimit_data --region hkg --size 1
fly deploy
```

`fly.toml` uses `Dockerfile.api` (API only, no static files). SQLite lives on the mounted volume at `/app/data/etflimit.sqlite`.

### Custom domain

```sh
fly certs add api.yourdomain.com
```

Add the DNS record Fly prints (usually CNAME `api` → `etflimit-api.fly.dev`).

### Seed and refresh data (on the API machine)

```sh
fly ssh console
cd /app
npm run sync:daily
npm run acceptance
exit
```

### Scheduled sync (Fly cron or external)

**Option A — Fly Machines schedule** (if enabled on your plan) or a small cron elsewhere that SSHes in.

**Option B — cron on any always-on host** hitting the repo:

```cron
30 8 * * 1-5 cd /path/to/etflimit && npm run sync:daily && npm run acceptance >> logs/daily-sync.log 2>&1
0 12 * * 1-5 cd /path/to/etflimit && npm run sync:limits >> logs/limits-sync.log 2>&1
30 15 * * 1-5 cd /path/to/etflimit && npm run sync:limits >> logs/limits-sync.log 2>&1
```

See [DATA-SYNC.md](./DATA-SYNC.md) for what each job does.

### Health check

`GET https://api.yourdomain.com/api/health` → `{"ok":true}`

---

## 2. Web on Cloudflare Pages

### Build settings (dashboard)

| Setting | Value |
|---------|--------|
| Framework | None / Vite |
| Build command | `npm ci && npm run build` |
| Build output | `dist` |
| Root directory | `/` |

### Environment variable (required for option B)

| Name | Example |
|------|---------|
| `VITE_API_BASE` | `https://api.yourdomain.com` |

No trailing slash. This is baked in at **build time** — change it → rebuild and redeploy Pages.

### Custom domain

Pages → Custom domains → `www.yourdomain.com` (or apex `yourdomain.com`).

### SPA routing

`public/_redirects` is copied into `dist/`:

```
/*    /index.html   200
```

So `/indices` and `/stocks` work on refresh.

### Local production build test

```sh
cp .env.production.example .env.production
# edit VITE_API_BASE
export $(grep -v '^#' .env.production | xargs) && npm run build
npx vite preview
```

---

## 3. Verify end-to-end

1. `curl https://api.yourdomain.com/api/health`
2. `curl https://api.yourdomain.com/api/targets`
3. Open `https://www.yourdomain.com/indices` — tables load (not empty forever)
4. DevTools → Network: requests go to `api.yourdomain.com`, not `127.0.0.1`

CORS is already `Access-Control-Allow-Origin: *` on the API.

---

## 4. Alternative hosts

| Piece | Alternatives |
|-------|----------------|
| API | Railway, Render, VPS + `Dockerfile.api`, `npm run start:api` |
| Web | Vercel, Netlify, OSS + CDN — same `VITE_API_BASE` rule |

---

## Option A (single container, not recommended for mini-program)

For local demos or a quick single-box deploy, see the **Monolith** section in the root [README](../README.md#monolith-option-a). Production with a future mini-program should stay on **option B**.

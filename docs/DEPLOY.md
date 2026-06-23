# Production deployment (option B — 备选，未使用)

> **当前生产** 为阿里云 API + Cloudflare Pages + Tunnel，见 [STATUS.md](./STATUS.md) 与 [DEPLOY-PAGES.md](./DEPLOY-PAGES.md)。  
> 本文档保留 Fly.io 方案供参考。

Split hosting: **static web** on Cloudflare Pages, **API** on Fly.io (Hong Kong).  
Same layout works for a future WeChat mini-program (it only needs the API origin).

## Quick launch (no custom domain)

```sh
# 1. API (Hong Kong)
bash scripts/deploy-api.sh
fly ssh console -a globaletf-api -C "npm run sync:daily"

# 2. Web — Cloudflare Dashboard → Pages → Create project → Connect Git
#    Build: npm ci && npm run build
#    Output: dist
#    Env:   VITE_API_BASE=https://globaletf-api.fly.dev

# 3. Verify
curl https://globaletf-api.fly.dev/api/health
# Open https://<your-project>.pages.dev/indices
```

Or use GitHub Actions [`.github/workflows/deploy-pages.yml`](../.github/workflows/deploy-pages.yml) after setting `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, and `VITE_API_BASE`.

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
| API | `https://globaletf-api.fly.dev` | `bash scripts/deploy-api.sh` |
| Web | `https://globaletf.pages.dev` | `VITE_API_BASE=https://globaletf-api.fly.dev` |

Add a custom domain later without changing the architecture. Mainland WeChat mini-program and ICP 备案 still need your own domain when you get there.

---

## 1. API on Fly.io

### First-time setup

```sh
fly auth login
bash scripts/deploy-api.sh
```

`fly.toml` app name: `globaletf-api`, region: `hkg`, volume: `globaletf_data`.  
`Dockerfile.api` runs API only. SQLite on `/app/data/etflimit.sqlite`.

### Custom domain

```sh
fly certs add api.yourdomain.com
```

Add the DNS record Fly prints (usually CNAME `api` → `globaletf-api.fly.dev`).

### Seed and refresh data (on the API machine)

```sh
fly ssh console -a globaletf-api -C "npm run sync:daily"
fly ssh console -a globaletf-api -C "npm run acceptance"
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

---

## Mainland China access (已做 / 现实预期)

**已内置的优化：**

| 层 | 措施 |
|----|------|
| API | Fly **香港 (hkg)** 机房，比美欧更近 |
| API | **gzip** 压缩 JSON |
| API | 只读接口 **Cache-Control**（指数对比 60s、持仓 5min） |
| 网页 | Cloudflare Pages 边缘 CDN + `/_headers` 长缓存静态资源 |
| 网页 | 构建时 **dns-prefetch / preconnect** 到 API 域名 |

**现实预期（无 ICP 备案）：**

- 大陆用户访问 `*.fly.dev` / `*.pages.dev` 走国际线路，**比本地慢，但通常可用**
- 无法保证全国各省都稳定极速；晚高峰可能波动
- 要明显加速大陆访问，需要 **备案 + 国内/香港云**（阿里云香港、腾讯云等），属于下一阶段

**备案后的路径：** API 迁香港云主机或国内节点 + 自有域名 + 可选国内 CDN。

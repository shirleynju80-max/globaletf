# Cloudflare Pages（备案期间临时上线）

备案完成前，用 **https://globaletf.pages.dev** 访问；API 经同域 `/api/*` 代理到大陆服务器，避免 HTTPS 页面请求 HTTP API 被浏览器拦截。

## 架构

```
浏览器 → https://globaletf.pages.dev
              ├─ /, /indices, /stocks   静态 dist/
              └─ /api/*                 Pages Function → http://8.147.67.18/api/*
```

构建时 **不设置** `VITE_API_BASE`（同域访问 API）。

备案通过后可将 `globaletf.store` 指回大陆机器，或继续用 Pages + 代理。

---

## 一次性配置（Cloudflare Dashboard）

1. [Cloudflare Dashboard](https://dash.cloudflare.com/) → **Workers & Pages** → **Create** → **Pages** → Connect Git  
   仓库：`shirleynju80-max/globaletf`，分支 `main`

2. **Build settings**

   | 项 | 值 |
   |----|-----|
   | Build command | `npm ci && npm run build` |
   | Build output | `dist` |
   | Root | `/` |

3. **Environment variables**（Production，可选 — 代码里已有默认 IP）

   | Name | Value |
   |------|--------|
   | `API_RESOLVE_IP` | `8.147.67.18` |
   | `API_ORIGIN_HOST` | `8.147.67.18` |

   > 不要用 `API_ORIGIN=http://IP`（Cloudflare 会报 **1003**）。代理通过 `resolveOverride` 连大陆服务器。

4. **不要** 设置 `VITE_API_BASE`（留空 = 同域 `/api`）。

5. GitHub Actions（可选）：仓库 Secrets  
   - `CLOUDFLARE_API_TOKEN`  
   - `CLOUDFLARE_ACCOUNT_ID`  
   推送 `main` 后 `.github/workflows/deploy-pages.yml` 自动部署。

---

## 本地手动部署

```sh
npm ci
npm run build
npx wrangler login
npx wrangler pages deploy dist --project-name=globaletf
```

---

## 验证

```sh
curl https://globaletf.pages.dev/api/health
```

应返回 `{"ok":true}`。浏览器打开：

- https://globaletf.pages.dev/
- https://globaletf.pages.dev/indices

---

## 备案通过后

1. ICP 审核通过 → `globaletf.store` 解析大陆 IP 不再拦截  
2. 服务器上执行 HTTPS：`CERTBOT_EMAIL=... bash scripts/aliyun-enable-https.sh`  
3. 可选：停用 Pages，或保留 Pages 作备用入口  

若改回纯域名托管，构建仍不需要 `VITE_API_BASE`（同机同域）。

---

## 注意

- 大陆服务器 IP 需对公网开放 **80**（API 经 Nginx → 8787）。  
- `POST /api/sync-limits` 可能较慢，受 Cloudflare 代理超时限制。  
- `API_ORIGIN` 变更后需在 Cloudflare Pages 环境变量中同步更新。

# WeChat mini-program (future)

The web UI and a mini-program should **share the same API** on `https://api.yourdomain.com`.  
Deploy with [option B](./DEPLOY.md) so the API origin is stable before building a小程序.

## What you reuse

| Reuse | Notes |
|-------|--------|
| All `/api/*` routes | Same JSON as the website |
| `npm run sync:*` on API host | Data layer unchanged |
| SQLite on API server | Mini-program never touches the DB directly |

## What you rebuild

| New work | Notes |
|----------|--------|
| Mini-program UI | WeChat native, uni-app, or Taro — new frontend |
| WeChat admin setup | 小程序 AppID, request 合法域名 = `api.yourdomain.com` |
| ICP 备案 | Required for mainland legal domain on WeChat |

## WeChat configuration checklist

1. Register mini-program → obtain AppID
2. **开发 → 开发管理 → 服务器域名** → add `https://api.yourdomain.com`
3. Ensure API uses **HTTPS** with a valid certificate (Fly/custom domain provides this)
4. Call the same endpoints as `src/api/client.ts`, e.g.:
   - `wx.request({ url: 'https://api.yourdomain.com/api/index-comparison/NASDAQ_100' })`

## API considerations before public小程序

- **Rate limiting** — live-premium and sync-limits are expensive; add limits per IP/openid later
- **Auth (optional)** — public read-only may be fine for MVP; add tokens if abused
- **Versioning** — consider `/api/v1/...` before breaking changes

## Suggested client mapping

| Screen | API |
|--------|-----|
| 指数列表 | `GET /api/targets` (filter `type === 'index'`) |
| 同指数对比 | `GET /api/index-comparison/:code` + `GET /api/live-premium/:code` |
| 股票持仓 | `GET /api/stock-concentration/:code` |

No code changes are required on the server to start a小程序 POC — only deploy option B and a filled SQLite from `sync:daily`.

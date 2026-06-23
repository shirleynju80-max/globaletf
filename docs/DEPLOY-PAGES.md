# Cloudflare Pages 生产部署

公网主站：**https://globaletf.pages.dev**  
API 经 **Cloudflare Tunnel** 连阿里云（绕过大陆 ICP 拦截与 Workers 直连 IP 限制）。

## 架构

```
浏览器 → https://globaletf.pages.dev
              ├─ /, /indices, /stocks, /status   静态 dist/
              └─ /api/*                          Pages Function
                                                      ↓
                                            https://api.globaletf.store
                                                      ↓
                                    cloudflared（阿里云 systemd）
                                                      ↓
                                            http://127.0.0.1:80
```

构建时 **不设置** `VITE_API_BASE`（同源 `/api` 由 Function 代理）。

---

## 当前配置

| 项 | 值 |
|----|-----|
| Pages 项目 | `globaletf` |
| 公网 URL | https://globaletf.pages.dev |
| Git | `shirleynju80-max/globaletf` → `main` |
| Build | `npm ci && npm run build` |
| Output | `dist` |
| API 上游 | `API_ORIGIN=https://api.globaletf.store`（[`wrangler.toml`](../wrangler.toml)） |
| Tunnel | Zero Trust → `globaletf-api` |
| Tunnel 路由 | `api.globaletf.store` → `http://127.0.0.1:80` |
| 域名 NS | Cloudflare（`elle.ns.cloudflare.com` / `fonzie.ns.cloudflare.com`） |

验证：

```sh
curl https://globaletf.pages.dev/api/health
curl https://api.globaletf.store/api/health
```

均应返回 `{"ok":true}`。

---

## 更新前端

**自动（推荐）：** push 到 `main`，Pages 从 GitHub 构建部署。

**手动：**

```sh
npm ci && npm run build
npx wrangler pages deploy dist --project-name=globaletf --branch=main
```

`wrangler.toml` 中的 `[vars] API_ORIGIN` 会随部署带入 Functions。

---

## Tunnel 运维

Connector 在阿里云以 systemd 运行：

```sh
systemctl status cloudflared
journalctl -u cloudflared -n 50 --no-pager
```

重装或换 token：

```sh
CLOUDFLARE_TUNNEL_TOKEN=eyJ... bash /opt/globaletf/scripts/aliyun-cloudflared-install.sh
```

Token 来源：Zero Trust → Networks → Tunnels → `globaletf-api` → Add connector。

服务器 API 本机检查：

```sh
curl http://127.0.0.1:80/api/health
```

---

## DNS（Cloudflare）

域名 `globaletf.store` 已在 Cloudflare **Active**。关键记录：

| 名称 | 类型 | 内容 | 说明 |
|------|------|------|------|
| `@` | A | `47.100.5.7` | 根域名（备案通过后可用） |
| `www` | A | `47.100.5.7` | |
| `api` | Tunnel | `globaletf-api` | 由 Zero Trust 管理，勿手改 |

> NS 必须在 Cloudflare，仅阿里云 CNAME 到 `cfargotunnel.com` **不够**（公网无 IPv4 A 记录）。

---

## 故障排查

| 现象 | 处理 |
|------|------|
| Pages 有页面、无数据 | 查 `wrangler.toml` 的 `API_ORIGIN`；重新 `pages deploy` |
| `/api/health` 1003 | 未走 Tunnel，仍在直连 IP；确认 `API_ORIGIN` 为 `https://api.globaletf.store` |
| Tunnel INACTIVE | 服务器执行 `systemctl status cloudflared`；重装 connector |
| `api.globaletf.store` 本机 curl 失败 | 关 Clash/Surge fake-ip，或换网络/浏览器测 |
| 改 env 后仍旧行为 | Pages 需 **重新部署** 才生效 |

---

## 备案通过后（可选）

1. 宝塔/Nginx 为 `globaletf.store` 配置 HTTPS → 见 [DEPLOY-ALIYUN.md](./DEPLOY-ALIYUN.md)
2. Pages → Custom domains → 添加 `globaletf.store`
3. 可保留 Tunnel + Pages 架构，或改为纯阿里云托管

---

## 相关文件

| 文件 | 用途 |
|------|------|
| [`wrangler.toml`](../wrangler.toml) | Pages 项目 + `API_ORIGIN` |
| [`functions/api/proxy.ts`](../functions/api/proxy.ts) | `/api/*` 代理逻辑 |
| [`scripts/aliyun-cloudflared-install.sh`](../scripts/aliyun-cloudflared-install.sh) | 服务器安装 cloudflared |
| [`.github/workflows/deploy-pages.yml`](../.github/workflows/deploy-pages.yml) | CI 部署（若启用） |

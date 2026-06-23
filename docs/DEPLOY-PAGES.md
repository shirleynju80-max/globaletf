# Cloudflare Pages（备案期间临时上线）

备案完成前，用 **https://globaletf.pages.dev** 访问。API 经 **Cloudflare Tunnel** 连大陆服务器（绕过 ICP 拦截与 Workers 直连 IP 限制）。

## 架构

```
浏览器 → https://globaletf.pages.dev
              ├─ /, /indices, /stocks     静态 dist/
              └─ /api/*                   Pages Function
                                              ↓
                                    https://api.globaletf.store  (Tunnel)
                                              ↓
                              阿里云 127.0.0.1:8787  (cloudflared 出站)
```

构建时 **不设置** `VITE_API_BASE`。

---

## 第一步：Pages 已部署 ✓

项目 `globaletf` → **https://globaletf.pages.dev**

---

## 第二步：Cloudflare Tunnel（必做，否则 /api 无数据）

大陆 IP / sslip **不能** 给 Pages Function 直连（1003 或备案拦截）。要在服务器跑 **cloudflared**，用 Tunnel 域名暴露 API。

### 2.1 把域名加到 Cloudflare（若尚未添加）

1. [Cloudflare Dashboard](https://dash.cloudflare.com/) → **Add a site** → `globaletf.store`
2. 按提示改域名 NS 到 Cloudflare，或仅添加 DNS 记录（若 NS 仍在阿里云，Tunnel 公网 hostname 需 NS 在 CF）

> Tunnel 子域 `api.globaletf.store` 的 CNAME 由 Cloudflare 自动管理，**不会**触发大陆 ICP 80 端口拦截。

### 2.2 创建 Tunnel

1. [Cloudflare Zero Trust](https://one.dash.cloudflare.com/) → **Networks** → **Tunnels** → **Create**
2. 类型 **Cloudflared**，名称 `globaletf-api`
3. **Public Hostname**：
   - Subdomain: `api`
   - Domain: `globaletf.store`
   - Service: `http://127.0.0.1:8787`
4. 复制 **Install command** 里的 token（`eyJ...`）

### 2.3 在阿里云服务器安装 connector

SSH 登录后：

```sh
bash /opt/globaletf/scripts/aliyun-cloudflared-install.sh
# 若未装 cloudflared，脚本会下载

CLOUDFLARE_TUNNEL_TOKEN=eyJ... bash /opt/globaletf/scripts/aliyun-cloudflared-install.sh
```

验证：

```sh
curl https://api.globaletf.store/api/health
```

应返回 `{"ok":true}`。

### 2.4 Pages 环境变量

Cloudflare → **Workers & Pages** → **globaletf** → **Settings** → **Environment variables** → Production：

| Name | Value |
|------|--------|
| **`API_ORIGIN`** | **`https://api.globaletf.store`** |

删除旧的 `API_ORIGIN_HOST` / `API_UPSTREAM_HOST`（如有）。

**Save** → **Retry deployment**（或 push 任意 commit 触发 rebuild）。

---

## 验证

```sh
curl https://globaletf.pages.dev/api/health
curl https://globaletf.pages.dev/api/targets
```

浏览器：

- https://globaletf.pages.dev/
- https://globaletf.pages.dev/indices

---

## 构建设置（参考）

| 项 | 值 |
|----|-----|
| Build command | `npm ci && npm run build` |
| Build output | `dist` |
| `VITE_API_BASE` | **留空** |

---

## 备案通过后

1. ICP 通过 → `globaletf.store` 可解析大陆 IP  
2. 可选：停用 Tunnel，Pages 改 `API_ORIGIN` 或改回纯阿里云 + HTTPS  
3. 或保留 Pages 作 CDN 前端，API 仍走 Tunnel / 大陆机  

---

## 故障排查

| 现象 | 处理 |
|------|------|
| `/api/health` 返回 1003 | 未设 `API_ORIGIN=https://...`，仍在直连 IP |
| 返回备案 HTML | 未走 Tunnel；检查 `api.globaletf.store` 是否 CNAME 到 tunnel |
| Tunnel 不通 | `systemctl status cloudflared`；8787 本机 `curl http://127.0.0.1:8787/api/health` |
| 页面有、数据空 | Pages 环境变量改后需 **重新部署** |

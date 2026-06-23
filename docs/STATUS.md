# 当前状态

仓库：[github.com/shirleynju80-max/globaletf](https://github.com/shirleynju80-max/globaletf) · 分支 `main`  
**最后更新：** 2026-06-23

## 产品

**globaletf** — 跨境基金公开数据：同指数产品对比 + 季报持仓浓度。

| 路由 | 页面 |
|------|------|
| `/` | 首页（KPI + 预览） |
| `/indices` | 指数跟踪（实时折溢价、场外限购/费率） |
| `/stocks` | 股票持仓（季报权重，非实时） |
| `/status` | 数据同步状态 |

## 生产环境（已上线）

### 公网访问

| 入口 | 地址 | 状态 |
|------|------|------|
| **主站（推荐）** | https://globaletf.pages.dev | ✅ |
| API（Tunnel） | https://api.globaletf.store/api/health | ✅ |
| 服务器 IP | http://47.100.5.7/ | ✅ |
| 根域名 | https://globaletf.store | ⏳ ICP 备案通过后可用 |

### 架构

```
浏览器 → globaletf.pages.dev（Cloudflare Pages）
              ├─ /, /indices, /stocks     静态 dist/
              └─ /api/*                   Pages Function
                                              ↓
                                    api.globaletf.store（Tunnel）
                                              ↓
                              阿里云 47.100.5.7 · globaletf.service :80
                                              ↓
                              SQLite /opt/globaletf/data/etflimit.sqlite
```

### 组件

| 组件 | 详情 |
|------|------|
| 前端 | Cloudflare Pages 项目 `globaletf`，GitHub `main` 自动构建 |
| API 代理 | `wrangler.toml` → `API_ORIGIN=https://api.globaletf.store` |
| Tunnel | Zero Trust `globaletf-api`，connector 在阿里云 `systemd cloudflared` |
| 域名 DNS | NS 在 Cloudflare（`elle` / `fonzie`）；`@`/`www` → `47.100.5.7`；`api` → Tunnel |
| 服务器 | 阿里云 ECS `47.100.5.7`，宝塔 Linux 11.1.0 |
| 应用 | `globaletf.service`，`PORT=80`，`SERVE_STATIC=1` |
| 代码路径 | `/opt/globaletf` |
| 定时同步 | cron：`daily-sync.sh` 08:30，`limits-sync.sh` 12:00 / 15:30（工作日） |
| 数据 | `sync:daily` + `acceptance` 全绿 |

运维文档：[DEPLOY-PAGES.md](./DEPLOY-PAGES.md)（Pages + Tunnel）、[DEPLOY-ALIYUN.md](./DEPLOY-ALIYUN.md)（服务器）。

## 本地开发

```sh
npm install
npm run dev:all
```

| 服务 | 地址 |
|------|------|
| 前端 | http://localhost:5173/ |
| API | http://127.0.0.1:8787 |

```sh
npm test              # 单元测试
npm run build
npm run sync:daily    # 刷新 SQLite（约 10–20 分钟）
npm run acceptance    # 数据门禁
npm run health-check  # 服务器 cron 健康检查
```

数据文件：`data/etflimit.sqlite`。

## 跟踪标的

**指数（5）**：纳斯达克100、标普500、日经225、恒生科技可用；**韩国综合指数**置灰（库内有产品后自动启用）。

**股票 Tab（8 + 搜索）**：NVDA、AAPL、GOOG、MU、AVGO、AMD、TSM、海力士（HYNIX）。

## 数据时效

| 数据 | 更新方式 |
|------|----------|
| 场内折溢价 | 指数页每 90s 拉 `/api/live-premium` |
| 场外限购/费率 | 工作日 `sync:daily` / `sync:limits`；页内可 `POST /api/sync-limits` |
| 持仓权重 | 季报，`sync:holdings` |
| 基金发现 | `sync:daily` 含 F10 跟踪标的校验，误收录主题 QDII 自动禁用 |

## 已知限制

- 首页 API 失败时静默 fallback
- KOSPI 尚无纯韩综 ETF 入库
- 持仓为季报快照，非实时仓位
- `globaletf.store` 根域名在大陆直连仍受 **ICP 备案** 约束；对外分享用 **globaletf.pages.dev**
- 本机若开 Clash/Surge，`api.globaletf.store` 可能被 fake-ip 干扰，不影响 Pages 站点

## 下一步

1. **ICP 备案通过** → 宝塔/Nginx 为 `globaletf.store` 配置 HTTPS（见 [DEPLOY-ALIYUN.md](./DEPLOY-ALIYUN.md)）
2. 可选：Pages 绑定自定义域 `globaletf.store` / `www.globaletf.store`
3. 微信小程序（见 [MINIPROGRAM.md](./MINIPROGRAM.md)）

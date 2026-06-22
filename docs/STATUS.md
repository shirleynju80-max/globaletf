# 当前状态

仓库：[github.com/shirleynju80-max/globaletf](https://github.com/shirleynju80-max/globaletf) · 分支 `main` · [PR #1](https://github.com/shirleynju80-max/globaletf/pull/1) 已合并

## 产品

**globaletf** — 跨境基金公开数据：同指数产品对比 + 季报持仓浓度。

| 路由 | 页面 |
|------|------|
| `/` | 首页（预览 + KPI） |
| `/indices` | 指数跟踪（实时折溢价、场外限购/费率） |
| `/stocks` | 股票持仓（季报权重，非实时） |

## 本地开发

```sh
npm install
npm run dev:all    # API + 前端
```

| 服务 | 地址 |
|------|------|
| 前端 | http://localhost:5173/ |
| API | http://127.0.0.1:8787 |

```sh
npm test             # 274 tests
npm run build
npm run sync:daily   # 刷新 SQLite
npm run acceptance   # 数据门禁（当前全绿）
```

数据文件：`data/etflimit.sqlite`（本地约 615 只 distinct 股票）。

## 跟踪标的

**指数（5）**：纳斯达克100、标普500、日经225、恒生科技可用；**韩国综合指数**置灰，库内有跟踪产品后自动启用。

**股票 Tab（8 + 搜索）**：NVDA、AAPL、GOOG、MU、AVGO、AMD、TSM、海力士（HYNIX）；支持别名搜索。

## 数据时效

| 数据 | 更新 |
|------|------|
| 场内折溢价 | 指数页打开时每 90s 拉 `/api/live-premium` |
| 场外限购/费率 | `sync:daily` + 页内 `/api/sync-limits` |
| 持仓权重 | 季报，`sync:holdings` |

## 部署

| 方案 | 文档 | 说明 |
|------|------|------|
| **阿里云单机** | [DEPLOY-ALIYUN.md](./DEPLOY-ALIYUN.md) | **推荐先上线**：香港 Docker 单体 |
| CF Pages + Fly | [DEPLOY.md](./DEPLOY.md) | 前后端分离，适合后续扩展 |

## 已知限制

- 首页 API 失败时静默使用静态 fallback
- KOSPI 尚无纯韩综 ETF 入库
- 持仓为季报快照，非实时仓位
- 生产环境需配置定时 sync（见 [DATA-SYNC.md](./DATA-SYNC.md)）

## 下一步

1. **阿里云香港单机部署**（[DEPLOY-ALIYUN.md](./DEPLOY-ALIYUN.md)）
2. 服务器上配置 `sync:daily` / `sync:limits` 定时任务
3. 绑定域名与 HTTPS（或先用 IP:8787 验证）

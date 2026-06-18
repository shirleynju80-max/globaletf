# 当前状态（2026-06-18）

分支：`feat/stock-holdings-discovery`（本地有大量未提交改动，尚未合并 main）

## 产品概览

**globaletf** — 跨境基金公开数据工具：同指数产品对比 + 季报持仓浓度查询。

| 路由 | 页面 | 数据性质 |
|------|------|----------|
| `/` | 首页 | 产品入口 + 实时预览表 + KPI |
| `/indices` | 指数跟踪 | 场内折溢价（实时）+ 场外限购/费率 |
| `/stocks` | 股票持仓 | 季报披露权重（非实时持仓） |

## 本地开发

```sh
npm install
npm run dev:all    # 推荐：API + 前端一起起
```

| 服务 | 地址 |
|------|------|
| 前端 | http://localhost:5173/ （`vite` `host: true`，`localhost` / `127.0.0.1` 均可） |
| API | http://127.0.0.1:8787 |
| 健康检查 | `GET /api/health` → `{"ok":true}` |

分开启动：`npm run api` + `npm run dev`。

**常见故障**：页面打不开 → 检查 5173 / 8787 是否有进程监听；dev 进程退出后需重新 `npm run dev:all`。

## 测试与数据

```sh
npm test              # 270 tests（Vitest）
npm run acceptance    # MVP 数据门禁
npm run sync:daily    # 刷新 SQLite 快照
```

本地库 `data/etflimit.sqlite`（约 **615** 只 distinct 股票于 `stock_fund_index`）。

## 跟踪标的

### 指数（5 个）

| 代码 | 名称 | UI 状态 |
|------|------|---------|
| NASDAQ_100 | 纳斯达克100 | 可用 |
| SP_500 | 标普500 | 可用 |
| NIKKEI_225 | 日经225 | 可用 |
| HSTECH | 恒生科技 | 可用 |
| KOSPI | 韩国综合指数 | **置灰**，库内有跟踪产品后自动启用 |

逻辑：`src/domain/indexTargetAvailability.ts` — `INDEX_TARGETS_PENDING_UNTIL_FUNDS`。

### 股票 Tab（8 个 + 自定义搜索）

NVDA、AAPL、GOOG、MU、AVGO、AMD、TSM、**HYNIX（海力士）**；支持名称/代码搜索（含别名，如 `SK海力士` → `HYNIX`）。

## 页面功能要点

### 首页

- 两大产品卡：纳指场内折溢价预览、NVDA 持仓预览（API 拉取，失败时用静态 fallback）
- KPI 三列：**跟踪指数 4+** / **股票 600+** / **更新时效 高**（`GET /api/landing-stats`）
- 文案已去掉「，并标注报告期与来源，便于自行核实」

### 指数跟踪

- 场内：实时折溢价（90s 轮询 `GET /api/live-premium/...`）、昨收折溢价、成交额
- 标题旁状态：**更新中…** → **实时数据更新于 HH:MM:SS**（失败显示「暂不可用」）
- 场外：限购/费率/渠道；「待核实」「暂停申购」折叠区
- 场外限额：打开页后 1min 起 `POST /api/sync-limits/...`，之后每 30min

### 股票持仓

- 季报权重排序；默认同质指数产品折叠（可勾选展开）
- 筛选：**可申购 / 场内 / 场外** 可组合；场内暂停申购不计入「可申购」
- 加载态「加载中...」，避免首屏误显「暂无数据」
- 面板标题：`{股票} 持仓排名`（与页头不重复）

## API 一览（相对 API 根）

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/health` | 存活探针 |
| GET | `/api/targets` | 标的列表 |
| GET | `/api/landing-stats` | 首页 KPI |
| GET | `/api/index-comparison/:targetCode` | 指数对比快照 |
| GET | `/api/live-premium/:targetCode` | 实时折溢价（无缓存） |
| POST | `/api/sync-limits/:targetCode` | 刷新场外限额 |
| GET | `/api/stock-concentration/:stockCode` | 持仓浓度（`?expandPeers=1` 展开同类） |
| GET | `/api/status` | 同步状态 |
| GET | `/api/discovery-health/:targetCode` | 发现覆盖率 |

客户端封装：`src/api/client.ts`。

## 数据时效

| 数据 | 更新方式 |
|------|----------|
| 场内折溢价 | 指数页打开时每 **90s** 拉 live-premium |
| 场外限购/费率 | 每日 `sync:daily` + 页内可选刷新 |
| 股票持仓权重 | 季报（`sync:holdings`），**非实时** |

详见 [DATA-SYNC.md](./DATA-SYNC.md)。

## 部署选项

| 方案 | 文档 |
|------|------|
| 阿里云 Docker 单体（推荐先跑通） | [DEPLOY-ALIYUN.md](./DEPLOY-ALIYUN.md) |
| Cloudflare Pages + Fly.io API | [DEPLOY.md](./DEPLOY.md) |
| 单机演示 `SERVE_STATIC=1` | 根 [README.md](../README.md) |

## 本阶段已完成的 UI / 逻辑改动（未提交）

- 首页 KPI 布局与文案；预览表改用场内 ETF 而非无折溢价的联接基金
- KOSPI 待产品 tab 置灰；landing-stats API
- 海力士 `stock_key` 别名查询修复
- 股票页多选筛选、加载态、主题色统一
- 指数页实时更新时间显示修复（含「更新中」中间态；限额刷新不再打断 live 轮询）
- Vite `host: true`，`localhost:5173` 可访问

## 已知限制

- 首页 API 失败时静默使用 fallback，无「离线」提示
- KOSPI 尚无 A 股纯韩综 ETF 入库（仅有中韩半导体等主题产品，不纳入 KOSPI 发现）
- 股票持仓为季报快照，与当前真实仓位有滞后
- 本地 LaunchAgent 定时 sync **未安装**（需手动或按 DATA-SYNC 配置 cron）

## 文档索引

| 文档 | 内容 |
|------|------|
| [README.md](../README.md) | 快速开始 |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | 架构与数据流 |
| [DATA-SYNC.md](./DATA-SYNC.md) | 同步与验收 |
| [DEPLOY-ALIYUN.md](./DEPLOY-ALIYUN.md) / [DEPLOY.md](./DEPLOY.md) | 部署 |
| [MINIPROGRAM.md](./MINIPROGRAM.md) | 小程序复用 API |
| `docs/superpowers/` | 2026-06 MVP 设计存档（非部署必读） |

## 建议下一步

1. 跑通 `npm run acceptance`，确认快照完整
2. 视需要 `git commit` 收拢本分支改动
3. 选部署方案（阿里云单体 或 CF+Fly）上线
4. 配置 `sync:daily` / `sync:limits` 定时任务
5. KOSPI：有合规跟踪产品入库后 tab 自动放开

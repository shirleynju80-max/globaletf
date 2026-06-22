# globaletf

跨境基金公开数据工具：同指数产品对比 + 季报持仓浓度。

| 路由 | 页面 |
|------|------|
| `/` | 首页 |
| `/indices` | 指数跟踪（实时折溢价、场外限购/费率） |
| `/stocks` | 股票持仓（季报披露权重） |

详细状态见 **[docs/STATUS.md](./docs/STATUS.md)**。

## 本地开发

```sh
npm install
npm run dev:all       # 推荐：API + 前端
```

| 服务 | 地址 |
|------|------|
| API | http://127.0.0.1:8787 |
| 前端 | http://localhost:5173/ |

```sh
npm test              # 274 tests
npm run build
npm run sync:daily
npm run acceptance
```

## 文档

**[docs/README.md](./docs/README.md)** — 完整索引

| 主题 | 文档 |
|------|------|
| 当前状态 | [docs/STATUS.md](./docs/STATUS.md) |
| 上线（推荐） | [docs/DEPLOY-ALIYUN.md](./docs/DEPLOY-ALIYUN.md) |
| 上线（CF + Fly） | [docs/DEPLOY.md](./docs/DEPLOY.md) |
| 架构 | [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) |
| 数据同步 | [docs/DATA-SYNC.md](./docs/DATA-SYNC.md) |

## 本地单体演示

```sh
npm run build
SERVE_STATIC=1 HOST=0.0.0.0 PORT=8787 npm run api
```

生产环境请用 [阿里云 Docker](./docs/DEPLOY-ALIYUN.md) 或 [CF + Fly](./docs/DEPLOY.md)。

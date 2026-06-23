# globaletf

跨境基金公开数据工具：同指数产品对比 + 季报持仓浓度。

| 路由 | 页面 |
|------|------|
| `/` | 首页 |
| `/indices` | 指数跟踪（实时折溢价、场外限购/费率） |
| `/stocks` | 股票持仓（季报披露权重） |

**当前状态** → [docs/STATUS.md](./docs/STATUS.md)

## 本地开发

```sh
npm install
npm run dev:all
```

| 服务 | 地址 |
|------|------|
| API | http://127.0.0.1:8787 |
| 前端 | http://localhost:5173/ |

```sh
npm test
npm run build
npm run sync:daily
npm run acceptance
```

## 文档

索引：[docs/README.md](./docs/README.md)

| 主题 | 文档 |
|------|------|
| 当前状态 | [docs/STATUS.md](./docs/STATUS.md) |
| Pages + Tunnel | [docs/DEPLOY-PAGES.md](./docs/DEPLOY-PAGES.md) |
| 阿里云 API 机 | [docs/DEPLOY-ALIYUN.md](./docs/DEPLOY-ALIYUN.md) |
| CF + Fly（备选） | [docs/DEPLOY.md](./docs/DEPLOY.md) |
| 架构 | [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) |
| 数据同步 | [docs/DATA-SYNC.md](./docs/DATA-SYNC.md) |

## 生产访问

| 环境 | 地址 |
|------|------|
| **主站** | https://globaletf.pages.dev |
| API | https://api.globaletf.store |
| 服务器 IP | http://47.100.5.7/ |
| 根域名 | https://globaletf.store（ICP 备案通过后） |

## 本地单体演示

```sh
npm run build
SERVE_STATIC=1 HOST=0.0.0.0 PORT=8787 npm run api
```

# 阿里云部署（推荐：香港单机 Docker）

一台 **阿里云 ECS / 轻量应用服务器** 跑网页 + API + SQLite，**不用改代码**。  
适合先跑通；大陆用户访问选 **香港** 机房（无需 ICP 备案）。

## 架构

```
浏览器 → http(s)://公网IP:8787  或  https://你的域名
              ↓
         Docker 单体（SERVE_STATIC=1）
         ├─ /          静态网页 dist/
         └─ /api/*     Express + SQLite
```

同一域名访问 API，构建时 **不需要** 设置 `VITE_API_BASE`。

---

## 1. 买机器

登录 [阿里云控制台](https://ecs.console.aliyun.com/)：

| 项 | 建议 |
|----|------|
| 产品 | **轻量应用服务器** 或 ECS |
| 地域 | **中国香港**（先上线、免备案） |
| 镜像 | Ubuntu 22.04 |
| 规格 | 2核 2GB 起 |
| 带宽 | 3–5 Mbps 起 |

创建后在防火墙 / 安全组放行：

- **8787**（应用，先跑通）
- **80 / 443**（绑域名 HTTPS 时）

记下 **公网 IP**。

> 大陆机房 + 自有域名需要 **ICP 备案**；小程序也必须备案域名。先香港最省事。

---

## 2. 登录服务器

```sh
ssh root@<公网IP>
```

---

## 3. 安装 Docker（可选脚本）

```sh
curl -fsSL https://get.docker.com | sh
# 或上传仓库后：
# bash scripts/aliyun-setup.sh
```

---

## 4. 上传代码

**方式 A — Git（服务器能访问 GitHub 时）**

```sh
apt-get update && apt-get install -y git
git clone <你的仓库地址> /opt/globaletf
cd /opt/globaletf
```

**方式 B — 本机打包上传**

在本机 Mac：

```sh
cd /Users/shuke-xl/Documents/etflimit
tar czf /tmp/globaletf.tgz --exclude=node_modules --exclude=data --exclude=dist --exclude=.git .
scp /tmp/globaletf.tgz root@<公网IP>:/opt/
```

在服务器：

```sh
mkdir -p /opt/globaletf && cd /opt/globaletf
tar xzf /opt/globaletf.tgz -C /opt/globaletf
```

---

## 5. 构建并启动

```sh
cd /opt/globaletf
docker compose -f docker-compose.aliyun.yml up -d --build
```

查看日志：

```sh
docker compose -f docker-compose.aliyun.yml logs -f
```

本机验证：

```sh
curl http://127.0.0.1:8787/api/health
```

浏览器打开：`http://<公网IP>:8787`

---

## 6. 首次灌数据（必做）

在容器里跑同步（约 **10–20 分钟**）：

```sh
docker compose -f docker-compose.aliyun.yml exec globaletf npm run sync:daily
```

可选验收：

```sh
docker compose -f docker-compose.aliyun.yml exec globaletf npm run acceptance
```

完成后刷新 `/indices`、`/stocks` 应有数据。

---

## 7. 定时同步（crontab）

在**宿主机**加 cron（北京时间工作日）：

```sh
crontab -e
```

```cron
30 8 * * 1-5 cd /opt/globaletf && docker compose -f docker-compose.aliyun.yml exec -T globaletf npm run sync:daily >> /var/log/globaletf-sync.log 2>&1
0 12 * * 1-5 cd /opt/globaletf && docker compose -f docker-compose.aliyun.yml exec -T globaletf npm run sync:limits >> /var/log/globaletf-limits.log 2>&1
30 15 * * 1-5 cd /opt/globaletf && docker compose -f docker-compose.aliyun.yml exec -T globaletf npm run sync:limits >> /var/log/globaletf-limits.log 2>&1
```

详见 [DATA-SYNC.md](./DATA-SYNC.md)。

---

## 8. 绑定域名 + HTTPS（可选）

有域名时，在服务器安装 Nginx + Certbot：

```sh
apt-get install -y nginx certbot python3-certbot-nginx
cp deploy/nginx-globaletf.conf.example /etc/nginx/sites-available/globaletf
# 编辑 YOUR_DOMAIN → 你的域名
ln -s /etc/nginx/sites-available/globaletf /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx
certbot --nginx -d 你的域名
```

DNS：A 记录指向 ECS 公网 IP。

备案完成前，香港机器用域名访问仍走国际线路，但比 `IP:8787` 更易记。

---

## 9. 日常运维

| 操作 | 命令 |
|------|------|
| 重启 | `docker compose -f docker-compose.aliyun.yml restart` |
| 更新代码 | `git pull` 或重新上传 → `docker compose -f docker-compose.aliyun.yml up -d --build` |
| 看日志 | `docker compose -f docker-compose.aliyun.yml logs -f` |
| 手动同步 | `docker compose ... exec globaletf npm run sync:daily` |
| 备份数据库 | `docker compose ... exec globaletf cat /app/data/etflimit.sqlite > backup.sqlite` |

数据卷：`globaletf_data`（`docker volume inspect` 可查路径）。

---

## 进阶：网页 OSS + API ECS 分离

和 [DEPLOY.md](./DEPLOY.md) 的 option B 一样，只是 API 放阿里云 ECS、网页放 **OSS + CDN**：

1. 本机构建：`VITE_API_BASE=https://api.你的域名 npm run build`
2. 上传 `dist/` 到 OSS，开启静态网站 + CDN
3. ECS 只跑 `Dockerfile.api`（不设 `SERVE_STATIC`）

单机跑通后再拆，运维更省事。

---

## 费用与大陆访问

| 项 | 说明 |
|----|------|
| 费用 | 香港轻量约 **¥24–50/月**（促销价因活动而异），新用户常有试用券 |
| 大陆速度 | 香港机房通常优于 Fly / 纯海外 Pages |
| 备案后 | 可迁大陆 ECS + 阿里云 CDN，进一步加速 |

---

## 故障排查

| 现象 | 处理 |
|------|------|
| 浏览器打不开 | 检查安全组是否放行 8787；`docker compose ps` 是否 Up |
| 页面空表 | 是否跑过 `sync:daily`；看 `docker compose logs` |
| `sync:daily` 失败 | 服务器需能访问东方财富等外网数据源；检查 DNS |
| 构建 OOM | 换 2GB+ 内存，或本机 `docker build` 后推镜像到 ACR |

---

## 相关文件

| 文件 | 用途 |
|------|------|
| `docker-compose.aliyun.yml` | 单机编排 |
| `Dockerfile` | 单体镜像（UI + API） |
| `deploy/nginx-globaletf.conf.example` | Nginx 反代 |
| `scripts/aliyun-setup.sh` | 安装 Docker |

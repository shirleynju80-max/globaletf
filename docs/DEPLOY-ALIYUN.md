# 阿里云部署（宝塔 + systemd）

大陆 ECS 跑网页 + API + SQLite。**推荐裸机 systemd**，不依赖 Docker Hub。

## 架构（当前生产）

```
globaletf.pages.dev  →  Pages Function  →  api.globaletf.store (Tunnel)  →  阿里云 :80
```

详见 [DEPLOY-PAGES.md](./DEPLOY-PAGES.md)、[STATUS.md](./STATUS.md)。

大陆 ECS 直连见 [DEPLOY-ALIYUN.md](./DEPLOY-ALIYUN.md)。

备案完成前域名会被 **ICP 拦截**；公网分享用 Pages。

---

## 当前生产

| 项 | 值 |
|----|-----|
| IP | `47.100.5.7` |
| 面板 | 宝塔 Linux 11.1.0 |
| 代码 | `/opt/globaletf` |
| 服务 | `systemctl status globaletf` |
| 端口 | **80**（`globaletf.service` 中 `PORT=80`） |
| Tunnel | `systemctl status cloudflared` |
| 域名 DNS | NS 在 **Cloudflare**；`@`/`www` A → 本机；`api` → Tunnel |
| 健康检查 | `curl http://127.0.0.1/api/health` |

---

## 首次部署

### 1. 打包上传

```sh
cd /path/to/etflimit
COPYFILE_DISABLE=1 tar czf ~/Desktop/globaletf.tgz \
  --exclude=node_modules --exclude=data --exclude=dist --exclude=.git .
```

宝塔 **文件** → 上传 `/opt/globaletf.tgz` → 解压到 `/opt/globaletf`。

### 2. 一键部署

```sh
chmod +x /opt/globaletf/scripts/baota-systemd-deploy.sh
bash /opt/globaletf/scripts/baota-systemd-deploy.sh
```

若机器未装 Nginx，脚本后需把服务改到 80 端口：

```sh
sed -i 's/Environment=PORT=8787/Environment=PORT=80/' /etc/systemd/system/globaletf.service
systemctl daemon-reload && systemctl restart globaletf
```

### 3. 灌数据

```sh
cd /opt/globaletf
npm run sync:daily    # 约 10–20 分钟
npm run acceptance
```

或从旧机拷贝 `data/etflimit.sqlite` 后 `systemctl restart globaletf`。

### 4. 防火墙

阿里云安全组 + 宝塔 **安全**：放行 **80**、**443**。

### 5. DNS

域名 NS 在 **Cloudflare**（见 [DEPLOY-PAGES.md](./DEPLOY-PAGES.md)）。在 Cloudflare DNS 中：

- `@` / `www` → A → **`47.100.5.7`**
- `api` → Tunnel → `globaletf-api`（勿在阿里云单独改）

若仅 IP 访问，安全组放行 **80** 即可，无需改 DNS。

### 6. 定时同步

```sh
crontab -e
```

```cron
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
SHELL=/bin/bash
30 8 * * 1-5 /opt/globaletf/scripts/daily-sync.sh >> /var/log/globaletf-sync.log 2>&1
0 12 * * 1-5 /opt/globaletf/scripts/limits-sync.sh >> /var/log/globaletf-limits.log 2>&1
30 15 * * 1-5 /opt/globaletf/scripts/limits-sync.sh >> /var/log/globaletf-limits.log 2>&1
```

> 必须用 **wrapper 脚本**，不要直接 `npm run …`（cron 环境缺 `PATH` 会静默失败）。

日志：`/opt/globaletf/logs/daily-sync.log`、`/var/log/globaletf-sync.log`。

---

## 备案与 HTTPS

1. **ICP 备案**通过后，`globaletf.store` 可在大陆正常解析访问。
2. 宝塔 → **软件商店** 安装 Nginx → **网站** → 添加 `globaletf.store`。
3. 若应用仍占 80 端口：改 `globaletf.service` 为 `PORT=8787`，Nginx 反代到 `127.0.0.1:8787`（配置见 `deploy/nginx-globaletf.conf`）。
4. **SSL** → Let's Encrypt → 开启强制 HTTPS。

或备案后执行：

```sh
CERTBOT_EMAIL=you@example.com bash /opt/globaletf/scripts/aliyun-enable-https.sh
```

---

## 代码更新

大陆 ECS **通常无法直连 GitHub**。推荐从本机推送代码：

```sh
# 在本机仓库根目录（需 SSH 到 47.100.5.7）
bash scripts/deploy-to-aliyun.sh
```

会 rsync 当前 git 工作区 → 服务器 `npm ci` + `build` + 重启，并写入 `.deploy-rev` 记录 commit。

若服务器能访问 GitHub，也可在服务器上：

```sh
bash /opt/globaletf/scripts/aliyun-git-deploy.sh install   # 首次
bash /opt/globaletf/scripts/aliyun-git-deploy.sh update    # 日常
```

---

## 日常运维

| 操作 | 命令 |
|------|------|
| 状态 | `systemctl status globaletf` |
| 重启 | `systemctl restart globaletf` |
| 应用日志 | `tail -f /opt/globaletf/logs/app.log` |
| 同步日志 | `tail -f /opt/globaletf/logs/daily-sync.log` |
| **更新代码** | 本机 `bash scripts/deploy-to-aliyun.sh` |
| 手动全量同步 | `cd /opt/globaletf && npm run sync:daily` |
| 备份 DB | `cp /opt/globaletf/data/etflimit.sqlite ~/backup-$(date +%F).sqlite` |

---

## 备选：Docker

大陆拉 `docker.io` 常超时，仅在香港/海外或已配镜像加速时考虑：

```sh
docker compose -f docker-compose.aliyun.yml up -d --build
```

---

## 相关文件

| 文件 | 用途 |
|------|------|
| `deploy/globaletf.service` | systemd 单元 |
| `scripts/baota-systemd-deploy.sh` | 宝塔一键部署 |
| `scripts/aliyun-git-deploy.sh` | 服务器 git pull（需能访问 GitHub） |
| `scripts/deploy-to-aliyun.sh` | **本机 rsync 部署（大陆推荐）** |
| `scripts/daily-sync.sh` / `limits-sync.sh` | cron 包装脚本 |
| `deploy/nginx-globaletf.conf` | 域名 + Nginx 反代 |

同步说明见 [DATA-SYNC.md](./DATA-SYNC.md)。

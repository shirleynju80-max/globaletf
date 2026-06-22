# 阿里云部署（推荐：systemd 裸机，不用 Docker）

一台 **轻量应用服务器 / ECS** 跑网页 + API + SQLite。  
大陆机房（如乌兰察布）可直接用；**无需 Docker Hub**，避免镜像拉取失败。

## 架构

```
浏览器 → https://globaletf.store
              ↓
         Nginx（80/443）→ 127.0.0.1:8787
              ↓
         systemd → npm run start:api（SERVE_STATIC=1）
```

同域访问 API，构建时 **不需要** `VITE_API_BASE`。

---

## 当前生产

| 项 | 值 |
|----|-----|
| 域名 | **globaletf.store** |
| 服务器 IP | `47.100.5.7`（宝塔 Linux 面板 11.1.0） |
| 应用 | `globaletf.service` → `127.0.0.1:8787` |
| 反代 | Baota Nginx vhost `/www/server/panel/vhost/nginx/globaletf.conf` |
| 临时访问 | http://47.100.5.7/（DNS 未切前；需先部署 + 放行 80） |

---

## 域名 globaletf.store

### 1. DNS（域名控制台）

| 主机记录 | 类型 | 记录值 |
|----------|------|--------|
| `@` | A | `47.100.5.7` |
| `www` | A 或 CNAME | `47.100.5.7` 或 `globaletf.store` |

生效验证（Mac）：

```sh
nslookup globaletf.store
curl http://globaletf.store/api/health
```

### 2. 阿里云防火墙

放行 **80**、**443**（HTTPS 证书需要 443）。

### 3. HTTPS（DNS 生效后在服务器执行）

```sh
CERTBOT_EMAIL=你的邮箱@example.com bash /opt/globaletf/scripts/aliyun-enable-https.sh
```

或宝塔面板 → 网站 → 添加站点 `globaletf.store` → **Let's Encrypt** 申请证书。

### 4. 备案说明

`.store` 域名 + 大陆乌兰察布机房：**若面向大陆用户，通常需要 ICP 备案**。未备案时可能面临访问限制；香港机房可免备案但延迟不同。

---

## 宝塔面板快速部署（当前机器）

服务器：**47.100.5.7** · 宝塔 Linux 面板 11.1.0 · 域名 **globaletf.store**

### A. 本机打包上传

Mac 终端：

```sh
cd /Users/shuke-xl/Documents/etflimit
COPYFILE_DISABLE=1 tar czf ~/Desktop/globaletf.tgz \
  --exclude=node_modules --exclude=data --exclude=dist --exclude=.git .
```

宝塔 **文件** → 上传到 `/opt/globaletf.tgz` → 解压到 `/opt/globaletf`。

或 **终端**：

```sh
mkdir -p /opt/globaletf
tar xzf /opt/globaletf.tgz -C /opt/globaletf
```

### B. 一键部署（宝塔终端，root）

```sh
chmod +x /opt/globaletf/scripts/baota-systemd-deploy.sh
bash /opt/globaletf/scripts/baota-systemd-deploy.sh
```

脚本会：装 Node 22 → `npm ci` → `npm run build` → 启 `globaletf.service` → 写入 Nginx 反代配置。

### C. 迁旧数据库（可选，比重新 sync 快）

若旧机 `8.147.67.18` 仍可登录，在旧机：

```sh
cp /opt/globaletf/data/etflimit.sqlite ~/etflimit.sqlite
```

下载后上传到新机 `/opt/globaletf/data/etflimit.sqlite`，然后：

```sh
systemctl restart globaletf
```

无旧库则新机执行：`cd /opt/globaletf && npm run sync:daily`

### D. DNS（必做，当前仍指向旧 IP）

域名控制台把 **globaletf.store**、**www** 的 A 记录改为 **`47.100.5.7`**。

生效验证：

```sh
nslookup globaletf.store
curl http://globaletf.store/api/health
```

### E. 宝塔防火墙与安全组

- 阿里云安全组：放行 **80**、**443**
- 宝塔 **安全** → 放行 **80**、**443**

### F. HTTPS

DNS 生效后：宝塔 → **网站** → `globaletf.store` → **SSL** → **Let's Encrypt** → 申请并开启强制 HTTPS。

### G. 定时同步（宝塔计划任务或 crontab）

```cron
30 8 * * 1-5 cd /opt/globaletf && /usr/bin/npm run sync:daily >> /var/log/globaletf-sync.log 2>&1
0 12 * * 1-5 cd /opt/globaletf && /usr/bin/npm run sync:limits >> /var/log/globaletf-limits.log 2>&1
```

---

Mac 打包（排除 macOS 元数据）：

```sh
cd /path/to/etflimit
COPYFILE_DISABLE=1 tar czf ~/Desktop/globaletf.tgz \
  --exclude=node_modules --exclude=data --exclude=dist --exclude=.git .
```

Workbench **上传**到服务器 `/opt/globaletf.tgz`，解压：

```sh
sudo mkdir -p /opt/globaletf
sudo tar xzf /opt/globaletf.tgz -C /opt/globaletf
```

---

## 2. 安装 Node 22（Alibaba Cloud Linux 3）

```sh
sudo yum install -y python3 make gcc-c++ git
curl -fsSL https://rpm.nodesource.com/setup_22.x | sudo bash -
sudo yum install -y nodejs
node -v   # v22.x
```

npm 镜像（可选，大陆更快）：

```sh
npm config set registry https://registry.npmmirror.com
```

---

## 3. 构建 + systemd 服务

```sh
cd /opt/globaletf
npm ci
npm run build

sudo mkdir -p /opt/globaletf/data /opt/globaletf/logs
sudo cp deploy/globaletf.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now globaletf
sudo systemctl status globaletf
curl http://127.0.0.1:8787/api/health
```

或一键脚本（代码已在 `/opt/globaletf` 时）：

```sh
sudo bash /opt/globaletf/scripts/aliyun-systemd-deploy.sh
```

---

## 4. 首次灌数据

```sh
cd /opt/globaletf
npm run sync:daily      # 约 10–20 分钟
npm run acceptance      # 数据门禁
```

---

## 5. 定时同步（crontab）

```sh
sudo crontab -e
```

```cron
30 8 * * 1-5 cd /opt/globaletf && /usr/bin/npm run sync:daily >> /var/log/globaletf-sync.log 2>&1
35 8 * * 1-5 cd /opt/globaletf && DATABASE_PATH=/opt/globaletf/data/etflimit.sqlite /usr/bin/npm run health-check >> /var/log/globaletf-health.log 2>&1
0 12 * * 1-5 cd /opt/globaletf && /usr/bin/npm run sync:limits >> /var/log/globaletf-limits.log 2>&1
30 15 * * 1-5 cd /opt/globaletf && /usr/bin/npm run sync:limits >> /var/log/globaletf-limits.log 2>&1
```

`health-check` runs `acceptance` and inspects `sync_status` for `error`. Optional webhook:

```sh
export NOTIFY_WEBHOOK_URL="https://your-webhook"
export NOTIFY_WEBHOOK_FORMAT=wecom   # 企业微信机器人；默认 json
npm run health-check
```

---

## 6. 放行外网访问

### 轻量应用服务器：用 80 端口（推荐）

控制台防火墙里 **HTTP 80** 通常已放行。服务监听 **80** 即可公网访问：

```sh
# deploy/globaletf.service 里 Environment=PORT=80
curl http://127.0.0.1:80/api/health
```

浏览器：**http://\<公网IP\>/**（不要加 `:8787`）

### 若坚持用 8787

添加 **自定义 TCP 8787** 规则。若外网仍 `Empty reply` 而本机 127.0.0.1 正常，说明外层防火墙未转发该端口——**改用 80** 或联系阿里云工单。

### 验证

```sh
curl http://<公网IP>/api/health
```

应返回 `{"ok":true}`。

---

## 7. 日常运维

| 操作 | 命令 |
|------|------|
| 状态 | `systemctl status globaletf` |
| 重启 | `systemctl restart globaletf` |
| 日志 | `tail -f /opt/globaletf/logs/app.log` |
| 更新代码 | 重新上传 → `npm ci && npm run build && systemctl restart globaletf` |
| 手动同步 | `cd /opt/globaletf && npm run sync:daily` |
| 备份 DB | `cp /opt/globaletf/data/etflimit.sqlite ~/backup.sqlite` |

---

## 备选：Docker 部署

大陆服务器拉 `docker.io` 常超时，仅在香港/海外或已配置镜像加速时推荐：

```sh
docker compose -f docker-compose.aliyun.yml up -d --build
```

见 `docker-compose.aliyun.yml`、`Dockerfile`。

---

## 相关文件

| 文件 | 用途 |
|------|------|
| `deploy/globaletf.service` | systemd 单元 |
| `scripts/aliyun-systemd-deploy.sh` | 裸机构建 + 启服务 |
| `deploy/nginx-globaletf.conf.example` | 绑域名时 Nginx 反代 |

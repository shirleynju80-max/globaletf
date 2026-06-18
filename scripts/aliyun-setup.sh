#!/usr/bin/env bash
# First-time bootstrap on Aliyun ECS (Ubuntu 22.04/24.04). Run as root or with sudo.
set -euo pipefail

if ! command -v docker >/dev/null 2>&1; then
  echo "Installing Docker..."
  apt-get update
  apt-get install -y ca-certificates curl
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  echo \
    "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu \
    $(. /etc/os-release && echo "${VERSION_CODENAME}") stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
fi

echo "Docker ready: $(docker --version)"
echo ""
echo "Next steps:"
echo "  1. Clone repo to /opt/globaletf (or upload tarball)"
echo "  2. cd /opt/globaletf && docker compose -f docker-compose.aliyun.yml up -d --build"
echo "  3. docker compose -f docker-compose.aliyun.yml exec globaletf npm run sync:daily"
echo "  4. Open http://<ECS公网IP>:8787"

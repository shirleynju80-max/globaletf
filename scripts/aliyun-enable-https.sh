#!/usr/bin/env bash
# Enable HTTPS for globaletf.store on Aliyun ECS (Baota/Tengine nginx + certbot).
# Prereqs: DNS A records for globaletf.store and www -> this server's public IP.
set -euo pipefail

DOMAIN="${GLOBALETF_DOMAIN:-globaletf.store}"
EMAIL="${CERTBOT_EMAIL:-}"
ROOT="/opt/globaletf"
VHOST="/www/server/panel/vhost/nginx/globaletf.conf"
NGINX="/www/server/nginx/sbin/nginx"

if [ "$(id -u)" -ne 0 ]; then
  echo "Run as root"
  exit 1
fi

if ! python3 -c "import socket; socket.gethostbyname('$DOMAIN')" 2>/dev/null; then
  echo "DNS not ready: $DOMAIN does not resolve. Add A record -> server IP first."
  exit 1
fi

yum install -y epel-release
yum install -y certbot python3-certbot-nginx

sed -i 's/Environment=PORT=80/Environment=PORT=8787/' /etc/systemd/system/globaletf.service
grep -q 'PORT=8787' /etc/systemd/system/globaletf.service || sed -i 's/Environment=PORT=.*/Environment=PORT=8787/' /etc/systemd/system/globaletf.service
systemctl daemon-reload
systemctl restart globaletf

install -m 644 "$ROOT/deploy/nginx-globaletf.conf" "$VHOST"
$NGINX -t
$NGINX -s reload

if [ -z "$EMAIL" ]; then
  echo "Nginx proxy ok. Set CERTBOT_EMAIL and run:"
  echo "  certbot --nginx -d $DOMAIN -d www.$DOMAIN"
  exit 0
fi

certbot --nginx -d "$DOMAIN" -d "www.$DOMAIN" --non-interactive --agree-tos -m "$EMAIL" --redirect

echo "Done: https://$DOMAIN/"

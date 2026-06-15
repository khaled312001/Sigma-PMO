#!/usr/bin/env bash
#
# Sigma PMO — VPS provisioning (Hostinger / Ubuntu 22.04 LTS)
#
# Idempotent first-time setup of a fresh VPS. Run once as root.
#   sudo bash provision.sh app.sigma.example admin@sigma.example
#
# Steps:
#   1. apt update + base packages
#   2. Node 22 LTS via NodeSource
#   3. MariaDB 10.11 + secure setup + sigma_pmo database
#   4. nginx + certbot
#   5. sigma user + /srv/sigma-pmo + /etc/sigma-pmo skeleton
#   6. UFW firewall (22, 80, 443)
#   7. Reminders for what to do next
#
# Re-running this script will skip steps already done.

set -euo pipefail

DOMAIN="${1:-}"
LETSENCRYPT_EMAIL="${2:-}"

if [[ -z "$DOMAIN" || -z "$LETSENCRYPT_EMAIL" ]]; then
  echo "Usage: sudo bash provision.sh <domain> <letsencrypt-email>" >&2
  exit 2
fi

if [[ "$EUID" -ne 0 ]]; then
  echo "must run as root" >&2
  exit 1
fi

echo "==> [1/7] apt update + base packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y --no-install-recommends \
  curl ca-certificates gnupg ufw rsync jq git build-essential

echo "==> [2/7] Node 22 LTS"
if ! command -v node >/dev/null 2>&1 || ! node -v | grep -q '^v22'; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi
node -v
npm -v

echo "==> [3/7] MariaDB"
if ! command -v mariadb >/dev/null 2>&1; then
  apt-get install -y mariadb-server mariadb-client
  systemctl enable --now mariadb
fi
# Create DB and user if absent. Passwords are filled in by deploy.sh from env.
mariadb -uroot -e "CREATE DATABASE IF NOT EXISTS sigma_pmo CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
mariadb -uroot -e "CREATE USER IF NOT EXISTS 'sigma_pmo'@'localhost' IDENTIFIED BY 'CHANGE_ME_IN_PROD';"
mariadb -uroot -e "GRANT ALL PRIVILEGES ON sigma_pmo.* TO 'sigma_pmo'@'localhost'; FLUSH PRIVILEGES;"
echo "    note: change the sigma_pmo DB password before going live."

echo "==> [4/7] nginx + certbot"
apt-get install -y nginx certbot python3-certbot-nginx
systemctl enable --now nginx

echo "==> [5/7] sigma user + folder skeleton"
if ! id -u sigma >/dev/null 2>&1; then
  useradd --system --create-home --shell /usr/sbin/nologin sigma
fi
install -d -o sigma -g sigma -m 0755 /srv/sigma-pmo
install -d -o sigma -g sigma -m 0755 /srv/sigma-pmo/backend
install -d -o sigma -g sigma -m 0755 /srv/sigma-pmo/frontend
install -d -o sigma -g sigma -m 0750 /srv/sigma-pmo/storage
install -d -o sigma -g sigma -m 0750 /srv/sigma-pmo/storage/files
install -d -o sigma -g sigma -m 0750 /srv/sigma-pmo/storage/backups
install -d -o root -g sigma -m 0750 /etc/sigma-pmo

echo "==> [6/7] UFW firewall"
ufw allow OpenSSH || true
ufw allow 'Nginx Full' || true
yes | ufw enable || true

echo "==> [7/7] Done."
cat <<EOF

Next steps (in order):

  1. Copy deploy/nginx/sigma-pmo.conf to /etc/nginx/sites-available/
     and symlink into sites-enabled/. Edit server_name to "$DOMAIN".
     Then: nginx -t && systemctl reload nginx

  2. Run certbot to obtain TLS:
       certbot --nginx -d $DOMAIN -m $LETSENCRYPT_EMAIL --agree-tos -n

  3. Copy systemd unit files and reload:
       cp deploy/systemd/*.service /etc/systemd/system/
       systemctl daemon-reload

  4. Create env files under /etc/sigma-pmo/ (use deploy/env/*.env.example
     as templates):
       /etc/sigma-pmo/backend.env
       /etc/sigma-pmo/frontend.env

  5. Deploy the application:
       bash deploy/scripts/deploy.sh

  6. Enable + start services:
       systemctl enable --now sigma-pmo-backend sigma-pmo-frontend

  7. Bootstrap the first admin user — see deploy/README.md §"First admin".

  8. Install the daily backup cron:
       crontab -u sigma -l 2>/dev/null > /tmp/sigma_crontab || true
       echo '15 2 * * * /srv/sigma-pmo/deploy/scripts/backup-cron.sh >> /srv/sigma-pmo/storage/backups/cron.log 2>&1' >> /tmp/sigma_crontab
       crontab -u sigma /tmp/sigma_crontab

  9. Drill restore once with deploy/scripts/restore-drill.sh.

EOF

# Sigma PMO Server Upload Checklist

Use this checklist with the server company before the first UAT deployment.

## 1. Server Requirements

| Item | Required |
| --- | --- |
| OS | Ubuntu 22.04 LTS or newer |
| Runtime | Node.js 22 LTS |
| Database | MariaDB 10.11+ or MySQL 8+ |
| Web server | nginx with certbot |
| Ports | 22, 80, 443 |
| App user | `sigma` system user |
| App root | `/srv/sigma-pmo` |
| Env root | `/etc/sigma-pmo` |
| Storage root | `/srv/sigma-pmo/storage` |

## 2. Files To Upload

Upload the full repository except local secrets and generated folders:

- Do upload: `backend/`, `frontend/`, `data/samples/`, `deploy/`, `docs/`, `scripts/`, `README.md`, lock files.
- Do not upload: `.env`, `*.env`, `node_modules/`, `dist/`, `.next/`, `coverage/`, `data/storage/`.

Preferred method:

```bash
git clone <repo-url> /srv/sigma-pmo
```

Fallback package method:

```bash
bash deploy/scripts/package-release.sh
scp /tmp/sigma-pmo-release-*.tar.gz root@<server-ip>:/srv/
```

## 3. First Deployment Commands

```bash
cd /srv/sigma-pmo
sudo bash deploy/scripts/provision.sh app.sigma.example admin@sigma.example
sudo cp deploy/nginx/sigma-pmo.conf /etc/nginx/sites-available/
sudo ln -sf /etc/nginx/sites-available/sigma-pmo.conf /etc/nginx/sites-enabled/sigma-pmo.conf
sudo sed -i 's/app.sigma.example/<actual-domain>/g' /etc/nginx/sites-available/sigma-pmo.conf
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d <actual-domain> -m <admin-email> --agree-tos -n
sudo cp deploy/systemd/*.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo install -d -m 0750 -o root -g sigma /etc/sigma-pmo
sudo cp deploy/env/backend.env.example /etc/sigma-pmo/backend.env
sudo cp deploy/env/frontend.env.example /etc/sigma-pmo/frontend.env
sudo cp deploy/env/backup.env.example /etc/sigma-pmo/backup.env
sudo editor /etc/sigma-pmo/backend.env
sudo editor /etc/sigma-pmo/frontend.env
sudo editor /etc/sigma-pmo/backup.env
sudo chmod 0640 /etc/sigma-pmo/backend.env /etc/sigma-pmo/frontend.env
sudo chown root:sigma /etc/sigma-pmo/backend.env /etc/sigma-pmo/frontend.env
sudo chmod 0600 /etc/sigma-pmo/backup.env
sudo chown sigma:sigma /etc/sigma-pmo/backup.env
sudo -u sigma bash deploy/scripts/deploy.sh
sudo systemctl enable --now sigma-pmo-backend sigma-pmo-frontend
```

## 4. Go-Live Smoke Checks

```bash
curl -i https://<actual-domain>/api/v1/live
curl -i https://<actual-domain>/api/v1/ready
sudo journalctl -u sigma-pmo-backend --since "10 min ago" --no-pager
sudo journalctl -u sigma-pmo-frontend --since "10 min ago" --no-pager
```

Create the first admin from the server only:

```bash
cd /srv/sigma-pmo/backend
sudo -u sigma npm run user:create -- ayham@sigma.example sigma_admin "Ayham"
```

Then open:

```text
https://<actual-domain>/auth
```

## 5. UAT Readiness Gate

Before receiving any client project data, confirm:

- TLS certificate is active.
- `/api/v1/ready` returns 200.
- The first admin account exists and the bootstrap token is removed.
- Backups run and `restore-drill.sh` succeeds.
- Project-specific roles and time-limited access are created.
- Upload/download activity is logged.
- Client data ownership and removal rules are confirmed in writing.


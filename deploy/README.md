# Sigma PMO — deploy in 60 minutes

> Hostinger VPS or any Ubuntu 22.04+ host. Assumes a fresh VM, a DNS A
> record pointing `app.sigma.example` at the VPS IP, and root SSH access.

## What's in this folder

| Path                              | Purpose                                                |
| --------------------------------- | ------------------------------------------------------ |
| `nginx/sigma-pmo.conf`            | reverse proxy + TLS                                    |
| `systemd/sigma-pmo-backend.service` | backend Node service (hardened)                      |
| `systemd/sigma-pmo-frontend.service` | frontend Next.js service                            |
| `scripts/provision.sh`            | one-shot VPS setup                                     |
| `scripts/deploy.sh`               | pull + build + migrate + restart                       |
| `scripts/backup-cron.sh`          | daily DB + files backup                                |
| `scripts/restore-drill.sh`        | quarterly DR drill                                     |
| `.env.production.example`         | template for `/etc/sigma-pmo/{backend,frontend,backup}.env` |

## Sequence (≈ 60 min from blank VPS to live)

1. **DNS** (5 min) — point `app.sigma.example` A record at the VPS IP.
2. **Provision** (10 min):
   ```bash
   ssh root@<vps-ip>
   git clone https://github.com/<org>/sigma-pmo.git /srv/sigma-pmo
   cd /srv/sigma-pmo
   sudo bash deploy/scripts/provision.sh app.sigma.example admin@sigma.example
   ```
3. **nginx + TLS** (5 min):
   ```bash
   cp deploy/nginx/sigma-pmo.conf /etc/nginx/sites-available/
   ln -sf /etc/nginx/sites-available/sigma-pmo.conf /etc/nginx/sites-enabled/sigma-pmo.conf
   sed -i 's/app.sigma.example/<your-domain>/g' /etc/nginx/sites-available/sigma-pmo.conf
   nginx -t && systemctl reload nginx
   certbot --nginx -d app.sigma.example -m admin@sigma.example --agree-tos -n
   ```
4. **systemd units** (3 min):
   ```bash
   cp deploy/systemd/*.service /etc/systemd/system/
   systemctl daemon-reload
   ```
5. **Env files** (10 min):
   ```bash
   install -d -m 0750 -o root -g sigma /etc/sigma-pmo
   cp deploy/.env.production.example /etc/sigma-pmo/backend.env  # then edit
   $EDITOR /etc/sigma-pmo/backend.env
   $EDITOR /etc/sigma-pmo/frontend.env       # see template at end of example file
   $EDITOR /etc/sigma-pmo/backup.env         # see template at end of example file
   chmod 0640 /etc/sigma-pmo/*.env
   chown root:sigma /etc/sigma-pmo/*.env
   chmod 0600 /etc/sigma-pmo/backup.env
   chown sigma:sigma /etc/sigma-pmo/backup.env
   ```
   Replace every `REPLACE_*` placeholder. Set the DB password and update the
   MariaDB user accordingly:
   ```bash
   mariadb -uroot -e "ALTER USER 'sigma_pmo'@'localhost' IDENTIFIED BY '<new-pass>'; FLUSH PRIVILEGES;"
   ```
6. **Deploy** (10 min):
   ```bash
   sudo -u sigma bash deploy/scripts/deploy.sh
   systemctl enable --now sigma-pmo-backend sigma-pmo-frontend
   ```
7. **First admin** (5 min) — see § below.
8. **Backup cron** (3 min):
   ```bash
   sudo -u sigma crontab -e
   # add:
   15 2 * * * /srv/sigma-pmo/deploy/scripts/backup-cron.sh >> /srv/sigma-pmo/storage/backups/cron.log 2>&1
   ```
9. **Restore drill** (10 min):
   ```bash
   sudo bash deploy/scripts/restore-drill.sh
   ```
   Paste the drill output into [`docs/handover/acceptance-evidence-pack.md`](../docs/handover/acceptance-evidence-pack.md)
   under §"Live deployment proof".

## First admin

Production bootstrap is gated by `BOOTSTRAP_TOKEN` (see
`docs/runbook/ops.md` § "First-admin bootstrap"). On a fresh deployment:

```bash
# 1. read the token from /etc/sigma-pmo/backend.env
TOKEN=$(grep BOOTSTRAP_TOKEN /etc/sigma-pmo/backend.env | cut -d= -f2)

# 2. POST the first admin
curl -sX POST https://app.sigma.example/api/v1/auth/users \
  -H "Content-Type: application/json" \
  -H "x-bootstrap-token: $TOKEN" \
  -d '{
    "email": "alayham@sigma.example",
    "displayName": "Al Ayham Alhamach",
    "role": "sigma_admin"
  }'

# 3. capture the apiKey from the response — shown ONCE.

# 4. remove the BOOTSTRAP_TOKEN line and restart the backend
sed -i '/^BOOTSTRAP_TOKEN=/d' /etc/sigma-pmo/backend.env
systemctl restart sigma-pmo-backend
```

After this, additional users are created by an existing admin via
`POST /api/v1/auth/users` with their `x-api-key`.

## Smoke test

```bash
curl -i https://app.sigma.example/api/v1/ready
# expect HTTP/2 200

curl -i https://app.sigma.example/api/v1/projects \
  -H "x-api-key: <admin-key>"
# expect HTTP/2 200 with [] (empty list on a fresh deploy)
```

Open `https://app.sigma.example/auth` in a browser, paste the admin key,
land on `/review`. Ingest a sample from `data/samples/`, run rule
evaluation, generate a summary — confirms the full pipeline end-to-end.

## Rollback

Tagged releases are immutable. To roll back to the prior tag:

```bash
cd /srv/sigma-pmo
SIGMA_GIT_REF=v1.0.0-acceptance bash deploy/scripts/deploy.sh
```

If a migration introduced incompatible schema change, restore the latest
DB dump first (see `docs/runbook/restore.md`).

## Re-scope triggers

Anything beyond this folder — Kubernetes manifests, multi-region failover,
WAF, dedicated metrics stack, blue/green — is out of v1.0.0 scope and is a
Re-scope Trigger per Annex 2 of the Service Agreement.

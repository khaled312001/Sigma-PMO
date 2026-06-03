# Operations runbook

> Daily and on-demand operations of the Sigma PMO platform. For incidents,
> see `incident.md`. For backup / restore drills, see `backup.md` and
> `restore.md`. For health probes and metrics, see `monitoring.md`.

## Component map

| Service        | Tech                          | Default port | Notes                                  |
| -------------- | ----------------------------- | ------------ | -------------------------------------- |
| Database       | MySQL 8 / MariaDB 10.6+       | 3306         | utf8mb4, InnoDB                        |
| Backend API    | Node.js 22+, NestJS 11        | 3001         | global prefix `/api/v1`                |
| Frontend       | Next.js 16 (App Router)       | 3000         | Webpack on platforms without SWC native |
| Reverse proxy  | nginx (recommended)           | 80 / 443     | TLS termination — see `deploy/nginx/`  |

## First-time setup

```bash
# 1. Database
mysql -u root -p <<'SQL'
  CREATE DATABASE sigma_pmo CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
  CREATE USER 'sigma'@'%' IDENTIFIED BY '<strong-password>';
  GRANT ALL ON sigma_pmo.* TO 'sigma'@'%';
  FLUSH PRIVILEGES;
SQL

# 2. Backend
cd backend
cp .env.example .env  # set DB_*, BOOTSTRAP_TOKEN, CORS_ORIGINS, etc.
npm ci
npm run build
npm run migration:run            # production schema
node dist/main                   # or via systemd (see deploy/systemd/)

# 3. First admin user (production: provide x-bootstrap-token)
npm run user:create -- ops@sigma-pmo.com sigma_admin "Operations"
# Capture the printed API key — it is shown ONCE.

# 4. Frontend
cd ../frontend
cp .env.local.example .env.local 2>/dev/null || true  # optional
npm ci
npm run build
npm run start                    # listens on 3000
```

## Daily checklist

- [ ] `curl /api/v1/ready` returns 200 with `db: up`.
- [ ] Latest `mysqldump` from `backup-cron.sh` present off-host.
- [ ] No critical alerts on the `/admin/users` or `/admin/policy` pages.
- [ ] No errors in pino log (`journalctl -u sigma-pmo-backend --since "24h ago" | grep level=50`).

## Routine tasks

### Rotate a user's API key

```bash
curl -X POST https://api.example.com/api/v1/auth/users/<id>/rotate-key \
  -H "x-api-key: $SIGMA_ADMIN_KEY"
# Captures the new key in the response. The old key stops working immediately.
```

### Delete a user (safe — refuses sole admin)

```bash
curl -X DELETE https://api.example.com/api/v1/auth/users/<id> \
  -H "x-api-key: $SIGMA_ADMIN_KEY"
# Returns 409 Conflict if you are the only active sigma_admin.
```

### Re-deploy after `main` updates

```bash
cd /opt/sigma-pmo
git pull
deploy/scripts/deploy.sh
```

### Configure the governance policy

Either via the API (`POST /api/v1/governance/policy`) or via the
`/admin/policy` UI as `sigma_admin` or `client` role. Every save creates a
new versioned `GovernancePolicy` row; the prior version is preserved.

## Environment matrix (12-factor)

| Variable                    | Required | Description                              |
| --------------------------- | -------- | ---------------------------------------- |
| `NODE_ENV`                  | yes      | `production` in deployed environments    |
| `PORT`                      | no       | API port (default 3001)                  |
| `DB_HOST` / `DB_PORT`       | yes      | MySQL connection                         |
| `DB_USERNAME` / `DB_PASSWORD` | yes    | MySQL credentials                        |
| `DB_DATABASE`               | yes      | Database name (`sigma_pmo`)              |
| `DB_SYNCHRONIZE`            | no       | Forced to false in production            |
| `STORAGE_DIR` / `SAMPLES_DIR` | yes    | Archive root + allowlisted samples dir   |
| `CORS_ORIGINS`              | no       | Comma-separated origins (commas trim)    |
| `BODY_LIMIT`                | no       | Default `25mb`                           |
| `LOG_LEVEL`                 | no       | `info` in prod, `debug` in dev           |
| `BOOTSTRAP_TOKEN`           | yes (prod) | Header `x-bootstrap-token` for first-admin |
| `SENTRY_DSN`                | no       | Enables Sentry error reporting           |
| `RATE_LIMIT_*`              | no       | Throttler buckets                        |
| `LLM_API_KEY` etc.          | no       | Enables LLM rewrite of weekly summary    |
| `EMAIL_SMTP_URL`            | no       | Activates email channel                  |
| `SLACK_WEBHOOK_URL`         | no       | Activates Slack channel                  |
| `TEAMS_WEBHOOK_URL`         | no       | Activates Teams channel                  |

## Cycle-close checklist (contract gate)

1. `npm test` and `npm run test:e2e` — all green.
2. `npm run build` — both backend and frontend.
3. `curl /api/v1/ready` — green.
4. New ADR(s) merged into `docs/adr/`.
5. Architecture notes for the cycle shared 24 h before the Zoom review.
6. Cycle Brief countersigned at the start; Written Acceptance + Cycle Release
   issued in writing at the end.

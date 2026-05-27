# Sigma PMO — Deployment runbook

> Reproducible deployment of the Sigma PMO platform. Targets Hostinger VPS
> (Cycle 8 default) but every step works on any Linux/Windows host with
> Node ≥ 22 and MySQL 8 / MariaDB 10.6+.

## Components

| Service        | Tech                         | Default port | Notes                                  |
| -------------- | ---------------------------- | ------------ | -------------------------------------- |
| Database       | MySQL 8 / MariaDB 10.6+      | 3306         | utf8mb4, InnoDB                        |
| Backend API    | Node.js 22+, NestJS 11       | 3001         | `/api/v1` prefix                       |
| Frontend       | Next.js 16 (App Router)      | 3000         | Webpack on platforms missing SWC native |
| Reverse proxy  | nginx (recommended)          | 80 / 443     | TLS termination, route map below       |

## 0. Conditions Precedent (per contract)

- Sigma-owned repository with Service Provider access
- Hostinger credentials (DB host/user, app deployment user)
- Sample data (any P6/Excel/CSV)
- Written go-ahead + Cycle release + 30% kickoff deposit (per Sub-Clause 6 / 10.2)

## 1. Provision the database

```sql
CREATE DATABASE sigma_pmo CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'sigma'@'%' IDENTIFIED BY '<strong-password>';
GRANT ALL ON sigma_pmo.* TO 'sigma'@'%';
FLUSH PRIVILEGES;
```

## 2. Backend

```bash
cd backend
cp .env.example .env
# Edit .env: DB_HOST, DB_USERNAME, DB_PASSWORD, DB_DATABASE
# Production: set DB_SYNCHRONIZE=false and use migrations.
npm ci
npm run build

# First-time schema:
DB_SYNCHRONIZE=true node dist/main   # boot once to sync, then stop
# OR (recommended for prod):
npm run migration:generate -- src/migrations/Init
npm run migration:run

# Run:
node dist/main      # production
npm run start:dev   # development
```

## 3. Create the first admin user

```bash
npm run user:create -- ops@sigma-pmo.com sigma_admin "Operations"
# Note the printed API key — it is not shown again. Set as x-api-key on writes.
```

Once the first user exists, **all write endpoints require x-api-key**.

## 4. Frontend

```bash
cd frontend
cp .env.local.example .env.local   # if present; else create
# Optionally set NEXT_PUBLIC_API_BASE if API is not at http://localhost:3001/api/v1
npm ci
npm run build
npm run start       # listens on 3000
```

## 5. nginx route map (recommended)

```
location /api/   { proxy_pass http://127.0.0.1:3001; }
location /       { proxy_pass http://127.0.0.1:3000; }
```

## 6. Backups

- **MySQL:** `mysqldump -u sigma -p sigma_pmo > backup_YYYY-MM-DD.sql`
  scheduled daily (cron / Task Scheduler).
- **Source-file archive:** rsync `data/storage/` to off-host weekly. The
  archive is content-addressed and immutable — re-uploading the same file
  is a no-op.

## 7. Restore drill (verify recoverability)

```bash
mysql -u sigma -p sigma_pmo < backup_YYYY-MM-DD.sql
node backend/dist/main           # boots clean against restored DB
curl http://localhost:3001/api/v1/health    # expect { db: 'up' }
```

## 8. Health & monitoring

- `GET /api/v1/health` — returns `{ status, db, timestamp }`.
- Application logs: stdout (NestJS Logger). Capture to journald / file.
- Per-ingestion audit trail in `ingestion_run` table.

## 9. Environment matrix (12-factor)

| Variable                    | Required | Description                                |
| --------------------------- | -------- | ------------------------------------------ |
| `NODE_ENV`                  | yes      | `production` in deployed environments      |
| `PORT`                      | no       | API port (default 3001)                    |
| `DB_HOST` / `DB_PORT`       | yes      | MySQL connection                           |
| `DB_USERNAME` / `DB_PASSWORD` | yes    | MySQL credentials                          |
| `DB_DATABASE`               | yes      | Database name (`sigma_pmo`)                |
| `DB_SYNCHRONIZE`            | no       | `false` in prod                            |
| `STORAGE_DIR`               | no       | Source-file archive root                   |
| `CORS_ORIGINS`              | no       | Comma-separated origins for the front-end  |
| `LLM_API_KEY`               | no       | Enables LLM rewrite of executive summary   |
| `LLM_PROVIDER`              | no       | `anthropic` (default) or `openai`          |
| `LLM_MODEL`                 | no       | Model name                                 |
| `SLACK_WEBHOOK_URL`         | no       | Slack notifications                        |
| `TEAMS_WEBHOOK_URL`         | no       | Teams notifications                        |
| `EMAIL_SMTP_URL`            | no       | Email transport (placeholder)              |

## 10. Cycle-close checklist

1. `npm test` — all jest suites green.
2. `npm run build` — both backend and frontend.
3. Health probe green.
4. New ADR(s) merged into `docs/adr/`.
5. Architecture notes file shared 24 h before the Zoom review (per the
   agreed cycle gate).
6. Cycle Brief countersigned at the start; Written Acceptance + Cycle
   Release issued in writing at the end.

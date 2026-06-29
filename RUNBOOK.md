# Sigma PMO — RUNBOOK

Operational guide: run from a clean clone, deploy, migrate, back up/restore, and troubleshoot.
Companion docs: [`FINAL_HANDOVER.md`](FINAL_HANDOVER.md), [`ENVIRONMENT_VARIABLES.md`](ENVIRONMENT_VARIABLES.md),
[`docs/BACKUP-RESTORE.md`](docs/BACKUP-RESTORE.md), [`docs/AUTODESK-APS.md`](docs/AUTODESK-APS.md).

---

## 0. Toolchain — npm only
This project is locked to **one package manager: npm** (one lockfile, `backend/package-lock.json`).

- **Do not use pnpm or yarn.** A `preinstall` guard ([`backend/scripts/enforce-npm.cjs`](backend/scripts/enforce-npm.cjs))
  stops them with a clear message; `backend/.npmrc` sets `engine-strict=true`; `package.json` declares
  `engines` (`node >=20`, `npm >=10`). There is intentionally **no** `pnpm-lock.yaml` / `yarn.lock`.
- Supported runtime: **Node ≥ 20**, **npm ≥ 10** (production image is `node:20-alpine`).
- If you previously ran pnpm/yarn here, delete any stray `pnpm-lock.yaml`/`yarn.lock` and
  `node_modules`, then `npm ci`.

---

## 1. Run the backend from a clean clone
```bash
git clone <repo> sigma-pmo && cd sigma-pmo/backend
cp .env.example .env            # then fill DB_* (see ENVIRONMENT_VARIABLES.md)
npm ci                          # clean, lockfile-only install (NOT npm install)
npm run migration:run           # create/upgrade the schema (DB_SYNCHRONIZE stays false)
npm run start:dev               # http://localhost:3001, API under /api/v1, Swagger at /api/v1/docs
```
First-ever boot with an empty users table: create the first admin with the `x-bootstrap-token` header
(value = `BOOTSTRAP_TOKEN`) — see `POST /auth/bootstrap-admin`.

## 2. Run the frontend
```bash
cd ../frontend
npm ci
# point the app at the API:
echo 'NEXT_PUBLIC_API_BASE_URL=http://localhost:3001/api/v1' > .env.local
npm run dev                     # http://localhost:3000
```

## 3. Build + test (the exact clean-room proof)
From a fresh checkout this is the **single command chain** that proves the build:
```bash
cd backend
npm ci && npm run build && npm test
```
Expected (Node 24 / npm 11 reference host, commit pinned in FINAL_HANDOVER.md):
- `npm ci` → installs from the lockfile, exit 0.
- `npm run build` (`nest build`) → exit 0.
- `npm test` (`jest`) → **69 suites passed, 997 passed, 1 skipped**, exit 0.

Frontend:
```bash
cd frontend && npm ci && npx tsc --noEmit && npm run build
```
Other useful test commands: `npm run test:cov` (coverage), `npm run test:e2e` (e2e config).

## 4. Database migrations
- Migrations live in [`backend/src/migrations/`](backend/src/migrations/) and are **auto-discovered**
  (no manual registration). They are **additive and idempotent** (each `ADD COLUMN` is guarded by an
  `information_schema` check) and every migration implements `down()`.
- Apply: `npm run migration:run`. Revert the last: `npm run migration:revert`.
- Generate after an entity change: `npm run migration:generate -- src/migrations/<name>`.
- **`DB_SYNCHRONIZE` must remain `false`** in every environment. Schema only ever changes via migrations.
- In production, migrations also run automatically on container start (`migrationsRun`).

## 5. Deploy (Coolify)
- Each git branch auto-deploys its **own** Coolify environment. `main` = **production**
  (`system.sigma-pmo.com` web, `system-api.sigma-pmo.com` API). There are separate `test` and `dev`
  environments on their branches.
- Production is built from the multi-stage [`backend/Dockerfile`](backend/Dockerfile)
  (`node:20-alpine`, `npm ci --include=dev` → `npm run build` → `npm prune --omit=dev`) and
  [`frontend/Dockerfile`](frontend/Dockerfile).
- Config comes from the Coolify env panel (see `ENVIRONMENT_VARIABLES.md`) — **never** from a committed file.
- **Before any push, confirm the target branch** (`test` / `dev` / `production`=`main`); each deploys
  a different environment.

## 6. Backups & restore
- **Automatic:** nightly in-app encrypted backup to S3/R2 (`BackupService @Cron`, pure `mysql2`) plus
  the file archive already on S3 — together they back up **files + data**.
- **On-demand:** `POST /backup/run` (super-admin) or `cd backend && npx ts-node scripts/backup-db-to-s3.ts`.
- **Restore (DESTRUCTIVE, needs `--yes`):**
  ```bash
  npx ts-node scripts/restore-db-from-s3.ts --list
  npx ts-node scripts/restore-db-from-s3.ts --latest --yes
  ```
- **Restore verification without touching prod:** restore the latest into a throwaway DB and check row
  counts (monthly drill). There is also an in-app `POST /backup/restore-verify` that proves a backup
  restores into a scratch schema and reports row counts. Full procedure: `docs/BACKUP-RESTORE.md`.
- `BACKUP_ENCRYPTION_KEY` is a production secret — losing it makes `.enc` backups unrecoverable.

## 7. Health & operations
- Liveness/diagnostics and per-integration status:
  - `GET /integrations/autodesk/status?probe=true` — APS configured? (no secret returned)
  - `GET /drawings/capabilities` — honest accepts/extraction/clash matrix.
  - `GET /journey/:projectKey` — full lifecycle chain for a project (good smoke test).
- Logs: structured (pino). In prod, `LOG_LEVEL=info`. Secrets are never logged.
- More: [`docs/runbook/ops.md`](docs/runbook/ops.md), [`monitoring.md`](docs/runbook/monitoring.md),
  [`incident.md`](docs/runbook/incident.md).

## 8. Troubleshooting
| Symptom | Cause | Fix |
|---|---|---|
| `pnpm install` / `yarn` fails immediately with a "locked to npm" banner | The preinstall guard | Use `npm ci`. (CI-only override: `SIGMA_ALLOW_ANY_PM=1`.) |
| `npm ci` errors "lockfile out of sync" | `package.json` edited without refreshing the lockfile | `npm install --package-lock-only`, commit both. |
| `nest: command not found` in Docker build | `npm ci` omitted devDeps under `NODE_ENV=production` | Dockerfile already uses `npm ci --include=dev`; keep it. |
| Build OK but tests "fail" intermittently when several builds run at once | Concurrent `nest build`/`jest` in the same dir clobber `dist/`/cache | Run one build/test at a time (or isolated dirs). |
| AI features return a "deterministic-only" notice | `ANTHROPIC_API_KEY` unset | Set it in env or `/admin/settings`. Platform still works without it. |
| DWG/RVT upload only archives, no geometry | APS not configured | Set `AUTODESK_CLIENT_ID` + `AUTODESK_CLIENT_SECRET` (`docs/AUTODESK-APS.md`). IFC works natively meanwhile. |
| Schema missing new columns after deploy | Migrations not run | `npm run migration:run` (prod runs them on boot). |

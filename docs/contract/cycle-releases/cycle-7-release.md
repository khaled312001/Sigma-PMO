# Cycle Release — Cycle 7 (Layer 3, Platform Core + RBAC)

- **Status:** `DRAFT — pending Sigma countersignature`
- **Issued by:** Khaled Ahmed
- **Contract clause:** 10.2 + 10.1 + Annex 3 #11
- **Cycle:** 7 of 8 · Layer 3 · Days 85–98 · USD 800
- **Precondition met:** Final integration list locked (see `docs/contract/assumptions/A11-integrations-final-list.md`)

## 1. Scope delivered

Modular service architecture + environment separation + secrets management + scheduled backups + RBAC + admin / workflow controls + configurable governance + versioned API.

## 2. Deliverables manifest

### Commits
- `6a8ede5` — Layer 3: RBAC (User + ApiKeyGuard + capabilities) + /api/v1 + notifications & P6 webhook stubs + migrations setup + deployment runbook + root README.
- `2e1bb4c` — Layer 3: refresh root README.
- `8d7074b` — UI/UX polish: icon set, sidebar redesign, top bar, shared primitives.
- `3f0e74d` — UX: account menu in top bar (sign in/out from every page) + /account /help + 404 + global error boundary.

### RBAC + auth
- `backend/src/modules/auth/roles.enum.ts` — 5 roles (sigma_admin, sigma_reviewer, client, consultant, contractor) + capability matrix.
- `backend/src/modules/auth/api-key.guard.ts` — sha-256 of `x-api-key`; bootstrap-permissive until first User row exists, then enforces; `BOOTSTRAP_TOKEN`-gated and sole-admin-protected (Phase 2 hardening).
- `backend/src/modules/auth/require-capability.decorator.ts` + `auth.controller.ts` + `auth.service.ts`.
- `backend/scripts/create-user.ts` — CLI for first admin and subsequent users; prints raw API key once.

### Versioned API + hardening
- `backend/src/main.ts` — global prefix `/api/v1`; helmet; pino logger; request-id middleware; body size limits; CORS configurable via `CORS_ORIGINS`; Sentry init guarded by `SENTRY_DSN`.
- `backend/src/common/throttler.module.ts` — `@nestjs/throttler` global with per-route buckets.
- `backend/src/health/health.controller.ts` — split `/live` (always 200) and `/ready` (DB + storage).

### Migrations + environment separation
- `backend/src/migrations/{1700000000000-Init,1700000000100-AddIndexes}.ts` — production schema baseline + indexes.
- `backend/data-source.ts` — TypeORM data source for CLI.
- `backend/src/database/database.module.ts` — forces `synchronize=false` whenever `NODE_ENV=production`.

### Operations runbooks (Clause 8)
- `docs/runbook/ops.md` — provision, build, run, nginx, env matrix, daily ops.
- `docs/runbook/incident.md` — severity ladder, on-call action, rollback.
- `docs/runbook/backup.md` — daily `mysqldump` + weekly off-host rsync.
- `docs/runbook/restore.md` — drill steps + RTO/RPO.
- `docs/runbook/monitoring.md` — health probes + Sentry thresholds + log aggregation pointer.

### Deployment artifacts (Phase 9)
- `deploy/nginx/sigma-pmo.conf`
- `deploy/systemd/sigma-pmo-{backend,frontend}.service`
- `deploy/scripts/{provision,deploy,backup-cron,restore-drill}.sh`
- `deploy/.env.production.example`
- `deploy/README.md` — "deploy in 60 minutes"

### Documentation
- `docs/adr/0008-layer-3-platform.md`
- `docs/reviews/cycle-7-architecture-notes.md`

## 3. Acceptance evidence

Acceptance criterion: *Dev/staging/prod stack live; backup and restore proven; roles enforced end-to-end; API consumed externally.*

| Item                                | Evidence in repo |
| ----------------------------------- | ---------------- |
| Modular service architecture        | `backend/src/modules/` — 9 modules with clear boundaries |
| Environment separation              | `NODE_ENV`-driven; `database.module.ts` forces `synchronize=false` in prod |
| Secrets management                  | `.env` gitignored; `.env.example` documented; SHA-256 hashed API keys |
| Scheduled backups                   | `deploy/scripts/backup-cron.sh` + `docs/runbook/backup.md` |
| RBAC                                | `roles.enum.ts` (5 roles) + `ApiKeyGuard` + `@RequiresCapability` |
| Admin / workflow controls           | `/admin/policy`, `/admin/users` + `decision-review` audit |
| Configurable governance             | `GovernancePolicy` versioned JSON (Cycle 5–6) |
| Versioned API                       | `/api/v1` prefix; v2 path reserved for future breaking changes |
| Backup + restore proven             | `deploy/scripts/restore-drill.sh` + drill output (captured when run live on Hostinger) |
| Roles enforced end-to-end           | `@RequiresCapability('canIngest')`, `('canEditPolicy')`, etc. applied to all write routes |
| API consumed externally             | Frontend (`http://localhost:3000`) consumes all `/api/v1/*` endpoints via `lib/api.ts` |

## 4. ADRs included

ADR-0008 (Commercial platform layer).

## 5. Pending live deployment

Production execution to Hostinger awaits credentials per Cycle 7 brief inputs. All artifacts in `deploy/` ready for a ~60-minute deploy. Live URL + restore-drill output to be appended to `docs/handover/acceptance-evidence-pack.md` when executed.

## 6. Release signature

| Party                         | Name        | Date       | Signature      |
| ----------------------------- | ----------- | ---------- | -------------- |
| Service Provider              | Khaled Ahmed | 2026-05-28 | _Khaled Ahmed_ |
| Client (Sigma)                | Al Ayham    |            |                |

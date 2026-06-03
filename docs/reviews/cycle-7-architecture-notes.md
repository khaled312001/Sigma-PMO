# Cycle 7 — Architecture Notes for Review

> Cycle 7 scope: **Platform Core + RBAC** (Layer 3 begins).
> Acceptance criterion: *dev / staging / prod stack live; backup and restore proven; roles enforced end-to-end; API consumed externally.*

## 1. Scope delivered

| Area                       | Delivered                                                                  |
| -------------------------- | -------------------------------------------------------------------------- |
| Modular service architecture | 9 modules with explicit imports/exports (auth · canonical · governance · ingestion · integrations · notifications · rules · summary · validation) |
| Environment separation     | `NODE_ENV`-driven; `database.module.ts` forces `synchronize=false` in prod |
| Secrets management         | sha-256-hashed API keys; `.env` gitignored; `BOOTSTRAP_TOKEN` for first-admin in prod |
| Scheduled backups          | `deploy/scripts/backup-cron.sh` + `docs/runbook/backup.md`                 |
| RBAC                       | 5 roles (`sigma_admin`, `sigma_reviewer`, `client`, `consultant`, `contractor`) + capability matrix + `@RequiresCapability` decorator |
| Sole-admin protection      | `AuthController.deleteUser` blocks deletion of the last active sigma_admin |
| Admin / workflow controls  | `/admin/policy` + `/admin/users` + `decision_review` audit                 |
| Versioned API              | `/api/v1` prefix; v2 path reserved                                          |
| Hardening                  | helmet + throttler (3 buckets: default/auth/ingest) + pino + request-id + body size limit + path allowlist |
| Migrations                 | `1700000000000-Init.ts` + `1700000000100-AddIndexes.ts`; CLI scripts wired   |
| Observability              | pino structured logs (JSON in prod, pretty in dev); HTTP request-id correlation; Sentry-ready via `SENTRY_DSN` |

## 2. Architecture in one picture (production deploy)

```
internet
   │
   ▼
nginx (TLS · /  → frontend :3000  · /api → backend :3001)
   ├─► systemd:sigma-pmo-frontend (Next.js)
   │       │
   │       └─► fetch('/api/v1/…')
   │
   └─► systemd:sigma-pmo-backend (NestJS)
          ├─► helmet · throttler · pino · request-id (in order)
          ├─► ApiKeyGuard (sha-256 lookup + capability)
          ├─► modules/*
          └─► TypeORM (mysql2) ──► MariaDB :3306
```

## 3. Key files

- `backend/src/modules/auth/{auth.service,api-key.guard,auth.controller}.ts` — RBAC + sole-admin guard + key rotation.
- `backend/src/common/{request-id.middleware,throttler.module,logger,path-allowlist}.ts` — security primitives.
- `backend/src/migrations/{Init,AddIndexes}.ts` — production schema baseline.
- `backend/data-source.ts` — CLI data source for migrations.
- `deploy/{nginx,systemd,scripts}/` — full deploy pack.

## 4. Bootstrap-mode reasoning (the Phase-2 fix)

Auditors flagged the original bootstrap behaviour as a CRITICAL escalation vector (delete last admin → all endpoints reopen). The Phase 2 fix:

| Environment      | Users == 0 behaviour                                       |
| ---------------- | ---------------------------------------------------------- |
| Non-production   | Permissive (with one-time warning) — dev ergonomics        |
| Production       | Requires matching `x-bootstrap-token` header; else 503     |
| Any environment  | DELETE on sole active sigma_admin → 409 Conflict           |

This makes it impossible to fall back into open-mode once any admin has existed.

## 5. Deterministic vs AI boundary

Cycle 7 adds zero new AI surface. The LLM use remains rewrite-only for the Cycle-4 summary.

## 6. ADRs raised

- **ADR-0008** — Commercial platform layer (RBAC + versioned API + integrations stubs + migrations + deployment readiness).

## 7. Acceptance evidence (pre-Hostinger)

| Acceptance item                          | Local proof                                                              | Live proof (when Hostinger creds arrive) |
| ---------------------------------------- | ------------------------------------------------------------------------- | ---------------------------------------- |
| dev/staging/prod stack live              | Local dev stack live; `deploy/` artifacts ready for staging + prod        | Pending                                  |
| Backup and restore proven                | `deploy/scripts/backup-cron.sh` + `restore-drill.sh` shellcheck-clean      | Pending — drill output to be captured    |
| Roles enforced end-to-end                | `@RequiresCapability` applied to all write routes; smoke-tested with curl  | n/a (works locally)                       |
| API consumed externally                  | Frontend reads `/api/v1/*`; documented for external clients via OpenAPI hint | Pending — public URL                      |

## 8. Acceptance gate path

Cycle 7 acceptance is **conditional** on the live-deploy portion being captured within 5 business days of Hostinger creds arriving (per `cycle-7-acceptance.md`).

## 9. Deferred / known items

- OIDC / SSO: not in Cycle 7 scope. ADR-0008 documents the swap-in path for the future.
- Load test results: Cycle 8 acceptance criterion.

## 10. What this enables

- Cycle 8 lays the commercial UI + integrations + load tests on top of this hardened stack.
- The platform is one `deploy.sh` away from production.

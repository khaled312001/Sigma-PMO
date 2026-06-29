# Sigma PMO — Environment Variables

Authoritative reference for every environment variable the **backend** reads. Source of truth in
code: [`backend/src/config/configuration.ts`](backend/src/config/configuration.ts); a copy-ready
template lives in [`backend/.env.example`](backend/.env.example).

## How configuration is loaded
- Backend reads `process.env` (in dev, from `backend/.env`). **`backend/.env` is git-ignored and is
  never committed.** In production the values are injected by the host (Coolify env panel), not by a file.
- A few integrations (Anthropic, Autodesk APS, Primavera P6) can **also** be set at runtime from the
  in-app **`/admin/settings`** screen, where they are **encrypted at rest** in the database. When a
  credential exists both in `/admin/settings` and in the environment, the **encrypted setting wins**.
- **Deterministic-first:** every external integration is optional. With its key unset the platform
  stays fully functional in deterministic mode — no silent fallback to fake data.

## Security rules (non-negotiable)
1. **Never** hardcode a secret in source, a migration, a seed, a test, a screenshot, or a log line.
2. Secrets are provided **only** through the host environment or the encrypted `/admin/settings` store.
3. Account/integration credentials are registered in the **platform owner's** own accounts; the
   service provider does not need to see or hold them.
4. The backend never logs or returns a secret value; status endpoints report **enabled/disabled only**.

---

## 1. Application & HTTP
| Variable | Required | Default | Purpose |
|---|---|---|---|
| `NODE_ENV` | no | `development` | `production` in prod (enables prod logging, disables dev niceties). |
| `PORT` | no | `3001` | HTTP port. API is served under `/api/v1`. |
| `BODY_LIMIT` | no | `25mb` | Max request body (used by `/ingestion/upload`, base64 file uploads). |
| `CORS_ORIGINS` | prod | `http://localhost:3000` | Comma-separated allowed origins for the browser app. |
| `LOG_LEVEL` | no | `debug` (dev) | `trace\|debug\|info\|warn\|error\|fatal`. |
| `SENTRY_DSN` | no | — | When set, errors report to Sentry. |

## 2. Database (MySQL) — required
| Variable | Required | Default | Purpose |
|---|---|---|---|
| `DB_HOST` | yes | `localhost` | MySQL host. |
| `DB_PORT` | yes | `3306` | MySQL port. |
| `DB_USERNAME` | yes | `root` | DB user. |
| `DB_PASSWORD` | yes | — | DB password. |
| `DB_DATABASE` | yes | `sigma_pmo` | Schema name. |
| `DB_SYNCHRONIZE` | yes | `false` | **MUST stay `false`.** Schema changes go through migrations, never runtime auto-sync. |
| `DB_LOGGING` | no | `false` | SQL query logging. |

Migrations run automatically on boot in production (`migrationsRun`). To run them by hand:
`cd backend && npm run migration:run`.

## 3. Bootstrap & rate limits
| Variable | Required | Default | Purpose |
|---|---|---|---|
| `BOOTSTRAP_TOKEN` | prod (first boot) | — | Allows first-admin creation while no users exist, via `x-bootstrap-token` header. Remove after first admin is created. |
| `RATE_LIMIT_DEFAULT_LIMIT` | no | `100` | Per-IP requests/minute (default bucket). |
| `RATE_LIMIT_DEFAULT_TTL_MS` | no | `60000` | Window for the default bucket. |
| `RATE_LIMIT_AUTH_LIMIT` | no | `10` | Per-IP login attempts/minute. |
| `RATE_LIMIT_INGEST_LIMIT` | no | `30` | Per-IP ingest/upload calls/minute. |

## 4. Storage (file archive)
| Variable | Required | Default | Purpose |
|---|---|---|---|
| `STORAGE_DIR` | no | `../data/storage` | Local disk archive root (used when S3 is **not** configured). |
| `SAMPLES_DIR` | no | `../data/samples` | Allow-listed sample inputs. |

When the `S3_*` block (section 8) is set, `StorageService` writes/reads the archive on S3 instead of
local disk — **same content-addressed paths**, so switching is transparent.

## 5. Anthropic Claude (AI narratives, FIDIC drafts, clash proposals) — optional
| Variable | Required | Default | Purpose |
|---|---|---|---|
| `ANTHROPIC_API_KEY` | no | — | When empty, the platform is **deterministic-only** (no AI prose). When set, persona-mediated features turn on. |
| `ANTHROPIC_DEFAULT_MODEL` | no | `claude-sonnet-4-5` | Concrete model id when a persona tier needs resolving. |
| `ANTHROPIC_DEFAULT_TIER` | no | `claude-sonnet` | Default tier slug. |
| `ANTHROPIC_MAX_TOKENS` | no | `4096` | Default completion size. |
| `ANTHROPIC_CACHE_TTL` | no | `3600` | Ephemeral prompt-cache TTL (seconds). |
| `ANTHROPIC_COUNCIL_ENABLED` | no | `false` | Multi-member "LLM Council" adjudication. |
| `ANTHROPIC_COUNCIL_SIZE` | no | `3` | Council size when enabled. |

> Can also be set (encrypted) at `/admin/settings`. **This is a server-side key; it is never shipped
> to the browser.**

## 6. Autodesk Platform Services (APS) — DWG/RVT geometry — optional
| Variable | Required for APS | Default | Purpose |
|---|---|---|---|
| `AUTODESK_CLIENT_ID` | **yes (to enable APS)** | — | 2-legged OAuth client id (Model Derivative). |
| `AUTODESK_CLIENT_SECRET` | **yes (to enable APS)** | — | 2-legged OAuth client secret. |
| `AUTODESK_BASE_URL` | no | `https://developer.api.autodesk.com` | Override only for region-specific APS hosts. |

**These two values are the ONLY ones required** to translate DWG/RVT via APS Model Derivative. The
pipeline uses **server-side 2-legged (client-credentials) OAuth** — there is **no callback URL and no
3-legged scope** to configure for translation. Without them, the BIM surface stays on the **native IFC
parser** (IFC works today; DWG/RVT geometry needs APS). Full detail + native-vs-APS boundary:
[`docs/AUTODESK-APS.md`](docs/AUTODESK-APS.md). Preferred entry point: `/admin/settings` (encrypted).

## 7. Primavera P6 EPPM (live schedule pull) — optional
| Variable | Required for P6 | Purpose |
|---|---|---|
| `P6_BASE_URL` | yes (to enable) | P6 EPPM REST root, e.g. `https://<host>/p6ws/restapi`. |
| `P6_DATABASE` | yes (to enable) | P6 database id. |
| `P6_USERNAME` / `P6_PASSWORD` | yes (to enable) | P6 service account. |

Without these, P6 data still arrives via `.xer/.xml/.pdf` upload + the inbound webhook. Preferred entry
point: `/admin/settings` (encrypted).

## 8. S3 / S3-compatible object storage (file archive + DB backups) — optional
| Variable | Required for S3 | Default | Purpose |
|---|---|---|---|
| `S3_BUCKET` | yes (to enable) | — | Bucket name. |
| `S3_REGION` | yes (to enable) | `us-east-1` | Region (`auto` for Cloudflare R2). |
| `S3_ACCESS_KEY` / `S3_SECRET_KEY` | yes (to enable) | — | Access credentials. |
| `S3_ENDPOINT` | for non-AWS | — | S3-compatible endpoint (R2/MinIO/Hetzner/Backblaze/Wasabi). |
| `S3_FORCE_PATH_STYLE` | for non-AWS | `true` | Path-style addressing. |
| `S3_PREFIX` | no | — | "System folder" key prefix for all archive objects + backups. |
| `S3_SSE` | no | — | `AES256` for server-side at-rest encryption (AWS). |

## 9. Database backups → S3/R2 — optional but recommended
| Variable | Required for backups | Default | Purpose |
|---|---|---|---|
| `BACKUP_ENCRYPTION_KEY` | yes (to encrypt) | — | 32-byte hex (`openssl rand -hex 32`). AES-256-GCM encrypts each dump before upload. **Same key required to restore.** |
| `BACKUP_RETENTION` | no | `14` | Days of backups to keep. |

Nightly in-app backup (`BackupService @Cron`, pure `mysql2`) runs automatically; on-demand via
`POST /backup/run`. CLI variants: `scripts/backup-db-to-s3.ts` / `restore-db-from-s3.ts`. See
[`docs/BACKUP-RESTORE.md`](docs/BACKUP-RESTORE.md).

## 10. Stripe (multi-tenant SaaS billing) — optional
| Variable | Required for billing | Default | Purpose |
|---|---|---|---|
| `STRIPE_SECRET_KEY` | yes (to enable) | — | Server-side Stripe key. |
| `STRIPE_PUBLISHABLE_KEY` | yes (to enable) | — | Browser publishable key. |
| `STRIPE_PRICE_ID` | yes (to enable) | — | Subscription price id. |
| `STRIPE_WEBHOOK_SECRET` | yes (to enable) | — | Verifies inbound webhooks. |
| `STRIPE_TRIAL_DAYS` | no | `30` | Free-trial length. |
| `APP_PUBLIC_URL` | for billing redirects | `http://localhost:3000` | Frontend URL for Checkout success/cancel + login links. |

Without Stripe, company registration uses the trial-only flow (no card capture).

## 11. Outbound notifications — optional
| Variable | Purpose |
|---|---|
| `EMAIL_SMTP_URL` | SMTP URL for outbound email, e.g. `smtp://user:pass@smtp.example.com:587`. For the domain mailbox (e.g. `info@sigma-pmo.com`) use that provider's SMTP. |
| `SLACK_WEBHOOK_URL` | Slack incoming webhook. |
| `TEAMS_WEBHOOK_URL` | Microsoft Teams webhook. |

## 12. Frontend
The Next.js app needs only the API base URL (build/deploy-time), e.g.
`NEXT_PUBLIC_API_BASE_URL=https://system-api.sigma-pmo.com/api/v1`. No secret belongs in the frontend.

---

### What is "native" vs "external" (at a glance)
| Capability | Native (no credentials) | External (needs a key) |
|---|---|---|
| Governance rules, decisions, audit, baselines, FIDIC clause checks | ✅ | — |
| IFC (STEP) parsing, native geometric clash, BOQ/cost, CPM, claims | ✅ | — |
| DB + file archive on local disk | ✅ | — |
| AI prose (narrative reports, FIDIC draft text, clash proposals) | — | `ANTHROPIC_API_KEY` |
| DWG/RVT geometry & quantities, SVF2 viewer | — | `AUTODESK_CLIENT_ID` + `AUTODESK_CLIENT_SECRET` |
| Live P6 schedule pull | upload/webhook | `P6_*` |
| File archive + DB backups on object storage | local disk | `S3_*` (+ `BACKUP_ENCRYPTION_KEY`) |
| SaaS subscription billing | trial-only | `STRIPE_*` |

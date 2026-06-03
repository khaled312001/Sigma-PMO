# Written Acceptance — Cycle 7 (Layer 3, Platform Core + RBAC)

- **Status:** `DRAFT — pending Sigma signature`
- **Contract clause:** 10.1 + Annex 3 #11
- **Cycle:** 7 of 8 · USD 800 · Days 85–98
- **Linked release:** `docs/contract/cycle-releases/cycle-7-release.md`

## 1. Acceptance criterion (Annex 1)

> *Dev / staging / production stack live with backup and restore proven; roles enforced end-to-end; API consumed externally.*

## 2. Reminder (Clause 10.1)

Acceptance must be granted **explicitly in writing** by the Client. **Silence does not constitute acceptance.**

## 3. What is being accepted

The platform core as released in Cycle 7 release: modular service architecture (9 backend modules) · environment separation (`NODE_ENV`-driven, `synchronize=false` enforced in production) · secrets management (sha-256 hashed API keys, `.env` gitignored, bootstrap-token-gated) · scheduled backups (`deploy/scripts/backup-cron.sh`) · 5-role RBAC with `@RequiresCapability` decorator and sole-admin protection · `/admin/policy` and `/admin/users` admin surfaces · configurable governance via versioned policy · versioned API `/api/v1` · helmet + throttler + pino + request-id + Sentry-ready + body limits.

Migrations land for production: `Init` + `AddIndexes` under `backend/src/migrations/`. The `synchronize=true` dev convenience is force-disabled when `NODE_ENV=production`.

Five separate ops runbooks delivered: `docs/runbook/{ops,incident,backup,restore,monitoring}.md` per Clause 8.

## 4. Pending live deployment proof

Live deployment to Hostinger and backup/restore drill execution are pending Hostinger credentials. All deploy artifacts in `deploy/` are ready for a ~60-minute provision/deploy/smoke-test/drill sequence per `deploy/README.md`. Output of the drill will be appended to `docs/handover/acceptance-evidence-pack.md` § "Live deploy proof" when executed.

The "live with backup/restore proven" portion of the acceptance criterion becomes verifiable only after Hostinger creds arrive. Until then, this acceptance is conditional on the Service Provider executing the runbook within 5 business days of credentials being provided.

## 5. Written acceptance

By countersigning below, the Client confirms that the Cycle 7 deliverables meet the contractual acceptance criterion (subject to the live-deploy condition above) and triggers the **70% completion payment** of USD 560 per Clause 6.

| Party                         | Name        | Date       | Signature      |
| ----------------------------- | ----------- | ---------- | -------------- |
| Client (Sigma)                | Al Ayham    |            |                |
| Service Provider (witness)    | Khaled Ahmed |            |                |

## 6. Cycle release control (Clause 10.2)

Cycle 8 release must be issued separately in writing.

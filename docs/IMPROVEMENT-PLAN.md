# Sigma PMO — Development & Improvement Plan

_Status snapshot: multi-tenant SaaS live and verified. Backend `tsc=0`, **379 jest tests pass**,
**15/15 live multi-tenant e2e pass**. Tenant isolation verified end-to-end (a new company sees 0
data everywhere; foreign project keys are blocked 403). Claude is live; Stripe + S3 are config-driven
and degrade gracefully when unset._

---

## 0. Where we are
- **Tenancy:** company self-registration (construction-entity type → platform config), per-company
  login `/c/:slug`, platform super-admin, `companyId` on the canonical + investment + ingestion entities.
- **Isolation:** request-scoped tenant context (AsyncLocalStorage) + `companyScope()` across every
  dashboard/list, plus a global `ProjectScopeGuard` that rejects any request carrying a foreign
  `projectKey`/`projectId` (403). Verified across ~10 page families.
- **Billing:** Stripe Checkout (30-day trial) + signed webhook, config-driven.
- **Storage:** `StorageService` writes to S3 when configured, else local disk. DB backup script exists.

---

## 1. Security & isolation hardening — _highest priority_
1. **Close residual get-by-id leaks.** Sub-resources without `companyId` (letter / drawing / report /
   cost-estimate / baseline-job / clash / procurement-package / funding-facility `:id`) still need an
   owning-project ownership check. Low practical risk (their list endpoints are guarded, so a user
   never obtains a foreign id) — but close it for defence-in-depth.
2. **Write-path audit.** Confirm every create/update stamps `companyId` and every mutate-by-`:id`
   verifies ownership (the guard covers query/param/body project keys, not arbitrary sub-resource ids).
3. **Isolation regression suite.** A jest spec that registers two companies and asserts zero
   cross-visibility across all endpoints, so isolation can never silently regress.
4. **Shared-vs-tenant decision.** Decide whether Vendor registry, Knowledge base, and Personas are
   global platform reference (current behavior) or per-company. Sources + Personas are intentionally global.
5. **Abuse protection.** Tighten rate-limits on `/onboarding/register`, `/auth/login`, `/c/:slug`;
   add lockout/backoff; CAPTCHA on public registration if needed.
6. **Super-admin guardrails.** Audit-log every super-admin action (suspend/cancel/reply); confirm
   `canManagePlatform` is the only cross-company read path.

## 2. Billing & monetization (Stripe go-live)
1. Provide real Stripe keys (`STRIPE_SECRET_KEY` / `STRIPE_PRICE_ID` / `STRIPE_WEBHOOK_SECRET`) +
   `APP_PUBLIC_URL`; point the webhook at the deployed domain.
2. **Plans & entitlements:** Starter / Pro / Enterprise → seat limits, module/feature gating, project
   + storage quotas. Enforce seat limits in `onboarding.addUser`; gate modules by plan.
3. **Stripe Customer Portal** (`/billing/portal`) so companies manage card / invoices / cancellation.
4. **Dunning & grace:** `past_due` → in-app banner; suspend on cancel; reactivation on repay.
5. (Optional) **Usage metering** of AI tokens per company for cost visibility / metered plans.

## 3. Data durability — Database on S3
> MySQL is an OLTP engine and cannot run *directly* on S3 (object storage, not block storage). The
> production-grade "database on S3" pattern is: **managed MySQL + automated encrypted backups to S3 +
> the file archive on S3**, optionally with point-in-time recovery via binlog shipping.

1. **DB → S3 backups:** schedule `scripts/backup-db-to-s3.ts` (nightly `mysqldump | gzip | encrypt →
   s3://…/db-backups/<ts>.sql.gz`) with retention; add a tested **restore** script + a periodic
   restore drill; alert on backup failure.
2. **File archive on S3:** set `S3_*` envs in prod so uploads/PDFs/evidence live on S3 (already wired).
3. **PITR (optional):** ship MySQL binlogs to S3 for near-zero-RPO recovery.
4. **DB backups for the company:** include per-company export (a tenant can request its own data dump).
> _Decision required — see the question raised alongside this plan._

## 4. Performance & scale
1. **Guard cost:** `ProjectScopeGuard` does one lookup per project-keyed request — cache the company's
   project keys in the per-request tenant store, and add a composite index `(businessKey, companyId)`.
2. **Indexes:** ensure every new `companyId` column is indexed (done) + hot query paths covered.
3. **N+1 review** in scoring / rollup / list endpoints; batch where possible.
4. **Read caching** for heavy aggregates (executive scores, hierarchy tree) with per-company cache keys.
5. **Pooling + query timeouts**; pagination on every list endpoint.

## 5. Observability & operations
1. Per-company request tagging in logs (pino already in place); error tracking via Sentry (`SENTRY_DSN`).
2. `/health` + readiness endpoints; uptime + latency + error-rate monitoring.
3. Backup-success + webhook-failure alerts; super-admin audit log.

## 6. Product & UX
1. Onboarding: email verification, welcome email, password-reset flow.
2. Company settings: logo upload → S3, branding, members-management UI.
3. Super-admin tooling: company drill-down, support impersonation, subscription editing, ticket replies.
4. In-app billing banner (trial days left / past_due).
5. Finish the **AI report → professional PDF download** (MarkdownLite headings already added).
6. i18n completeness pass (AR/EN) over the new SaaS surfaces.

## 7. Deployment & hosting
1. **Real migrations:** generate proper TypeORM migrations for the tenancy + billing + isolation
   columns to replace the dev `apply-*-dev.ts` scripts in production.
2. Dockerize backend + frontend; CI/CD (build → test → migrate → deploy).
3. Staging + prod environments; secrets management; domain + TLS + CDN; reverse proxy.
4. DR runbook (DB restore-from-S3 + storage recovery).

## 8. Suggested sequencing
- **Phase 1 (security & durability):** §1 hardening + isolation regression tests + real migrations +
  §3 DB→S3 backups + S3 storage enablement.
- **Phase 2 (revenue):** §2 Stripe go-live + plans/entitlements + customer portal.
- **Phase 3 (scale & ops):** §4 performance + §5 observability + §7 deployment automation.
- **Phase 4 (polish):** §6 product/UX + super-admin tooling + AI report PDF.

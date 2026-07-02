# Sigma PMO — RPO / RTO &amp; Post-Delivery Support

> Operational recovery objectives and the post-delivery support plan. The recovery numbers are
> **targets validated by the restore-verify drill** and the real backup cadence in the code
> (`backend/src/modules/backup/backup.service.ts`, [`BACKUP-RESTORE.md`](BACKUP-RESTORE.md)); the
> support plan is a professional template the platform owner can adopt as-is. Companion runbooks:
> [`runbook/backup.md`](runbook/backup.md) · [`runbook/restore.md`](runbook/restore.md) ·
> [`runbook/incident.md`](runbook/incident.md) · [`runbook/monitoring.md`](runbook/monitoring.md).
>
> **الخلاصة (Arabic summary):** نسخة احتياطية مشفّرة كل ليلة إلى S3/R2 ⇒ أقصى فقدان بيانات
> **≤ 24 ساعة** (RPO). تجربة الاستعادة في 2026-07-02 استرجعت ~79 جدولاً/~5,084 صفاً في ~22 ثانية إلى
> قاعدة مؤقتة دون المساس بالإنتاج ⇒ هدف زمن الاستعادة الكامل **≤ 1–2 ساعة** (RTO). خطة دعم بثلاثة
> مستويات خطورة (P1/P2/P3).

---

## 1. Backup cadence (the basis for the numbers)

| What | How | Where |
|---|---|---|
| **Nightly DB backup** | `BackupService` `@Cron(EVERY_DAY_AT_2AM)` — pure-`mysql2` logical dump (DDL + data) → gzip → **AES-256-GCM** encrypt (`BACKUP_ENCRYPTION_KEY`) → upload | `s3://<bucket>/<prefix>/db-backups/<db>-<ts>.sql.gz.enc` |
| **On-demand DB backup** | `POST /backup/run` (super-admin) or `npx ts-node scripts/backup-db-to-s3.ts` | same prefix |
| **File archive** | Uploads/PDFs are content-addressed to S3/R2 via `StorageService` as they are written | `s3://<bucket>/<prefix>/...` |
| **Retention** | Pruned to `BACKUP_RETENTION` (default **14** newest) after each run | — |
| **Verification** | `POST /backup/restore-verify` (into a throwaway scratch schema) + a monthly manual restore drill | see §3 |

DB backups + the file archive together are **files-and-data durable**. The `BACKUP_ENCRYPTION_KEY`
is a production secret kept **out** of the bucket — losing it makes `.enc` backups unrecoverable.

---

## 2. RPO — Recovery Point Objective

**RPO ≤ 24 hours.**

- **Basis.** The database is captured by the nightly `@Cron` backup (~02:00). In the worst case — a
  loss occurring just before the next nightly run — at most the writes since the last successful
  backup (≤ 24 h) are lost. The file archive is effectively continuous (objects are written to
  S3/R2 as they are uploaded), so **uploaded files have an RPO near zero**; the 24 h bound applies to
  relational data only.
- **How to drive it toward zero.** Add **MySQL binlog shipping to S3** for point-in-time recovery on
  top of the nightly logical dumps — this is already documented as the next step in
  [`BACKUP-RESTORE.md`](BACKUP-RESTORE.md) ("For near-zero-RPO recovery, add MySQL binlog shipping").
  A managed MySQL (RDS / Aurora / Cloud SQL) additionally provides native automated snapshots.

---

## 3. RTO — Recovery Time Objective

**RTO target ≤ 1–2 hours** for a full production restore + redeploy.

- **Empirical evidence (restore-verify drill, 2026-07-02).** `POST /backup/restore-verify` downloaded
  the newest backup, decrypted + gunzipped it, replayed it into a throwaway scratch schema, counted
  the tables/rows from `information_schema`, then dropped the scratch schema — **production untouched**.
  It restored **≈ 79 tables / ≈ 5,084 rows in ≈ 22 seconds**. (This is a point-in-time count that
  grows with the dataset; the endpoint reports `tables`, `rows` and `durationMs` on every run.)
- **Why the target is 1–2 h, not 22 s.** The raw data load is seconds; the RTO budget is dominated by
  the surrounding operational steps, not the SQL replay:

  ```mermaid
  flowchart LR
      A["Provision / confirm<br/>MySQL instance"] --> B["restore-db-from-s3<br/>--latest --yes"]
      B --> C["App boot runs<br/>pending migrations"]
      C --> D["Redeploy API + web<br/>(Coolify) · point DNS"]
      D --> E["Smoke test<br/>/api/v1/ready · /journey"]
  ```

  1. **Provision / confirm** the MySQL target (minutes if the instance exists; longer if a new one
     must be created).
  2. **Restore:** `npx ts-node scripts/restore-db-from-s3.ts --latest --yes` (destructive; requires
     `--yes`). Seconds-to-minutes for the current data volume.
  3. **Migrations** run automatically on app boot in production (`migrationsRun`), so the schema is
     brought current with no manual step.
  4. **Redeploy** the API + web on Coolify and re-point DNS if the host changed.
  5. **Smoke test** `GET /api/v1/ready` (DB round-trip) and `GET /journey/:projectKey`.

- **Honesty.** ≤ 1–2 h is a **target validated by the restore-verify drill** (the data-load portion is
  proven; the provisioning/redeploy/DNS portion depends on the hosting state at incident time). It is
  not a contracted, independently-audited SLA.

| Objective | Target | Basis |
|---|---|---|
| **RPO** | **≤ 24 h** (relational data); ~0 (uploaded files) | Nightly `@Cron` DB backup + continuous file archive |
| **RTO** | **≤ 1–2 h** (full prod restore + redeploy) | 2026-07-02 restore-verify: ~79 tables / ~5,084 rows in ~22 s |

---

## 4. Backup monitoring — owner, cadence, alerting

| Item | Detail |
|---|---|
| **Owner** | Platform operator / **super-admin** (the account holding `canManagePlatform`). |
| **Daily** | Confirm the nightly backup ran: check the pino log line `Nightly backup ok → <key> (<MB>)`; list objects via `GET /backup` (super-admin) or `scripts/restore-db-from-s3.ts --list`. Run the daily checklist in [`runbook/ops.md`](runbook/ops.md) (`/api/v1/ready` green, latest backup present, no `level=50` log errors). |
| **Monthly** | **Restore drill** ([`BACKUP-RESTORE.md`](BACKUP-RESTORE.md) §"Monthly restore drill"): restore the latest into `sigma_restore_check`, sanity-check `SELECT COUNT(*)` on `company`/`project`, drop it. Or the one-click `POST /backup/restore-verify`. *Never trust an un-tested backup.* |
| **On failure** | The nightly cron logs `Nightly backup FAILED: <error>` at error level (pino `level=50`). If `SENTRY_DSN` is set, unhandled errors + 5xx flow to Sentry; the recommended rules in [`runbook/monitoring.md`](runbook/monitoring.md) route "new exception" to ops and "5xx > 1%/5min" to page on-call. Recommended addition: an alert on the **absence** of the nightly success log line (a missed backup is silent otherwise). |
| **Key custody** | `BACKUP_ENCRYPTION_KEY` lives in the secrets manager, never in the bucket. Rotate per policy; a lost key means unrecoverable `.enc` backups. |

---

## 5. Post-delivery support plan (template)

> A professional support template aligned with the existing severity ladder in
> [`runbook/incident.md`](runbook/incident.md). Response = time to first human acknowledgement;
> resolution = time to fix **or** a workaround. Targets assume the owner's hosting is reachable.

### 5.1 Channels
- **Primary:** a shared support inbox / ticket queue (email or issue tracker) monitored in business
  hours.
- **In-app:** tenant `support_request` tickets (`POST /onboarding/support`) surface to the super-admin.
- **Escalation:** a named on-call contact for P1 (see §5.4).

### 5.2 Severity levels &amp; targets

| Level | Definition | Response (ack) | Target resolution / workaround | Runbook SEV |
|---|---|---|---|---|
| **P1 — Critical** | Platform unavailable to all tenants (API/DB down, login broken). | **15 min** | **≤ 4 h** (restore service or safe rollback). | SEV1 |
| **P2 — High** | A major feature down or a single tenant blocked (e.g. ingestion failing, backups failing). | **1 h** | **≤ 1 business day**. | SEV2 |
| **P3 — Normal** | One role / one project affected, or a non-blocking defect with a workaround. | **1 business day** | **≤ 5 business days** or a scheduled release. | SEV3 |
| **P4 — Low** | Cosmetic, documentation, or enhancement request. | Best-effort | Backlog / next planned cycle. | SEV4 |

### 5.3 Scope

**Covered**
- Bug fixes for delivered functionality (regressions, incorrect behaviour vs the accepted spec).
- Operational guidance: deploy, migrate, backup/restore, health, env-var configuration.
- Restore assistance and drill support.
- Security patches for delivered code and dependency advisories.

**Out of scope (change request, not support)**
- **New features** or new integrations, new roles/personas, new report types.
- Data entry / content authoring on the owner's behalf.
- Provisioning or paying for third-party accounts (Anthropic, Autodesk APS, Stripe, S3/R2, SMTP) —
  these are the **owner's** credentials; support configures, it does not own them.
- Performance tuning beyond the delivered baseline, or bespoke monitoring stacks
  (Prometheus/OpenTelemetry are noted as future work in `runbook/monitoring.md`).

### 5.4 Escalation &amp; runbooks
1. **Triage** the ticket to a severity (§5.2).
2. **First five minutes** for any incident: follow [`runbook/incident.md`](runbook/incident.md) —
   check `/api/v1/live` + `/api/v1/ready`, capture the `x-request-id`, pull the pino log slice,
   check Sentry.
3. **Rollback path** (P1/P2 caused by a release): `git checkout <tagged release>` → redeploy
   ([`runbook/incident.md`](runbook/incident.md) §"Known rollback path"). If a migration is implicated,
   take a backup first, then see [`runbook/restore.md`](runbook/restore.md).
4. **Data recovery:** [`BACKUP-RESTORE.md`](BACKUP-RESTORE.md) + §3 above.
5. **Post-incident note:** scope, root cause, time-to-detect, time-to-resolve, linked request-ids;
   feed monitoring gaps back into `runbook/monitoring.md`.

**Runbooks pointer:** [`docs/runbook/`](runbook/) — `ops.md`, `incident.md`, `monitoring.md`,
`backup.md`, `restore.md`.

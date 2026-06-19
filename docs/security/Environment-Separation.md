# Sigma PMO — Environment Separation & Security Hardening (2026-06-19)

This note explains how the single Sigma image is run as three clearly-separated
environments and how each of the security review's points is enforced. It
accompanies the **Security & Tenant-Isolation Test Report**
(`Sigma-Security-Tenant-Isolation-Report.pdf`, 20/20 live tests PASS).

## The three environments

| | **Demo** | **UAT** | **Production** |
|---|---|---|---|
| Purpose | Controlled demonstrations | Product-Owner testing on real data | Commercial clients |
| `SEED_DEMO` | `true` | `false` | `false` |
| `DEMO_LOGIN_PUBLIC` | `true` | `false` | `false` |
| `NEXT_PUBLIC_DEMO_LOGIN` | `true` | `false` | `false` |
| Sample accounts | Business roles only (one-click) | none | none |
| Platform admin | private password, not in picker | real auth only | real auth only |
| Data | sample / non-sensitive | your real project data | per-tenant client data |
| Suggested host | `demo.sigma-pmo.com` | `uat.sigma-pmo.com` | `app.sigma-pmo.com` |

Templates: `deploy/env/{demo,uat,prod}.env.example`.

> **External-sharing rule.** Until UAT/Production are stood up with the settings
> above, the current public link (`system.sigma-pmo.com`) is a **controlled Demo
> only** — it must not be positioned as production-ready for external clients.

## How the demo login is actually disabled (not just hidden)

The one-click picker on the login page is cosmetic; the real control is at the
API. Every seeded sample account is flagged `isDemo=true`. When
`DEMO_LOGIN_PUBLIC=false`, `AuthService.authenticateByPassword` refuses those
accounts outright — so even a direct `curl` to `/auth/login` with a sample
credential fails. On UAT/Production there are no sample accounts at all
(`SEED_DEMO=false`), and the picker is removed from the build
(`NEXT_PUBLIC_DEMO_LOGIN=false`).

## Demo passwords & the platform admin

- Sample (business-role) passwords come from `DEMO_SEED_PASSWORD` and are reset
  on every boot — the previously-shared `…#2026` credentials are dead.
- The privileged **Sigma Admin / Reviewer** never get a public password: set
  `ADMIN_SEED_PASSWORD` for a stable private login, or leave it empty and the
  seeder generates a strong random one and logs it once. They are **not** in the
  one-click picker — platform admin is reached only via manual login.

## Tenant isolation (multi-tenant SaaS)

- Every record and user carries a `companyId`; a per-request tenant context
  (AsyncLocalStorage) is set from the authenticated user.
- A global `ProjectScopeGuard` rejects any request for a project key the
  caller's company does not own (403); `ProjectOwnershipService` closes the
  fetch-by-sub-resource-id path; list/read endpoints filter by `companyId`.
- Self-registration only ever creates a **company-scoped owner** (role from the
  company-type preset) — never a platform admin, never `companyId = null`.

## Subscription / trial controls

`AuthService.assertCompanyActive` runs on every authenticated request and at
login. It returns **403** when the company is `suspended`/`cancelled`, the
subscription is `cancelled`, or the free trial has ended — and access is
restored the moment the super-admin reactivates/extends it.

## Audit log (always-on)

`AuditInterceptor` writes an append-only `audit_log` row for **every mutation
and every login** (success + failure): actor, company, action, method, path,
HTTP status, IP, timestamp. Request bodies/passwords are never stored. Read it,
company-scoped, at `GET /audit` (platform super-admin sees all).

## Reproducing the test report

A running backend (any environment) can be verified end-to-end:

```
BASE=https://uat-api.sigma-pmo.com/api/v1 \
SUPER_EMAIL=... SUPER_PW=... DEMO_PW=... \
node docs/security/run-isolation-test.mjs
```

It registers two companies, ingests a project for one, and exercises
cross-tenant access, suspension/reactivation, subscription cancellation, trial
expiry and the audit log — writing full evidence to
`docs/security/isolation-evidence.json`.

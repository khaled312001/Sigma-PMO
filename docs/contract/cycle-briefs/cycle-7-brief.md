# Cycle Brief — Cycle 7 (Layer 3, Platform Core + RBAC)

- **Status:** `DRAFT — pending signature`
- **Issued by:** Khaled Ahmed (Service Provider)
- **Addressed to:** Al Ayham (Sigma)
- **Contract clause:** 10.2 + Annex 3 #11
- **Cycle number:** 7 of 8
- **Layer:** 3 — Full Commercial Platform Layer
- **Calendar window:** Days 85 – 98
- **Cycle fee:** USD 800  (30% kickoff USD 240 · 70% completion USD 560)

## 1. Scope (verbatim from Annex 1)

> *Modular service architecture + environment separation + secrets management + scheduled backups + RBAC + admin / workflow controls + configurable governance + versioned API.*

## 2. Acceptance criterion (verbatim from Annex 1)

> *Dev / staging / production stack live with backup and restore proven; roles enforced end-to-end; API consumed externally.*

## 3. Inputs from Sigma (preconditions per Annex 3)

- **Annex 3 #11 — Final integration list** locked in writing (see `docs/contract/assumptions/A11-integrations-final-list.md`).
- Written Cycle 7 release.
- USD 240 kickoff deposit.
- Hostinger VPS credentials (DB host/user/password, application user, sudo access for provisioning).
- Production domain + DNS access (or staging subdomain).

## 4. Deliverables

- `backend/src/modules/auth/{roles.enum,api-key.guard,require-capability.decorator,auth.{controller,service,module}.ts}` — 5-role RBAC (sigma_admin · sigma_reviewer · client · consultant · contractor) + capability matrix + `@RequiresCapability` decorator + bootstrap-token-gated first-admin flow + sole-admin protection.
- `backend/src/modules/canonical/entities/user.entity.ts` — User entity with sha-256 `apiKeyHash`, `projectScopes`, `active` flag.
- `backend/src/main.ts` — global prefix `/api/v1`, helmet, throttler, pino logger, request-id middleware, body size limits, Sentry-ready.
- `backend/src/migrations/{Init,AddIndexes}.ts` — production migration baseline; `synchronize=false` enforced when `NODE_ENV=production`.
- `backend/data-source.ts` — TypeORM CLI data source wired.
- `deploy/{nginx,systemd,scripts}/` — provision · deploy · backup · restore-drill scripts; nginx config; systemd units.
- `docs/runbook/{ops,incident,backup,restore,monitoring}.md` — five separate ops runbooks per Clause 8.
- `docs/adr/0008-layer-3-platform.md`.
- `docs/reviews/cycle-7-architecture-notes.md`.

## 5. Sequencing notes

- Annex 1 Layer 3 clarification: RBAC role views for Contractor / Consultant / Client / Sigma; four standard surfaces (input / review / approval / evidence) — functional, not view-only.
- Native mobile apps + bespoke role-specific workflow screens remain Re-scope Triggers (Annex 2).
- Live deployment to Hostinger executable in ~60 minutes once creds arrive (sequence in `deploy/README.md`).

## 6. Cycle release signature

| Party                         | Name        | Date | Signature |
| ----------------------------- | ----------- | ---- | --------- |
| Client (Sigma)                | Al Ayham    |      |           |
| Service Provider              | Khaled Ahmed |      | _Khaled Ahmed (pre-signed)_ |

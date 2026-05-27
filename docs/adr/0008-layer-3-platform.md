# ADR-0008 — Commercial platform layer (Layer 3)

- **Status:** Accepted
- **Date:** 2026-05-27
- **Layer / Cycle:** Layer 3 / Cycles 7–8 (Commercial platform)
- **Decision owner:** Khaled Ahmed
- **Reviewers:** Al Ayham, Syed Moinuddin

## Context

Layer 3 turns the working engine into a deployable, multi-stakeholder
platform: RBAC, admin/workflow controls, a versioned API, inbound/outbound
integrations, and the production hardening + deployment runbook the contract
calls for in Annex 1.

The platform stays one unified web application (per the Layer 3
Implementation Depth Clarification), with four standard role surfaces
(input / review / approval / evidence) driven by RBAC — not separate apps.

## Decision

### 1. RBAC (API-key based)

- **`User` entity** — `email`, `displayName`, `role`, `apiKeyHash`,
  `projectScopes`. The raw API key is never persisted; only its SHA-256.
- **`Role` enum** — `sigma_admin`, `sigma_reviewer`, `client`,
  `consultant`, `contractor` (matches Annex 1 stakeholders + Sigma internal).
- **`ApiKeyGuard`** (registered as `APP_GUARD`) — extracts `x-api-key`,
  hashes, resolves a User, then checks a per-route required capability
  declared via `@RequiresCapability(...)`. **Bootstrap mode**: while the
  `user` table is empty the guard is permissive, so dev/seed flows are not
  blocked; the first User row enables enforcement project-wide.
- **`scripts/create-user.ts`** — one-shot CLI to mint users and print the
  raw key once (`npm run user:create -- <email> <role> [displayName] [scopes]`).

Capability matrix per role lives in `roles.enum.ts` and is the single
authority. Admin/workflow editing of role capabilities is a Cycle-8.x
follow-on (per the Re-scope Triggers boundary).

### 2. Versioned API — `/api/v1`

Global prefix moves from `/api` to `/api/v1`. Subsequent breaking changes
get their own `/api/v2` while v1 stays supported. Internal services and the
front-end consume the same prefix, configurable through
`NEXT_PUBLIC_API_BASE`.

### 3. Notifications + integrations (stubs with stable contracts)

- **`NotificationsService.send({channel, to, subject, body})`** — logs by
  default; activates the Slack/Teams adapter when `SLACK_WEBHOOK_URL` /
  `TEAMS_WEBHOOK_URL` is configured. Email adapter is a TODO (SMTP URL
  recognised but no transport wired yet).
- **P6 inbound webhook** — `POST /api/v1/integrations/p6/webhook` accepts
  either inline base64 bytes or a server-side path, then runs the standard
  ingest pipeline. MS Project, Slack/Teams outbound, and email outbound use
  the same `NotificationsService` surface.

### 4. Migrations + production data path

- **`backend/data-source.ts`** — standalone TypeORM `DataSource` reading
  the same env vars as the runtime. Used by `npm run migration:generate`,
  `migration:run`, `migration:revert` to produce a real migration set for
  production (replacing `synchronize: true`).
- Migrations land under `backend/src/migrations/` and are deployed with the
  release; `synchronize` stays true only in development (driven by
  `DB_SYNCHRONIZE` env).

### 5. UI scope

The Cycle-4 internal console (Next.js, single page) is kept as-is for
Layer 1 review surfaces; the Layer-3 commercial UI extension consumes the
same `/api/v1` surface and adds role-specific input/review/approval/evidence
surfaces driven by RBAC — explicitly within the four-standard-surfaces
clarification. Bespoke role-specific screens remain a Re-scope Trigger.

## Reason

- **API-key auth** is the right choice for an internal/B2B operating
  console at this scale — operationally simple, rotatable, no third-party
  identity dependency.
- **Bootstrap-permissive guard** prevents the chicken-and-egg of "I need an
  admin user but the only way to create one is to authenticate as one."
- **Versioned API** is an explicit contractual deliverable; URL-prefix
  versioning is the simplest scheme that keeps backward compatibility.
- **Stub integrations with stable interfaces** mean Sigma can swap a real
  Slack workspace, Email SMTP, or P6 EPS endpoint at any time without
  touching callers.

## Risk & mitigation

- **No password / SSO** — acceptable for internal MVP and the Cycle-7 brief;
  SSO (OIDC) would be a Layer-3.x ADR if Sigma requires it for the client-facing
  surfaces.
- **Bootstrap permissive mode** — clearly logged; an ops checklist (in the
  deployment runbook) instructs the operator to create the first admin
  immediately after first boot.
- **Webhook stub is open** — protected by `RequiresCapability('canIngest')`,
  so once enforcement is on, it requires a service account.

## Replacement path

- **Add OIDC** — drop in a `OidcGuard` alongside `ApiKeyGuard`, register both
  via `APP_GUARD` with a fallback strategy. User entity already has `email`.
- **Move to message queue for notifications** — `NotificationsService.send()`
  contract is queue-friendly; wire BullMQ/RabbitMQ behind it without changing
  any caller.

## Consequences

- Layer 3 acceptance criteria met for Cycle 7 (RBAC + admin/workflow surface
  + versioned API + migrations path) and Cycle 8 (integration stubs +
  deployment runbook + handover pack), with proprietary role flows and
  bespoke screens explicitly held inside the Re-scope Trigger boundary.
- The system is now ready for the Layer-3 acceptance demo: ingest → rules
  → evidence → governance decision → executive summary, all through the
  versioned API, with RBAC enforceable on demand.

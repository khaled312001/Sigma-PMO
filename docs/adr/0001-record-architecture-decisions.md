# ADR-0001 — Record architecture decisions

- **Status:** Accepted
- **Date:** 2026-05-20
- **Layer / Cycle:** Layer 1 / Cycle 1 (Data Foundation)
- **Decision owner:** Khaled Ahmed (Service Provider — execution & tooling ownership)
- **Reviewers:** Al Ayham (product / governance), Syed Moinuddin (architecture / logic / AI boundary)

## Context

The engagement requires, in the Client's written confirmation (2026-05-20), that
**any major architecture decision, dependency, framework change, hosting
constraint, or third-party service be surfaced in writing _before_
implementation — stating its reason, risk, and replacement path — and be
available for Syed's architecture review before it becomes final.**

We need a lightweight, durable mechanism that satisfies this without slowing
delivery.

## Decision

We keep **Architecture Decision Records (ADRs)** in `docs/adr/`, one Markdown
file per decision, numbered sequentially. Every ADR documents the four
contractually-required fields explicitly:

- **Reason** — why the decision is being made.
- **Risk** — what could go wrong and how it is mitigated.
- **Replacement path** — how the choice can be reversed or swapped with no
  lock-in, including the concrete migration route.

An ADR is raised **before** implementing the decision it describes, set to
`Proposed`, shared for Syed's review, and moved to `Accepted` once reviewed.
Superseded decisions are marked `Superseded by ADR-XXXX` rather than deleted, so
the full decision history is auditable.

"Major" means: language/framework choice, datastore, public API contract,
authn/authz model, deployment topology, any new runtime third-party dependency
or external service, and any change to the deterministic-vs-AI boundary.

## Consequences

- The Client and Syed always review architecture from a written baseline.
- No silent dependency or framework drift; every lock-in risk is examined up front.
- Minimal overhead: small decisions stay in code; only "major" ones get an ADR.

# Layer 1 — Architecture Review Checkpoint (Clause 10.4)

> Mandatory checkpoint after Layer 1 acceptance and before Layer 2 begins
> per Clause 10.4 of the Service Agreement.
> Author: Khaled Ahmed. Reviewer: Syed Moinuddin (architecture / AI boundary).
> Co-reviewer: Al Ayham (product / governance).

## 1. Layer 1 closure declaration

Layer 1 (Cycles 1–4) is functionally complete:

| Cycle | Acceptance criterion                                | Notes file                                       | Status |
| ----- | --------------------------------------------------- | ------------------------------------------------ | ------ |
| 1     | Ingest sample P6 + Excel → normalised state         | `docs/reviews/cycle-1-architecture-notes.md`     | Proven |
| 2     | A deviation is detected with full traceback         | `docs/reviews/cycle-2-architecture-notes.md`     | Proven |
| 3     | End-to-end evidence trail on real sample data       | `docs/reviews/cycle-3-architecture-notes.md`     | Proven |
| 4     | Usable internal MVP + full handover                 | `docs/reviews/cycle-4-architecture-notes.md`     | Proven |

## 2. Architecture invariants Syed should verify

| Invariant                                              | How to verify                                                       |
| ------------------------------------------------------ | -------------------------------------------------------------------- |
| **Append-only canonical model** — no row is ever UPDATEd  | `TraceableEntity.isCurrent` exactly-one rule per `businessKey`; covered by `normalizer.service.spec.ts` (Phase 7) |
| **Source bytes recoverable** for any canonical row      | `sourceFile.contentSha256` + `storedPath` → file on disk = original bytes; `StorageService.archive()` uses flag 'wx' |
| **Deterministic engine**                               | No `Math.random`, no clock-dependent logic in rule classes; all coercion in `common/coerce.ts` is pure & locale-free |
| **LLM use is rewrite-only**                            | `LlmService` only takes `grounded` text; system prompt forbids invention; deterministic narrative always persisted |
| **Cross-cycle data flow has no hidden state**          | Snapshot → rules → alerts → evidence → summary → all reproducible from `(rule code, context)` + canonical rows |
| **Module boundaries are unidirectional**               | Dependency graph: `canonical` ← `governance` ← `summary` & `rules`; `ingestion` ← (nothing imports from it inwards) |

## 3. Determinism vs AI boundary (definitive map)

```
INGESTION (Cycle 1)        ─ pure parsing, validation, normalisation. No LLM.
RULE ENGINE (Cycle 2)      ─ pure functions over snapshot. No LLM.
EVIDENCE + CONFIDENCE (3)  ─ deterministic plain-English rationale; weights formula. No LLM.
EXECUTIVE SUMMARY (4)      ─ deterministic grounded narrative ALWAYS persisted.
                             LLM (optional) rewrites the SAME facts. Strict system prompt.
GOVERNANCE POLICY (5)      ─ JSON config; pure mapping in decision engine. No LLM.
SIGMA PROPRIETARY (6)      ─ enters as policy data. No LLM in source.
```

The boundary is intentionally narrow: **the LLM never sees the canonical DB; it only sees text the engine generated.** It can only paraphrase, not introduce new facts.

## 4. Modular service architecture (per Clause 8 — no hidden dependencies)

`backend/src/modules/`:
- `canonical/` — entities only (no behaviour).
- `ingestion/` — parsers, storage, normaliser, ingestion controller. Owns the pipeline.
- `validation/` — pure functions over `RawDataset`.
- `rules/` — rule classes + engine + snapshot.
- `governance/` — confidence, evidence, policy, decision, decision-review.
- `summary/` — summary service + LLM service.
- `auth/`, `notifications/`, `integrations/` — Layer 3 boundary.

All inter-module dependencies are explicit in `*.module.ts` imports. There is no global state.

## 5. Evidence-chain integrity

A single chain answers every governance question:

```
GovernanceDecision  ──►  Alert  ──►  Activity (or other canonical row)  ──►  IngestionRun  ──►  SourceFile  ──►  archived bytes
        │                  │                                                       │
        ▼                  ▼                                                       ▼
    Decision review     Rationale                                             ConfidenceScore
    (Cycle 6)           (Cycle 3)                                             (Cycle 3)
```

Three SQL hops or one HTTP call (`GET /governance/alerts/:id/evidence`) reach every node.

## 6. Escalation readiness (Layer 2 hook)

Layer 2's escalation logic plugs into the existing `Alert.severity` + `IngestionRun.createdAt` columns; no Layer-1 schema change needed.

## 7. Release readiness

| Property                  | Status                                          |
| ------------------------- | ----------------------------------------------- |
| Functional acceptance     | All 4 cycles proven on synthetic dataset        |
| ADR coverage              | ADR-0001 (process) · 0002 (stack) · 0003 (canonical) · 0004 (rules) · 0005 (evidence + confidence) · 0006 (summary + UI) |
| Tests                     | 27 jest tests passing (Phase 7 extends to 60% coverage)  |
| Security hardening status | Phase 2 landed: helmet · throttler · pino · request-id · BOOTSTRAP_TOKEN · sole-admin · path allowlist · body limits |
| Architecture reviewability| One ADR per major decision; this checkpoint file consolidates Layer 1 |

## 8. Sign-off

Per Clause 10.4, Layer 2 Cycle 5 does not begin until this checkpoint is closed in writing.

| Party                         | Name              | Date | Signature |
| ----------------------------- | ----------------- | ---- | --------- |
| Architecture reviewer         | Syed Moinuddin    |      |           |
| Product / governance reviewer | Al Ayham          |      |           |
| Service Provider              | Khaled Ahmed      |      |           |

## 9. Requested review focus (per the agreed flow)

> *architecture integrity · logic discipline · deterministic vs AI boundaries
> · evidence-chain behaviour · escalation flow · release readiness.*

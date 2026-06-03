# Annex 3 #10 — Sigma proprietary governance logic: capture workflow

- **Status:** `DRAFT — pending Sigma confirmation`
- **Contract reference:** Annex 3 item #10 (line 1006) + Clause 7 (IP) + NDA Part B Clause 5
- **Lock window:** before Cycle 6 release

## 1. The assumption (verbatim)

> *Sigma proprietary logic is documented by the Client in writing before Layer 2 Cycle 6 begins.*

## 2. Confirmed workflow

Sigma proprietary logic is entered **by Sigma** through the platform's `/admin/policy` UI. **The Service Provider never sees the content.**

```
┌─────────────────┐    HTTPS + x-api-key      ┌────────────────────────┐
│  Al Ayham       │ ───────────────────────▶  │  POST /api/v1/         │
│  (sigma_admin)  │  policy JSON in body      │  governance/policy     │
└─────────────────┘                           └────────────┬───────────┘
                                                           │
                                                           ▼
                                              ┌────────────────────────┐
                                              │ governance_policy table│
                                              │ append-only version    │
                                              │ (owned by Sigma)       │
                                              └────────────────────────┘
```

### What stays in source code
- Generic FIDIC + PMI baseline only (`default-policy.ts` — public, conservative defaults).
- Generic rule classes (`rules/*.rule.ts`) operating on canonical schema.
- The `GovernancePolicyConfig` TypeScript interface (shape only).

### What stays out of source code
- All Sigma proprietary FIDIC interpretations.
- All Sigma causality / fault weighting / accountability balancing / intervention scoring.
- All commercial-behaviour rules.

## 3. Operational protection (Clause 7 + NDA Part B)

| Concern                                  | Mitigation |
| ---------------------------------------- | ---------- |
| Source-code leakage of Sigma IP          | Content lives only in `governance_policy.config` JSON; not in any source file. |
| Backup tape contains Sigma IP            | DB backups are encrypted at rest per `docs/runbook/backup.md`; Sigma controls the encryption key. |
| Service Provider could read prod DB      | After acceptance, Service Provider access is revoked (per Clause 8 — "may be revoked at any cycle close"). |
| Audit trail of who saw / modified policy | `governance_policy.authoredBy` + per-version row preserves who saved each version; access logs via pino + request-id (Cycle 7). |

## 4. NDA Part B Clause 5 reminder

> *The Service Provider expressly acknowledges that all Sigma governance logic … is the sole and exclusive intellectual property of the Client and that the Service Provider shall not, at any time, use, reuse, replicate, license, adapt, derive, teach, publish, or transfer any part of such logic in or for any other implementation, project, client, product, or derivative work, whether during or after the term of this NDA. This obligation survives termination of the Service Agreement indefinitely.*

## 5. Confirmation signature

| Party                         | Name        | Date | Signature |
| ----------------------------- | ----------- | ---- | --------- |
| Client (Sigma)                | Al Ayham    |      |           |
| Service Provider              | Khaled Ahmed |      |           |

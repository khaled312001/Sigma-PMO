# Written Acceptance — Cycle 8 (Layer 3, Integrations + Commercial UI · closes the engagement)

- **Status:** `DRAFT — pending Sigma signature`
- **Contract clause:** 10.1 + Annex 3 #12 + Clause 7 (IP transfer trigger)
- **Cycle:** 8 of 8 · USD 800 · Days 99–112
- **Linked release:** `docs/contract/cycle-releases/cycle-8-release.md`

## 1. Acceptance criterion (Annex 1)

> *Integrations exchanging data; load test results; deployment runbook; full handover package.*

## 2. Reminder (Clause 10.1)

Acceptance must be granted **explicitly in writing** by the Client. **Silence does not constitute acceptance.**

## 3. What is being accepted

The full commercial platform as released in Cycle 8 release: P6 inbound webhook · MS Project XML parser · email integration via nodemailer SMTP · Slack/Teams outbound webhooks · 11-page unified responsive Next.js console implementing the Annex 1 Layer 3 four standard surfaces (input/review/approval/evidence) as functional operating surfaces with create / submit / upload / review / approve / reject actions per RBAC; multi-project switcher; toast notifications; confirmation dialogs on destructive actions; a11y baseline (aria-labels, focus traps, ≥44px touch targets, ≥4.5:1 contrast, axe-core clean); mobile drawer + tablet + desktop layouts; load test results documented; full handover package (`docs/handover/`).

## 4. Final engagement closure

This acceptance closes the full 8-cycle build path. Per Clause 7:
- Full source code ownership transfers to Sigma at this acceptance.
- All platform logic, schemas, configurations, and assets built for Sigma transfer to Sigma.
- All Sigma proprietary governance logic remains Sigma's intellectual property (NDA Part B Clause 5 — indefinite survival).
- No retained dependency on the Service Provider for platform continuity.

## 5. Written acceptance

By countersigning below, the Client confirms that the Cycle 8 deliverables meet the contractual acceptance criterion and triggers the **70% completion payment** of USD 560 per Clause 6, plus any unpaid completion portions of prior cycles.

Total commercial value of this Agreement (USD 5,000) is now contractually closed.

| Party                         | Name        | Date       | Signature      |
| ----------------------------- | ----------- | ---------- | -------------- |
| Client (Sigma)                | Al Ayham    |            |                |
| Service Provider (witness)    | Khaled Ahmed |            |                |

## 6. Post-acceptance

- Git tag `v1.0.0-acceptance` is placed on the final commit.
- The complete handover package is at `docs/handover/`.
- NDA confidentiality obligations remain in force per Part B Clause 6 (5-year term + indefinite obligation on Sigma proprietary logic).

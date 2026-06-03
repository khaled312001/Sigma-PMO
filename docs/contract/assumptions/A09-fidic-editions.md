# Annex 3 #9 — FIDIC reference editions

- **Status:** `DRAFT — pending Sigma confirmation`
- **Contract reference:** Annex 3 item #9 (line 1005 of `docs/reference/generate_contract.py`)
- **Lock window:** at Layer 2 kick-off (before Cycle 5 release)

## 1. The assumption (verbatim)

> *FIDIC reference editions (Red / Yellow / Silver, year) and PMBOK reference edition are confirmed at Layer 2 kick-off.*

## 2. Lock decision

| Family            | Edition          | In scope | Notes |
| ----------------- | ---------------- | -------- | ----- |
| FIDIC Red Book    | 1999 1st ed.     | ✅       | Default baseline target |
| FIDIC Red Book    | 2017 2nd ed.     | ✅       | Default mapping in `default-policy.ts` uses 2017 numbering |
| FIDIC Yellow Book | 1999 1st ed.     | ✅       | Mapped where clause numbering aligns with Red |
| FIDIC Yellow Book | 2017 2nd ed.     | ✅       | Mapped via `default-policy.ts` |
| FIDIC Silver Book | 1999 / 2017      | ⚠️ TBC   | Confirm with Sigma — default policy does **not** cover Silver-specific clauses |
| FIDIC Gold / Pink / Green Books | any | ❌       | Re-scope trigger per Annex 2 |
| NEC / JCT / AIA / bespoke | any   | ❌       | Re-scope trigger per Annex 2 |
| PMBOK             | 6th ed. (2017)   | ✅       | PMI/PMBOK process group hints in `default-policy.ts` use 6th-ed numbering |
| PMBOK             | 7th ed. (2021)   | ⚠️ TBC   | Confirm with Sigma — 7th ed. shifted from process groups to principles |

## 3. Cross-reference to source

- `backend/src/modules/governance/default-policy.ts` — the FIDIC-2017 clause map (8.4 EOT · 8.5 Delay damages · 8.6 Rate of progress · 4.21 Progress reports · 13 Variations · 14 Contract price · 20.1 Contractor's claims).
- `backend/src/modules/governance/governance-decision.service.ts` — uses `policy.config.fidic[ruleCode]` to attach the FIDIC clause + notice + deadline to each decision.

## 4. Out of scope (Re-scope Triggers)

- NEC, JCT, AIA, and bespoke contract families.
- Multi-jurisdiction overlay (default is FIDIC-as-written).
- Real-time governance flow (default is event-driven).

## 5. Confirmation signature

| Party                         | Name        | Date | Signature |
| ----------------------------- | ----------- | ---- | --------- |
| Client (Sigma)                | Al Ayham    |      |           |
| Service Provider              | Khaled Ahmed |      |           |

# Sigma PMO — Contract Artifacts Index

The paper trail required by the Service Agreement (`docs/reference/Sigma_PMO_Contract_Package.pdf`). Each cycle has three documents that together form one cycle's contractual closure: a **Cycle Brief** (issued at release per Clause 10.2 and Khaled's chat-msg-#24 commitment), a **Cycle Release** (issued by the Service Provider at hand-over, countersigned by the Client per Clause 10.2), and a written **Acceptance** (issued by the Client per Clause 10.1 — "silence ≠ acceptance").

## Status legend

- `DRAFT — pending signature` — drafted, awaiting Al Ayham (Sigma) countersignature.
- `EXECUTED` — countersigned and dated by both Parties; binding.

## Layout

```
docs/contract/
├── README.md                                  ← this file
├── cycle-briefs/        cycle-{1..8}-brief.md
├── cycle-releases/      cycle-{1..8}-release.md
├── acceptances/         cycle-{1..8}-acceptance.md
└── assumptions/         A09-fidic-editions.md
                         A10-sigma-proprietary-logic.md
                         A11-integrations-final-list.md
                         A12-branding.md
                         A13-vision-alignment.md
```

## Cycle ↔ Contract clause mapping

| Cycle | Layer | Days | Fee  | Brief                         | Release                              | Acceptance                              |
| ----- | ----- | ---- | ---- | ----------------------------- | ------------------------------------ | --------------------------------------- |
| 1     | 1     |   1–14   | 700  | [brief](cycle-briefs/cycle-1-brief.md) | [release](cycle-releases/cycle-1-release.md) | [acceptance](acceptances/cycle-1-acceptance.md) |
| 2     | 1     |  15–28   | 600  | [brief](cycle-briefs/cycle-2-brief.md) | [release](cycle-releases/cycle-2-release.md) | [acceptance](acceptances/cycle-2-acceptance.md) |
| 3     | 1     |  29–42   | 400  | [brief](cycle-briefs/cycle-3-brief.md) | [release](cycle-releases/cycle-3-release.md) | [acceptance](acceptances/cycle-3-acceptance.md) |
| 4     | 1     |  43–56   | 300  | [brief](cycle-briefs/cycle-4-brief.md) | [release](cycle-releases/cycle-4-release.md) | [acceptance](acceptances/cycle-4-acceptance.md) |
| 5     | 2     |  57–70   | 700  | [brief](cycle-briefs/cycle-5-brief.md) | [release](cycle-releases/cycle-5-release.md) | [acceptance](acceptances/cycle-5-acceptance.md) |
| 6     | 2     |  71–84   | 700  | [brief](cycle-briefs/cycle-6-brief.md) | [release](cycle-releases/cycle-6-release.md) | [acceptance](acceptances/cycle-6-acceptance.md) |
| 7     | 3     |  85–98   | 800  | [brief](cycle-briefs/cycle-7-brief.md) | [release](cycle-releases/cycle-7-release.md) | [acceptance](acceptances/cycle-7-acceptance.md) |
| 8     | 3     |  99–112  | 800  | [brief](cycle-briefs/cycle-8-brief.md) | [release](cycle-releases/cycle-8-release.md) | [acceptance](acceptances/cycle-8-acceptance.md) |

## Annex 3 assumption locks

Annex 3 of the contract holds open assumptions that must be locked before specific cycle releases. Each lock is countersigned and dated.

| Item | Subject                                     | Required before    | Document                                              |
| ---- | ------------------------------------------- | ------------------ | ----------------------------------------------------- |
| #9   | FIDIC reference editions                    | Layer 2 kick-off   | [A09-fidic-editions.md](assumptions/A09-fidic-editions.md) |
| #10  | Sigma proprietary governance logic capture  | Cycle 6 release    | [A10-sigma-proprietary-logic.md](assumptions/A10-sigma-proprietary-logic.md) |
| #11  | Final integration list                      | Cycle 7 release    | [A11-integrations-final-list.md](assumptions/A11-integrations-final-list.md) |
| #12  | Branding / logos / visual style guide       | Cycle 8 release    | [A12-branding.md](assumptions/A12-branding.md) |
| #13  | Long-term vision lock (2026-06-04)          | Post-v1.0 cycle gate | [A13-vision-alignment.md](assumptions/A13-vision-alignment.md) |

## Linked artifacts

- Architecture notes per cycle (Clause 10.4 + agreed Syed review flow): `docs/reviews/cycle-{1..8}-architecture-notes.md`
- ADRs (process per Clause 9): `docs/adr/0001-0008-*.md`
- Operations runbooks (Clause 8): `docs/runbook/{ops,incident,backup,restore,monitoring}.md`
- Handover entry point (Clause 8): `docs/handover/README.md`

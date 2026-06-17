# Hospital project — platform test runbook

For Mr. Ayham's first real test (meeting 2026-06-16): the **Horse & Camel Hospital**
(~AED/USD 65–70M). This is the step-by-step to run the moment the data arrives (1–2 days).

## What Ayham sends
- **Schedule**: Primavera P6 **Critical Path + baseline** — any of `.xer`, PMXML `.xml`,
  or the P6 Activity-Table `.pdf` export. (Or a live P6 EPPM pull — see Integrations.)
- **Model**: the **IFC drawings** (`.ifc` STEP) from the start of the project.

## Ingestion readiness — VERIFIED 2026-06-17 (new build)
| Input | Path | Result |
|---|---|---|
| P6 `.xer` | `POST /ingestion/ingest-path` (or `/input` upload) | ✅ normalized, confidence 0.99 |
| P6 PMXML `.xml` | same | ✅ normalized |
| P6 `.pdf` critical path | same (parser `p6_pdf`) | ✅ parser + tests |
| IFC model | `POST /bim/upload` (or `/drawings` → BIM Models) | ✅ parsed + archived (SHA-256) |
| Live P6 EPPM | `POST /integrations/p6/sync` | ready (needs P6 credentials) |
| Live Autodesk model | `POST /integrations/autodesk/import` | ready (needs APS credentials) |

## Run the test (UI flow)
1. **Ingest the schedule** — `/input` → upload the `.xer`/`.xml`/`.pdf`. The project +
   activities + critical path land in the canonical model (a new project key is created,
   e.g. from the P6 project id). Confirm the confidence bar on the run.
2. **Upload the IFC model** — `/drawings` → **BIM Models** → upload the `.ifc`. Review the
   element counts (walls/slabs/columns/beams/doors/windows/spaces/storeys) + validation checks.
3. **Select the project** in the top switcher so every page is scoped to the hospital.
4. **Quantity Survey** — `/quantity-survey`: generate a classified estimate from the BIM
   model (BIM → Quantity → Cost → Governance), then **Run QS governance**.
5. **Rules + governance** — `/review` → **Run governance workflow** (alerts + decisions);
   `/analytics` (EVM/SPI/CPI from the schedule); `/risk`; `/claims` (delay → EOT readiness).
6. **Agents pipeline** — `/agents` → **Run full pipeline** (L1→L8) on the project.
7. **Command center** — `/governance-command` → **Recompute (L8)** for the consolidated
   Green/Yellow/Orange/Red verdict + corrective actions.
8. **Report** — `/reports/monthly` → generate the narrated executive report (AR + EN PDF).
9. (Optional) **Acceptance** — `/acceptance` → Run all tests against the project.

## Expected outputs to show Ayham
- Canonical project + ~N activities with the **critical path** and total float.
- **EVM** indices (SPI/CPI/EAC/VAC) + forecast finish/overrun.
- **Governance status** per node (4-tier) with the agents + evidence behind it.
- **BIM quantities** classified (NRM/UniFormat/…) + QS governance findings (with quantum).
- **Risk register** + **claims** with EOT/delay readiness (the known project problems should
  surface as findings).
- A **narrated executive report** (Arabic + English) with `[SOURCE: id]` citations.

## Notes
- With the **Claude API key** set, every AI panel + the report narration light up (and the
  **LLM Council** can adjudicate findings); without it the platform runs deterministic-only.
- Known project problems Ayham mentioned will be the validation: the rule engine + risk +
  claims layers should independently flag them from the schedule + model.

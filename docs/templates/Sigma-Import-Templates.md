# Sigma PMO — Official Import Templates (CSV / Excel)

Use these templates to import schedule data into Sigma. Upload from the **Input
(L1)** page (or `POST /api/v1/ingestion/upload`). Save as **UTF-8 CSV** (or
`.xlsx` with the same column headers). **Upload the project file first, then the
activities** — activities link to their project by `projectKey`.

Download: `/templates/sigma-projects-template.csv`,
`/templates/sigma-activities-template.csv` (links on the Input page).

## 1) Projects — `sigma-projects-template.csv`

| Column | Required | Type / format | Notes |
|---|---|---|---|
| `businessKey` | **Yes** | text (e.g. `P-1000`) | Stable, unique project id. Activities reference this. |
| `name` | **Yes** | text | Project name. |
| `status` | No | text | e.g. `Active`, `On Hold`, `Closed`. |
| `clientName` | No | text | Employer / client. |
| `currency` | No | ISO code | e.g. `USD`, `AED`. |
| `dataDate` | No | `YYYY-MM-DD` | Schedule data date. |
| `plannedStart` | No | `YYYY-MM-DD` | |
| `plannedFinish` | No | `YYYY-MM-DD` | |
| `actualStart` | No | `YYYY-MM-DD` | Leave blank if not started. |
| `actualFinish` | No | `YYYY-MM-DD` | Leave blank if not finished. |
| `budgetAtCompletion` | No | number | Total budget (no thousands separators). |

## 2) Activities — `sigma-activities-template.csv`

| Column | Required | Type / format | Notes |
|---|---|---|---|
| `businessKey` | **Yes** | text (e.g. `A1000`) | Stable, unique activity id. |
| `projectKey` | **Yes** | text | **Must match a project `businessKey`** (P‑1000). The project may be uploaded in the same file **or earlier** — Sigma resolves it. |
| `wbsCode` | No | text | e.g. `1.2`. |
| `name` | **Yes** | text | Activity name. |
| `activityType` | No | text | e.g. `Task Dependent`, `Level of Effort`. |
| `status` | No | text | e.g. `Not Started`, `In Progress`, `Completed`. |
| `plannedStart` / `plannedFinish` | No | `YYYY-MM-DD` | |
| `actualStart` / `actualFinish` | No | `YYYY-MM-DD` | Blank if not started/finished. |
| `plannedDurationDays` / `remainingDurationDays` | No | number | |
| `plannedPctComplete` / `actualPctComplete` | No | fraction `0..1` | `0.45` = 45%. |
| `budgetedCost` / `actualCost` | No | number | |

## Common issues

- **"Uploaded, but no rows were saved" / `activity:0`** — every activity's
  `projectKey` must match an existing project `businessKey`. Upload the project
  first (or include it in the same file). Sigma now resolves a project ingested
  earlier, so a separate activities file links correctly.
- **Dates** must be `YYYY-MM-DD`. **Percentages** are fractions (`0.6`, not `60`).
- Re-uploading the same `businessKey` creates a **new version** (append-only,
  full history kept) — it never overwrites and never affects another company.

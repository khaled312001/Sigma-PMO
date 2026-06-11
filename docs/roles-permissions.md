# Sigma PMO — Roles & Permissions

This note documents what each of the six roles can see and do. **The frontend sidebar reflects the role** (each role gets a different navigation), and the **backend is the real enforcement point** — every write route is guarded by `ApiKeyGuard` + `@RequiresCapability(...)`, so even a hand-crafted request is rejected when the role lacks the capability. Subcontractor data is additionally **activity-scoped and fails closed** (an unscoped subcontractor sees an empty slice, never the whole project).

Source of truth: `backend/src/modules/auth/roles.enum.ts` (`ROLE_CAPABILITIES`), mirrored for the UI in `frontend/lib/capabilities.ts`. Sidebar gating: `frontend/components/Sidebar.tsx`.

Sidebar visibility tiers:
- **read** — any authenticated user (shared operational surfaces).
- **govern** — the strategic-governance tier (`canReadAll` **or** `canEvaluateRules`): the L3–L8 governance views, the command center, executive, hierarchy and the agent registry. The **subcontractor is deliberately excluded**.
- **capability-gated** — a specific flag (ingest, approve, edit policy, edit personas, read-all, simulate, manage hierarchy).

Pages visible per role (counted from the live nav): **Admin 29 · Client 27 · Consultant 25 · Reviewer 24 · Contractor 24 · Subcontractor 11.**

---

## 1. Sigma Admin (`sigma_admin`)
**Charter:** platform operator — full control.
**Sees:** everything (all 29 pages incl. the full Admin group).
**Can:** ingest any source, evaluate rules, run every agent, approve letters + baselines (dual-signature), edit governance policy, **edit personas** (admin-only), manage the hierarchy, trigger Computer Use, read all projects, manage users + settings, read the audit log.
**Cannot:** — (no restrictions).
**Notes:** the only role that can edit personas, change platform settings (Claude key) and trigger Computer Use. Reserve for the Sigma platform team.

## 2. Client (`client`)
**Charter:** governance owner (Al Ayham / Sigma leadership).
**Sees:** 27 pages — everything except **Personas**.
**Can:** read all projects + the full L0–L8 governance views and command center; **edit governance policy** + platform settings; **manage the hierarchy** (create Enterprise/Portfolio/Program, attach projects, recompute status); **approve letters and baselines**; simulate; intake letters (`canIngestLetter`); read users + audit.
**Cannot:** ingest schedules/BoQ (that's the contractor's data), edit personas, trigger Computer Use.
**Notes:** the most powerful non-admin role — the decision authority. Distinct from Admin: no persona editing, no Computer Use, does not upload contractor schedule data.

## 3. Sigma Reviewer (`sigma_reviewer`)
**Charter:** read-only auditor / quality reviewer.
**Sees:** 24 pages — the full governance views + Users + Audit. **No** Input (L1), **no** Simulation, **no** Admin policy/settings/personas.
**Can:** read everything (`canReadAll`), evaluate rules, generate summaries, read users + audit.
**Cannot:** ingest anything, simulate (Khaled-default, open question 13), approve letters/baselines, edit policy/personas/settings, manage hierarchy, trigger Computer Use.
**Notes:** a clean audit charter — observes and evaluates, never mutates governance state. `canSimulate=false` is intentional (flip on Al Ayham's confirmation).

## 4. Consultant (`consultant`)
**Charter:** read + propose + simulate (the Engineer's advisory view).
**Sees:** 25 pages — governance views + Users + Audit + **Simulation**. **No** Input (L1), **no** Admin policy/settings/personas.
**Can:** read all, evaluate rules, generate summaries, **simulate** what-if scenarios, read users + audit.
**Cannot:** ingest, approve, edit policy/personas/settings, manage hierarchy.
**Notes:** like the Reviewer but **with simulation** — can model scenarios without ever writing to canonical truth (scenarios are sandboxed).

## 5. Contractor (`contractor`)
**Charter:** delivers and governs his own slice.
**Sees:** 24 pages — **Input (L1)** + the governance views (his data) + tools. **No Admin group at all** (no users, audit, policy, settings, personas).
**Can:** **ingest schedules, BoQ and his own letters**; evaluate rules + generate summaries on his slice; simulate; read the governance views.
**Cannot:** read all projects (`canReadAll=false` — scoped to his own), approve letters/baselines, edit policy/personas/settings, manage the hierarchy (program-level view only), see any admin page.
**Notes:** the only non-admin/non-subcontractor role that **uploads schedule/BoQ data**. Sees the governance verdict on his work but cannot approve or change policy.

## 6. Subcontractor (`subcontractor`)
**Charter:** minimal — progress updates on assigned activities only.
**Sees:** **11 pages** — Overview, Projects, Knowledge (L0), **Input (L1)**, Repository, Evidence, Baselines, Simulation, Clashes, Drawings, Sources. **No strategic governance views, no command center, no executive, no analytics/risk/claims/decisions, no Admin.**
**Can:** read (activity-scoped), ingest his own progress, simulate (sandbox).
**Cannot:** evaluate rules, generate summaries, read all (`canReadAll=false`), see any L3–L8 governance surface, approve anything, edit anything, manage hierarchy.
**Notes:** the most restricted role. Data is **activity-scoped and fails closed** — an unscoped subcontractor sees an empty list, never the project-wide position. This is the clearest "not like admin" view (11 vs 29 pages).

---

## Capability matrix (backend `ROLE_CAPABILITIES`)

| Capability | Admin | Client | Reviewer | Consultant | Contractor | Subcontractor |
|---|:--:|:--:|:--:|:--:|:--:|:--:|
| canRead | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| canReadAll (all projects) | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| canIngest (generic) | ✅ | ❌ | ❌ | ❌ | ✅ | ✅ |
| canIngestSchedule | ✅ | ❌ | ❌ | ❌ | ✅ | ❌ |
| canIngestBoQ | ✅ | ❌ | ❌ | ❌ | ✅ | ❌ |
| canIngestLetter | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ |
| canEvaluateRules | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| canGenerateSummary | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| canSimulate | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ |
| canApproveLetter | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| canApproveBaseline | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| canEditPolicy | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| canEditPersonas | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| canManageHierarchy | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| canViewEnterprise | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| canViewPortfolio | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| canViewProgram | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| canTriggerComputerUse | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |

## Demo accounts (local seeds — rotate for any real deployment)

| Role | Email | Password |
|---|---|---|
| Sigma Admin | admin@sigma.local | AdminSigma#2026 |
| Sigma Reviewer | reviewer@sigma.local | ReviewerSigma#2026 |
| Client | client@sigma.ae | ClientSigma#2026 |
| Consultant | consultant@sigma.ae | ConsultantSigma#2026 |
| Contractor | contractor@sigma.ae | ContractorSigma#2026 |
| Subcontractor | subcontractor@sigma.ae | SubcontractorSigma#2026 |

The sign-in page's **"Sign in as"** selector fills the email + password for whichever role you pick.

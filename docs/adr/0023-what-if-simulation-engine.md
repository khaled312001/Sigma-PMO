# ADR-0023 — What-If Simulation Engine + atomic schedule revision

- **Status:** Accepted (2026-06-10)
- **Date:** 2026-06-10
- **Layer / Cycle:** Cross-layer (Simulation + Planning + Governance) — Wave 6 Cycle 2 (correction-plan §2.3–§2.4)
- **Decision owner:** Khaled Ahmed
- **Reviewers:** Al Ayham (product / governance)
- **Related:** ADR-0003 (append-only model), ADR-0012 (Outbox), ADR-0013 (priority chain), ADR-0022 (3-options contract), meeting transcript 2026-06-08 @ 00:07:49 + 00:10:24

## Context

Two meeting requirements were missing from the platform:

1. **Pre-approval simulation** (00:07:49): before the decision-maker approves
   a clash option, the platform must show "زيادة بالوقت 15 يوم وزيادة
   بالتكاليف 100 ألف درهم" — a concrete before/after projection.
2. **Approval = reflection on the programme** (00:10:24): approving must
   regenerate the schedule ("يعمل reflection مباشرةً على البرنامج الزمني
   ويطلع ببرنامج جديد… تعديل رقم واحد") and prepare the claim
   ("بكون جهزت كليم كاملة واضحة صريحة").

## Decision

### Simulation (read-only)

`SimulationEngineService.projectClashImpact()` computes the project-level
slip with the **total-float heuristic**: an activity delayed by D days
extends the project by `max(0, D − float)` where
`float = projectFinish − activityFinish`. Exact on the critical path, a
safe ceiling elsewhere. Ingested schedules carry no relationship graph, so
a full CPM re-pass is impossible; the projection's `assumptions` array
says so explicitly — refusal-over-fake-precision, same contract as the
personas.

Every simulation persists a `Scenario` row (status `open`, 30-day TTL)
holding the input + the projection, so the approval can reference exactly
what the human saw.

### Apply (write, atomic)

`ScheduleRevisionService.applyClashResolution()` in ONE transaction:
1. Records `chosenOptionIndex` / `decidedBy` / `decidedAt` on the clash.
2. Issues **append-only Activity revisions**: current rows flip
   `isCurrent=false`, clones with `version+1` and shifted `plannedFinish`
   become current. `rawSource` carries the clash id + approver for audit.
3. Marks the referenced Scenario `committed`.
4. Pushes `planning.schedule.revised` onto the Outbox (same transaction —
   ADR-0012 producer contract).

AFTER commit it best-effort drafts the FIDIC claim letter via the
LetterDrafter. A Claude outage degrades to a warning — an approved revision
is never rolled back because the letter could not be drafted.

### Affected-activity resolution

When the option does not name activities, both engine and revision use the
**conservative-critical assumption** (latest-finishing activities) and say
so in `assumptions` / `warnings`. The simulate and apply paths share the
heuristic so what was displayed is what gets revised.

## Consequences

- Approving requires `canEditPolicy`; simulating requires `canSimulate`
  (every role may run what-ifs per the meeting's role matrix — "يعمل
  simulation دون الدخول على إعدادات المشروع").
- Rollback = flip the version flags back; no data is ever destroyed.
- When the relationship graph lands (TASKPRED ingestion), the float
  heuristic upgrades to a true CPM re-pass behind the same interface.

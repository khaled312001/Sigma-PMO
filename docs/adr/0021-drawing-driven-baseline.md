# ADR-0021 — Drawing-driven baseline generation (phase 1)

- **Status:** Accepted (2026-06-10) — phase 1 (PDF feature extraction + floor-scaled template); IFC is phase 2, DWG/RVT phase 3
- **Date:** 2026-06-10
- **Layer / Cycle:** Layer 1 (Engineering) + Layer 2 (Planning) — Wave 7 (correction-plan §2.1/§2.7)
- **Decision owner:** Khaled Ahmed
- **Reviewers:** Al Ayham (product / governance)
- **Related:** ADR-0017 (Author Path), ADR-0006 (deterministic-first), meeting transcript 2026-06-08 @ 00:23:39–00:23:48

## Context

The meeting's baseline instruction is drawings-first: «الانبوت تبعي هو
مخططات drawings… base on this drawing اعملي baseline program». The Wave-4
Author Path generated the template purely from the project window — the
same ~90 activities for every building.

## Decision

**Phase 1 (this ADR):**

1. `DrawingPackage` entity + `/drawings` upload surface. PDF sets archive
   immutably (SHA-256) and extract: page count, sheet titles, floor hints
   (GROUND/FIRST/…/LEVEL n/G+n + Arabic markers), discipline hints
   (ARCH/STR/MEP/ELE/PLB/FF), and a bounded text excerpt.
2. **The detected floor count genuinely changes the schedule:**
   `BaselineTemplateService.synthesise()` accepts `floorCount` and
   generates one columns+slab cycle PER above-ground floor — a G+5 set
   produces 24 superstructure activities where a G+1 set produces 8.
3. `POST /baselines/jobs/author` accepts `drawingPackageId`; the job
   records the package (audit) and `resynthesise()` re-derives the same
   floor count after restarts (determinism survives).
4. **Honesty contract:** scanned PDFs with no text layer record
   `extractionNote` and fall back to the default template — the platform
   never invents features it could not read.

**Phase 2/3 (future):** IFC via `web-ifc` (structured floors/spaces/MEP
zones — no heuristics needed), then DWG/RVT via licensed tooling.

## Consequences

- The "generic template" path survives as the fallback and is labelled as
  such; the drawing-driven path is the primary flow once a package exists.
- Floor detection is heuristic in phase 1 — the UI shows the detected
  count before generation so the planner can correct it (future small UX).

# ADR-0019 — Monthly Narrative Report

- **Status:** Accepted
- **Date:** 2026-06-09
- **Layer / Cycle:** Layer 4 (Reports) — Wave 1 deliverable; sits on top of
  the Layer 1 deterministic core (ADR-0003, ADR-0004, ADR-0005, ADR-0006),
  the persona system (ADR-0010), and the cross-layer bus (ADR-0012). It
  does **not** depend on the still-`Proposed` cross-layer priority chain
  (ADR-0013) — the monthly report reads facts, it does not arbitrate
  conflicts.
- **Decision owner:** Khaled Ahmed (Service Provider).
- **Reviewers:** Al Ayham (product / governance — the report is one of
  the four artefacts he signs every month and the one he reads first).
- **Related:** ADR-0001 (ADR contract), ADR-0003 (canonical model &
  append-only traceability — the report is a derived view, never a source
  of truth), ADR-0004 (rule engine v1 — the facts the narrative is built
  from), ADR-0005 (evidence & confidence — every claim in the report is
  evidence-backed), ADR-0006 (summary & UI — the LLM-stays-a-rewriter
  boundary this ADR explicitly inherits), ADR-0010 (persona system — the
  Monthly Report Author persona, `reports.monthly.author.ar-AE`),
  ADR-0012 (cross-layer bus — the report consumes Outbox events but does
  not emit any of its own).

## Context

The 2026-06-08 post-meeting plan, **section 3.4** ("التقرير الشهري —
Monthly narrative report"), named the monthly narrative report as one of
the four artefacts the platform owes the Owner every cycle (alongside the
baseline programme review, the FIDIC letter draft, and the executive
dashboard). Al Ayham's framing in the meeting was explicit:

> التقرير الشهري مش جدول أرقام. هو **سرد** — يوصف للمالك إيه اللي حصل،
> ليه حصل، إيه التأثير، وإيه الخطوة القادمة. بس كل جملة فيه لازم تكون
> مربوطة بحقيقة محسوبة من الـ baseline والـ actuals، مش رأي.

Two constraints fall out of that framing and are the spine of this ADR:

1. **Facts first, prose second.** The numbers, dates, percentages, and
   variance figures in the report are computed deterministically from the
   canonical model (ADR-0003) and the rule-engine outputs (ADR-0004)
   **before** any LLM is invoked. The LLM's only job is to turn the fact
   bundle into Arabic-domain prose with the voice of the relevant persona
   — exactly the ADR-0006 boundary, applied to a longer-form surface.
2. **Multi-audience, single source.** The same fact bundle is rendered
   three ways — for the Owner, for the Project Director (PD), and for
   the Contractor — with different emphasis, different tone, and
   different recommended actions, but never different numbers. The
   audience switch is a persona switch plus a section template switch,
   not a recomputation.

The codebase today has none of this surface. There is a `SummaryView`
(commit `5edff62`) that renders the executive summary as structured
cards, an evidence renderer with hero confidence (commit `a5e441d`), and
a policy structured view (commit `e55d323`) — all single-screen UI, all
in the existing PDF-less render path. The monthly report is a different
artefact: it leaves the app as a **PDF** that the Owner forwards to his
board, and the rendering pipeline therefore has to produce a deterministic
binary on the server, not a screenshot of a React tree.

The 2026-06-08 plan, **section 4.5** ("PDF rendering — server-side,
deterministic, no headless browser"), also pinned the rendering library:

> ما نستخدمش Puppeteer/Playwright في الإنتاج لتقرير شهري — أوزان كبيرة،
> اعتماد على Chromium، صعب الـ reproducibility. نستخدم `pdf-lib` —
> مكتبة TypeScript نقية، تبني الـ PDF من primitives، نتيجتها
> deterministic، ما تحتاج binary خارجي.

`pdf-lib` is a pure-TypeScript PDF construction library that builds the
document from primitives (pages, fonts, text runs, vector graphics). It
ships in the same Node process as the rest of the backend, has no
Chromium dependency, and produces byte-identical output for identical
input — which matters because the report is **versioned and hashed** as
an Evidence-backed artefact (ADR-0005), and a non-deterministic renderer
would make the hash useless.

## Decision

The Monthly Narrative Report is a first-class Layer 4 artefact, built in
three sequential stages — **Fact Bundle → Persona Rewrite → PDF Render** —
with the Owner / PD / Contractor audience split implemented as three
parallel render passes over the **same** Fact Bundle.

### 1. Stage 1 — Deterministic Fact Bundle

For each `(project, reportingPeriod)` pair, a new service
`MonthlyReportFactBundler` (in `backend/src/modules/reports/monthly/`)
produces a **`MonthlyFactBundle`** — a typed, append-only, hash-stable
object whose every field is either:

- a value read directly from the canonical model (ADR-0003), or
- a value computed by an existing rule-engine rule (ADR-0004), or
- an aggregation over the above with the aggregation function named
  inline (e.g. `weightedAverage(progressByWbs, byBaselineCost)`).

The bundle contains, at minimum:

- **Project header** — `projectId`, `projectName`, `reportingPeriod`
  (ISO month), `baselineVersion.businessKey`, `dataAsOf` timestamp.
- **Schedule facts** — planned-vs-actual progress %, schedule variance
  in days against the current baseline (per ADR-0003: never group by
  `project.id`, always by `businessKey` — see Feedback memory note),
  Critical Path slip in days, top three slipping WBS branches with
  their evidence ids.
- **Cost facts** — earned value (EV), planned value (PV), actual cost
  (AC), CPI, SPI, each with the rule id that computed it and the
  Evidence trace.
- **Governance facts** — open Alerts grouped by severity, Decisions
  landed in the period grouped by policy area, FIDIC-tagged events
  pending letter generation (count only — letter drafts are ADR-TBD,
  not in scope here).
- **Cross-layer facts** — Engineering verdicts (clash count, severity),
  Planning verdicts (Critical Path health), Governance verdicts (policy
  breaches), each tagged with the originating `Layer` enum value from
  ADR-0012. No conflict resolution happens here — if two layers
  disagree, **both** verdicts appear in the bundle, with their
  disagreement called out as a typed `LayerDisagreement` fact for the
  persona to narrate. Resolution is ADR-0013's job, not this ADR's.

The bundle is **immutable** once built — it is hashed (SHA-256 over the
canonicalised JSON), persisted as a `MonthlyFactBundle` row keyed by
`businessKey = 'monthly_fact_bundle.<projectBusinessKey>.<period>'`, and
referenced by `id` from every downstream artefact. Re-running the
bundler for the same `(project, period)` with the same upstream data
produces the same hash; if the hash changes, that is itself an audit
event (the canonical model under the report changed after the report was
locked, and the Owner sees a "data revised" notice on the next render).

### 2. Stage 2 — Persona Rewrite

The Monthly Report Author persona — `reports.monthly.author.ar-AE` per
ADR-0010 section 3.3 — receives the `MonthlyFactBundle` plus an
**audience marker** (`OWNER` / `PD` / `CONTRACTOR`) and produces a
**`MonthlyNarrativeDraft`**: a structured Arabic-domain prose document
with the section template appropriate for the audience.

Section templates (the persona obeys these as part of its constraints
block, not as freeform creative choice):

- **OWNER view** — Executive narrative. Five sections: *الموقف العام*
  (overall position), *الإنجاز مقابل المخطط* (progress vs plan), *المخاطر
  والقرارات* (risks and decisions), *الأثر المالي* (financial impact),
  *التوصيات التنفيذية* (executive recommendations). Tone: decisive,
  short paragraphs, every number cited with its rule id in a footnote
  reference. No raw evidence cards in the prose — those go in an
  appendix.
- **PD view** — Operational narrative. Seven sections: the five OWNER
  sections plus *تحليل المسار الحرج* (Critical Path analysis) and
  *إجراءات الأسبوع القادم* (next-week actions). Tone: directive,
  paragraphs may be longer, WBS-level detail is fair game, evidence
  cards inline.
- **CONTRACTOR view** — Compliance narrative. Six sections: *الموقف
  التعاقدي* (contractual position), *الإنجاز المُعتمد* (approved
  progress), *الانحرافات والأسبابها* (variances and their causes),
  *المراسلات المعلّقة* (pending correspondence — FIDIC-tagged events),
  *الالتزامات للفترة القادمة* (commitments for next period), *المرفقات*
  (attachments). Tone: formal, contract-clause-anchored, every claim
  tied to either the baseline or a Decision id.

The persona is bound by the ADR-0010 five-rule constraint block, with
two additions specific to this surface:

- **Numbers are quoted, not paraphrased.** A figure from the bundle
  appears in the prose verbatim (e.g. "1.7% SPI"), never restated
  approximately ("بنحو 2%"). This is enforced by a post-generation
  check that scans the draft for numeric tokens and verifies each one
  appears in the bundle.
- **Disagreement is named.** If the bundle contains a
  `LayerDisagreement` fact (Engineering says X days, Planning says Y
  days), the persona must surface the disagreement in the prose
  exactly once, attribute each verdict to its layer, and **must not**
  pick a winner. Picking a winner is ADR-0013's job, and until that
  ADR is Accepted any draft that picks a winner is rejected by the
  same post-generation check.

The draft is persisted as a `MonthlyNarrativeDraft` row, references the
`MonthlyFactBundle.id`, records the persona version id used, and is
itself versioned (regenerating the draft produces a new version under
the same `businessKey`; the old draft stays queryable per ADR-0003).

### 3. Stage 3 — PDF Render via `pdf-lib`

A new service `MonthlyReportPdfRenderer` consumes a
`MonthlyNarrativeDraft` plus the project's branding pack (the formal UAE
identity locked in commit `fde8c37` — Tajawal + Inter fonts, crimson /
neutral palette) and emits a PDF using `pdf-lib`.

Renderer contract:

- **Pure TypeScript, in-process.** `pdf-lib` runs in the same Node
  process as the rest of the backend. No Chromium, no Puppeteer, no
  Playwright, no external binary.
- **Deterministic output.** Given the same draft, the same branding
  pack, and the same `pdf-lib` version, the renderer produces a
  byte-identical PDF. The output is hashed (SHA-256) and the hash is
  stored on the `MonthlyReport` artefact row. Any change to the
  hash is an Evidence event (ADR-0005) — the Owner sees a banner if
  the report he is reading is not the version he last signed.
- **Fonts embedded.** Tajawal (Arabic body / headers) and Inter (Latin
  numbers / figures) are embedded as font subsets, sized so the PDF
  is still under 2 MB for a typical 12-page report. The crimson /
  neutral palette is applied as fill / stroke colour primitives, not
  via CSS.
- **Right-to-left Arabic layout.** Paragraph runs are shaped RTL using
  the bidi handling that `pdf-lib` provides via its custom font loader.
  Latin numbers and rule-id footnote markers are bidi-isolated so they
  render LTR inside RTL paragraphs without flipping.
- **One renderer, three audience templates.** `MonthlyReportPdfRenderer`
  is parameterised by the audience marker. The page master, header,
  footer, and section ordering vary per audience; the underlying fact
  references do not.
- **Evidence appendix.** Every report includes a final appendix listing
  the Evidence ids cited in the prose, the rule ids that produced
  each fact, and the `MonthlyFactBundle.hash`. The Owner can hand the
  PDF to an auditor and the auditor can walk every claim back to the
  canonical model.

The rendered PDF is persisted as a `MonthlyReport` artefact (binary
stored on disk under `storage/reports/monthly/<projectBusinessKey>/<period>/<audience>.pdf`,
metadata in MySQL). The artefact row is the only thing the UI links to
— the bundle and the draft stay backend-side as audit substrate.

### 4. What this ADR deliberately does NOT decide

- **It does not introduce a broker or a render queue.** Report
  generation is a synchronous backend job triggered by an authenticated
  POST to `/reports/monthly/generate`. If render time becomes a problem
  (current target: under 30 seconds end-to-end for a 12-page report),
  a queue is a future ADR.
- **It does not change the LLM provider boundary.** The persona runs
  through whichever provider ADR-0010 specifies; this ADR does not
  pick a model id, a pricing tier, or a caching strategy. Provider
  choice stays a Persona concern.
- **It does not generate FIDIC letters.** Letter drafts are a separate
  Layer 2 artefact (still ADR-TBD), referenced by the monthly report's
  CONTRACTOR view (*المراسلات المعلّقة*) but not produced by it.
- **It does not resolve layer disagreements.** Per section 2 above,
  disagreements are surfaced verbatim and ADR-0013 owns the resolution
  policy. This ADR ships safely under all three options A/B/C in
  ADR-0013.
- **It does not migrate any existing row.** No schema change touches
  data older than this ADR. All new tables (`MonthlyFactBundle`,
  `MonthlyNarrativeDraft`, `MonthlyReport`) are additive.

## Consequences

- Layer 4 has a concrete, end-to-end artefact that exercises the
  deterministic core, the persona system, and the cross-layer bus
  simultaneously — the first surface in the codebase that does.
- The Owner gets a signed PDF with Arabic-domain prose backed by an
  Evidence appendix; the PD and Contractor get audience-specific
  variants from the **same** fact bundle. There is structurally no way
  for the three audiences to receive contradictory numbers.
- The `pdf-lib` pinning means the report pipeline has no Chromium
  dependency. Docker images stay slim; CI stays fast; the renderer
  runs identically on a developer laptop and the production server.
- The `MonthlyFactBundle.hash` and the `MonthlyReport` PDF hash give
  the platform two independent audit checkpoints per report — one for
  "did the underlying facts change?" and one for "did the rendered
  artefact change?". Either changing without a new `MonthlyReport`
  version is a contract violation.
- Because the LLM only sees the bundle and never the database, the
  ADR-0006 boundary is preserved — the LLM is a rewriter for a longer
  surface, not a fact source.

## Reason · Risk · Replacement (per ADR-0001 contract)

- **Reason.** Plan section 3.4 named the monthly narrative report as a
  Wave 1 Layer 4 deliverable and section 4.5 pinned `pdf-lib` as the
  renderer. The three-stage split (facts → prose → PDF) is the only
  shape that keeps the LLM out of the governance path (ADR-0006), keeps
  the audit chain intact (ADR-0005), and still gives the Owner the
  Arabic narrative he asked for. Multi-audience-from-single-bundle is
  the only shape that prevents the three audiences from drifting.
- **Risk.**
  - *LLM hallucinates a number.* The persona could write
    "تقدم بنسبة 47%" when the bundle says 42%. Mitigation: the
    post-generation numeric-token check (section 2) rejects the draft;
    the persona is re-invoked with the rejection reason. The Owner
    never sees an unverified number.
  - *`pdf-lib` Arabic RTL edge case.* Bidi shaping of mixed
    Arabic/Latin runs inside justified paragraphs is the most likely
    rendering bug. Mitigation: the Wave 1 templates use left-aligned
    Arabic paragraphs (not justified), Latin tokens are wrapped in
    explicit bidi-isolation runs, and the visual diff suite includes
    a fixture report with deliberately ugly mixed runs. If the
    rendered text shapes incorrectly in production, the renderer
    falls back to a flagged "draft" stamp and the report does not
    leave the app.
  - *Persona drifts off-template.* The persona ignores the section
    template and writes a free-form essay. Mitigation: the section
    headings are validated structurally before the draft is accepted;
    a missing or renamed heading rejects the draft.
  - *Render non-determinism.* A future `pdf-lib` upgrade changes byte
    output for identical input, invalidating every stored report hash.
    Mitigation: `pdf-lib` is pinned in `package.json` with an exact
    version; an upgrade is its own ADR with a migration plan for the
    stored hashes. Until then, the hash is trustworthy.
  - *Layer disagreement gets buried.* The persona softens a
    Planning-vs-Engineering disagreement into a single hedged sentence
    that the Owner skims over. Mitigation: the section template for
    each audience reserves a named slot for disagreements; if the
    bundle contains a `LayerDisagreement` fact and the draft does not
    include the slot, the draft is rejected. The Owner sees the
    disagreement or the report does not ship.
- **Replacement path.**
  - *Forward — Layer 4 expansion.* Once the monthly report is in
    production, weekly and ad-hoc reports become variants of the same
    pipeline (different reporting period, different section template,
    same three stages). They do not need a new ADR — they are
    implementations of this one.
  - *Sideways — alternate renderer.* If `pdf-lib` proves insufficient
    for a future layout requirement (complex tables, charts beyond
    vector primitives), the renderer is replaced behind the same
    `MonthlyReportPdfRenderer` interface and the stored-hash migration
    is documented in the successor ADR. Stages 1 and 2 are unaffected.
  - *Backwards — supersede if the report mechanic changes.* If
    Al Ayham later decides the monthly artefact is an interactive web
    surface, not a PDF, this ADR is superseded by the web-surface ADR;
    the `MonthlyFactBundle` and `MonthlyNarrativeDraft` rows stay as
    the substrate, and only the renderer is replaced.
  - *Withdraw.* If the project pivot drops Layer 4 entirely, this ADR
    is marked withdrawn; no other ADR is affected because nothing
    else reads `MonthlyReport`. The Layer 1 core remains untouched.

## Cite

- 2026-06-08 post-meeting plan, **section 3.4** ("التقرير الشهري —
  Monthly narrative report") — the artefact's place in Wave 1 and the
  Owner-first framing.
- Same plan, **section 4.5** ("PDF rendering — server-side,
  deterministic, no headless browser") — the `pdf-lib` pinning and
  the reasoning against Puppeteer / Playwright in production.
- ADR-0003 (canonical model & append-only traceability) — the
  `businessKey` rollup contract the fact bundle obeys.
- ADR-0004 (rule engine v1) — every numeric fact in the bundle
  references a rule id from the engine.
- ADR-0005 (evidence & confidence) — the appendix contract and the
  hash-as-audit-event mechanic.
- ADR-0006 (summary & UI) — the LLM-stays-a-rewriter boundary this
  ADR extends to a longer surface.
- ADR-0010 (persona system) — the Monthly Report Author persona
  `reports.monthly.author.ar-AE` and the five-rule constraints block
  the persona obeys.
- ADR-0012 (cross-layer bus) — the `Layer` enum that tags each fact
  in the bundle and the Outbox the bundler subscribes to for
  freshness.
- ADR-0013 (cross-layer priority chain, Proposed) — explicitly **not**
  a dependency; this ADR ships under all three options A/B/C by
  surfacing disagreements rather than resolving them.
- Feedback memory note (`businessKey for rollups`) — never group
  versioned entities by `project.id`; the bundler and the renderer
  both honour this.
- Commit `fde8c37` (formal UAE identity: Tajawal + Inter, crimson /
  neutral palette) — the branding primitives the renderer applies.

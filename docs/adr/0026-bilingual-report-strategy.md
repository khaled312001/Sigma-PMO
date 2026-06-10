# ADR-0026 — Bilingual report strategy (Arabic + English editions)

- **Status:** Accepted (2026-06-10)
- **Date:** 2026-06-10
- **Layer / Cycle:** Layer 4 (Reports) — Wave 7 (correction-plan §2.8)
- **Decision owner:** Khaled Ahmed
- **Reviewers:** Al Ayham (product / governance)
- **Related:** ADR-0010 (Persona system), meeting transcript 2026-06-08 @ 00:42:17–00:42:56

## Context

«هو في نسخة عربي + نسخة انجليزي» — the meeting requires both editions, with
curated terminology («المصطلحات نعدل عليها لأنه الـ AI ما بعرف منين عم يجي
بالمصطلحات»). Wave 4 shipped Arabic-only.

## Decision

1. **Independent narrators, shared facts.** `report-narrator-english` is a
   first-class persona that writes from the same deterministic facts block
   as `report-narrator-arabic` — NOT a translation pass. Translation would
   inherit Arabic-prose artefacts; independent authorship gives each
   readership native register.
2. **Terminology alignment via the shared glossary**
   (`backend/seed/construction-glossary-ar-en.json`, 30 core terms): both
   persona prompts pin the exact terms (تاريخ البيانات = Data Date, المسار
   الحرج = Critical Path, …). The glossary is the human-curated artefact
   the meeting asked for — extending it is an editorial act, not a code
   change.
3. **Storage:** `MonthlyReport.narrativeAr` + `narrativeEn` (both nullable);
   the legacy `narrative` column mirrors the Arabic edition so existing
   readers keep working. Pre-Wave-7 rows stay Arabic-only — no migration
   of generated content.
4. **Generation:** both calls run in parallel; an English-call failure
   degrades to Arabic-only (never blocks the report). Citations are the
   union of both calls, filtered against the Source Registry as before.
5. **Rendering:** `GET /reports/monthly/:id/pdf?lang=ar|en` renders the
   requested edition to its own file (`{id}-{lang}.pdf`); requesting a
   missing edition returns an honest 404 with the regeneration hint. The
   UI shows the English download button only when the edition exists.

## Consequences

- Owner/PD tiers pay two Claude calls per report — accepted; the meeting
  ranks report quality above cost ("الإنجليزي أساسي").
- The citation guard applies to the union: a bilingual report with zero
  citations across both editions still falls back to deterministic facts.

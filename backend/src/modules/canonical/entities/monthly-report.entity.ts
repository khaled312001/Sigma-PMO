import { Column, Entity, Index } from 'typeorm';

import { UuidEntity } from '../../../common/entities/base.entity';

/**
 * MonthlyReport — one rendered monthly narrative for a project + audience
 * combo (post-meeting plan §3.6, ADR-0010).
 *
 * The row is the persisted output of `MonthlyReportService.generateMonthly()`:
 *  - `metrics` carries the deterministic facts the persona was given (alert
 *    counts, schedule deltas, BoQ totals, governance decisions in window) so
 *    the narrative is reproducible without re-querying the snapshot.
 *  - `narrative` is the persona's prose output (Arabic primary, English
 *    fallback inline). Equals the grounded fact block when Claude is
 *    disabled — Wave 2 keeps the deterministic-first contract used by the
 *    weekly `ExecutiveSummary`.
 *  - `citations` is the deduplicated set of `[SOURCE: id]` markers harvested
 *    from the response. MUST be non-empty when `narrativeSource = 'llm'`;
 *    callers fail closed (the citation guard) if the persona forgot to cite.
 *  - `pdfStoredPath` is set after the `PdfRendererService` writes the file
 *    under `storageDir`. Left null for the deterministic-only path until the
 *    PDF is rendered on demand by the `/reports/monthly/:id/pdf` endpoint.
 *  - `status` moves `draft` → `generated` → `pdf-rendered`. The post-meeting
 *    plan §3.6 reserves `approved` / `sent` for Wave 3 (human approval gate
 *    + Outbox push). Wave 2 stops at `pdf-rendered`.
 *
 * Append-only is NOT used here — each `generateMonthly` call inserts a NEW
 * row (you can have multiple drafts for the same project+month+audience). The
 * `(projectBusinessKey, month, audience, createdAt)` tuple is the audit key.
 */
@Entity('monthly_report')
export class MonthlyReport extends UuidEntity {
  /** Project businessKey (not project.id — survives append-only versioning). */
  @Index()
  @Column({ type: 'varchar', length: 64 })
  projectBusinessKey!: string;

  /**
   * Parent calendar month, `YYYY-MM`. For daily/weekly rows this is the
   * month the period falls into (first day's month if a week spans two) —
   * keeps the legacy `month` index useful as a coarse filter while
   * `periodKey` carries the exact window.
   */
  @Index()
  @Column({ type: 'varchar', length: 7 })
  month!: string;

  /**
   * Cadence flag — added Wave 4 alongside daily/weekly variants. Existing
   * rows are NULL in dev and treated as `'month'` by the service layer.
   */
  @Index()
  @Column({ type: 'varchar', length: 8, nullable: true })
  cadence!: 'day' | 'week' | 'month' | null;

  /**
   * Exact period covered by the report:
   *  - `month`  →  `YYYY-MM`
   *  - `week`   →  `YYYY-Www` (ISO week)
   *  - `day`    →  `YYYY-MM-DD`
   */
  @Index()
  @Column({ type: 'varchar', length: 16, nullable: true })
  periodKey!: string | null;

  /**
   * Stakeholder view this row was written for. Each audience gets the same
   * facts at a different depth (post-meeting plan §3.6 + persona §):
   *   - `owner`      — one-page executive verdict + top risks + outlook.
   *   - `pd`         — 5–10 pages: per-WBS detail, every decision/letter.
   *   - `contractor` — slice covering only the contractor's own activities.
   */
  @Index()
  @Column({ type: 'varchar', length: 16 })
  audience!: 'owner' | 'pd' | 'contractor' | string;

  /** Persona slug used to author the prose (e.g. `report-narrator-arabic`). */
  @Column({ type: 'varchar', length: 64 })
  personaSlug!: string;

  /** Version of the persona at call time — pinpoints the prompt for audit. */
  @Column({ type: 'int' })
  personaVersion!: number;

  /** `deterministic` when no Claude, `llm` when Claude rewrote the facts. */
  @Column({ type: 'varchar', length: 16 })
  narrativeSource!: 'deterministic' | 'llm' | string;

  /** Resolved model id sent to Anthropic when `narrativeSource = 'llm'`. */
  @Column({ type: 'varchar', length: 128, nullable: true })
  llmModel!: string | null;

  /** Authored prose (Markdown). Always reflects the human-facing report. */
  @Column({ type: 'longtext' })
  narrative!: string;

  /**
   * Deterministic facts the persona was grounded on. Persisted so a future
   * cycle can rebuild a PDF — or re-author the prose — without re-running
   * the snapshot loader.
   */
  @Column({ type: 'json' })
  metrics!: Record<string, unknown>;

  /**
   * Deduplicated source ids harvested from `[SOURCE: id]` markers in the
   * persona response. Empty array allowed for `deterministic` rows; the
   * citation guard rejects empty arrays for `llm` rows.
   */
  @Column({ type: 'json' })
  citations!: string[];

  /** Path on disk to the rendered PDF (relative to `STORAGE_DIR`). */
  @Column({ type: 'varchar', length: 1024, nullable: true })
  pdfStoredPath!: string | null;

  /** `draft` | `generated` | `pdf-rendered` (Wave 3 adds `approved` | `sent`). */
  @Index()
  @Column({ type: 'varchar', length: 32 })
  status!: string;
}

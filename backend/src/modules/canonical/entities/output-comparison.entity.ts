import { Column, Entity, Index } from 'typeorm';

import { UuidEntity } from '../../../common/entities/base.entity';

/**
 * What the AI and the human were both asked to produce. Mirrors the four
 * artefact families the correction-plan §2.10 names.
 */
export type ComparisonTaskKind =
  | 'baseline'
  | 'clash-resolution'
  | 'letter-draft'
  | 'monthly-report';

/**
 * The project director's call after reading both outputs side-by-side.
 * `pending` until a verdict is recorded; the three decided states map 1:1
 * to the §2.10 buttons ("Mark AI as correct" / "Mark human as correct" /
 * "Both have merit").
 */
export type ComparisonVerdict =
  | 'pending'
  | 'ai-correct'
  | 'human-correct'
  | 'both-merit';

/**
 * `OutputComparison` — one AI-output vs human-output pair for the same task
 * (correction-plan §2.10, transcript 00:46:14: «رح نشوف كيف بتطلع نتائج من
 * الـ human being وكيف تطلع نتائج من AI، وكيف من الأقرب للصحة»).
 *
 * The row is the audit record Al Ayham asked for: which artefact the AI
 * produced, which one the human planner produced, the director's
 * reconciliation notes, and the verdict. Verdicts feed persona refinement —
 * each decided row is a labelled training example ("for THIS task kind on
 * THIS project, the human's approach was judged closer to correct").
 *
 * Not a `TraceableEntity` — a comparison is an evaluation artefact, not an
 * ingested source. Verdicts may be revised (the latest stands); the
 * `decidedBy`/`decidedAt` stamp always reflects the most recent call.
 */
@Entity('output_comparison')
export class OutputComparison extends UuidEntity {
  @Index()
  @Column({ type: 'varchar', length: 64 })
  projectBusinessKey!: string;

  /** See {@link ComparisonTaskKind}. */
  @Index()
  @Column({ type: 'varchar', length: 32 })
  taskKind!: ComparisonTaskKind | string;

  /** Human-readable label, e.g. "Baseline B-1 — tower A superstructure". */
  @Column({ type: 'varchar', length: 255 })
  title!: string;

  /**
   * Id of the AI-generated artefact — a `BaselineBuildJob`, `Letter`,
   * `MonthlyReport`, or clash `Scenario` id depending on `taskKind`. Kept
   * as a loose ref (no FK) because the four families live in four tables.
   */
  @Column({ type: 'varchar', length: 64 })
  aiOutputId!: string;

  /** What the AI produced, summarised for side-by-side reading. */
  @Column({ type: 'text' })
  aiSummary!: string;

  /**
   * Id of the human-produced equivalent when one exists in the system
   * (e.g. a `SourceFile` of the planner's own XER). Nullable — the human
   * output may live outside the platform and be described only in
   * `humanSummary`.
   */
  @Column({ type: 'varchar', length: 64, nullable: true })
  humanOutputId!: string | null;

  /** What the human planner produced, summarised for side-by-side reading. */
  @Column({ type: 'text' })
  humanSummary!: string;

  /** Project director's notes on the differences (§2.10 "reconciliation"). */
  @Column({ type: 'text', nullable: true })
  reconciliation!: string | null;

  /** See {@link ComparisonVerdict}. */
  @Index()
  @Column({ type: 'varchar', length: 24, default: 'pending' })
  verdict!: ComparisonVerdict | string;

  @Column({ type: 'varchar', length: 128, nullable: true })
  decidedBy!: string | null;

  @Column({ type: 'datetime', precision: 6, nullable: true })
  decidedAt!: Date | null;
}

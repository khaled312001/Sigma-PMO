import { Column, Entity, Index } from 'typeorm';

import { UuidEntity } from '../../../common/entities/base.entity';

/**
 * Weekly Executive Summary (Cycle 4). Always produced from the deterministic
 * grounding (alert counts, key facts, average data confidence) so the
 * narrative is reproducible from the persisted record. If an LLM provider is
 * configured, the deterministic grounding is rewritten into executive prose
 * — never the other way round. Both versions are stored.
 */
@Entity('executive_summary')
export class ExecutiveSummary extends UuidEntity {
  @Index()
  @Column({ type: 'char', length: 36 })
  projectId!: string;

  @Column({ type: 'date' })
  periodStart!: string;

  @Column({ type: 'date' })
  periodEnd!: string;

  /** Deterministic, grounded narrative — the source of truth. */
  @Column({ type: 'text' })
  groundedNarrative!: string;

  /** Optional LLM-rewritten executive prose; equals groundedNarrative when no LLM. */
  @Column({ type: 'text' })
  narrative!: string;

  /** `deterministic` or `llm`. */
  @Column({ type: 'varchar', length: 16 })
  source!: string;

  @Column({ type: 'varchar', length: 64, nullable: true })
  llmProvider!: string | null;

  @Column({ type: 'varchar', length: 128, nullable: true })
  llmModel!: string | null;

  /** RuleEvaluation that supplied the alerts. */
  @Column({ type: 'char', length: 36, nullable: true })
  ruleEvaluationId!: string | null;

  /** Average confidence across IngestionRuns whose data appears in the snapshot. */
  @Column({ type: 'double' })
  confidenceAverage!: number;

  /** Structured facts behind the prose: alert counts, schedule numbers, etc. */
  @Column({ type: 'json' })
  metrics!: Record<string, unknown>;
}

import { Column, Entity, Index } from 'typeorm';

import { UuidEntity } from '../../../common/entities/base.entity';

/**
 * Data-confidence score for one IngestionRun (Cycle 3). All scores are in
 * [0,1]. The composite `overall` is what governance dashboards consume; the
 * sub-scores explain it; `breakdown` carries the per-entity counts and the
 * weights used so the score is fully reproducible (deterministic).
 */
@Entity('confidence_score')
export class ConfidenceScore extends UuidEntity {
  @Index({ unique: true })
  @Column({ type: 'char', length: 36 })
  ingestionRunId!: string;

  /** Required fields populated across all ingested rows. */
  @Column({ type: 'double' })
  completeness!: number;

  /** Driven by validation errors/warnings. 1.0 = clean. */
  @Column({ type: 'double' })
  consistency!: number;

  /** Weight by source type (P6 highest; CSV lowest). */
  @Column({ type: 'double' })
  sourceReliability!: number;

  /** Weighted composite. */
  @Column({ type: 'double' })
  overall!: number;

  @Column({ type: 'json' })
  breakdown!: Record<string, unknown>;
}

import { Column, Entity, Index } from 'typeorm';

import { UuidEntity } from '../../../common/entities/base.entity';

/**
 * BoQ — Bill of Quantities document header (post-meeting plan §3.7, also a
 * direct dependency of the Author-Path baseline build, §3.1).
 *
 * Append-only by (`businessKey`, `version`). The `businessKey` is bound to a
 * `Project.businessKey` (the BoQ of project P-1000 carries
 * `businessKey = 'boq:P-1000'` or equivalent — exact format set by the
 * importer in C2).
 *
 * Wave 1 ships the entity only — the Excel importer + total-amount validator
 * are part of the BoQ pipeline in C2.
 */
@Entity('boq')
export class BoQ extends UuidEntity {
  @Index()
  @Column({ type: 'varchar', length: 64 })
  businessKey!: string;

  @Column({ type: 'int', default: 1 })
  version!: number;

  @Index()
  @Column({ type: 'boolean', default: true })
  isCurrent!: boolean;

  @Column({ type: 'varchar', length: 8, default: 'AED' })
  currency!: string;

  /** Sum of line `amount`s — driver returns decimals as strings to preserve precision. */
  @Column({ type: 'decimal', precision: 18, scale: 2, nullable: true })
  totalAmount!: string | null;

  /** Source file the BoQ was parsed from. */
  @Index()
  @Column({ type: 'char', length: 36 })
  sourceFileId!: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  authoredBy!: string | null;

  /** Threads the cross-module journey (sketch → … → decision) together. */
  @Index()
  @Column({ type: 'char', length: 36, nullable: true })
  journeyCorrelationId!: string | null;
}

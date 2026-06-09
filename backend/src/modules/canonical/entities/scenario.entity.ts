import { Column, Entity, Index } from 'typeorm';

import { UuidEntity } from '../../../common/entities/base.entity';

/**
 * Scenario — a what-if sandbox fork of a project at a fixed point in time
 * (post-meeting plan §3.4, ADR-0010 §6).
 *
 * Every Scenario writes onto its own branch — rules re-evaluate against the
 * `baselineSnapshot`, but **mutations never reach canonical truth**. The only
 * path back to canonical is the explicit "Promote to canonical" gate (admin +
 * signature) which lands in C5, not Wave 1.
 *
 * Grouping is on `projectBusinessKey` (not `project.id`) per the
 * `feedback-businesskey-rollups` memory rule: scenarios are scoped to a
 * project's business identity across re-ingests, not to a specific version
 * row of the project.
 */
@Entity('scenario')
export class Scenario extends UuidEntity {
  /** The parent project the scenario forks. */
  @Index()
  @Column({ type: 'varchar', length: 64 })
  projectBusinessKey!: string;

  @Column({ type: 'varchar', length: 255 })
  name!: string;

  /** User who forked the scenario, when known. */
  @Column({ type: 'char', length: 36, nullable: true })
  authorUserId!: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  authorDisplay!: string | null;

  /** `open` | `committed` | `discarded`. */
  @Column({ type: 'varchar', length: 32 })
  status!: string;

  /** Time of the fork; identifies the parent state snapshot. */
  @Column({ type: 'datetime', precision: 6 })
  forkedFromAt!: Date;

  /** Human-readable what-if description (free text). */
  @Column({ type: 'text' })
  summary!: string;

  /** Frozen snapshot of parent state at fork time; rules re-evaluate against this. */
  @Column({ type: 'json' })
  baselineSnapshot!: Record<string, unknown>;

  /**
   * When the scenario auto-expires. Default is 30 days out per the post-meeting
   * plan §3.4 (Khaled engineering default — pending Al Ayham review). Nullable
   * for scenarios manually pinned by an admin.
   */
  @Column({ type: 'datetime', precision: 6, nullable: true })
  expiresAt!: Date | null;
}

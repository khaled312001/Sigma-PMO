import { Column, Entity, Index } from 'typeorm';

import { UuidEntity } from '../../../common/entities/base.entity';

/**
 * LessonsLearned — a first-class entry in the L0 Knowledge & Rules Engine's
 * Lessons Learned Repository (Mr. Ayham's L0 requirement). New standards,
 * regulations, and learned lessons are added as ROWS, never schema changes —
 * keeping L0 "extensible to additional standards and regulations" by design.
 *
 * A lesson may be global (projectBusinessKey null) or project-specific, and is
 * tagged with the agent layer(s) it informs so the KnowledgeService can hand
 * each agent a focused knowledge pack.
 */
@Entity('lessons_learned')
export class LessonsLearned extends UuidEntity {
  @Column({ type: 'varchar', length: 255 })
  title!: string;

  @Column({ type: 'text' })
  content!: string;

  /** `schedule` | `cost` | `claims` | `governance` | `risk` | `quality` | … */
  @Index()
  @Column({ type: 'varchar', length: 32 })
  category!: string;

  /** Optional pointer to the standard/regulation this lesson encodes. */
  @Column({ type: 'varchar', length: 128, nullable: true })
  standardRef!: string | null;

  /** Null = global lesson; else scoped to one project. */
  @Index()
  @Column({ type: 'varchar', length: 64, nullable: true })
  projectBusinessKey!: string | null;

  /** Agent layers this lesson informs (e.g. ["l4_analytics","l6_claims"]). */
  @Column({ type: 'json' })
  appliesToLayers!: string[];

  @Column({ type: 'varchar', length: 128, nullable: true })
  recordedBy!: string | null;

  @Index()
  @Column({ type: 'boolean', default: true })
  isActive!: boolean;
}

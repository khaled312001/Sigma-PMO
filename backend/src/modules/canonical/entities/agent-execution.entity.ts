import { Column, Entity, Index } from 'typeorm';

import { UuidEntity } from '../../../common/entities/base.entity';
import {
  AgentLayer,
  GovernanceStatus,
  HierarchyLevel,
  LifecyclePhase,
} from '../../../common/enums';

/**
 * AgentExecution — the central audit row written by EVERY agent run, the
 * "Audit Trail" field of Mr. Ayham's standardized Agent operating model.
 *
 * One row per agent invocation captures the full contract: which agent/layer
 * ran, against which hierarchy node + lifecycle phase, the input + output
 * references, the confidence it produced (FK to the existing `ConfidenceScore`
 * rather than duplicating its columns), the escalation it raised, the
 * governance status it contributed, and a correlationId threading multi-agent
 * pipeline runs together. This makes any conclusion in the platform traceable
 * back to the exact agent + persona version that produced it.
 */
@Entity('agent_execution')
@Index(['agentLayer', 'status'])
@Index(['nodeType', 'nodeBusinessKey', 'createdAt'])
export class AgentExecution extends UuidEntity {
  /** Stable agent key, e.g. `l2.validation`, `l8.sigma_governance`. */
  @Index()
  @Column({ type: 'varchar', length: 64 })
  agentKey!: string;

  @Column({ type: 'varchar', length: 32 })
  agentLayer!: AgentLayer | string;

  /** Persona slug + version this run executed under (null for pure-deterministic agents). */
  @Column({ type: 'varchar', length: 64, nullable: true })
  personaSlug!: string | null;

  @Column({ type: 'int', nullable: true })
  personaVersion!: number | null;

  /** Hierarchy node this run targeted. */
  @Column({ type: 'varchar', length: 16, nullable: true })
  nodeType!: HierarchyLevel | string | null;

  @Index()
  @Column({ type: 'varchar', length: 64, nullable: true })
  nodeBusinessKey!: string | null;

  @Column({ type: 'varchar', length: 32, nullable: true })
  lifecyclePhase!: LifecyclePhase | string | null;

  /** References to the inputs consumed (ingestion run ids, source ids, …). */
  @Column({ type: 'json' })
  inputRefs!: Record<string, unknown>;

  /** References to the artefacts produced (alert ids, decision ids, …). */
  @Column({ type: 'json', nullable: true })
  outputRefs!: Record<string, unknown> | null;

  /** FK to the `ConfidenceScore` this run produced (reuse, don't duplicate). */
  @Column({ type: 'char', length: 36, nullable: true })
  confidenceScoreId!: string | null;

  /** Convenience denormalization of the overall confidence [0,1]. */
  @Column({ type: 'double', nullable: true })
  confidenceOverall!: number | null;

  /** Highest escalation this run raised (L1…L3), if any. */
  @Column({ type: 'varchar', length: 8, nullable: true })
  escalationLevel!: string | null;

  /** Governance status this run contributed to its node. */
  @Column({ type: 'varchar', length: 16, nullable: true })
  governanceStatus!: GovernanceStatus | string | null;

  /** `running` | `completed` | `failed`. */
  @Column({ type: 'varchar', length: 16 })
  status!: string;

  @Column({ type: 'text', nullable: true })
  failureReason!: string | null;

  /** Threads a multi-agent pipeline run (L1→L8) together. */
  @Index()
  @Column({ type: 'char', length: 36, nullable: true })
  correlationId!: string | null;

  @Column({ type: 'datetime', precision: 6, nullable: true })
  startedAt!: Date | null;

  @Column({ type: 'datetime', precision: 6, nullable: true })
  finishedAt!: Date | null;
}

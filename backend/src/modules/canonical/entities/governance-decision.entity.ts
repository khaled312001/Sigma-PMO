import { Column, Entity, Index } from 'typeorm';

import { UuidEntity } from '../../../common/entities/base.entity';

/**
 * Governance decision (Layer 2) produced for one Alert: who is accountable,
 * which FIDIC clause/notice applies, the escalation level + recipients, and
 * suggested interventions. This is the layer's bridge from "deviation
 * detected" (Layer 1) to "what happens about it" (Layers 2/3).
 */
@Entity('governance_decision')
export class GovernanceDecision extends UuidEntity {
  @Index()
  @Column({ type: 'char', length: 36 })
  alertId!: string;

  @Column({ type: 'char', length: 36 })
  policyId!: string;

  @Column({ type: 'int' })
  policyVersion!: number;

  /** contractor | consultant | client | sigma | shared */
  @Column({ type: 'varchar', length: 32 })
  responsibleParty!: string;

  @Column({ type: 'varchar', length: 64, nullable: true })
  fidicClause!: string | null;

  @Column({ type: 'varchar', length: 512, nullable: true })
  fidicNotice!: string | null;

  /** Contractual deadline (days from data date or alert detection). */
  @Column({ type: 'int', nullable: true })
  fidicDeadlineDays!: number | null;

  /** L1 (lowest) … L3 (highest) — matches escalation thresholds. */
  @Column({ type: 'varchar', length: 8 })
  escalationLevel!: string;

  @Column({ type: 'json' })
  notifyParties!: string[];

  @Column({ type: 'json' })
  interventions!: string[];

  /** Human-readable explanation, deterministic from rule code + policy. */
  @Column({ type: 'text' })
  rationale!: string;

  /**
   * Decision domain (Req R7, Mr. Ayham acceptance) — derived deterministically
   * from the triggering alert (FIDIC clause / alert code). Drives the
   * NO-auto-approval guard: `financial` | `contractual` | `safety` can NEVER be
   * auto-approved and require an explicit human action. Other values
   * (`schedule` | `quality` | `operational` | `general`) still require human
   * approval but are not in the hard-blocked set. Null on legacy rows.
   */
  @Column({ type: 'varchar', length: 24, nullable: true })
  category!: string | null;

  /** Threads the cross-module journey (sketch → … → decision) together. */
  @Index()
  @Column({ type: 'char', length: 36, nullable: true })
  journeyCorrelationId!: string | null;
}

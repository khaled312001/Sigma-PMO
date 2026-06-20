import { Column, Entity, Index } from 'typeorm';

import { UuidEntity } from '../../../common/entities/base.entity';

/**
 * ContractClauseRule — a contract clause turned into an OPERATIONAL rule
 * (Mr. Ayham acceptance #2: the Contract Rules Engine). Each row captures a
 * time/authority rule extracted from (or defined against) a contract — a notice
 * period, a time bar, a response period, a deemed-approval window, an
 * instruction-issuing authority, a determination period — so facts (dates,
 * correspondence, claims) can be tested against the contract terms and a
 * procedural verdict (preserved / weak / time-barred) produced. Append-only by
 * (businessKey, isCurrent); seedable from a FIDIC preset.
 */
@Entity('contract_clause_rule')
@Index(['projectBusinessKey', 'isCurrent'])
export class ContractClauseRule extends UuidEntity {
  @Index()
  @Column({ type: 'varchar', length: 64 })
  projectBusinessKey!: string;

  /** Stable natural key, e.g. "CR-003". */
  @Index()
  @Column({ type: 'varchar', length: 64 })
  businessKey!: string;

  /** e.g. "FIDIC Red Book 1999", "FIDIC Yellow 2017", "Bespoke". */
  @Column({ type: 'varchar', length: 64 })
  contractStandard!: string;

  /** Clause reference, e.g. "20.1", "8.4", "3.5". */
  @Column({ type: 'varchar', length: 32, nullable: true })
  clauseRef!: string | null;

  @Column({ type: 'varchar', length: 255 })
  title!: string;

  /**
   * notice | time_bar | response_period | deemed_approval | particulars |
   * determination | instruction_authority.
   */
  @Index()
  @Column({ type: 'varchar', length: 32 })
  ruleType!: string;

  /** The event that starts the clock (free text). */
  @Column({ type: 'text', nullable: true })
  triggerEvent!: string | null;

  /** Days available to act from the trigger event. */
  @Column({ type: 'int', nullable: true })
  daysToAct!: number | null;

  /** Who must act: contractor | engineer | employer | either. */
  @Column({ type: 'varchar', length: 24, nullable: true })
  actor!: string | null;

  /** What happens if the deadline is missed (the contractual consequence). */
  @Column({ type: 'text', nullable: true })
  consequence!: string | null;

  /** For deemed_approval rules: the deemed outcome — approved | rejected. */
  @Column({ type: 'varchar', length: 16, nullable: true })
  deemedOutcome!: string | null;

  @Column({ type: 'text', nullable: true })
  basis!: string | null;

  /** active | superseded. */
  @Index()
  @Column({ type: 'varchar', length: 16, default: 'active' })
  status!: string;

  @Column({ type: 'int', default: 1 })
  version!: number;

  @Index()
  @Column({ type: 'boolean', default: true })
  isCurrent!: boolean;

  @Column({ type: 'varchar', length: 128, nullable: true })
  createdBy!: string | null;
}

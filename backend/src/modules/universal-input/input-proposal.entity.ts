import { Column, Entity, Index } from 'typeorm';

import { UuidEntity } from '../../common/entities/base.entity';

/** A user decision recorded against an extracted item at commit time. */
export type InputItemDecision =
  | 'pending'
  | 'confirm'
  | 'correct'
  | 'exclude'
  | 'assumption' // treat as a fixed user-approved assumption
  | 'missing' // treat as missing data
  | 'limited_confidence'; // proceed with limited confidence

export type InputCompleteness = 'complete' | 'uncertain' | 'missing';

/**
 * One piece of information the AI extracted from the user's raw input, mapped to
 * a Sigma layer and held for human review BEFORE anything is committed.
 */
export interface InputItem {
  id: string;
  /** Proposed Sigma layer (project-data | planning | commercial | risk | claims | governance | procurement | qs | daily-reporting | compliance | approvals | stakeholders | assumptions | missing-information | supporting-evidence). */
  layer: string;
  /** What the value represents (e.g. "Project start date", "Contractor name"). */
  label: string;
  /** The extracted value (verbatim or normalised). */
  value: string;
  /** AI confidence 0..1. */
  confidence: number;
  completeness: InputCompleteness;
  /** Assumptions the AI made to produce this value. */
  assumptions: string[];
  /** A clear follow-up question when the item is uncertain/missing. */
  question: string | null;
  /** Source reference (file name / section / "pasted text"). */
  evidence: string | null;
  /**
   * Dates found in or inferred for this item — document/revision/issue/received/
   * approval/event/effective/baseline/schedule-update/upload date, each tagged
   * with whether it was explicit in the input or inferred by the AI.
   */
  dates?: { type: string; value: string; inferred: boolean }[];
  /** The governing date for chronological ordering (ISO yyyy-mm-dd or null). */
  effectiveDate?: string | null;
  /**
   * Inferred chronological position when the date is missing/unclear, e.g.
   * "later revision superseding an earlier one", "retrospective record",
   * "refers to an earlier event", "possible duplicate".
   */
  chronologyNote?: string | null;
  /** True when the AI detected a chronological conflict/inconsistency. */
  chronologyConflict?: boolean;
  /** Set during review/commit. */
  decision?: InputItemDecision;
  /** When the user corrects the value. */
  correctedValue?: string | null;
}

export type InputProposalStatus = 'pending_review' | 'committed' | 'discarded';

/**
 * Universal Input proposal (Mr. Ayham, 2026-06-19). A staging record that holds
 * the AI-extracted, layer-mapped items from any raw input (files + pasted text)
 * for human review. NOTHING is committed to official Sigma records until the
 * user confirms; every decision (confirm / correct / exclude / approve as
 * assumption / treat as missing / proceed with limited confidence) is then
 * recorded in the audit log and reflected on the committed records.
 */
@Entity('input_proposal')
export class InputProposal extends UuidEntity {
  @Index()
  @Column({ type: 'char', length: 36, nullable: true })
  companyId!: string | null;

  /** Target project (when known); items are committed under this project. */
  @Index()
  @Column({ type: 'varchar', length: 64, nullable: true })
  projectBusinessKey!: string | null;

  @Index()
  @Column({ type: 'varchar', length: 24, default: 'pending_review' })
  status!: InputProposalStatus;

  /** Description of the raw input: files (name/type/bytes) + pasted-text length. */
  @Column({ type: 'json' })
  source!: Record<string, unknown>;

  /** AI overall summary of what was provided. */
  @Column({ type: 'text', nullable: true })
  summary!: string | null;

  /** Claude model used for the extraction. */
  @Column({ type: 'varchar', length: 64, nullable: true })
  model!: string | null;

  /** The extracted, layer-mapped items awaiting review. */
  @Column({ type: 'json' })
  items!: InputItem[];

  /** Consolidated follow-up questions for the user. */
  @Column({ type: 'json', nullable: true })
  questions!: string[] | null;

  @Column({ type: 'varchar', length: 320, nullable: true })
  createdByEmail!: string | null;

  @Column({ type: 'datetime', precision: 6, nullable: true })
  committedAt!: Date | null;

  @Column({ type: 'varchar', length: 320, nullable: true })
  committedByEmail!: string | null;

  /** Outcome of the commit: counts + per-decision tally + created record ids. */
  @Column({ type: 'json', nullable: true })
  commitResult!: Record<string, unknown> | null;
}

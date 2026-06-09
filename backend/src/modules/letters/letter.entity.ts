import { Column, Entity, Index } from 'typeorm';

import { UuidEntity } from '../../common/entities/base.entity';

/**
 * Trigger that produced a `Letter` draft. The two Wave-2 triggers are:
 *
 *  - `incoming-letter` — a contractor letter (PDF or text) was uploaded to the
 *    governance inbox; the `fidic-redbook-expert` persona was asked to read it
 *    and propose a reply with explicit Sub-Clause + deadline. The originating
 *    bytes live at `incomingLetterSourceFileId` so the draft is reproducible
 *    from `(persona version + source file)` alone (same audit shape Al Ayham
 *    praised in the 2026-06-08 meeting for ingestion fingerprinting — see
 *    `persona.entity.ts`).
 *
 *  - `compliance-flag` — a deterministic rule (e.g. the PMI org-chart auditor
 *    persona found a missing role) raised a finding that needs a formal letter
 *    to the contractor. There is no incoming source file in this case so
 *    `incomingLetterSourceFileId` is null and the trigger metadata is carried
 *    in the request context the drafter persists.
 *
 * Letter status is the human-approval gate the post-meeting plan §3.5 +
 * ADR-0011 §3 require: every AI output starts as `draft`, an authorised human
 * flips it to `approved`, and only an approved letter can ever be `sent`.
 * Auto-send is forbidden by Wave 2 — no code path on this entity may write
 * `sent` without going through an explicit approval step.
 */
export type LetterTrigger = 'incoming-letter' | 'compliance-flag';
export type LetterStatus = 'draft' | 'approved' | 'sent';

/**
 * `Letter` — one persisted FIDIC contract letter draft (post-meeting plan §3.5,
 * ADR-0010 §6, ADR-0011 §3).
 *
 * Each row carries:
 *  - the bilingual body (Arabic primary + English mirror) the persona produced,
 *  - the applicable FIDIC Sub-Clause the persona identified,
 *  - the contractual deadline in days (nullable when the persona returned
 *    `"TBD pending data"` per its rule 3),
 *  - the curated `Source` ids the persona cited — empty array means the
 *    drafter never persisted this row (the service throws when the AI
 *    response carries no citation, per Wave 2 rule "claims without sources
 *    are flagged").
 *  - the `status` gate that keeps a draft from being sent without a human
 *    approval click.
 *
 * Append-only versioning is NOT used here. A letter is an artefact, not a
 * fingerprinted source — corrections happen by drafting a new Letter that
 * supersedes the prior one (the prior row stays in DB for the audit trail).
 * If a future cycle needs version history, switch to `TraceableEntity`.
 */
@Entity('letter')
export class Letter extends UuidEntity {
  /**
   * `Project.businessKey` the letter is attached to. Indexed because the
   * `/letters?projectKey=…` list endpoint is the primary read path.
   */
  @Index()
  @Column({ type: 'varchar', length: 255 })
  projectBusinessKey!: string;

  /**
   * Pointer to the `SourceFile` that carries the incoming contractor letter
   * bytes (PDF / text). Nullable because compliance-flag drafts have no
   * incoming letter — they are produced from a deterministic rule finding.
   * Not enforced as a FK in DDL to keep this module decoupled from the
   * canonical schema's evolution (and because the source file may be a
   * legacy archived blob without a row at draft time).
   */
  @Column({ type: 'char', length: 36, nullable: true })
  incomingLetterSourceFileId!: string | null;

  /** What produced this draft — see {@link LetterTrigger}. */
  @Index()
  @Column({ type: 'varchar', length: 32 })
  trigger!: LetterTrigger | string;

  /** Subject line / header summary. Plain text, no markdown. */
  @Column({ type: 'varchar', length: 512 })
  subject!: string;

  /** Arabic letter body — primary language for UAE contracts (rule 5 of the persona). */
  @Column({ type: 'text' })
  bodyAr!: string;

  /** English mirror — translation attached for the Engineer's record. */
  @Column({ type: 'text' })
  bodyEn!: string;

  /**
   * The FIDIC Sub-Clause the persona identified, e.g. `Sub-Clause 20.1 [1999]`
   * or `Sub-Clause 20.2.1 [2017]`. Nullable for compliance-flag triggers that
   * cite a policy rule rather than a Sub-Clause.
   */
  @Column({ type: 'varchar', length: 128, nullable: true })
  fidicClauseRef!: string | null;

  /**
   * Contractual response deadline in days. Nullable when the persona returned
   * `"TBD pending data"` — rule 3 of the FIDIC persona makes that an explicit
   * outcome, not a silent zero. Callers MUST treat `null` as "deadline
   * unknown, do not run a countdown" rather than as zero.
   */
  @Column({ type: 'int', nullable: true })
  deadlineDays!: number | null;

  /** Approval gate — see {@link LetterStatus}. New drafts persist as `draft`. */
  @Index()
  @Column({ type: 'varchar', length: 16, default: 'draft' })
  status!: LetterStatus | string;

  /**
   * Array of `Source.externalId` strings the persona cited. The drafter
   * service refuses to persist a Letter whose citations array is empty
   * (the AI must back its claim with at least one curated source — Wave 2
   * rule, post-meeting plan §3.3 rule 5). Stored as JSON because the AI
   * may cite N sources per letter and we want to keep them ordered.
   */
  @Column({ type: 'json' })
  citations!: string[];
}

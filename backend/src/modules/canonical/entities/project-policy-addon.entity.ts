import { Column, Entity, Index } from 'typeorm';

import { UuidEntity } from '../../../common/entities/base.entity';

/**
 * ProjectPolicyAddon — a project-scoped instruction the Consultant (or PD /
 * Client / Admin) writes for the AI, layered on top of the global
 * GovernancePolicy (correction-plan §2.6; meeting 2026-06-08 @ 00:19:40):
 *
 *  «في كل مشروع ممكن يكون فيه ملاحظات… انت بتكتب للـ AI، طبعاً كله ده في
 *   dashboard — في كل صفحة فإنت بتكتبه: بند واحد، بند اثنين، بند ثلاثة.»
 *
 * Each addon is one bullet the prompt builder appends to the persona's
 * system context for matching `(projectBusinessKey, surface)` calls.
 * Project-specific addons OVERRIDE the global policy tone — they are
 * appended after it with explicit priority labelling.
 *
 * Lifecycle is append-only-ish: rows are never edited in place. "Edit" =
 * deactivate the old row + insert a new one (the UI does both); the audit
 * trail of who-instructed-the-AI-what survives forever.
 */
@Entity('project_policy_addon')
export class ProjectPolicyAddon extends UuidEntity {
  @Index()
  @Column({ type: 'varchar', length: 64 })
  projectBusinessKey!: string;

  /**
   * Which AI surface the addon applies to:
   * `planning` | `engineering` | `governance` | `reports` | `*` (all).
   */
  @Index()
  @Column({ type: 'varchar', length: 32 })
  surface!: string;

  /** The instruction itself — one Markdown bullet, ≤ 2000 chars. */
  @Column({ type: 'text' })
  content!: string;

  /** Display name of the author (Consultant / PD / Client / Admin). */
  @Column({ type: 'varchar', length: 128, nullable: true })
  authoredBy!: string | null;

  /** Role slug of the author at write time — audit, not authorisation. */
  @Column({ type: 'varchar', length: 32, nullable: true })
  authoredByRole!: string | null;

  /** Soft-delete flag — deactivated rows stay for the audit trail. */
  @Index()
  @Column({ type: 'boolean', default: true })
  isActive!: boolean;
}

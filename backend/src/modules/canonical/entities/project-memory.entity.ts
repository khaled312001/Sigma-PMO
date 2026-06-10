import { Column, Entity, Index } from 'typeorm';

import { UuidEntity } from '../../../common/entities/base.entity';

/**
 * ProjectMemory — one durable fact the platform has learned about a project
 * (correction-plan §2.11; meeting 2026-06-08 @ 00:22:33 "understudy").
 *
 * The meeting's framing: each project develops a PERSONALITY the AI should
 * remember — "approvals on this project run slow", "the MEP zones are
 * congested", "the contractor's planner pads durations". Facts feed the
 * Claude prompt builder for matching projects so suggestions improve with
 * the project's own history instead of resetting every call.
 *
 * Sources:
 *  - `user-input`           — a team member wrote the fact directly.
 *  - `inferred`             — the MemoryHarvester derived it from the
 *                              alert / decision pattern.
 *  - `historical-analysis`  — a periodic batch job (future) mined it.
 *
 * `confidence` gates prompt injection: only facts ≥ 0.6 reach the AI, so a
 * weak inference never poisons a prompt (the meeting's own warning: «الـ AI
 * أحيانًا بيدي معلومات مش بتكون صحيحة 100%»).
 */
@Entity('project_memory')
export class ProjectMemory extends UuidEntity {
  @Index()
  @Column({ type: 'varchar', length: 64 })
  projectBusinessKey!: string;

  /** `characteristic` | `risk` | `preference` | `history`. */
  @Index()
  @Column({ type: 'varchar', length: 32 })
  factType!: string;

  /** The fact itself — one sentence, ≤ 1000 chars. */
  @Column({ type: 'text' })
  content!: string;

  /** `user-input` | `inferred` | `historical-analysis`. */
  @Column({ type: 'varchar', length: 32 })
  source!: string;

  /** 0..1 — prompt injection requires ≥ 0.6. */
  @Column({ type: 'double' })
  confidence!: number;

  /** Who recorded / confirmed the fact (display name), when known. */
  @Column({ type: 'varchar', length: 128, nullable: true })
  recordedBy!: string | null;

  /** Soft-delete — wrong facts get deactivated, never erased. */
  @Index()
  @Column({ type: 'boolean', default: true })
  isActive!: boolean;
}

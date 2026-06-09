import { Column, Entity, Index } from 'typeorm';

import { UuidEntity } from '../../../common/entities/base.entity';
import { Layer } from '../../../common/enums';

/**
 * Persona — a named, versioned expert system prompt that gives the platform a
 * specific senior-expert voice on a specific page (ADR-0010).
 *
 * Append-only versioning is implemented directly on this entity (rather than
 * inheriting `TraceableEntity`) because personas are not produced by an
 * `IngestionRun` — they are platform assets seeded from Markdown files under
 * `backend/src/personas/` on first boot and edited through the admin surface
 * thereafter. The append-only contract is identical to canonical entities:
 *  - one row per (businessKey, version), and
 *  - at any moment exactly one row per `businessKey` has `isCurrent = true`.
 *
 * Every Claude call records the exact `(businessKey, version)` it ran under,
 * so an answer the platform gave six months ago is reproducible from
 * `(persona version + project snapshot)` alone — same audit guarantee
 * Al Ayham praised in the 2026-06-08 meeting for ingestion fingerprinting.
 */
@Entity('persona')
export class Persona extends UuidEntity {
  /** Persona slug — stable across versions, e.g. `planner-p6-25yr`. */
  @Index()
  @Column({ type: 'varchar', length: 64 })
  businessKey!: string;

  @Column({ type: 'int', default: 1 })
  version!: number;

  @Index()
  @Column({ type: 'boolean', default: true })
  isCurrent!: boolean;

  /** Display title, e.g. *"مخطّط Primavera بخبرة 25 سنة"*. */
  @Column({ type: 'varchar', length: 255 })
  title!: string;

  /** Which platform layer this persona belongs to (see `Layer` enum). */
  @Column({ type: 'varchar', length: 32 })
  layer!: Layer | string;

  /** One-paragraph description of what this persona is for. */
  @Column({ type: 'text' })
  description!: string;

  /** Full system-prompt body sent to Claude as the `system` field. */
  @Column({ type: 'text' })
  systemPrompt!: string;

  /** Named constraint rules — citation-only, refusal policy, output schema, etc. */
  @Column({ type: 'json' })
  rules!: string[];

  /** Tier label, e.g. `claude-opus` / `claude-sonnet` / `claude-haiku`. */
  @Column({ type: 'varchar', length: 32 })
  modelTier!: string;

  @Column({ type: 'float', default: 0.2 })
  temperature!: number;

  /** Role allowed to edit this persona (defaults to `sigma_admin`). */
  @Column({ type: 'varchar', length: 32 })
  ownedByRole!: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  authoredBy!: string | null;
}

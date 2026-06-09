import { Column, Entity, Index } from 'typeorm';

import { UuidEntity } from '../../common/entities/base.entity';

/**
 * Source — one row per authoritative scientific or professional reference
 * the platform's expert personas are allowed to cite. The catalogue is curated
 * by Khaled + reviewed by Al Ayham; every persona system prompt instructs
 * Claude that **claims without a [SOURCE: externalId] marker referring to a
 * row in this table are flagged as assumptions, never silently embedded as
 * facts** (see post-meeting plan §3.3 rule 5).
 *
 * The seed catalogue lives in `sources.seed.json` and is loaded by
 * `SourcesService.seedFromCatalogue()` on application bootstrap. The loader
 * is idempotent: upsert keyed on `externalId`.
 *
 * Append-only versioning is NOT used here — sources are a curated lookup
 * table, not a fingerprintable audit artefact. Edits update the row in
 * place. If a future cycle needs change history, switch to TraceableEntity.
 */
@Entity('source')
export class Source extends UuidEntity {
  /**
   * Stable external slug used in persona prompts and `[SOURCE: id]` markers.
   * Examples: `fidic-red-2017`, `pmbok-7`, `iso-19650-2`, `aace-rp-29r-03`.
   *
   * NOTE: keep this short (<=64 chars) so it fits comfortably inside Claude
   * responses without consuming tokens we want for the actual citation.
   */
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 64 })
  externalId!: string;

  /**
   * Standards family this source belongs to — drives the `/sources/by-family`
   * filter on the front-end and keeps persona prompts compact ("cite from the
   * FIDIC family only" instead of an explicit allowlist).
   * Known values: `FIDIC`, `PMI`, `ISO`, `BIM`, `AACE`, `PRIMAVERA`.
   */
  @Index()
  @Column({ type: 'varchar', length: 32 })
  family!: string;

  @Column({ type: 'varchar', length: 512 })
  title!: string;

  /** Human-readable edition string, e.g. "2nd Edition 2017 (reprinted 2022)". */
  @Column({ type: 'varchar', length: 255 })
  latestEdition!: string;

  @Column({ type: 'varchar', length: 255 })
  publisher!: string;

  /** Year of the cited edition; used for tie-breaking when two editions overlap. */
  @Column({ type: 'int' })
  year!: number;

  @Column({ type: 'varchar', length: 1024 })
  url!: string;

  /** Long-form description of the source's scope (the persona reads this). */
  @Column({ type: 'text' })
  scope!: string;

  /**
   * Persona slugs allowed to cite this source. Used by the citation auditor
   * to flag e.g. a `pmi.org_chart.auditor` quoting a FIDIC Sub-Clause —
   * possible but suspicious, surfaces as a warning in the audit log.
   */
  @Column({ type: 'json' })
  applicablePersonas!: string[];

  /**
   * Curator-set verification state:
   *  - `confirmed`: title + edition + publisher cross-checked against the
   *    publisher's catalogue.
   *  - `verify`: the catalogue entry is plausible but at least one field
   *    (typically edition year or ISBN) needs a publisher-page check before
   *    being used in a client-facing letter.
   */
  @Column({ type: 'varchar', length: 16, default: 'verify' })
  verification!: string;
}

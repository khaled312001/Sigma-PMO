import { Column, Entity, Index } from 'typeorm';

import { UuidEntity } from '../../../common/entities/base.entity';

/**
 * ClashItem — a single Revit/BIM clash row imported from a clash report
 * (post-meeting plan §3.7, Layer 1 — Engineering).
 *
 * Wave 1 ships the entity only — the importer + 3-options solver belong to
 * `revit.clash.analyst` persona work in C2/C5 and are deliberately out of
 * scope here.
 *
 * `proposedOptions` mirrors the meeting's three-options-per-clash mechanic:
 * one of A (time-impact), B (cost-impact), C (scope-impact + cross-discipline
 * coordination). The chosen option is recorded by index so the rationale
 * trail stays append-only.
 */
@Entity('clash_item')
export class ClashItem extends UuidEntity {
  @Index()
  @Column({ type: 'varchar', length: 64 })
  projectBusinessKey!: string;

  /** SourceFile id of the imported clash report. */
  @Index()
  @Column({ type: 'char', length: 36 })
  sourceFileId!: string;

  /** Revit/BIM clash id from the source report. */
  @Column({ type: 'varchar', length: 128 })
  clashRef!: string;

  /** Disciplines involved, e.g. ['electrical', 'mechanical', 'structural']. */
  @Column({ type: 'json' })
  disciplinesInvolved!: string[];

  /** `critical` | `major` | `minor`. */
  @Column({ type: 'varchar', length: 16 })
  severity!: string;

  @Column({ type: 'text' })
  description!: string;

  /**
   * Array of `{ label, timeImpactDays, costImpactAED, scopeImpact }` — the
   * three options the BIM analyst persona proposes (post-meeting plan §3.7).
   *
   * `costImpactAED` is allowed to be `null` to honour the `revit-clash-analyst`
   * persona rule "أرقام التكلفة من جدول الكميات حصراً" — when the BoQ does
   * not carry the line, the option must NOT invent a number; it records
   * `null` and the rationale travels alongside (the persisted shape is a
   * deliberate "fast" projection; richer fields like `costNote` live in the
   * proposer's view-model, not on the persisted column). This widening is
   * Wave 2 only — the DB column is already `json` nullable, so no migration
   * is required.
   */
  @Column({ type: 'json', nullable: true })
  proposedOptions!: Array<{
    label: string;
    timeImpactDays: number;
    costImpactAED: number | null;
    scopeImpact: string;
  }> | null;

  @Column({ type: 'int', nullable: true })
  chosenOptionIndex!: number | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  decidedBy!: string | null;

  @Column({ type: 'datetime', precision: 6, nullable: true })
  decidedAt!: Date | null;

  // ── Per-clash detail columns (Req 2, Mr. Ayham acceptance) — first-class
  // typed fields so the clash detail view no longer re-parses `description`.
  // Populated by GeometricClashService.detect (real geometry) and by the
  // ClashExcelParser->ingestion path (Grid Location / Item GUIDs / Distance
  // columns). All nullable/additive. ──

  /** GUID of element on side A (IFC GlobalId / Revit element id). */
  @Column({ type: 'varchar', length: 128, nullable: true })
  elementGuidA!: string | null;

  /** GUID of element on side B. */
  @Column({ type: 'varchar', length: 128, nullable: true })
  elementGuidB!: string | null;

  /** World X coordinate of the clash centroid (project units, mm). */
  @Column({ type: 'double', nullable: true })
  locationX!: number | null;

  @Column({ type: 'double', nullable: true })
  locationY!: number | null;

  @Column({ type: 'double', nullable: true })
  locationZ!: number | null;

  /** Grid/axis location text (e.g. "C-4 / +12.30"). */
  @Column({ type: 'varchar', length: 255, nullable: true })
  gridLocation!: string | null;

  /** Penetration depth / clearance distance in millimetres. */
  @Column({ type: 'double', nullable: true })
  penetrationMm!: number | null;

  /** Storage ref (path/key) of the clash snapshot image, when captured. */
  @Column({ type: 'varchar', length: 512, nullable: true })
  snapshotImagePath!: string | null;

  /** Autodesk Viewer model URN (the "viewer half" of the detail view). */
  @Column({ type: 'varchar', length: 512, nullable: true })
  viewUrn!: string | null;

  /** Autodesk Viewer view state (camera + isolated dbIds), opaque JSON. */
  @Column({ type: 'json', nullable: true })
  viewState!: Record<string, unknown> | null;

  /** businessKey of the canonical Activity this clash resolution revised. */
  @Index()
  @Column({ type: 'varchar', length: 64, nullable: true })
  linkedActivityBusinessKey!: string | null;

  /** Party responsible for resolving the clash (discipline/contractor). */
  @Column({ type: 'varchar', length: 255, nullable: true })
  responsibleParty!: string | null;
}

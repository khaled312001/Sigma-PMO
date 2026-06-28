import { Column, Entity, Index } from 'typeorm';

import { UuidEntity } from '../../../common/entities/base.entity';

/**
 * SiteEvidence — a dedicated site-capture channel (Mr. Ayham acceptance
 * 2026-06-28): photo / video / audio / transcript captured on site (e.g. via
 * smart glasses) with rich metadata — when (capturedAt), where (lat/long +
 * locationLabel), who (workerName/Id), on which device (smart_glasses / phone /
 * tablet), and against which activity. The media bytes are archived immutably
 * (SHA-256) by StorageService; this row holds the metadata + storedPath. Rows
 * roll up per day via `reportDate` (the daily-report view) and may optionally
 * raise a Safety or Quality finding, linked back via
 * linkedSafetyRecordId / linkedQualityRecordId.
 */
@Entity('site_evidence')
@Index(['projectBusinessKey', 'reportDate'])
export class SiteEvidence extends UuidEntity {
  /** Owning company (multi-tenant SaaS) — null for legacy/default-tenant rows. */
  @Index()
  @Column({ type: 'char', length: 36, nullable: true })
  companyId!: string | null;

  @Index()
  @Column({ type: 'varchar', length: 64 })
  projectBusinessKey!: string;

  /** photo | video | audio | transcript. */
  @Index()
  @Column({ type: 'varchar', length: 16 })
  mediaKind!: 'photo' | 'video' | 'audio' | 'transcript' | string;

  @Column({ type: 'varchar', length: 255 })
  filename!: string;

  @Column({ type: 'varchar', length: 128 })
  mimeType!: string;

  @Column({ type: 'int' })
  bytes!: number;

  @Column({ type: 'char', length: 64 })
  sha256!: string;

  /** Content-addressed archive path (StorageService). */
  @Column({ type: 'varchar', length: 512 })
  storedPath!: string;

  /** When the media was captured on site (device clock). */
  @Column({ type: 'datetime', precision: 6, nullable: true })
  capturedAt!: Date | null;

  /** Calendar day of capture (YYYY-MM-DD), derived from capturedAt for the daily rollup. */
  @Index()
  @Column({ type: 'date', nullable: true })
  reportDate!: string | null;

  @Column({ type: 'decimal', precision: 10, scale: 7, nullable: true })
  latitude!: string | null;

  @Column({ type: 'decimal', precision: 10, scale: 7, nullable: true })
  longitude!: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  locationLabel!: string | null;

  /** Canonical Activity businessKey this capture relates to, when known. */
  @Index()
  @Column({ type: 'varchar', length: 64, nullable: true })
  activityKey!: string | null;

  @Column({ type: 'varchar', length: 128, nullable: true })
  workerName!: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  workerId!: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  deviceId!: string | null;

  /** smart_glasses | phone | tablet. */
  @Column({ type: 'varchar', length: 16, nullable: true })
  deviceType!: 'smart_glasses' | 'phone' | 'tablet' | string | null;

  /** Verbatim transcript text (for mediaKind=transcript, or an audio/video caption). */
  @Column({ type: 'text', nullable: true })
  transcriptText!: string | null;

  /** safety | quality | null — when set, a finding was raised from this capture. */
  @Column({ type: 'varchar', length: 16, nullable: true })
  findingType!: 'safety' | 'quality' | null;

  /** Id of the SafetyRecord raised from this capture (findingType=safety). */
  @Column({ type: 'char', length: 36, nullable: true })
  linkedSafetyRecordId!: string | null;

  /** Id of the QualityRecord raised from this capture (findingType=quality). */
  @Column({ type: 'char', length: 36, nullable: true })
  linkedQualityRecordId!: string | null;

  @Column({ type: 'varchar', length: 128, nullable: true })
  capturedBy!: string | null;
}

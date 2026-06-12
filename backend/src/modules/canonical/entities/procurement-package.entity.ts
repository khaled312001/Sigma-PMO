import { Column, Entity, Index } from 'typeorm';

import { UuidEntity } from '../../../common/entities/base.entity';

/**
 * ProcurementPackage — one procurement/supply package in Procurement
 * Intelligence (Mr. Ayham, 2026-06-12): planning + long-lead tracking, the
 * RFQ/bid governance trail, delivery tracking, and the three quantities the
 * cross-source supply-chain validation compares — BIM, procured and installed.
 * Append-only by (businessKey, isCurrent).
 */
@Entity('procurement_package')
@Index(['projectBusinessKey', 'isCurrent'])
export class ProcurementPackage extends UuidEntity {
  @Index()
  @Column({ type: 'varchar', length: 64 })
  projectBusinessKey!: string;

  /** Stable natural key, e.g. "PKG-007". */
  @Index()
  @Column({ type: 'varchar', length: 64 })
  businessKey!: string;

  @Column({ type: 'varchar', length: 255 })
  title!: string;

  /** Trade/material category — links to Vendor.category + the cost element. */
  @Index()
  @Column({ type: 'varchar', length: 64 })
  category!: string;

  /** Canonical classified element (cost-classification framework), when known. */
  @Column({ type: 'varchar', length: 48, nullable: true })
  element!: string | null;

  @Column({ type: 'varchar', length: 16, nullable: true })
  unit!: string | null;

  /** planned | rfq | evaluated | awarded | delivering | delivered. */
  @Index()
  @Column({ type: 'varchar', length: 16, default: 'planned' })
  status!: string;

  /** make-to-order | off-the-shelf | nominated | framework. */
  @Column({ type: 'varchar', length: 24, nullable: true })
  strategy!: string | null;

  @Column({ type: 'boolean', default: false })
  longLead!: boolean;

  @Column({ type: 'int', nullable: true })
  leadTimeDays!: number | null;

  @Column({ type: 'date', nullable: true })
  requiredOnSiteDate!: string | null;

  @Column({ type: 'date', nullable: true })
  plannedDeliveryDate!: string | null;

  @Column({ type: 'date', nullable: true })
  actualDeliveryDate!: string | null;

  /** The three quantities the validation compares (same unit). */
  @Column({ type: 'decimal', precision: 18, scale: 4, nullable: true })
  bimQuantity!: string | null;

  @Column({ type: 'decimal', precision: 18, scale: 4, nullable: true })
  procuredQuantity!: string | null;

  @Column({ type: 'decimal', precision: 18, scale: 4, nullable: true })
  installedQuantity!: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  awardedVendorBusinessKey!: string | null;

  @Column({ type: 'decimal', precision: 18, scale: 2, nullable: true })
  estimatedCost!: string | null;

  @Column({ type: 'decimal', precision: 18, scale: 2, nullable: true })
  awardedCost!: string | null;

  @Column({ type: 'varchar', length: 8, default: 'AED' })
  currency!: string;

  /**
   * RFQ + evaluation trail: { bids: [{ vendorBusinessKey, price, technical,
   * commercial, deliveryDays }], evaluation, awardRecommendation }.
   */
  @Column({ type: 'json', nullable: true })
  details!: Record<string, unknown> | null;

  @Column({ type: 'int', default: 1 })
  version!: number;

  @Index()
  @Column({ type: 'boolean', default: true })
  isCurrent!: boolean;

  @Column({ type: 'varchar', length: 128, nullable: true })
  createdBy!: string | null;
}

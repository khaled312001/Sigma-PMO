import { Column, Entity, Index } from 'typeorm';

import { UuidEntity } from '../../common/entities/base.entity';

/**
 * One finding the PMI org-chart auditor produced for a submitted contractor
 * organisation chart. The persona returns these as the structured payload of
 * its review.
 */
export interface OrgChartFinding {
  /** Slug for the role / role-pair the finding is about ("qa-qc-manager", "site-team", …). */
  role: string;
  /** Short human label — "QA/QC Manager", "Reporting line: PM → Owner". */
  label: string;
  /** PMBOK process group the finding refers to: Initiating / Planning / Executing / M&C / Closing. */
  processGroup: string;
  /**
   * Severity ladder per `pmi-orgchart-analyst` persona rule 3:
   *   missing-role > unclear-line > under-staffed > over-staffed
   */
  severity: 'missing-role' | 'unclear-line' | 'under-staffed' | 'over-staffed';
  /** Free-text issue narrative the persona supplied. */
  issue: string;
  /** Recommended action the contractor must take. */
  recommendation: string;
  /** SourceRegistry externalIds the finding cites (pmbok-7, pmbok-6, etc.). */
  citationIds: string[];
}

/** Lifecycle status of an org-chart review. */
export type OrgChartReviewStatus =
  | 'pending-review'
  | 'reviewed'
  | 'letter-drafted'
  | 'compliant';

/**
 * Persisted record of one PMI org-chart compliance review the platform ran on a
 * contractor-submitted organisation chart. The findings array is the
 * pmi-orgchart-analyst persona output; the optional `complianceLetterId`
 * points at the FIDIC-style compliance letter the human approved (per
 * ADR-0018, drafts are never auto-sent).
 *
 * See post-meeting plan §3.5 (FIDIC + PMI letter generation) and ADR-0010 §3
 * (per-page expert personas). The companion persona seed lives at
 * `backend/src/personas/pmi-orgchart-analyst.md`.
 */
@Entity('org_chart_review')
export class OrgChartReview extends UuidEntity {
  @Index()
  @Column({ type: 'varchar', length: 64 })
  projectBusinessKey!: string;

  /** SourceFile id of the uploaded org-chart Excel. Evidence chain hook. */
  @Index()
  @Column({ type: 'char', length: 36 })
  sourceFileId!: string;

  /** Structured findings produced by `pmi-orgchart-analyst`. */
  @Column({ type: 'json' })
  findings!: OrgChartFinding[];

  /** Optional pointer to the FIDIC-style compliance letter drafted from this review. */
  @Column({ type: 'char', length: 36, nullable: true })
  complianceLetterId!: string | null;

  @Column({ type: 'varchar', length: 32 })
  status!: OrgChartReviewStatus;

  @Column({ type: 'varchar', length: 255, nullable: true })
  reviewedBy!: string | null;

  /**
   * SourceRegistry externalIds the review cited overall (union of finding
   * citations + the persona's own context). Echoes the citation discipline
   * from the FIDIC LetterDrafter (ADR-0020) so every PMI artefact is
   * traceable to its standard.
   */
  @Column({ type: 'json' })
  citations!: string[];

  /** Free-text override / appended note the human reviewer added. */
  @Column({ type: 'text', nullable: true })
  reviewerNote!: string | null;
}

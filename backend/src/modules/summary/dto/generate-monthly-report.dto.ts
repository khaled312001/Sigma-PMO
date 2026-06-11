import { IsIn, IsOptional, IsString, Matches } from 'class-validator';

/** POST /reports/monthly/generate body. */
export class GenerateMonthlyReportDto {
  @IsString()
  projectKey!: string;

  /** Calendar month in `YYYY-MM` form. */
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, { message: 'monthIso must be YYYY-MM' })
  monthIso!: string;

  /** Stakeholder view to author. */
  @IsIn(['owner', 'pd', 'contractor'])
  audience!: 'owner' | 'pd' | 'contractor';

  /**
   * Narrative composition (default `executive` = legacy behaviour):
   *  - `executive` — schedule/alerts/governance/BoQ/confidence (current).
   *  - `governance` — decisions / escalations / corrective focus.
   *  - `investment` — latest feasibility assessments + recommendations.
   *  - `portfolio` — cross-project BAC/EV/AC totals + statuses.
   */
  @IsOptional()
  @IsIn(['executive', 'governance', 'investment', 'portfolio'])
  narrativeType?: 'executive' | 'governance' | 'investment' | 'portfolio';

  /** Optional author override; defaults to the calling user when omitted. */
  @IsOptional()
  @IsString()
  authoredBy?: string;
}

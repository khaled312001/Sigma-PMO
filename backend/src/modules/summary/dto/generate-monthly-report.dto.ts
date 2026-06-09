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

  /** Optional author override; defaults to the calling user when omitted. */
  @IsOptional()
  @IsString()
  authoredBy?: string;
}

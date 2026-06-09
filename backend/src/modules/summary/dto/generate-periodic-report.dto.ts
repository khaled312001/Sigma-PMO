import { IsIn, IsOptional, IsString, Matches, ValidateIf } from 'class-validator';

/**
 * POST /reports/periodic/generate body.
 *
 * `periodKey` shape is cadence-dependent:
 *  - `day`   → `YYYY-MM-DD`
 *  - `week`  → `YYYY-Www`  (ISO week, e.g. `2026-W23`)
 *  - `month` → `YYYY-MM`
 *
 * Per-cadence regex check is enforced at the service layer; this DTO only
 * sanity-checks the loose shape so a stray multi-line payload is rejected
 * early.
 */
export class GeneratePeriodicReportDto {
  @IsString()
  projectKey!: string;

  @IsIn(['day', 'week', 'month'])
  cadence!: 'day' | 'week' | 'month';

  @Matches(/^[0-9A-Za-z\-W]{7,16}$/, {
    message: 'periodKey must be YYYY-MM-DD (day), YYYY-Www (week), or YYYY-MM (month)',
  })
  periodKey!: string;

  @IsIn(['owner', 'pd', 'contractor'])
  audience!: 'owner' | 'pd' | 'contractor';

  @IsOptional()
  @IsString()
  @ValidateIf((o: GeneratePeriodicReportDto) => typeof o.authoredBy === 'string')
  authoredBy?: string;
}

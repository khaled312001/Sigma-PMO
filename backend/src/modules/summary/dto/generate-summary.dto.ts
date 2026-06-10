import { IsIn, IsInt, IsOptional, IsString, Matches, Max, Min } from 'class-validator';

export class GenerateSummaryDto {
  @IsOptional()
  @IsString()
  projectId?: string;

  @IsOptional()
  @IsString()
  projectKey?: string;

  /** ISO date YYYY-MM-DD; defaults to today (UTC). */
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  periodEnd?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(90)
  periodDays?: number;

  /**
   * Narrative locale (plan §8 — domain-tuned language). `ar` emits the
   * construction-industry Arabic terms; default `en` keeps the legacy
   * English literals existing rows were generated with.
   */
  @IsOptional()
  @IsIn(['en', 'ar'])
  locale?: 'en' | 'ar';
}

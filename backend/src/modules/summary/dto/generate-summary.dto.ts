import { IsInt, IsOptional, IsString, Matches, Max, Min } from 'class-validator';

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
}

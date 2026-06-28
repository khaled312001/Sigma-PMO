import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString } from 'class-validator';

/** POST /predictive/run body. */
export class PredictiveRunDto {
  @ApiProperty({ description: 'Project business key to forecast.', example: 'P-1000' })
  @IsString()
  projectKey!: string;

  @ApiPropertyOptional({ description: 'Data date for the forecast (ISO YYYY-MM-DD). Defaults to the platform predictive as-of date.', example: '2026-06-01' })
  @IsOptional()
  @IsString()
  asOfDate?: string;
}

/** POST /predictive/ai-analysis body. */
export class PredictiveAiAnalysisDto {
  @ApiProperty({ description: 'Project business key.', example: 'P-1000' })
  @IsString()
  projectKey!: string;

  @ApiPropertyOptional({ description: 'Data date (ISO YYYY-MM-DD).', example: '2026-06-01' })
  @IsOptional()
  @IsString()
  asOfDate?: string;

  @ApiPropertyOptional({ description: 'Narrative language.', enum: ['en', 'ar'], example: 'ar' })
  @IsOptional()
  @IsIn(['en', 'ar'])
  language?: 'en' | 'ar';
}

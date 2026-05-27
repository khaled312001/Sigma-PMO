import { IsOptional, IsString, IsUUID } from 'class-validator';

export class EvaluateDto {
  /** If provided, evaluate only this project (canonical row UUID). */
  @IsOptional()
  @IsUUID()
  projectId?: string;

  /** Alternatively, evaluate by the project's business key (e.g. "P-1000"). */
  @IsOptional()
  @IsString()
  projectKey?: string;
}

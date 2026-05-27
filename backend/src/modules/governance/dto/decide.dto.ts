import { IsOptional, IsString, IsUUID } from 'class-validator';

export class DecideDto {
  @IsUUID()
  ruleEvaluationId!: string;

  @IsOptional()
  @IsString()
  projectKey?: string;
}

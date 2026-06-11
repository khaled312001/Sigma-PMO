import { IsOptional, IsString } from 'class-validator';

/**
 * POST /rules/workflows/run body. When `projectKey` is omitted the workflow
 * runs across every current project (the "All projects" variant).
 */
export class RunWorkflowDto {
  @IsOptional()
  @IsString()
  projectKey?: string;
}

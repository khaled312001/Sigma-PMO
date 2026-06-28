import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

/**
 * POST /rules/workflows/run body. When `projectKey` is omitted the workflow
 * runs across every current project (the "All projects" variant).
 */
export class RunWorkflowDto {
  @ApiPropertyOptional({ description: 'Run the governance workflow (evaluate → decide) for this project. Omit to run across every current project.', example: 'P-1000' })
  @IsOptional()
  @IsString()
  projectKey?: string;
}

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString } from 'class-validator';

/**
 * POST /governance-command/recompute body. NOTE: the L8 command centre works on
 * the governance HIERARCHY, so it takes `nodeType` + `nodeKey` — NOT `projectKey`.
 * For a project pass nodeType="project" (the default) and nodeKey="P-1000".
 */
export class RecomputeDto {
  @ApiPropertyOptional({
    description: 'Hierarchy node type. Defaults to "project". Use enterprise/portfolio/program for higher-level roll-ups.',
    enum: ['enterprise', 'portfolio', 'program', 'project'],
    example: 'project',
  })
  @IsOptional()
  @IsIn(['enterprise', 'portfolio', 'program', 'project'])
  nodeType?: string;

  @ApiProperty({ description: 'Business key of the node to recompute. For a project this is the project key.', example: 'P-1000' })
  @IsString()
  nodeKey!: string;
}

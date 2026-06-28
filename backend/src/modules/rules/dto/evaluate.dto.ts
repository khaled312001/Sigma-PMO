import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID } from 'class-validator';

export class EvaluateDto {
  @ApiPropertyOptional({ description: 'Evaluate only this project by canonical row UUID.', example: '7e34978f-c4b7-47df-8f1a-b1823e6dc142', format: 'uuid' })
  @IsOptional()
  @IsUUID()
  projectId?: string;

  @ApiPropertyOptional({ description: "Evaluate by the project's stable business key (preferred). Omit both to evaluate every current project.", example: 'P-1000' })
  @IsOptional()
  @IsString()
  projectKey?: string;
}

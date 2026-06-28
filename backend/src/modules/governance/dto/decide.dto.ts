import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID } from 'class-validator';

export class DecideDto {
  @ApiProperty({ description: 'UUID of the rule evaluation whose alerts should be turned into governance decisions.', example: '00255fb1-d798-4956-9c35-a6657a941d00', format: 'uuid' })
  @IsUUID()
  ruleEvaluationId!: string;

  @ApiPropertyOptional({ description: "Optional project business key (tenant scoping).", example: 'P-1000' })
  @IsOptional()
  @IsString()
  projectKey?: string;
}

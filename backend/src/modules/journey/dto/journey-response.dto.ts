import { ApiProperty } from '@nestjs/swagger';

/** One leg of the cross-module journey, with explicit presence (documentation shape). */
export class JourneyLegDto {
  @ApiProperty({ description: 'Stable lifecycle key (alias of `stage`).', example: 'site-evidence' })
  leg!: string;

  @ApiProperty({ description: 'Stable lifecycle key (backward-compatible).', example: 'site-evidence' })
  stage!: string;

  @ApiProperty({ description: 'Human-readable leg label.', example: 'Site evidence (rooms + captures)' })
  label!: string;

  @ApiProperty({ description: 'Whether the leg has any item.', example: true })
  present!: boolean;

  @ApiProperty({ description: 'Number of items on the leg.', example: 2 })
  count!: number;

  @ApiProperty({ required: false, description: 'Why the leg is empty (only when present=false).', example: 'No concept sketch ingested for this project yet' })
  note?: string;

  @ApiProperty({ description: 'Rows on this leg (key fields + journeyCorrelationId where present).', type: 'array', items: { type: 'object', additionalProperties: true } })
  items!: Array<Record<string, unknown>>;
}

/** `GET /journey/:projectKey` response (documentation shape for `JourneyChain`). */
export class JourneyResponseDto {
  @ApiProperty({ description: 'Project business key.', example: 'P-1000' })
  projectKey!: string;

  @ApiProperty({ nullable: true, description: 'Project name.', example: 'Tower A' })
  projectName!: string | null;

  @ApiProperty({ nullable: true, description: 'Linked investment opportunity id, when the project came from one.', example: 'opp-7f3c…' })
  opportunityId!: string | null;

  @ApiProperty({ description: 'Distinct journeyCorrelationIds discovered across the chain.', type: [String], example: ['JC-1', 'JC-2'] })
  correlationIds!: string[];

  @ApiProperty({ description: 'Ordered lifecycle legs (sketch → feasibility → BIM → BoQ → schedule → contract → site-evidence → report → decision).', type: [JourneyLegDto] })
  legs!: JourneyLegDto[];
}

import { ApiProperty } from '@nestjs/swagger';

/** One document-anchored evidence item on a forensic chain leg (documentation shape). */
export class ForensicChainItemDto {
  @ApiProperty({ description: 'Where the item came from.', enum: ['link', 'evidence_item'], example: 'link' })
  source!: string;

  @ApiProperty({ nullable: true, description: 'Linked target table.', example: 'letter' })
  targetTable!: string | null;

  @ApiProperty({ nullable: true, description: 'Linked target row id.', example: 'ltr-91…' })
  targetId!: string | null;

  @ApiProperty({ nullable: true, description: 'Title / short note for the item.', example: 'NOI ref 0142' })
  title!: string | null;

  @ApiProperty({ nullable: true, description: 'Archived source file id.', example: 'file-22…' })
  fileId!: string | null;

  @ApiProperty({ nullable: true, description: 'Source file name.', example: 'noi-0142.pdf' })
  fileName!: string | null;

  @ApiProperty({ nullable: true, description: 'Page anchor within the source file.', example: 3 })
  page!: number | null;

  @ApiProperty({ nullable: true, description: 'Paragraph anchor within the page.', example: 2 })
  paragraph!: number | null;

  @ApiProperty({ nullable: true, description: 'Content SHA-256 of the cited evidence.', example: 'a1b2c3…' })
  sha256!: string | null;

  @ApiProperty({ nullable: true, description: 'Free-text note.', example: 'Time-bar starts at notice date.' })
  note!: string | null;
}

/** One leg of the forensic evidence chain (documentation shape). */
export class ForensicChainLegDto {
  @ApiProperty({ description: 'Chain leg key.', example: 'letter' })
  linkType!: string;

  @ApiProperty({ description: 'Human-readable leg label.', example: 'Letters / correspondence' })
  label!: string;

  @ApiProperty({ description: 'Document-anchored evidence items on the leg.', type: [ForensicChainItemDto] })
  items!: ForensicChainItemDto[];
}

/** FIDIC clause verdict for the claim (documentation shape). */
export class FidicClauseVerdictDto {
  @ApiProperty({ nullable: true, description: 'FIDIC clause the claim cites.', example: '20.1' })
  clauseRef!: string | null;

  @ApiProperty({ nullable: true, description: 'Matched active contract clause rule, when one is on the register.', type: 'object', additionalProperties: true })
  rule!: Record<string, unknown> | null;

  @ApiProperty({ description: 'Plain-language verdict / next step.', example: 'Claim cites 20.1 (notice): procedural window 28 day(s)…' })
  note!: string;
}

/** `GET /claims/:id/chain` response (documentation shape for `ForensicClaimChain`). */
export class ForensicChainResponseDto {
  @ApiProperty({ description: 'When the chain was assembled (ISO).', example: '2026-06-28T10:00:00.000Z' })
  generatedAt!: string;

  @ApiProperty({ description: 'Claim id.', example: 'clm-44…' })
  claimId!: string;

  @ApiProperty({ description: 'Project business key.', example: 'P-1000' })
  projectKey!: string;

  @ApiProperty({ description: 'The claim row.', type: 'object', additionalProperties: true })
  claim!: Record<string, unknown>;

  @ApiProperty({ description: 'Forensic delay analysis (as-planned vs as-built, windowed, net EOT).', type: 'object', additionalProperties: true })
  forensicDelay!: Record<string, unknown>;

  @ApiProperty({ description: 'Deterministic entitlement assessment.', type: 'object', additionalProperties: true })
  entitlement!: Record<string, unknown>;

  @ApiProperty({ description: 'FIDIC clause verdict for the cited clause.', type: FidicClauseVerdictDto })
  fidicClauseVerdict!: FidicClauseVerdictDto;

  @ApiProperty({ description: 'Document-anchored evidence legs (letter + daily report + baseline/update + photo/video + BOQ line + FIDIC clause).', type: [ForensicChainLegDto] })
  legs!: ForensicChainLegDto[];
}

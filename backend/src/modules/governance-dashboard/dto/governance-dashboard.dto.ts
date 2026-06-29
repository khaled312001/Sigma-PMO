import { ApiProperty } from '@nestjs/swagger';

class SourceInputsDto {
  @ApiProperty({ example: 3 }) drawings!: number;
  @ApiProperty({ example: 1 }) bimModels!: number;
  @ApiProperty({ example: 12 }) clashes!: number;
  @ApiProperty({ example: 240 }) boqItems!: number;
  @ApiProperty({ example: 7 }) procurementPackages!: number;
  @ApiProperty({ example: 320 }) activities!: number;
  @ApiProperty({ example: 18 }) siteEvidenceCaptures!: number;
}

class OutputsDto {
  @ApiProperty({ example: 4 }) monthlyReports!: number;
  @ApiProperty({ nullable: true, type: 'object', additionalProperties: true, description: 'ExecutiveKpiService.computeKpis() summary (null if not computable yet).' })
  kpis!: Record<string, unknown> | null;
  @ApiProperty({ nullable: true, example: 'orange' }) governanceStatus!: string | null;
}

class EvidenceDto {
  @ApiProperty({ example: 5 }) claims!: number;
  @ApiProperty({ example: 2 }) evidenceRooms!: number;
  @ApiProperty({ example: 18 }) siteEvidence!: number;
  @ApiProperty({ example: 9 }) claimEvidenceLinks!: number;
}

class HumanApprovalDto {
  @ApiProperty({ example: 6 }) decisionsTotal!: number;
  @ApiProperty({ example: 2 }) approved!: number;
  @ApiProperty({ example: 4 }) awaiting!: number;
  @ApiProperty({ example: 'Nothing is auto-approved: every governance decision awaits an explicit human approval (recorded in decision_review).' })
  note!: string;
}

class RecommendedDecisionDto {
  @ApiProperty({ nullable: true, example: 'orange' }) status!: string | null;
  @ApiProperty({ nullable: true, example: 0.42 }) score!: number | null;
  @ApiProperty({ nullable: true, example: '2026-06-28T09:00:00.000Z' }) computedAt!: string | null;
  @ApiProperty({ enum: ['governance-status-snapshot', 'governance-decision', 'none'], example: 'governance-status-snapshot' })
  source!: string;
  @ApiProperty({ nullable: true, example: 'Latest computed governance status is orange. This is a recommendation only — a human must approve any resulting action.' })
  summary!: string | null;
  @ApiProperty({ example: true, description: 'Always true — the platform recommends; a human decides. Nothing is auto-approved.' })
  requiresHumanApproval!: boolean;
}

/** `GET /executive/governance-dashboard?projectKey=` response (documentation shape). */
export class GovernanceDashboardDto {
  @ApiProperty({ example: 'P-1000' }) projectKey!: string;
  @ApiProperty({ nullable: true, example: 'Tower A' }) projectName!: string | null;
  @ApiProperty({ example: '2026-06-28T10:00:00.000Z' }) generatedAt!: string;
  @ApiProperty({ type: SourceInputsDto }) sourceInputs!: SourceInputsDto;
  @ApiProperty({ type: OutputsDto }) outputs!: OutputsDto;
  @ApiProperty({ type: EvidenceDto }) evidence!: EvidenceDto;
  @ApiProperty({ type: HumanApprovalDto }) humanApproval!: HumanApprovalDto;
  @ApiProperty({ type: RecommendedDecisionDto }) recommendedDecision!: RecommendedDecisionDto;
}

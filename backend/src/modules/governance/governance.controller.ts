import { Controller, Get, NotFoundException, Param, Query } from '@nestjs/common';

import { ConfidenceService } from './confidence.service';
import { EvidencePackage, EvidenceService } from './evidence.service';

@Controller('governance')
export class GovernanceController {
  constructor(
    private readonly evidence: EvidenceService,
    private readonly confidence: ConfidenceService,
  ) {}

  /** Full evidence chain for an alert (Cycle 3 acceptance surface). */
  @Get('alerts/:id/evidence')
  evidenceForAlert(@Param('id') id: string): Promise<EvidencePackage> {
    return this.evidence.forAlert(id);
  }

  /** Confidence score for one ingestion run. */
  @Get('confidence')
  async confidenceFor(@Query('runId') runId: string) {
    if (!runId) throw new NotFoundException('runId query parameter is required');
    const score = await this.confidence.findByRun(runId);
    if (!score) throw new NotFoundException(`No confidence score for run ${runId}`);
    return score;
  }
}

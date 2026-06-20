import { Module } from '@nestjs/common';

import { AiAnalysisModule } from '../ai-analysis/ai-analysis.module';
import { CanonicalModule } from '../canonical/canonical.module';
import { QualityController } from './quality.controller';
import { QualityGovernanceService } from './quality-governance.service';
import { QualityService } from './quality.service';

/**
 * QualityModule — QA/QC Governance (Mr. Ayham acceptance #4). Builds on the
 * QualityRecord entity (CanonicalModule) and reads the canonical Project +
 * Activity rows to flag critical-path impact. Governs the construction quality
 * lifecycle: WIR/MIR inspections, method statements, ITPs with hold/witness
 * points, NCRs, corrective actions and test reports — producing a quality
 * compliance score, a first-pass acceptance rate, a quality risk register, a
 * quality trend, and NCR claim chains (NCR → Rework → Delay + Cost → Critical
 * Path → EOT/Cost → Claim readiness).
 */
@Module({
  imports: [AiAnalysisModule, CanonicalModule],
  controllers: [QualityController],
  providers: [QualityService, QualityGovernanceService],
  exports: [QualityService, QualityGovernanceService],
})
export class QualityModule {}

import { Module } from '@nestjs/common';

import { CanonicalModule } from '../canonical/canonical.module';
import { ConfidenceService } from './confidence.service';
import { EvidenceService } from './evidence.service';
import { GovernanceController } from './governance.controller';
import { GovernanceDecisionService } from './governance-decision.service';
import { GovernancePolicyService } from './governance-policy.service';

@Module({
  imports: [CanonicalModule],
  controllers: [GovernanceController],
  providers: [ConfidenceService, EvidenceService, GovernancePolicyService, GovernanceDecisionService],
  exports: [ConfidenceService, EvidenceService, GovernancePolicyService, GovernanceDecisionService],
})
export class GovernanceModule {}

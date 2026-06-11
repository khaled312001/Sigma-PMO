import { Module } from '@nestjs/common';

import { CanonicalModule } from '../canonical/canonical.module';
import { SettingsModule } from '../settings/settings.module';
import { ConfidenceService } from './confidence.service';
import { DecisionReviewService } from './decision-review.service';
import { EvidenceService } from './evidence.service';
import { GovernanceController } from './governance.controller';
import { GovernanceDecisionService } from './governance-decision.service';
import { GovernancePolicyService } from './governance-policy.service';
import { GovernanceTraceService } from './governance-trace.service';

@Module({
  imports: [CanonicalModule, SettingsModule],
  controllers: [GovernanceController],
  providers: [
    ConfidenceService,
    EvidenceService,
    GovernancePolicyService,
    GovernanceDecisionService,
    DecisionReviewService,
    GovernanceTraceService,
  ],
  exports: [
    ConfidenceService,
    EvidenceService,
    GovernancePolicyService,
    GovernanceDecisionService,
    DecisionReviewService,
    GovernanceTraceService,
  ],
})
export class GovernanceModule {}

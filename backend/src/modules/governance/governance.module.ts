import { Module } from '@nestjs/common';

import { CanonicalModule } from '../canonical/canonical.module';
import { ConfidenceService } from './confidence.service';
import { EvidenceService } from './evidence.service';
import { GovernanceController } from './governance.controller';

@Module({
  imports: [CanonicalModule],
  controllers: [GovernanceController],
  providers: [ConfidenceService, EvidenceService],
  exports: [ConfidenceService, EvidenceService],
})
export class GovernanceModule {}

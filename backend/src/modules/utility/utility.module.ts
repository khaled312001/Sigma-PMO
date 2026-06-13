import { Module } from '@nestjs/common';

import { AgentsModule } from '../agents/agents.module';
import { AiAnalysisModule } from '../ai-analysis/ai-analysis.module';
import { CanonicalModule } from '../canonical/canonical.module';
import { OutboxModule } from '../outbox/outbox.module';
import { UtilityAgentService } from './utility-agent.service';
import { UtilityController } from './utility.controller';
import { UtilityGovernanceService } from './utility-governance.service';
import { UtilityService } from './utility.service';

/**
 * UtilityModule — Utility Governance (Mr. Ayham, 2026-06-13 17-stage lifecycle
 * scope). Builds on the UtilityConnection entity (CanonicalModule) to govern
 * utility readiness & connection status (power/water/telecom/gas/sewerage/
 * district cooling): the Utility Readiness Index, forecast connection dates and
 * per-connection delay exposure against the required-by date. Registers the
 * `ext.utility` extension agent — plugging in with zero edits to L0–L8.
 */
@Module({
  imports: [AgentsModule, AiAnalysisModule, CanonicalModule, OutboxModule],
  controllers: [UtilityController],
  providers: [UtilityService, UtilityGovernanceService, UtilityAgentService],
  exports: [UtilityService, UtilityGovernanceService],
})
export class UtilityModule {}

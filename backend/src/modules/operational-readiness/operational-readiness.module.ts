import { Module } from '@nestjs/common';

import { AgentsModule } from '../agents/agents.module';
import { AiAnalysisModule } from '../ai-analysis/ai-analysis.module';
import { CanonicalModule } from '../canonical/canonical.module';
import { OutboxModule } from '../outbox/outbox.module';
import { OperationalReadinessAgentService } from './operational-readiness-agent.service';
import { OperationalReadinessController } from './operational-readiness.controller';
import { OperationalReadinessGovernanceService } from './operational-readiness-governance.service';
import { OperationalReadinessService } from './operational-readiness.service';

/**
 * OperationalReadinessModule — Operational Readiness Governance (Mr. Ayham,
 * 2026-06-13: the full 17-stage governance lifecycle). Builds on the
 * OperationalReadinessItem entity (CanonicalModule) to govern the
 * construction-complete → operational go-live transition: O&M manuals, asset
 * registers, training, testing & commissioning, handover, staffing, spares and
 * warranties. Registers the `ext.operational_readiness` extension agent —
 * with zero edits to L0–L8.
 */
@Module({
  imports: [AgentsModule, AiAnalysisModule, CanonicalModule, OutboxModule],
  controllers: [OperationalReadinessController],
  providers: [OperationalReadinessService, OperationalReadinessGovernanceService, OperationalReadinessAgentService],
  exports: [OperationalReadinessService, OperationalReadinessGovernanceService],
})
export class OperationalReadinessModule {}

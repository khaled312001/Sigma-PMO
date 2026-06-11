import { Module } from '@nestjs/common';

import { AgentsModule } from '../agents/agents.module';
import { CanonicalModule } from '../canonical/canonical.module';
import { HierarchyModule } from '../hierarchy/hierarchy.module';
import { OutboxModule } from '../outbox/outbox.module';
import { ConsolidationService } from './consolidation.service';
import { SigmaGovernanceAgentService } from './sigma-governance-agent.service';
import { SigmaGovernanceController } from './sigma-governance.controller';

/**
 * SigmaGovernanceModule — the L8 Sigma Governance AI (Phase 5): the final
 * consolidator + corrective-action engine + the command-center surface.
 * Exports ConsolidationService so the L7 Executive agent can read the
 * consolidated view without re-implementing it.
 */
@Module({
  imports: [AgentsModule, CanonicalModule, OutboxModule, HierarchyModule],
  controllers: [SigmaGovernanceController],
  providers: [ConsolidationService, SigmaGovernanceAgentService],
  exports: [ConsolidationService, SigmaGovernanceAgentService],
})
export class SigmaGovernanceModule {}

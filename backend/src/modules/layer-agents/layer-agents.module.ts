import { Module } from '@nestjs/common';

import { AgentsModule } from '../agents/agents.module';
import { CanonicalModule } from '../canonical/canonical.module';
import { GovernanceModule } from '../governance/governance.module';
import { HierarchyModule } from '../hierarchy/hierarchy.module';
import { OutboxModule } from '../outbox/outbox.module';
import { RulesModule } from '../rules/rules.module';
import { ComplianceAgentService } from './compliance-agent.service';
import { ValidationAgentService } from './validation-agent.service';

/**
 * LayerAgentsModule — wraps the existing deterministic engines as conformant
 * L2/L3 agents (Phase 2). Each agent self-registers with the `AgentRegistry`
 * on init, so they appear in `/agents` and run via the orchestrator with no
 * change to the rule/governance cores they delegate to.
 *
 * Imports: AgentsModule (registry), Rules + Governance (the wrapped engines),
 * Hierarchy (status recompute), Canonical + Outbox (repos + bus).
 */
@Module({
  imports: [
    AgentsModule,
    CanonicalModule,
    OutboxModule,
    RulesModule,
    GovernanceModule,
    HierarchyModule,
  ],
  providers: [ValidationAgentService, ComplianceAgentService],
  exports: [ValidationAgentService, ComplianceAgentService],
})
export class LayerAgentsModule {}

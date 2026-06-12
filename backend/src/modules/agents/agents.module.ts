import { Module } from '@nestjs/common';

import { CanonicalModule } from '../canonical/canonical.module';
import { OutboxModule } from '../outbox/outbox.module';
import { SettingsModule } from '../settings/settings.module';
import { AgentConfigService } from './agent-config.service';
import { AgentHealthService } from './agent-health.service';
import { AgentOrchestrator } from './agent-orchestrator.service';
import { AgentRegistry } from './agent.registry';
import { AgentsController } from './agents.controller';

/**
 * AgentsModule — the standardized Agent Contract spine (2026-06-11 governance
 * OS). Owns the registry + orchestrator + the `/agents` surface. Imports
 * `CanonicalModule` (for the `AgentExecution` + `ConfidenceScore` repos, both
 * in CANONICAL_ENTITIES) and `OutboxModule` (for `OutboxService`).
 *
 * Exports the registry + orchestrator so every layer module (L0–L8) can
 * register its agent and trigger pipeline runs without re-wiring the core.
 */
@Module({
  imports: [CanonicalModule, OutboxModule, SettingsModule],
  controllers: [AgentsController],
  providers: [AgentRegistry, AgentOrchestrator, AgentConfigService, AgentHealthService],
  exports: [AgentRegistry, AgentOrchestrator, AgentConfigService, AgentHealthService],
})
export class AgentsModule {}

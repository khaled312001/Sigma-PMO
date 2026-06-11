import { Injectable, Logger } from '@nestjs/common';

import { AgentLayer } from '../../common/enums';
import { AgentExecution } from '../canonical/entities';
import { AgentRunContext } from './agent-contract.interface';
import { AgentRegistry } from './agent.registry';

/**
 * The canonical L1→L8 agent pipeline order. The orchestrator runs registered
 * agents in this order; layers with no registered agent yet are simply skipped
 * (the platform fills them in across Phases 2–8 without changing this order).
 */
export const PIPELINE_ORDER: AgentLayer[] = [
  AgentLayer.L1_DATA_COLLECTION,
  AgentLayer.L2_VALIDATION,
  AgentLayer.L3_COMPLIANCE,
  AgentLayer.L4_ANALYTICS,
  AgentLayer.L5_RISK,
  AgentLayer.L6_CLAIMS,
  AgentLayer.L7_EXECUTIVE,
  AgentLayer.L8_SIGMA_GOVERNANCE,
];

/**
 * AgentOrchestrator — runs a single agent, or the full L1→L8 governance
 * pipeline for one node, threading a shared correlationId so the whole run is
 * traceable as one workflow. Deliberately tolerant: a layer with no agent
 * registered yet is skipped, and a failing agent is recorded but does not abort
 * the remaining layers (L8 consolidation later recomputes from whatever ran).
 */
@Injectable()
export class AgentOrchestrator {
  private readonly logger = new Logger(AgentOrchestrator.name);

  constructor(private readonly registry: AgentRegistry) {}

  /** Run one agent by key. */
  runAgent(agentKey: string, ctx: AgentRunContext): Promise<AgentExecution> {
    return this.registry.get(agentKey).run(ctx);
  }

  /**
   * Run the full pipeline for a node. Returns every execution (including
   * failures, which are recorded on their own AgentExecution rows).
   */
  async runPipeline(ctx: AgentRunContext): Promise<AgentExecution[]> {
    const correlationId = ctx.correlationId ?? `pipe:${ctx.nodeBusinessKey ?? ctx.projectKey ?? 'node'}:${Date.now()}`;
    const runs: AgentExecution[] = [];
    for (const layer of PIPELINE_ORDER) {
      const agents = this.registry.byLayer(layer);
      for (const agent of agents) {
        try {
          const exec = await agent.run({ ...ctx, correlationId });
          runs.push(exec);
        } catch (err) {
          // The agent already recorded a `failed` AgentExecution row; the
          // pipeline keeps going so one bad layer can't blind the rest.
          this.logger.warn(
            `Pipeline agent ${agent.descriptor().agentKey} failed (continuing): ${(err as Error).message}`,
          );
        }
      }
    }
    this.logger.log(
      `Pipeline ${correlationId}: ${runs.length} agent run(s) across ${PIPELINE_ORDER.length} layers`,
    );
    return runs;
  }
}

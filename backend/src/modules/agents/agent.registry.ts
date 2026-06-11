import { Injectable, Logger, NotFoundException } from '@nestjs/common';

import { AgentLayer } from '../../common/enums';
import { Agent, AgentDescriptor } from './agent-contract.interface';

/**
 * AgentRegistry — the single place that knows every agent in the platform.
 *
 * Mirrors the `ParserRegistry` idea (one registry resolving the right handler)
 * but uses self-registration so a new agent plugs in by calling `register(this)`
 * in its `onModuleInit` — no edit to the core, satisfying Mr. Ayham's
 * "future agents introduced without structural change" requirement. The L0–L8
 * agents register in Phases 2–8; this Phase-1 registry starts empty and is the
 * stable contract they attach to.
 */
@Injectable()
export class AgentRegistry {
  private readonly logger = new Logger(AgentRegistry.name);
  private readonly agents = new Map<string, Agent>();

  register(agent: Agent): void {
    const key = agent.descriptor().agentKey;
    if (this.agents.has(key)) {
      this.logger.warn(`Agent "${key}" re-registered — overwriting prior instance`);
    }
    this.agents.set(key, agent);
    this.logger.log(`Registered agent "${key}" (layer ${agent.descriptor().layer})`);
  }

  has(agentKey: string): boolean {
    return this.agents.has(agentKey);
  }

  get(agentKey: string): Agent {
    const agent = this.agents.get(agentKey);
    if (!agent) {
      throw new NotFoundException(
        `No agent registered with key "${agentKey}". Registered: ${[...this.agents.keys()].join(', ') || '(none)'}`,
      );
    }
    return agent;
  }

  byLayer(layer: AgentLayer | string): Agent[] {
    return [...this.agents.values()].filter((a) => a.descriptor().layer === layer);
  }

  list(): AgentDescriptor[] {
    return [...this.agents.values()].map((a) => a.descriptor());
  }
}

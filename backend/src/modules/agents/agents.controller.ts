import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { RequiresCapability } from '../auth/require-capability.decorator';
import { AgentExecution } from '../canonical/entities';
import {
  AgentConfig,
  AgentConfigService,
  ALLOWED_MODEL_TIERS,
} from './agent-config.service';
import type { AgentDescriptor, AgentRunContext } from './agent-contract.interface';
import { AgentOrchestrator } from './agent-orchestrator.service';
import { AgentRegistry } from './agent.registry';

/** A registry descriptor enriched with its runtime config (enabled / tier). */
interface EnrichedAgentDescriptor extends AgentDescriptor {
  config: AgentConfig;
}

interface SaveAgentConfigBody extends Partial<AgentConfig> {
  updatedBy?: string | null;
}

/**
 * `/agents` — the standardized agent surface (2026-06-11 governance OS).
 *
 * Reads (registry + executions) are open to any authenticated role. Running an
 * agent or the pipeline is a governance action gated on `canEvaluateRules`
 * (reviewer level and up) — the same tier that drives rule evaluation today.
 */
@Controller('agents')
export class AgentsController {
  constructor(
    private readonly registry: AgentRegistry,
    private readonly orchestrator: AgentOrchestrator,
    private readonly agentConfig: AgentConfigService,
    @InjectRepository(AgentExecution)
    private readonly executions: Repository<AgentExecution>,
  ) {}

  /** The agent registry — every layer's contract descriptor, enriched with config. */
  @Get()
  @RequiresCapability('canRead')
  async list(): Promise<EnrichedAgentDescriptor[]> {
    return this.enrich(this.registry.list());
  }

  /**
   * Per-agent configuration surface (enabled / model tier) for every registered
   * agent. Reads are `canRead`; the descriptor is enriched so a config screen
   * has the layer + objective alongside the toggle without a second call.
   */
  @Get('config')
  @RequiresCapability('canRead')
  async configList(): Promise<{
    agents: EnrichedAgentDescriptor[];
    allowedModelTiers: readonly string[];
  }> {
    return {
      agents: await this.enrich(this.registry.list()),
      allowedModelTiers: ALLOWED_MODEL_TIERS,
    };
  }

  /**
   * Upsert one agent's config (enabled toggle + model tier). Gated on
   * `canManageRoles` — the governance-admin tier that owns role + agent wiring.
   */
  @Post(':agentKey/config')
  @HttpCode(200)
  @RequiresCapability('canManageRoles')
  async saveConfig(
    @Param('agentKey') agentKey: string,
    @Body() body: SaveAgentConfigBody,
  ): Promise<EnrichedAgentDescriptor> {
    if (!this.registry.has(agentKey)) {
      throw new BadRequestException(
        `Unknown agent "${agentKey}". Registered: ${this.registry.list().map((d) => d.agentKey).join(', ') || '(none yet)'}`,
      );
    }
    const patch: Partial<AgentConfig> = {};
    if (typeof body?.enabled === 'boolean') patch.enabled = body.enabled;
    if (typeof body?.modelTier === 'string') patch.modelTier = body.modelTier;
    const updatedBy = typeof body?.updatedBy === 'string' ? body.updatedBy : null;
    const config = await this.agentConfig.setFor(agentKey, patch, updatedBy);
    const descriptor = this.registry.get(agentKey).descriptor();
    return { ...descriptor, config };
  }

  /** Recent agent-execution audit rows (filterable by node / agent). */
  @Get('executions')
  @RequiresCapability('canRead')
  executionsList(
    @Query('nodeBusinessKey') nodeBusinessKey?: string,
    @Query('agentKey') agentKey?: string,
    @Query('limit') limit?: string,
  ): Promise<AgentExecution[]> {
    const take = Math.min(Math.max(Number.parseInt(limit ?? '50', 10) || 50, 1), 200);
    const where: Record<string, unknown> = {};
    if (nodeBusinessKey) where.nodeBusinessKey = nodeBusinessKey;
    if (agentKey) where.agentKey = agentKey;
    return this.executions.find({
      where,
      order: { createdAt: 'DESC' },
      take,
    });
  }

  /** Descriptors for one agent layer (e.g. `l4_analytics`). */
  @Get('layer/:layer')
  @RequiresCapability('canRead')
  byLayer(@Param('layer') layer: string) {
    return this.registry.byLayer(layer).map((a) => a.descriptor());
  }

  /**
   * Run the full L1→L8 pipeline for a node. Declared BEFORE `:agentKey/run`
   * so the literal `pipeline` segment is not captured as an agent key.
   */
  @Post('pipeline/run')
  @HttpCode(200)
  @RequiresCapability('canEvaluateRules')
  runPipeline(@Body() body: AgentRunContext): Promise<AgentExecution[]> {
    if (!body?.nodeBusinessKey && !body?.projectKey) {
      throw new BadRequestException('nodeBusinessKey or projectKey is required');
    }
    return this.orchestrator.runPipeline(body);
  }

  /** Run one agent against a node. */
  @Post(':agentKey/run')
  @HttpCode(200)
  @RequiresCapability('canEvaluateRules')
  run(
    @Param('agentKey') agentKey: string,
    @Body() body: AgentRunContext,
  ): Promise<AgentExecution> {
    if (!this.registry.has(agentKey)) {
      throw new BadRequestException(
        `Unknown agent "${agentKey}". Registered: ${this.registry.list().map((d) => d.agentKey).join(', ') || '(none yet)'}`,
      );
    }
    return this.orchestrator.runAgent(agentKey, body ?? {});
  }

  /** Attach each descriptor's effective config (defaults applied when unset). */
  private async enrich(descriptors: AgentDescriptor[]): Promise<EnrichedAgentDescriptor[]> {
    const map = await this.agentConfig.getAll();
    return descriptors.map((d) => ({
      ...d,
      config: map[d.agentKey] ?? { enabled: true, modelTier: 'default' },
    }));
  }
}

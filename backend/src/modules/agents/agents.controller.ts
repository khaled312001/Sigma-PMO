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
import type { AgentRunContext } from './agent-contract.interface';
import { AgentOrchestrator } from './agent-orchestrator.service';
import { AgentRegistry } from './agent.registry';

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
    @InjectRepository(AgentExecution)
    private readonly executions: Repository<AgentExecution>,
  ) {}

  /** The agent registry — every layer's contract descriptor. */
  @Get()
  @RequiresCapability('canRead')
  list() {
    return this.registry.list();
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

  /** Run the full L1→L8 pipeline for a node. */
  @Post('pipeline/run')
  @HttpCode(200)
  @RequiresCapability('canEvaluateRules')
  runPipeline(@Body() body: AgentRunContext): Promise<AgentExecution[]> {
    if (!body?.nodeBusinessKey && !body?.projectKey) {
      throw new BadRequestException('nodeBusinessKey or projectKey is required');
    }
    return this.orchestrator.runPipeline(body);
  }
}

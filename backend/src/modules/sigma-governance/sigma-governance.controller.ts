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
import { ApiTags } from '@nestjs/swagger';
import { Repository } from 'typeorm';

import { HierarchyLevel } from '../../common/enums';
import { companyScope } from '../../common/tenant/tenant-context';
import { RequiresCapability } from '../auth/require-capability.decorator';
import { CorrectiveAction, Project } from '../canonical/entities';
import {
  CommandCenterService,
  EscalationPathRow,
  ImpactAnalysis,
  RecommendedAction,
} from './command-center.service';
import { ConsolidatedNode } from './consolidation.service';
import { RecomputeDto } from './dto/recompute.dto';
import { SigmaGovernanceAgentService } from './sigma-governance-agent.service';

/**
 * `/governance-command` — the L8 Sigma Governance command-center surface. The
 * overview consolidates every project; the node detail is one consolidated
 * view; recompute re-runs the L8 consolidation; corrective actions can be
 * advanced through their lifecycle.
 */
@ApiTags('Governance Command (L8)')
@Controller('governance-command')
export class SigmaGovernanceController {
  constructor(
    private readonly l8: SigmaGovernanceAgentService,
    private readonly commandCenter: CommandCenterService,
    @InjectRepository(Project) private readonly projects: Repository<Project>,
    @InjectRepository(CorrectiveAction) private readonly actions: Repository<CorrectiveAction>,
  ) {}

  /**
   * Open corrective actions ranked by priority+age, plus derived "convene
   * recovery review" recommendations for every degraded (orange/red) node.
   */
  @Get('recommended-actions')
  @RequiresCapability('canEvaluateRules')
  recommendedActions(): Promise<{ rows: RecommendedAction[] }> {
    return this.commandCenter.recommendedActions();
  }

  /** Open governance escalations with their L1→L2→L3 path + next step. */
  @Get('escalation-paths')
  @RequiresCapability('canEvaluateRules')
  escalationPaths(): Promise<{ rows: EscalationPathRow[] }> {
    return this.commandCenter.escalationPaths();
  }

  /** Executive value-at-risk + benefit-realization impact analysis. */
  @Get('impact-analysis')
  @RequiresCapability('canEvaluateRules')
  impactAnalysis(): Promise<ImpactAnalysis> {
    return this.commandCenter.impactAnalysis();
  }

  /** Command center: a consolidated row per current project. */
  @Get('overview')
  @RequiresCapability('canRead')
  async overview(): Promise<{ nodes: ConsolidatedNode[]; statusTally: Record<string, number> }> {
    const projects = await this.projects.find({ where: { isCurrent: true, ...companyScope() } });
    const nodes = await Promise.all(
      projects.map((p) => this.l8.consolidate(HierarchyLevel.PROJECT, p.businessKey)),
    );
    const statusTally: Record<string, number> = { green: 0, yellow: 0, orange: 0, red: 0, unknown: 0 };
    for (const n of nodes) {
      const k = n.governanceStatus ?? 'unknown';
      statusTally[k] = (statusTally[k] ?? 0) + 1;
    }
    return { nodes, statusTally };
  }

  @Get('actions')
  @RequiresCapability('canRead')
  actionsList(@Query('nodeKey') nodeKey?: string): Promise<CorrectiveAction[]> {
    if (!nodeKey) throw new BadRequestException('nodeKey query parameter is required');
    return this.l8.listCorrectiveActions(nodeKey);
  }

  @Get(':nodeType/:nodeKey')
  @RequiresCapability('canRead')
  node(
    @Param('nodeType') nodeType: string,
    @Param('nodeKey') nodeKey: string,
  ): Promise<ConsolidatedNode> {
    return this.l8.consolidate(nodeType, nodeKey);
  }

  /** Re-run the L8 consolidation for a node (recompute status + actions). */
  @Post('recompute')
  @HttpCode(200)
  @RequiresCapability('canEvaluateRules')
  recompute(@Body() body: RecomputeDto) {
    if (!body?.nodeKey) throw new BadRequestException('nodeKey is required');
    return this.l8.run({
      nodeType: body.nodeType ?? HierarchyLevel.PROJECT,
      nodeBusinessKey: body.nodeKey,
    });
  }

  /** Advance a corrective action through its lifecycle. */
  @Post('actions/:id/status')
  @HttpCode(200)
  @RequiresCapability('canEvaluateRules')
  async setActionStatus(
    @Param('id') id: string,
    @Body() body: { status: string; owner?: string | null },
  ): Promise<CorrectiveAction> {
    const allowed = ['open', 'in-progress', 'done', 'dismissed'];
    if (!allowed.includes(body?.status)) {
      throw new BadRequestException(`status must be one of: ${allowed.join(', ')}`);
    }
    const row = await this.actions.findOne({ where: { id } });
    if (!row) throw new BadRequestException(`No corrective action ${id}`);
    row.status = body.status;
    if (body.owner !== undefined) row.owner = body.owner;
    return this.actions.save(row);
  }
}

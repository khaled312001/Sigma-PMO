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

import { HierarchyLevel } from '../../common/enums';
import { RequiresCapability } from '../auth/require-capability.decorator';
import { Enterprise, Portfolio, Program, Project } from '../canonical/entities';
import { GovernanceStatusService } from './governance-status.service';
import { GovernanceTree, HierarchyService } from './hierarchy.service';

interface CreateNodeBody {
  businessKey: string;
  name: string;
  description?: string;
  enterpriseBusinessKey?: string;
  portfolioBusinessKey?: string;
  strategicAlignment?: string;
  governanceOwner?: string;
}

/**
 * `/hierarchy` — the governance hierarchy surface
 * (Enterprise → Portfolio → Program → Project) + the 4-tier status recompute.
 *
 * Reads (tree + status) are `canRead`. Creating nodes / linking projects /
 * recomputing status is a governance-management action (`canManageHierarchy`,
 * admin tier).
 */
@Controller('hierarchy')
export class HierarchyController {
  constructor(
    private readonly hierarchy: HierarchyService,
    private readonly status: GovernanceStatusService,
  ) {}

  @Get('tree')
  @RequiresCapability('canRead')
  tree(): Promise<GovernanceTree> {
    return this.hierarchy.getTree();
  }

  @Post('enterprise')
  @HttpCode(200)
  @RequiresCapability('canManageHierarchy')
  createEnterprise(@Body() body: CreateNodeBody): Promise<Enterprise> {
    return this.hierarchy.createEnterprise(body);
  }

  @Post('portfolio')
  @HttpCode(200)
  @RequiresCapability('canManageHierarchy')
  createPortfolio(@Body() body: CreateNodeBody): Promise<Portfolio> {
    return this.hierarchy.createPortfolio(body);
  }

  @Post('program')
  @HttpCode(200)
  @RequiresCapability('canManageHierarchy')
  createProgram(@Body() body: CreateNodeBody): Promise<Program> {
    return this.hierarchy.createProgram(body);
  }

  @Post('attach')
  @HttpCode(200)
  @RequiresCapability('canManageHierarchy')
  attach(@Body() body: { projectKey: string; programKey: string }): Promise<Project> {
    if (!body?.projectKey || !body?.programKey) {
      throw new BadRequestException('projectKey and programKey are required');
    }
    return this.hierarchy.attachProjectToProgram(body.projectKey, body.programKey);
  }

  @Post('phase')
  @HttpCode(200)
  @RequiresCapability('canManageHierarchy')
  setPhase(@Body() body: { projectKey: string; phase: string }): Promise<Project> {
    if (!body?.projectKey || !body?.phase) {
      throw new BadRequestException('projectKey and phase are required');
    }
    return this.hierarchy.setProjectPhase(body.projectKey, body.phase);
  }

  /** Latest persisted status for a node. */
  @Get(':nodeType/:nodeKey/status')
  @RequiresCapability('canRead')
  async nodeStatus(
    @Param('nodeType') nodeType: string,
    @Param('nodeKey') nodeKey: string,
  ) {
    const snap = await this.status.latestFor(nodeType, nodeKey);
    return snap ?? { nodeType, nodeBusinessKey: nodeKey, status: null };
  }

  /**
   * Recompute the 4-tier governance status for a node (and, for a project,
   * walk up to refresh its program/portfolio/enterprise roll-ups when linked).
   */
  @Post('recompute')
  @HttpCode(200)
  @RequiresCapability('canManageHierarchy')
  async recompute(
    @Query('nodeType') nodeType?: string,
    @Query('nodeKey') nodeKey?: string,
  ) {
    if (!nodeKey) throw new BadRequestException('nodeKey query parameter is required');
    switch (nodeType) {
      case HierarchyLevel.ENTERPRISE:
        return this.status.recomputeEnterprise(nodeKey);
      case HierarchyLevel.PORTFOLIO:
        return this.status.recomputePortfolio(nodeKey);
      case HierarchyLevel.PROGRAM:
        return this.status.recomputeProgram(nodeKey);
      case HierarchyLevel.PROJECT:
      default:
        return this.status.recomputeProject(nodeKey);
    }
  }
}

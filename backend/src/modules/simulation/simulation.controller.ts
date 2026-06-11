import { BadRequestException, Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';

import { RequiresCapability } from '../auth/require-capability.decorator';
import { Scenario } from '../canonical/entities';
import {
  PortfolioImpactResponse,
  PortfolioScenarioService,
  PortfolioWhatIfResponse,
} from './portfolio-scenario.service';
import { SimulationService } from './simulation.service';

interface ForkScenarioBody {
  projectBusinessKey: string;
  name: string;
  authorUserId?: string | null;
  authorDisplay?: string | null;
  summary?: string;
}

interface PortfolioWhatIfBody {
  delayDaysPerProject: Record<string, number>;
}

/**
 * Sandbox simulation surface (ADR-0010, post-meeting plan §3.4).
 *
 * All write endpoints require `canSimulate` — Wave 1 grants this to every
 * role except contractor. Read endpoints follow the standard `canRead` gate.
 */
@Controller('simulation')
export class SimulationController {
  constructor(
    private readonly simulation: SimulationService,
    private readonly portfolio: PortfolioScenarioService,
  ) {}

  /**
   * Portfolio scenario planning — every OPEN scenario across ALL projects with a
   * per-scenario impact summary + portfolio totals. Gated on `canSimulate`
   * (read-only roll-up over the sandbox). Impact figures are flagged as
   * placeholders when the snapshot carries no real delta.
   */
  @Get('portfolio-impact')
  @RequiresCapability('canSimulate')
  portfolioImpact(): Promise<PortfolioImpactResponse> {
    return this.portfolio.portfolioImpact();
  }

  /**
   * What-if convenience — inject a per-project delay (days) and get the shifted
   * forecast finish + a naive cost-of-delay (named-basis formula). DETERMINISTIC
   * arithmetic only; persists NOTHING (pure analysis).
   */
  @Post('portfolio-whatif')
  @HttpCode(200)
  @RequiresCapability('canSimulate')
  portfolioWhatIf(@Body() body: PortfolioWhatIfBody): Promise<PortfolioWhatIfResponse> {
    if (!body?.delayDaysPerProject || typeof body.delayDaysPerProject !== 'object') {
      throw new BadRequestException('delayDaysPerProject (Record<projectKey, number>) is required.');
    }
    return this.portfolio.portfolioWhatIf(body.delayDaysPerProject);
  }

  @Post('scenarios')
  @HttpCode(200)
  @RequiresCapability('canSimulate')
  fork(@Body() body: ForkScenarioBody): Promise<Scenario> {
    if (!body?.projectBusinessKey || !body?.name) {
      throw new BadRequestException('projectBusinessKey and name are required');
    }
    return this.simulation.fork(
      body.projectBusinessKey,
      body.name,
      body.authorUserId ?? null,
      body.authorDisplay ?? null,
      body.summary ?? '',
    );
  }

  @Get('scenarios')
  @RequiresCapability('canRead')
  list(@Query('projectKey') projectKey?: string): Promise<Scenario[]> {
    if (!projectKey) throw new BadRequestException('projectKey query parameter is required');
    return this.simulation.listScenarios(projectKey);
  }

  @Post('scenarios/:id/discard')
  @HttpCode(200)
  @RequiresCapability('canSimulate')
  async discard(@Param('id') id: string): Promise<{ status: 'discarded' }> {
    await this.simulation.discard(id);
    return { status: 'discarded' };
  }

  /**
   * Promote-to-canonical (Wave 7 — the C5 gate, live). Requires
   * `canEditPolicy` because promotion reaches canonical truth — the same
   * capability that owns the clash apply gate. Clash-impact scenarios are
   * refused with a pointer to /clashes (their promotion must issue the
   * schedule revision + claim letter atomically).
   */
  @Post('scenarios/:id/promote')
  @HttpCode(200)
  @RequiresCapability('canEditPolicy')
  promote(
    @Param('id') id: string,
    @Body() body: { promotedBy?: string },
  ): Promise<{ status: 'committed'; outboxEventId: string | null }> {
    if (!body?.promotedBy) throw new BadRequestException('promotedBy is required');
    return this.simulation.commit(id, body.promotedBy);
  }
}

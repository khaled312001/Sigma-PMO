import {
  BadGatewayException,
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  Logger,
  NotFoundException,
  Param,
  ParseIntPipe,
  Post,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Throttle } from '@nestjs/throttler';
import { Repository } from 'typeorm';

import { RequiresCapability } from '../auth/require-capability.decorator';
import { ClashItem } from '../canonical/entities';
import {
  ApplyClashResolutionOutcome,
  ScheduleRevisionService,
} from '../simulation/schedule-revision.service';
import {
  SimulationEngineService,
  SimulationProjection,
} from '../simulation/simulation-engine.service';
import {
  ClashSolutionProposer,
  ProposeClashSolutionsOutcome,
} from './clash-solution-proposer.service';

/** Body of `POST /clashes/:id/options/:idx/simulate`. */
interface SimulateOptionBody {
  /** Optional explicit activity keys the option touches. */
  affectedActivityKeys?: string[];
  requestedBy?: string | null;
}

/** Body of `POST /clashes/:id/options/:idx/apply`. */
interface ApplyOptionBody {
  approvedBy: string;
  /** Scenario from a prior /simulate call — links "what was seen" to "what was done". */
  scenarioId?: string | null;
  affectedActivityKeys?: string[];
}

/**
 * `POST /clashes/:id/propose` — invoke the BIM clash analyst persona to
 * generate the three solution options for one ingested clash row
 * (post-meeting plan §3.7).
 *
 * Routing notes:
 *  - Lives on its own controller (not folded into `ClashesController`) so
 *    the gating rule "anything that touches Claude requires `canEvaluateRules`"
 *    is enforced at the route boundary rather than buried in a method.
 *  - `canEvaluateRules` is the right cap because proposing options is
 *    advisory analysis — the same capability that lets a Sigma reviewer
 *    run the deterministic rules. `canIngest` would be too narrow (only
 *    contractor + consultant + sigma have it) and `canEditPolicy` would
 *    be the wrong scope.
 *  - Throttled at the same rate as the AI-heavy summary endpoint (12 req/min
 *    per client). Each call burns Claude tokens; we will not let one client
 *    starve the rest. The 12/min cap matches `summary` so the per-client
 *    budget for AI work stays uniform.
 *
 * Errors:
 *  - 400 if the persona returns malformed JSON. The service throws
 *    `BadRequestException` with the parse reason so the operator can paste
 *    the failed response into a ticket without re-running the call.
 *  - 502 (BadGateway) for any other upstream Claude failure (network,
 *    rate limit, model overload). We deliberately surface this rather than
 *    silently falling back so the operator knows the platform tried to
 *    reach Claude and could not.
 *  - 404 when the clash id is unknown — bubbles from the service.
 */
@Controller('clashes')
export class ClashSolutionProposerController {
  private readonly logger = new Logger(ClashSolutionProposerController.name);

  constructor(
    private readonly proposer: ClashSolutionProposer,
    private readonly simulation: SimulationEngineService,
    private readonly revision: ScheduleRevisionService,
    @InjectRepository(ClashItem) private readonly clashes: Repository<ClashItem>,
  ) {}

  @Post(':id/propose')
  @HttpCode(200)
  @Throttle({ ai: { limit: 12, ttl: 60_000 } })
  @RequiresCapability('canEvaluateRules')
  async propose(@Param('id') id: string): Promise<ProposeClashSolutionsOutcome> {
    if (!id) {
      throw new BadRequestException('clash id is required');
    }
    try {
      return await this.proposer.proposeSolutions(id);
    } catch (err) {
      // BadRequest + NotFound are deliberate domain signals — re-throw.
      const status = (err as { status?: number }).status;
      if (status === 400 || status === 404) {
        throw err;
      }
      // Anything else (Anthropic outage, network, malformed SDK response) →
      // 502 with the underlying message so the operator can debug.
      this.logger.error(
        `Clash propose failed for ${id}: ${(err as Error).message}`,
      );
      throw new BadGatewayException(
        `ClashSolutionProposer upstream failed: ${(err as Error).message}`,
      );
    }
  }

  /**
   * `POST /clashes/:id/options/:idx/simulate` — project the time/cost impact
   * of one proposed option WITHOUT touching canonical truth (correction-plan
   * §2.3; meeting 2026-06-08 @ 00:07:49). Deterministic — no Claude call —
   * so it rides the default throttle bucket and the broad `canSimulate` cap
   * (every role except none may run what-ifs per the meeting's role matrix).
   */
  @Post(':id/options/:idx/simulate')
  @HttpCode(200)
  @RequiresCapability('canSimulate')
  async simulateOption(
    @Param('id') id: string,
    @Param('idx', ParseIntPipe) idx: number,
    @Body() body: SimulateOptionBody,
  ): Promise<SimulationProjection> {
    const { clash, option } = await this.resolveOption(id, idx);
    return this.simulation.projectClashImpact({
      projectKey: clash.projectBusinessKey,
      clashId: clash.id,
      optionIndex: idx,
      optionLabel: option.label,
      durationImpactDays: option.timeImpactDays,
      costImpactAED: option.costImpactAED,
      affectedActivityKeys: body?.affectedActivityKeys,
      requestedBy: body?.requestedBy ?? null,
    });
  }

  /**
   * `POST /clashes/:id/options/:idx/apply` — the approval gate. Records the
   * decision, issues append-only Activity revisions, commits the Scenario,
   * pushes the Outbox event, and best-effort drafts the FIDIC claim letter
   * (correction-plan §2.4; meeting @ 00:10:24). Requires `canEditPolicy` —
   * the same capability that owns governance decisions — because this write
   * reaches canonical truth.
   */
  @Post(':id/options/:idx/apply')
  @HttpCode(200)
  @RequiresCapability('canEditPolicy')
  async applyOption(
    @Param('id') id: string,
    @Param('idx', ParseIntPipe) idx: number,
    @Body() body: ApplyOptionBody,
  ): Promise<ApplyClashResolutionOutcome> {
    if (!body?.approvedBy) throw new BadRequestException('approvedBy is required');
    await this.resolveOption(id, idx); // 404/400 early with a clear message
    return this.revision.applyClashResolution({
      clashId: id,
      optionIndex: idx,
      approvedBy: body.approvedBy,
      scenarioId: body.scenarioId ?? null,
      affectedActivityKeys: body.affectedActivityKeys,
    });
  }

  /** Shared option resolution with consistent 404/400 errors. */
  private async resolveOption(
    id: string,
    idx: number,
  ): Promise<{ clash: ClashItem; option: NonNullable<ClashItem['proposedOptions']>[number] }> {
    if (!id) throw new BadRequestException('clash id is required');
    const clash = await this.clashes.findOne({ where: { id } });
    if (!clash) throw new NotFoundException(`No clash item with id ${id}`);
    const option = (clash.proposedOptions ?? [])[idx];
    if (!option) {
      throw new BadRequestException(
        `Clash ${id} has no proposed option at index ${idx} — run POST /clashes/${id}/propose first.`,
      );
    }
    return { clash, option };
  }
}

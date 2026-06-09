import {
  BadGatewayException,
  BadRequestException,
  Controller,
  HttpCode,
  Logger,
  Param,
  Post,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';

import { RequiresCapability } from '../auth/require-capability.decorator';
import {
  ClashSolutionProposer,
  ProposeClashSolutionsOutcome,
} from './clash-solution-proposer.service';

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

  constructor(private readonly proposer: ClashSolutionProposer) {}

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
}

import { BadRequestException, Body, Controller, Get, HttpCode, Post } from '@nestjs/common';

import { RequiresCapability } from '../auth/require-capability.decorator';
import { ACCEPTANCE_TESTS, AcceptanceTest } from './acceptance.catalog';
import { AcceptanceRunnerService, AcceptanceRunReport } from './acceptance.service';

/**
 * `/acceptance` — the Sigma Validation / Acceptance Framework (Mr. Ayham,
 * 2026-06-13). Exposes the 23-test catalog and a runner that executes the whole
 * program against the LIVE platform, returning pass/fail/skipped + evidence per
 * test. Both routes are gated on `canEvaluateRules` — the same governance tier
 * that drives rule evaluation and agent/pipeline runs.
 */
@Controller('acceptance')
export class AcceptanceController {
  constructor(private readonly runner: AcceptanceRunnerService) {}

  /** The 23-test acceptance catalog (declarative source of truth). */
  @Get('catalog')
  @RequiresCapability('canEvaluateRules')
  catalog(): AcceptanceTest[] {
    return ACCEPTANCE_TESTS;
  }

  /** Run the full 23-test acceptance program against the live platform. */
  @Post('run')
  @HttpCode(200)
  @RequiresCapability('canEvaluateRules')
  async run(@Body() body: { projectKey?: string }): Promise<AcceptanceRunReport> {
    if (!body?.projectKey) throw new BadRequestException('projectKey is required');
    const report = await this.runner.runAll(body.projectKey);
    // The controller stamps `ranAt` so the service stays free of the wall clock.
    return { ...report, ranAt: new Date().toISOString() };
  }
}

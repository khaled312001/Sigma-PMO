import { BadRequestException, Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';

import { RequiresCapability } from '../auth/require-capability.decorator';
import { ClaudeService } from './claude.service';
import { CouncilVerdict, LlmCouncilService } from './llm-council.service';

interface CouncilBody {
  question: string;
  context?: string;
  bibliography?: string;
  language?: 'en' | 'ar';
  members?: number;
  chairModelTier?: string;
}

/**
 * Lightweight Claude-status surface used by `/admin/settings`.
 *
 *  - GET  /admin/claude/status   → { enabled, keySource, defaultModel, defaultTier }
 *  - POST /admin/claude/refresh  → manually re-read the SystemSetting key
 *                                  (normally not needed; SettingsService
 *                                  triggers refresh via onChange)
 *
 * Read access is gated to `canEditPolicy` — same as the Settings UI itself.
 * The endpoint NEVER returns the raw key, only metadata.
 */
@Controller('admin/claude')
export class ClaudeController {
  constructor(
    private readonly claude: ClaudeService,
    private readonly council: LlmCouncilService,
  ) {}

  @Get('status')
  @RequiresCapability('canEditPolicy')
  status(): { enabled: boolean; keySource: 'db' | 'env' | 'none'; defaultModel: string; defaultTier: string } {
    const summary = this.claude.getConfigSummary();
    return {
      enabled: this.claude.isEnabled(),
      keySource: summary.keySource,
      defaultModel: summary.defaultModel,
      defaultTier: summary.defaultTier,
    };
  }

  @Post('refresh')
  @HttpCode(200)
  @RequiresCapability('canEditPolicy')
  async refresh(): Promise<{ refreshed: true; hasDbKey: boolean; enabled: boolean }> {
    const r = await this.claude.refreshFromSettings();
    return { refreshed: true, hasDbKey: r.hasDbKey, enabled: this.claude.isEnabled() };
  }

  /** Council status for the UI: enabled + whether it's the configured default. */
  @Get('council/status')
  @RequiresCapability('canEvaluateRules')
  councilStatus(): { enabled: boolean; defaultMode: boolean } {
    return { enabled: this.council.isEnabled(), defaultMode: this.council.isDefaultMode() };
  }

  /**
   * Adjudicate a question through the LLM Council (Mr. Ayham's "LLM Council").
   * Governance reviewers can run a multi-member deliberation over any claim +
   * deterministic context, and read each member's stance + the chair's consensus.
   */
  @Post('council')
  @HttpCode(200)
  @Throttle({ ai: { limit: 12, ttl: 60_000 } })
  @RequiresCapability('canEvaluateRules')
  council_adjudicate(@Body() body: CouncilBody): Promise<CouncilVerdict> {
    if (!body?.question?.trim()) throw new BadRequestException('question is required');
    return this.council.adjudicate({
      question: body.question,
      context: body.context ?? '',
      bibliography: body.bibliography,
      language: body.language === 'ar' ? 'ar' : 'en',
      members: body.members,
      chairModelTier: body.chairModelTier,
    });
  }
}

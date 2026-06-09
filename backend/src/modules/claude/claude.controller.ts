import { Controller, Get, HttpCode, Post } from '@nestjs/common';

import { RequiresCapability } from '../auth/require-capability.decorator';
import { ClaudeService } from './claude.service';

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
  constructor(private readonly claude: ClaudeService) {}

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
}

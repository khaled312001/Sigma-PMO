import { Module } from '@nestjs/common';

import { ClaudeModule } from '../claude/claude.module';
import { AiAnalysisService } from './ai-analysis.service';

/**
 * AiAnalysisModule — the shared, cross-module AI narration layer (Mr. Ayham,
 * 2026-06-12). Any feature module imports this to add Claude-powered analysis
 * grounded in the real domain reference library, with a graceful deterministic
 * fallback when no API key is configured. Exports the service only (no
 * controller — each module exposes its own context-bound analysis endpoint).
 */
@Module({
  imports: [ClaudeModule],
  providers: [AiAnalysisService],
  exports: [AiAnalysisService],
})
export class AiAnalysisModule {}

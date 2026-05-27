import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { LlmConfig } from '../../config/configuration';

export interface LlmRewriteResult {
  text: string;
  provider: string;
  model: string;
}

/**
 * Optional LLM augmentation for the Executive Summary. Disabled unless
 * `LLM_API_KEY` is set. When enabled, only deterministic grounded facts are
 * sent — the LLM rewrites them into executive prose and never receives source
 * data the system did not extract (governance: LLM is summary-only, never
 * decision logic).
 */
@Injectable()
export class LlmService {
  private readonly logger = new Logger(LlmService.name);
  private readonly cfg: LlmConfig;

  constructor(config: ConfigService) {
    this.cfg = config.getOrThrow<LlmConfig>('llm');
  }

  isEnabled(): boolean {
    return this.cfg.apiKey.trim().length > 0;
  }

  describe(): { provider: string; model: string } | null {
    return this.isEnabled() ? { provider: this.cfg.provider, model: this.cfg.model } : null;
  }

  /**
   * Rewrite a deterministic, grounded summary into executive prose. Returns
   * null on any failure (caller falls back to the deterministic version).
   */
  async rewrite(grounded: string, projectName: string): Promise<LlmRewriteResult | null> {
    if (!this.isEnabled()) return null;
    try {
      if (this.cfg.provider === 'anthropic') return await this.callAnthropic(grounded, projectName);
      if (this.cfg.provider === 'openai') return await this.callOpenAi(grounded, projectName);
      return null;
    } catch (error) {
      this.logger.warn(`LLM rewrite failed (${(error as Error).message}); falling back to deterministic.`);
      return null;
    }
  }

  private async callAnthropic(grounded: string, projectName: string): Promise<LlmRewriteResult | null> {
    const body = {
      model: this.cfg.model,
      max_tokens: this.cfg.maxTokens,
      system:
        'You are an executive PMO assistant. Rewrite the supplied grounded facts ' +
        'into a clean, concise executive summary (3–6 short paragraphs). ' +
        'Do not invent numbers, dates, names, or claims that are not in the facts. ' +
        'Do not add recommendations beyond what the facts already imply.',
      messages: [
        {
          role: 'user',
          content:
            `Project: ${projectName}\n\nGrounded facts (only source of truth):\n${grounded}`,
        },
      ],
    };
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': this.cfg.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`Anthropic HTTP ${res.status}`);
    const json = (await res.json()) as { content?: { type: string; text: string }[] };
    const text = (json.content ?? []).filter((c) => c.type === 'text').map((c) => c.text).join('\n').trim();
    if (!text) return null;
    return { text, provider: 'anthropic', model: this.cfg.model };
  }

  private async callOpenAi(grounded: string, projectName: string): Promise<LlmRewriteResult | null> {
    const body = {
      model: this.cfg.model,
      max_tokens: this.cfg.maxTokens,
      messages: [
        {
          role: 'system',
          content:
            'You are an executive PMO assistant. Rewrite the supplied grounded facts into a clean, ' +
            'concise executive summary (3–6 short paragraphs). Do not invent numbers, dates, or claims.',
        },
        { role: 'user', content: `Project: ${projectName}\n\nGrounded facts:\n${grounded}` },
      ],
    };
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${this.cfg.apiKey}`,
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`OpenAI HTTP ${res.status}`);
    const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const text = json.choices?.[0]?.message?.content?.trim();
    if (!text) return null;
    return { text, provider: 'openai', model: this.cfg.model };
  }
}

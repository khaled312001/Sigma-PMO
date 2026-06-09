import Anthropic from '@anthropic-ai/sdk';
import { Injectable, Logger, OnModuleInit, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { AnthropicConfig, AppConfiguration } from '../../config/configuration';
import type { Persona } from '../canonical/entities';
import { PersonasService } from '../personas/personas.service';
import { SETTING_KEYS, SettingsService } from '../settings/settings.service';

/**
 * Minimal structural type of the SDK surface we actually call. Defining it
 * here (rather than importing `Anthropic` directly into the constructor sig)
 * lets unit tests inject a fake client without dragging the real SDK into
 * the Jest module graph.
 *
 * Only `messages.create` is used today; if Wave 2 grows to need `messages.stream`
 * or `messages.batches`, extend this contract — do NOT widen to `any`.
 */
export interface AnthropicClientLike {
  messages: {
    create: (params: Record<string, unknown>) => Promise<AnthropicMessageResponse>;
    stream?: (params: Record<string, unknown>) => AsyncIterable<AnthropicStreamEvent>;
  };
}

/** Shape of the SDK's `messages.create` non-streaming response, narrowed. */
export interface AnthropicMessageResponse {
  id: string;
  model: string;
  role: 'assistant';
  stop_reason: string | null;
  content: Array<{ type: string; text?: string }>;
  usage: {
    input_tokens: number;
    output_tokens: number;
    cache_creation_input_tokens?: number | null;
    cache_read_input_tokens?: number | null;
  };
}

/** Shape of a single streaming event we forward to callers. */
export interface AnthropicStreamEvent {
  type: string;
  delta?: { type?: string; text?: string };
  usage?: AnthropicMessageResponse['usage'];
  message?: AnthropicMessageResponse;
}

/**
 * Result returned by `callPersona`. `cached` is true when the request hit
 * a prior ephemeral cache breakpoint (we infer this from `cache_read_input_tokens`).
 */
export interface PersonaCallResult {
  /** Concatenated assistant text from all returned `text` blocks. */
  content: string;
  /** Source ids extracted from `[SOURCE: id]` markers in the response text. */
  citations: string[];
  tokensIn: number;
  tokensOut: number;
  /** True iff the SDK reported `cache_read_input_tokens > 0`. */
  cached: boolean;
  /** The persona row used for the call (slug + version are the audit anchor). */
  personaSlug: string;
  personaVersion: number;
  /** Model id actually sent to the API (post tier resolution). */
  model: string;
  /** Stop reason from the SDK (`end_turn` | `max_tokens` | `tool_use` | `stop_sequence`). */
  stopReason: string | null;
}

/** Optional per-call context the caller can layer on top of the persona prompt. */
export interface PersonaCallContext {
  /**
   * Free-form context the persona needs (BoQ excerpt, contractor letter,
   * snapshot summary). Sent in the user message AFTER the persona system
   * block so the system block stays cacheable.
   */
  context?: string;
  /**
   * Override the persona's `modelTier`. Useful for `report.monthly.author`
   * which the post-meeting plan pins to Opus regardless of persona default.
   */
  modelTier?: string;
  /**
   * Override the resolved model id directly (skips tier-to-model mapping).
   * Last-resort knob — prefer `modelTier`.
   */
  modelId?: string;
  /** Override `max_tokens` for this call only. */
  maxTokens?: number;
  /** Override temperature for this call only (defaults to persona.temperature). */
  temperature?: number;
  /**
   * Tag this call as a simulation run. The persona's rules already require it
   * to prefix every paragraph with "محاكاة" when this is set; we forward it
   * as a `metadata.user_id` discriminator so cache breakpoints do not collide
   * between real and simulated runs.
   */
  simulation?: boolean;
}

/**
 * Map a persona's `modelTier` slug to a concrete model id. The slug is what
 * the seed Markdown files write (e.g. `claude-sonnet`); the id is what the
 * API expects (e.g. `claude-sonnet-4-5`). Unknown slugs fall back to the
 * configured default model so a persona authored before a new tier exists
 * still boots.
 */
const TIER_TO_MODEL: Record<string, string> = {
  'claude-haiku': 'claude-haiku-4-5',
  'claude-sonnet': 'claude-sonnet-4-5',
  'claude-opus': 'claude-opus-4-5',
};

/** Regex used to harvest `[SOURCE: id]` markers from a persona response. */
const SOURCE_CITATION_RE = /\[SOURCE:\s*([A-Za-z0-9._:-]+)\s*\]/g;

/**
 * Thin wrapper around `@anthropic-ai/sdk` that knows how to:
 *   1. Resolve the active persona row (by slug) via PersonasService.
 *   2. Build a `messages.create` request whose `system` block carries
 *      `cache_control: { type: 'ephemeral' }` so repeated calls in the same
 *      hour skip re-reading the full persona body.
 *   3. Extract `[SOURCE: id]` citations from the response so the caller can
 *      flag claims-without-sources before showing them to a user.
 *
 * Safety contract (ADR-0011 §3, post-meeting plan §3.2):
 *  - The API key is read from `process.env.ANTHROPIC_API_KEY` only — never
 *    accept it as a method argument, never log it.
 *  - When the key is unset, `isEnabled()` returns false and every call
 *    throws a helpful error instead of silently returning fake content.
 *    Wave 2 callers MUST gate UI behaviour on `isEnabled()` so dev machines
 *    without a key still boot.
 *
 * Tests inject a fake client via the optional 3rd constructor arg. Production
 * code constructs the real SDK lazily on first request (so importing this
 * module does not require ANTHROPIC_API_KEY to be set at boot — important
 * for migrations and other scripts that load the Nest module graph).
 */
@Injectable()
export class ClaudeService implements OnModuleInit {
  private readonly logger = new Logger(ClaudeService.name);

  private readonly config: AnthropicConfig;

  /** Lazily-constructed real SDK client. Test-overridden via constructor. */
  private clientCache: AnthropicClientLike | null = null;

  /**
   * API key loaded from the SystemSetting table at boot (and on subsequent
   * SettingsService change events). When present, overrides the env-only
   * apiKey from `AnthropicConfig`. This is how the `/admin/settings` UI
   * actually flips Claude on without requiring a backend restart.
   */
  private dbApiKey: string | null = null;

  constructor(
    private readonly configService: ConfigService<AppConfiguration, true>,
    private readonly personas: PersonasService,
    /**
     * Optional pre-built client for tests. When set, isEnabled() returns true
     * unconditionally and the lazy constructor is skipped.
     */
    @Optional() injectedClient?: AnthropicClientLike,
    @Optional() private readonly settings?: SettingsService,
  ) {
    this.config = this.configService.get('anthropic', { infer: true });
    if (injectedClient) {
      this.clientCache = injectedClient;
    }
  }

  /**
   * Lifecycle: load the DB-stored API key (if any) at boot and subscribe
   * to subsequent changes. SettingsService is optional so unit tests that
   * stand up ClaudeService in isolation still work without the DB wiring.
   */
  async onModuleInit(): Promise<void> {
    if (!this.settings) return;
    await this.refreshFromSettings();
    this.settings.onChange(async (settingKey) => {
      if (settingKey === SETTING_KEYS.ANTHROPIC_API_KEY) {
        await this.refreshFromSettings();
      }
    });
  }

  /**
   * Re-read the Anthropic API key from SystemSetting and invalidate the
   * cached SDK client so the next call rebuilds with the new key. Safe to
   * call repeatedly; idempotent when the key is unchanged.
   */
  async refreshFromSettings(): Promise<{ hasDbKey: boolean }> {
    if (!this.settings) return { hasDbKey: false };
    const before = this.dbApiKey;
    const next = await this.settings.getPlaintext(SETTING_KEYS.ANTHROPIC_API_KEY);
    this.dbApiKey = next;
    if (before !== next) {
      // Force the next call to rebuild the SDK client with the new key.
      this.clientCache = null;
      this.logger.log(
        `Anthropic API key refreshed from SystemSetting (configured=${!!next}, source=${next ? 'db' : 'env-only'}).`,
      );
    }
    return { hasDbKey: !!next };
  }

  /**
   * True when the service is wired and can serve Claude calls. Order of
   * precedence: injected test client > DB-stored key > env-provided key.
   */
  isEnabled(): boolean {
    return !!this.clientCache || !!this.dbApiKey || this.config.enabled;
  }

  /** Expose the resolved config (sans key) for diagnostics and tests. */
  getConfigSummary(): Omit<AnthropicConfig, 'apiKey'> & { hasApiKey: boolean; keySource: 'db' | 'env' | 'none' } {
    const { apiKey, ...rest } = this.config;
    const keySource: 'db' | 'env' | 'none' = this.dbApiKey ? 'db' : apiKey ? 'env' : 'none';
    return { ...rest, hasApiKey: !!(apiKey || this.dbApiKey), keySource };
  }

  /**
   * Call the active version of `personaSlug` with `userMessage`. The persona's
   * system prompt is sent as a cacheable system block; the user message
   * (optionally prefixed with `context.context`) sits after the breakpoint
   * so per-request data does not bust the cache.
   *
   * Throws if (a) the service is disabled or (b) the persona slug is unknown.
   */
  async callPersona(
    personaSlug: string,
    userMessage: string,
    context: PersonaCallContext = {},
  ): Promise<PersonaCallResult> {
    this.assertEnabled();
    const persona = await this.personas.findBySlug(personaSlug);
    const client = this.getClient();
    const model = this.resolveModel(persona, context);
    const maxTokens = context.maxTokens ?? this.config.maxTokens;
    const temperature = context.temperature ?? persona.temperature;

    const request = this.buildRequest(persona, userMessage, context, model, maxTokens, temperature);
    this.logger.debug(
      `claude.callPersona slug=${personaSlug} v=${persona.version} model=${model} sim=${!!context.simulation}`,
    );

    const response = await client.messages.create(request);
    return this.shapeResponse(persona, response, model);
  }

  /**
   * Streaming variant of `callPersona`. Yields raw SDK events; the caller is
   * responsible for accumulating text deltas. We do NOT extract citations
   * here because they often span block boundaries — call `extractCitations`
   * on the final assembled string after the stream completes.
   *
   * Wave 2 callers use this for the `/letters` drafting UI so the human
   * reviewer sees the draft form letter-by-letter (mirrors the post-meeting
   * plan's "human approval gate every AI output" rule).
   */
  async *streamPersona(
    personaSlug: string,
    userMessage: string,
    context: PersonaCallContext = {},
  ): AsyncGenerator<AnthropicStreamEvent, void, void> {
    this.assertEnabled();
    const persona = await this.personas.findBySlug(personaSlug);
    const client = this.getClient();
    if (!client.messages.stream) {
      throw new Error(
        'ClaudeService: injected client does not implement messages.stream; ' +
          'use callPersona instead or inject a streaming-capable fake.',
      );
    }
    const model = this.resolveModel(persona, context);
    const maxTokens = context.maxTokens ?? this.config.maxTokens;
    const temperature = context.temperature ?? persona.temperature;
    const request = this.buildRequest(persona, userMessage, context, model, maxTokens, temperature);
    const stream = client.messages.stream(request);
    for await (const event of stream) {
      yield event;
    }
  }

  /**
   * Public helper used by callers that assemble streamed text and need to
   * harvest citations from the final string. Exposed (not private) so e.g.
   * the FIDIC LetterDrafter can run the same regex after combining a
   * streamed draft with its template scaffold.
   */
  extractCitations(text: string): string[] {
    if (!text) return [];
    const seen = new Set<string>();
    for (const match of text.matchAll(SOURCE_CITATION_RE)) {
      const id = match[1];
      if (id) seen.add(id);
    }
    return [...seen];
  }

  // ───────────────────────── internals ─────────────────────────

  private assertEnabled(): void {
    if (!this.isEnabled()) {
      throw new Error(
        'ClaudeService is disabled: no Anthropic API key configured. ' +
          'Set ANTHROPIC_API_KEY in the environment, or save a key from /admin/settings, ' +
          'or inject a test client.',
      );
    }
  }

  /** Build the `messages.create` request body, including the cacheable system block. */
  private buildRequest(
    persona: Persona,
    userMessage: string,
    context: PersonaCallContext,
    model: string,
    maxTokens: number,
    temperature: number,
  ): Record<string, unknown> {
    const userContent = context.context
      ? `${context.context}\n\n---\n\n${userMessage}`
      : userMessage;

    // The system field accepts an array of typed blocks; cache_control on the
    // last block creates the ephemeral breakpoint. The TTL is wall-clock from
    // the first write; subsequent reads (within ttl) cost 0.1x of the base rate.
    const system = [
      {
        type: 'text',
        text: persona.systemPrompt,
        cache_control: { type: 'ephemeral' },
      },
    ];

    const request: Record<string, unknown> = {
      model,
      max_tokens: maxTokens,
      temperature,
      system,
      messages: [
        {
          role: 'user',
          content: userContent,
        },
      ],
      // Tag the call so Anthropic dashboards group runs by persona version.
      // Metadata.user_id MUST be opaque (no PII); slug+version is safe.
      metadata: {
        user_id: `persona:${persona.businessKey}:v${persona.version}${
          context.simulation ? ':sim' : ''
        }`,
      },
    };

    return request;
  }

  private shapeResponse(
    persona: Persona,
    response: AnthropicMessageResponse,
    model: string,
  ): PersonaCallResult {
    const content = (response.content ?? [])
      .filter((b) => b.type === 'text' && typeof b.text === 'string')
      .map((b) => b.text ?? '')
      .join('');
    const citations = this.extractCitations(content);
    const cacheRead = response.usage?.cache_read_input_tokens ?? 0;
    return {
      content,
      citations,
      tokensIn: response.usage?.input_tokens ?? 0,
      tokensOut: response.usage?.output_tokens ?? 0,
      cached: cacheRead > 0,
      personaSlug: persona.businessKey,
      personaVersion: persona.version,
      model,
      stopReason: response.stop_reason ?? null,
    };
  }

  /** Resolve the persona's modelTier (or context override) to a concrete model id. */
  private resolveModel(persona: Persona, context: PersonaCallContext): string {
    if (context.modelId) return context.modelId;
    const tier = context.modelTier ?? persona.modelTier ?? this.config.defaultTier;
    return TIER_TO_MODEL[tier] ?? this.config.defaultModel;
  }

  /** Lazily construct the real SDK client on first production call. */
  private getClient(): AnthropicClientLike {
    if (this.clientCache) return this.clientCache;
    // Construct on demand so importing this module never requires the key.
    // Precedence: DB-stored key (set via /admin/settings) wins over the
    // env-provided one — admins can rotate the key from the UI without
    // touching the .env file.
    const resolved = this.dbApiKey ?? this.config.apiKey;
    this.clientCache = new Anthropic({ apiKey: resolved }) as unknown as AnthropicClientLike;
    return this.clientCache;
  }
}

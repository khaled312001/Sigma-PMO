import type { ConfigService } from '@nestjs/config';

import { Layer } from '../../common/enums';
import type { AppConfiguration } from '../../config/configuration';
import type { Persona } from '../canonical/entities';
import { PersonasService } from '../personas/personas.service';
import {
  AnthropicClientLike,
  AnthropicMessageResponse,
  ClaudeService,
} from './claude.service';

/** A minimal fake persona row matching the entity contract. */
function makePersona(overrides: Partial<Persona> = {}): Persona {
  return {
    id: 'persona-uuid',
    createdAt: new Date(),
    businessKey: 'planner-p6-25yr',
    version: 7,
    isCurrent: true,
    title: 'Planner',
    layer: Layer.PLANNING,
    description: '',
    systemPrompt: 'You are a senior planner. Cite from [SOURCE: fidic-red-2017].',
    rules: ['cite-sources'],
    modelTier: 'claude-sonnet',
    temperature: 0.2,
    ownedByRole: 'sigma_admin',
    authoredBy: 'system',
    ...overrides,
  } as Persona;
}

/** Fake ConfigService bound to a single key (`anthropic`). */
function makeConfigService(enabled = true): ConfigService<AppConfiguration, true> {
  const value = {
    apiKey: enabled ? 'fake-key' : '',
    defaultModel: 'claude-sonnet-4-5',
    defaultTier: 'claude-sonnet',
    maxTokens: 4096,
    cacheTtlSeconds: 3600,
    enabled,
  };
  const fake = {
    get: jest.fn((key: string) => (key === 'anthropic' ? value : undefined)),
  };
  return fake as unknown as ConfigService<AppConfiguration, true>;
}

/** Fake PersonasService that resolves a single persona slug. */
function makePersonasService(persona: Persona) {
  return {
    findBySlug: jest.fn(async (slug: string) => {
      if (slug === persona.businessKey) return persona;
      const err: Error & { status?: number } = new Error(`No current persona with slug ${slug}`);
      err.status = 404;
      throw err;
    }),
  } as unknown as PersonasService;
}

/** Fake Anthropic client whose `messages.create` returns a canned response. */
function makeClient(response: AnthropicMessageResponse): AnthropicClientLike & {
  capturedRequest: Record<string, unknown> | null;
} {
  const captured: { capturedRequest: Record<string, unknown> | null } = { capturedRequest: null };
  const client: AnthropicClientLike & { capturedRequest: Record<string, unknown> | null } = {
    capturedRequest: null,
    messages: {
      create: jest.fn(async (params: Record<string, unknown>) => {
        captured.capturedRequest = params;
        client.capturedRequest = params;
        return response;
      }),
    },
  };
  return client;
}

const baseResponse: AnthropicMessageResponse = {
  id: 'msg_test',
  model: 'claude-sonnet-4-5',
  role: 'assistant',
  stop_reason: 'end_turn',
  content: [
    {
      type: 'text',
      text:
        'المسار الحرج يمر بالنشاط A100. الإخطار مستحق بموجب البند 8.5 ' +
        '[SOURCE: fidic-red-2017]. التقدير يعتمد على RP 49 [SOURCE: aace-rp-49r-06].',
    },
  ],
  usage: {
    input_tokens: 1234,
    output_tokens: 456,
    cache_creation_input_tokens: 0,
    cache_read_input_tokens: 0,
  },
};

describe('ClaudeService', () => {
  describe('when ANTHROPIC_API_KEY is unset and no client is injected', () => {
    it('isEnabled() returns false', () => {
      const config = makeConfigService(false);
      const personas = makePersonasService(makePersona());
      const svc = new ClaudeService(config, personas);
      expect(svc.isEnabled()).toBe(false);
    });

    it('callPersona throws a helpful error', async () => {
      const config = makeConfigService(false);
      const personas = makePersonasService(makePersona());
      const svc = new ClaudeService(config, personas);
      await expect(svc.callPersona('planner-p6-25yr', 'hi')).rejects.toThrow(
        /ANTHROPIC_API_KEY is unset/,
      );
    });

    it('getConfigSummary never leaks the apiKey field', () => {
      const config = makeConfigService(false);
      const personas = makePersonasService(makePersona());
      const svc = new ClaudeService(config, personas);
      const summary = svc.getConfigSummary() as Record<string, unknown>;
      expect(summary.apiKey).toBeUndefined();
      expect(summary.hasApiKey).toBe(false);
    });
  });

  describe('when a fake client is injected', () => {
    it('isEnabled() returns true even with no env key', () => {
      const config = makeConfigService(false);
      const personas = makePersonasService(makePersona());
      const client = makeClient(baseResponse);
      const svc = new ClaudeService(config, personas, client);
      expect(svc.isEnabled()).toBe(true);
    });

    it('builds the request with the persona system prompt + ephemeral cache_control', async () => {
      const config = makeConfigService(true);
      const persona = makePersona();
      const personas = makePersonasService(persona);
      const client = makeClient(baseResponse);
      const svc = new ClaudeService(config, personas, client);

      await svc.callPersona('planner-p6-25yr', 'Audit this baseline.');

      const req = client.capturedRequest!;
      expect(req).toBeDefined();
      // System field is an array of typed blocks with cache_control on the
      // single block we send. This is the contract for ephemeral caching.
      const system = req.system as Array<{ type: string; text: string; cache_control: { type: string } }>;
      expect(Array.isArray(system)).toBe(true);
      expect(system).toHaveLength(1);
      expect(system[0].type).toBe('text');
      expect(system[0].text).toBe(persona.systemPrompt);
      expect(system[0].cache_control).toEqual({ type: 'ephemeral' });

      // Model is resolved from the persona's tier slug.
      expect(req.model).toBe('claude-sonnet-4-5');

      // Single user message; no context prefix when none supplied.
      const messages = req.messages as Array<{ role: string; content: string }>;
      expect(messages).toHaveLength(1);
      expect(messages[0].role).toBe('user');
      expect(messages[0].content).toBe('Audit this baseline.');

      // Metadata stamps slug + version so the run is auditable.
      const metadata = req.metadata as { user_id: string };
      expect(metadata.user_id).toBe('persona:planner-p6-25yr:v7');
    });

    it('prefixes the user message with `context` when provided, with a separator', async () => {
      const config = makeConfigService(true);
      const personas = makePersonasService(makePersona());
      const client = makeClient(baseResponse);
      const svc = new ClaudeService(config, personas, client);

      await svc.callPersona('planner-p6-25yr', 'Question?', { context: 'BoQ line 4.12' });

      const messages = (client.capturedRequest as { messages: Array<{ content: string }> })
        .messages;
      expect(messages[0].content).toBe('BoQ line 4.12\n\n---\n\nQuestion?');
    });

    it('overrides the model when context.modelTier is supplied', async () => {
      const config = makeConfigService(true);
      const personas = makePersonasService(makePersona({ modelTier: 'claude-sonnet' }));
      const client = makeClient(baseResponse);
      const svc = new ClaudeService(config, personas, client);

      await svc.callPersona('planner-p6-25yr', 'Q', { modelTier: 'claude-opus' });
      expect((client.capturedRequest as { model: string }).model).toBe('claude-opus-4-5');
    });

    it('falls back to the configured default model for an unknown tier', async () => {
      const config = makeConfigService(true);
      const personas = makePersonasService(makePersona({ modelTier: 'claude-unobtainium' }));
      const client = makeClient(baseResponse);
      const svc = new ClaudeService(config, personas, client);

      await svc.callPersona('planner-p6-25yr', 'Q');
      expect((client.capturedRequest as { model: string }).model).toBe('claude-sonnet-4-5');
    });

    it('tags simulation calls with `:sim` in metadata so cache breakpoints split', async () => {
      const config = makeConfigService(true);
      const personas = makePersonasService(makePersona());
      const client = makeClient(baseResponse);
      const svc = new ClaudeService(config, personas, client);

      await svc.callPersona('planner-p6-25yr', 'Q', { simulation: true });
      const md = (client.capturedRequest as { metadata: { user_id: string } }).metadata;
      expect(md.user_id).toBe('persona:planner-p6-25yr:v7:sim');
    });

    it('extracts [SOURCE: id] citations from the response content (deduplicated)', async () => {
      const dupResponse: AnthropicMessageResponse = {
        ...baseResponse,
        content: [
          {
            type: 'text',
            text:
              'See [SOURCE: fidic-red-2017]. Also [SOURCE: pmbok-7]. ' +
              'Repeat [SOURCE: fidic-red-2017]. And [SOURCE: aace-rp-29r-03].',
          },
        ],
      };
      const config = makeConfigService(true);
      const personas = makePersonasService(makePersona());
      const client = makeClient(dupResponse);
      const svc = new ClaudeService(config, personas, client);

      const out = await svc.callPersona('planner-p6-25yr', 'Q');
      expect(out.citations).toEqual(['fidic-red-2017', 'pmbok-7', 'aace-rp-29r-03']);
      expect(out.content).toContain('[SOURCE: fidic-red-2017]');
    });

    it('returns cached=true when cache_read_input_tokens > 0', async () => {
      const cachedResponse: AnthropicMessageResponse = {
        ...baseResponse,
        usage: {
          input_tokens: 50,
          output_tokens: 100,
          cache_creation_input_tokens: 0,
          cache_read_input_tokens: 1200,
        },
      };
      const config = makeConfigService(true);
      const personas = makePersonasService(makePersona());
      const client = makeClient(cachedResponse);
      const svc = new ClaudeService(config, personas, client);

      const out = await svc.callPersona('planner-p6-25yr', 'Q');
      expect(out.cached).toBe(true);
      expect(out.tokensIn).toBe(50);
      expect(out.tokensOut).toBe(100);
    });

    it('returns cached=false on a cold call', async () => {
      const config = makeConfigService(true);
      const personas = makePersonasService(makePersona());
      const client = makeClient(baseResponse);
      const svc = new ClaudeService(config, personas, client);

      const out = await svc.callPersona('planner-p6-25yr', 'Q');
      expect(out.cached).toBe(false);
    });

    it('exposes persona slug + version on the result for audit', async () => {
      const config = makeConfigService(true);
      const personas = makePersonasService(makePersona({ businessKey: 'fidic-red-expert', version: 3 }));
      const client = makeClient(baseResponse);
      const svc = new ClaudeService(config, personas, client);

      const out = await svc.callPersona('fidic-red-expert', 'Q');
      expect(out.personaSlug).toBe('fidic-red-expert');
      expect(out.personaVersion).toBe(3);
      expect(out.stopReason).toBe('end_turn');
    });

    it('throws when the persona slug is unknown', async () => {
      const config = makeConfigService(true);
      const personas = makePersonasService(makePersona());
      const client = makeClient(baseResponse);
      const svc = new ClaudeService(config, personas, client);

      await expect(svc.callPersona('not-a-real-persona', 'Q')).rejects.toThrow(
        /No current persona with slug not-a-real-persona/,
      );
    });

    it('extractCitations returns [] for empty/null-ish input', () => {
      const config = makeConfigService(true);
      const personas = makePersonasService(makePersona());
      const client = makeClient(baseResponse);
      const svc = new ClaudeService(config, personas, client);

      expect(svc.extractCitations('')).toEqual([]);
      expect(svc.extractCitations('No markers here at all.')).toEqual([]);
    });

    it('streamPersona throws when the injected client lacks messages.stream', async () => {
      const config = makeConfigService(true);
      const personas = makePersonasService(makePersona());
      const client = makeClient(baseResponse); // no stream method
      const svc = new ClaudeService(config, personas, client);

      const iter = svc.streamPersona('planner-p6-25yr', 'Q');
      await expect(iter.next()).rejects.toThrow(/messages\.stream/);
    });

    it('streamPersona forwards every event from a streaming-capable client', async () => {
      const events = [
        { type: 'message_start' },
        { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Hello' } },
        { type: 'content_block_delta', delta: { type: 'text_delta', text: ' world' } },
        { type: 'message_stop' },
      ];
      async function* gen() {
        for (const e of events) yield e;
      }
      const streamingClient: AnthropicClientLike = {
        messages: {
          create: jest.fn(),
          stream: jest.fn(() => gen()),
        },
      };
      const config = makeConfigService(true);
      const personas = makePersonasService(makePersona());
      const svc = new ClaudeService(config, personas, streamingClient);

      const seen: unknown[] = [];
      for await (const evt of svc.streamPersona('planner-p6-25yr', 'Q')) {
        seen.push(evt);
      }
      expect(seen).toEqual(events);
    });
  });
});

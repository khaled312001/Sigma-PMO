/**
 * Typed application configuration, loaded from environment variables.
 * Safe local defaults are provided so the app boots in development; production
 * values come from the environment (Hostinger). See `.env.example`.
 */
export interface DatabaseConfig {
  host: string;
  port: number;
  username: string;
  password: string;
  database: string;
  /** Auto-create/update schema from entities. DEV ONLY — never true in prod. */
  synchronize: boolean;
  logging: boolean;
}

export interface LlmConfig {
  /** Empty string means LLM augmentation is disabled (deterministic only). */
  apiKey: string;
  provider: 'anthropic' | 'openai';
  model: string;
  maxTokens: number;
}

/**
 * Anthropic Claude API config (Wave 2). Separate from the legacy `llm.*` block
 * because Wave 2 wires Claude in directly via `@anthropic-ai/sdk` — the legacy
 * provider-neutral `llm` field stays for the deterministic-only path so older
 * code keeps booting unchanged.
 *
 * Discipline:
 *  - `apiKey` is read ONLY from `process.env.ANTHROPIC_API_KEY` (never hardcoded).
 *  - `enabled` is a derived boolean so `ClaudeService.isEnabled()` is a constant-
 *    time check that does not need the env at request time.
 *  - `defaultTier` maps a Persona's `modelTier` slug (e.g. `claude-sonnet`) to a
 *    concrete model id when the persona does not pin one itself.
 *  - `cacheTtlSeconds` controls the `cache_control: { type: 'ephemeral', ttl }`
 *    breakpoint applied to every persona system prompt. Default 3600 (1h).
 */
export interface AnthropicConfig {
  /** From `process.env.ANTHROPIC_API_KEY`. Empty string => disabled. */
  apiKey: string;
  /** Default model id used when a Persona's `modelTier` does not pin one. */
  defaultModel: string;
  /** Default tier slug (`claude-haiku` | `claude-sonnet` | `claude-opus`). */
  defaultTier: string;
  /** Default max tokens for completions when the caller does not override. */
  maxTokens: number;
  /** TTL for `cache_control: { type: 'ephemeral' }` system prompts, in seconds. */
  cacheTtlSeconds: number;
  /** Derived: true when `apiKey` is non-empty. */
  enabled: boolean;
}

export interface AppConfiguration {
  env: string;
  port: number;
  database: DatabaseConfig;
  /** Directory where ingested source files are archived immutably. */
  storageDir: string;
  /** Directory where synthetic sample files live; allowlisted for `ingest-path`. */
  samplesDir: string;
  llm: LlmConfig;
  /** Comma-separated allowed origins for CORS (or empty for default localhost dev). */
  corsOrigins: string;
  /** Outbound notification channels (optional). */
  emailSmtpUrl: string;
  slackWebhookUrl: string;
  teamsWebhookUrl: string;
  /** Required `x-bootstrap-token` header value for bootstrap-mode writes in prod. */
  bootstrapToken: string;
  /** Optional Sentry DSN; when unset, Sentry is not initialised. */
  sentryDsn: string;
  /** Body size limit for JSON endpoints (multer-style string, e.g. "25mb"). */
  bodyLimit: string;
  /** Rate-limit defaults (per-IP, per-route bucket). */
  throttlerDefaultLimit: number;
  throttlerDefaultTtlMs: number;
  throttlerAuthLimit: number;
  throttlerIngestLimit: number;
  /** Wave 2: direct Claude SDK wiring. Separate from the legacy `llm.*` block. */
  anthropic: AnthropicConfig;
}

function toBool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
}

function toInt(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export default (): AppConfiguration => {
  const anthropicApiKey = process.env.ANTHROPIC_API_KEY ?? '';
  return {
  env: process.env.NODE_ENV ?? 'development',
  port: toInt(process.env.PORT, 3001),
  storageDir: process.env.STORAGE_DIR ?? '../data/storage',
  samplesDir: process.env.SAMPLES_DIR ?? '../data/samples',
  corsOrigins: process.env.CORS_ORIGINS ?? '',
  emailSmtpUrl: process.env.EMAIL_SMTP_URL ?? '',
  slackWebhookUrl: process.env.SLACK_WEBHOOK_URL ?? '',
  teamsWebhookUrl: process.env.TEAMS_WEBHOOK_URL ?? '',
  bootstrapToken: process.env.BOOTSTRAP_TOKEN ?? '',
  sentryDsn: process.env.SENTRY_DSN ?? '',
  bodyLimit: process.env.BODY_LIMIT ?? '25mb',
  throttlerDefaultLimit: toInt(process.env.RATE_LIMIT_DEFAULT_LIMIT, 100),
  throttlerDefaultTtlMs: toInt(process.env.RATE_LIMIT_DEFAULT_TTL_MS, 60_000),
  throttlerAuthLimit: toInt(process.env.RATE_LIMIT_AUTH_LIMIT, 10),
  throttlerIngestLimit: toInt(process.env.RATE_LIMIT_INGEST_LIMIT, 30),
  llm: {
    apiKey: process.env.LLM_API_KEY ?? '',
    provider: (process.env.LLM_PROVIDER ?? 'anthropic') as 'anthropic' | 'openai',
    model: process.env.LLM_MODEL ?? 'claude-sonnet-4-6',
    maxTokens: toInt(process.env.LLM_MAX_TOKENS, 1024),
  },
  database: {
    host: process.env.DB_HOST ?? 'localhost',
    port: toInt(process.env.DB_PORT, 3306),
    username: process.env.DB_USERNAME ?? 'root',
    password: process.env.DB_PASSWORD ?? '',
    database: process.env.DB_DATABASE ?? 'sigma_pmo',
    // Default true for zero-setup dev; force false in production regardless (DatabaseModule enforces).
    synchronize: toBool(process.env.DB_SYNCHRONIZE, process.env.NODE_ENV !== 'production'),
    logging: toBool(process.env.DB_LOGGING, false),
  },
  anthropic: {
    apiKey: anthropicApiKey,
    defaultModel: process.env.ANTHROPIC_DEFAULT_MODEL ?? 'claude-sonnet-4-5',
    defaultTier: process.env.ANTHROPIC_DEFAULT_TIER ?? 'claude-sonnet',
    maxTokens: toInt(process.env.ANTHROPIC_MAX_TOKENS, 4096),
    cacheTtlSeconds: toInt(process.env.ANTHROPIC_CACHE_TTL, 3600),
    enabled: !!anthropicApiKey,
  },
  };
};

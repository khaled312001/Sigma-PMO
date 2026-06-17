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
  /**
   * LLM Council (Mr. Ayham, 2026-06-17): when true, AI adjudications default to
   * a multi-member deliberation (council) instead of a single pass. Off by
   * default — callers can still opt in per-call.
   */
  councilEnabled: boolean;
  /** Number of council members (2..4); the chair is additional. */
  councilSize: number;
}

/**
 * Autodesk Platform Services (APS, formerly Forge) — BIM/Revit/IFC integration.
 * 2-legged OAuth (client_credentials). Empty client id/secret => disabled, and
 * the BIM surface stays on the local hand-rolled IFC parser. The credentials
 * are read env-first here, but `AutodeskApsService` prefers the encrypted
 * `SystemSetting` (set from /admin/settings) when present — same precedence as
 * the Anthropic key. NEVER hardcode the secret.
 */
export interface AutodeskConfig {
  clientId: string;
  clientSecret: string;
  /** APS base host. Default is the public cloud; override only for sovereign regions. */
  baseUrl: string;
  /** Derived: true when both clientId and clientSecret are non-empty. */
  enabled: boolean;
}

/**
 * Primavera P6 EPPM REST — live schedule pull. Empty baseUrl/credentials =>
 * disabled, and P6 data arrives only via file upload (.xer/.xml/.pdf) or the
 * inbound webhook. `P6ClientService` prefers the encrypted `SystemSetting`
 * values over these env defaults. NEVER hardcode the password.
 */
export interface PrimaveraConfig {
  /** e.g. https://<host>/p6ws/restapi (P6 EPPM REST root). */
  baseUrl: string;
  /** P6 database instance name/id the REST API logs into. */
  database: string;
  username: string;
  password: string;
  /** Derived: true when baseUrl + username + password are all non-empty. */
  enabled: boolean;
}

/**
 * S3 (or S3-compatible) object storage for the file archive. When `enabled`
 * (bucket + credentials set), `StorageService` writes/reads objects on S3
 * instead of the local disk. Works with AWS S3 or any S3-compatible provider
 * (Hetzner, MinIO, Backblaze, Wasabi) via `endpoint` + `forcePathStyle`.
 */
export interface S3Config {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle: boolean;
  /** Derived: true when bucket + access key + secret are all set. */
  enabled: boolean;
}

/**
 * Stripe billing (multi-tenant SaaS subscriptions). When `enabled`
 * (STRIPE_SECRET_KEY + STRIPE_PRICE_ID set) registration sends the company to
 * Stripe Checkout with a `trialDays` trial; a signed webhook syncs status.
 * When disabled, billing degrades gracefully (trial subscription only).
 * Discipline: `secretKey`/`webhookSecret` are read ONLY from env — never hardcoded.
 */
export interface StripeConfig {
  secretKey: string;
  publishableKey: string;
  /** Recurring Price id (price_…) for the subscription plan. */
  priceId: string;
  webhookSecret: string;
  /** Free-trial length in days before the first real charge. Default 30. */
  trialDays: number;
  /** Public frontend URL used to build Checkout success/cancel redirects. */
  appUrl: string;
  /** Derived: true when secretKey + priceId are both set. */
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
  /** Autodesk APS (BIM/Revit/IFC) — 2-legged OAuth, env-default credentials. */
  autodesk: AutodeskConfig;
  /** Primavera P6 EPPM REST — live schedule pull, env-default credentials. */
  primavera: PrimaveraConfig;
  /** S3 / S3-compatible object storage for the file archive (optional). */
  s3: S3Config;
  /** Stripe billing (SaaS subscriptions) — optional, config-driven. */
  stripe: StripeConfig;
  /** Public URL of the frontend app (Checkout redirects, company login links). */
  appUrl: string;
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
  const autodeskClientId = process.env.AUTODESK_CLIENT_ID ?? '';
  const autodeskClientSecret = process.env.AUTODESK_CLIENT_SECRET ?? '';
  const p6BaseUrl = process.env.P6_BASE_URL ?? '';
  const p6Username = process.env.P6_USERNAME ?? '';
  const p6Password = process.env.P6_PASSWORD ?? '';
  const stripeSecretKey = process.env.STRIPE_SECRET_KEY ?? '';
  const stripePriceId = process.env.STRIPE_PRICE_ID ?? '';
  const appUrl = process.env.APP_PUBLIC_URL ?? 'http://localhost:3000';
  return {
  appUrl,
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
    // Runtime schema rewrites are unsafe for the mature UAT schema; use migrations instead.
    synchronize: toBool(process.env.DB_SYNCHRONIZE, false),
    logging: toBool(process.env.DB_LOGGING, false),
  },
  anthropic: {
    apiKey: anthropicApiKey,
    defaultModel: process.env.ANTHROPIC_DEFAULT_MODEL ?? 'claude-sonnet-4-5',
    defaultTier: process.env.ANTHROPIC_DEFAULT_TIER ?? 'claude-sonnet',
    maxTokens: toInt(process.env.ANTHROPIC_MAX_TOKENS, 4096),
    cacheTtlSeconds: toInt(process.env.ANTHROPIC_CACHE_TTL, 3600),
    enabled: !!anthropicApiKey,
    councilEnabled: toBool(process.env.ANTHROPIC_COUNCIL_ENABLED, false),
    councilSize: toInt(process.env.ANTHROPIC_COUNCIL_SIZE, 3),
  },
  autodesk: {
    clientId: autodeskClientId,
    clientSecret: autodeskClientSecret,
    baseUrl: process.env.AUTODESK_BASE_URL ?? 'https://developer.api.autodesk.com',
    enabled: !!autodeskClientId && !!autodeskClientSecret,
  },
  primavera: {
    baseUrl: p6BaseUrl,
    database: process.env.P6_DATABASE ?? '',
    username: p6Username,
    password: p6Password,
    enabled: !!p6BaseUrl && !!p6Username && !!p6Password,
  },
  s3: {
    endpoint: process.env.S3_ENDPOINT ?? '',
    region: process.env.S3_REGION ?? 'us-east-1',
    bucket: process.env.S3_BUCKET ?? '',
    accessKeyId: process.env.S3_ACCESS_KEY ?? '',
    secretAccessKey: process.env.S3_SECRET_KEY ?? '',
    forcePathStyle: toBool(process.env.S3_FORCE_PATH_STYLE, true),
    enabled: !!(process.env.S3_BUCKET && process.env.S3_ACCESS_KEY && process.env.S3_SECRET_KEY),
  },
  stripe: {
    secretKey: stripeSecretKey,
    publishableKey: process.env.STRIPE_PUBLISHABLE_KEY ?? '',
    priceId: stripePriceId,
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET ?? '',
    trialDays: toInt(process.env.STRIPE_TRIAL_DAYS, 30),
    appUrl,
    enabled: !!(stripeSecretKey && stripePriceId),
  },
  };
};

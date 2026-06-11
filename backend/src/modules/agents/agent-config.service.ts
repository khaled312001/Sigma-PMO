import { BadRequestException, Injectable } from '@nestjs/common';

import { SettingsService } from '../settings/settings.service';

/**
 * Per-agent runtime configuration (2026-06-12 Governance Configuration Center).
 *
 * One JSON document persisted under the single `agents.config` setting key via
 * the existing `SettingsService` plumbing — `{ [agentKey]: { enabled, modelTier } }`.
 * Agents default to enabled; an admin can disable an agent (the orchestrator and
 * the single-run route then refuse to run it with a 409) or pin its model tier.
 *
 * The document is sparse: only agents that have been explicitly configured carry
 * a row. Reads for an unconfigured agent fall back to {@link DEFAULT_AGENT_CONFIG}.
 */

/** The model tiers an admin may pin an agent to. `default` = platform default. */
export const ALLOWED_MODEL_TIERS = [
  'default',
  'claude-haiku',
  'claude-sonnet',
  'claude-opus',
] as const;

export type ModelTier = (typeof ALLOWED_MODEL_TIERS)[number];

/** Per-agent config record. */
export interface AgentConfig {
  /** When false the agent refuses to run (orchestrator + single-run route → 409). */
  enabled: boolean;
  /** Pinned model tier, or `default` to use the platform default. */
  modelTier: ModelTier;
}

/** The whole document: a sparse map keyed by agentKey. */
export type AgentConfigMap = Record<string, AgentConfig>;

/** Applied for any agent without an explicit persisted row. */
export const DEFAULT_AGENT_CONFIG: AgentConfig = {
  enabled: true,
  modelTier: 'default',
};

/** Setting key holding the JSON config document. */
export const AGENTS_CONFIG_SETTING_KEY = 'agents.config';

@Injectable()
export class AgentConfigService {
  constructor(private readonly settings: SettingsService) {}

  /** The full sparse config map (empty object when nothing persisted yet). */
  async getAll(): Promise<AgentConfigMap> {
    const raw = await this.settings.getPlaintext(AGENTS_CONFIG_SETTING_KEY);
    return parseStoredMap(raw);
  }

  /** The effective config for one agent (defaults applied when unconfigured). */
  async getFor(agentKey: string): Promise<AgentConfig> {
    const map = await this.getAll();
    return normalizeConfig(map[agentKey]);
  }

  /** True when the agent is allowed to run. */
  async isEnabled(agentKey: string): Promise<boolean> {
    return (await this.getFor(agentKey)).enabled;
  }

  /**
   * Upsert one agent's config (partial merge over the current value). Validates
   * the model tier + enabled flag and persists the merged document back.
   */
  async setFor(
    agentKey: string,
    patch: Partial<AgentConfig>,
    updatedBy: string | null,
  ): Promise<AgentConfig> {
    if (!agentKey || typeof agentKey !== 'string') {
      throw new BadRequestException('agentKey is required.');
    }
    const map = await this.getAll();
    const current = normalizeConfig(map[agentKey]);
    const merged = validateConfig({ ...current, ...patch });
    map[agentKey] = merged;
    await this.settings.set(AGENTS_CONFIG_SETTING_KEY, JSON.stringify(map), updatedBy);
    return merged;
  }
}

// ───────────────────────── validation / parsing ─────────────────────────

/** Range/type-validate one config record. */
export function validateConfig(input: Partial<AgentConfig>): AgentConfig {
  const enabled = input.enabled ?? DEFAULT_AGENT_CONFIG.enabled;
  if (typeof enabled !== 'boolean') {
    throw new BadRequestException('enabled must be a boolean.');
  }
  const modelTier = input.modelTier ?? DEFAULT_AGENT_CONFIG.modelTier;
  if (!ALLOWED_MODEL_TIERS.includes(modelTier as ModelTier)) {
    throw new BadRequestException(
      `modelTier must be one of: ${ALLOWED_MODEL_TIERS.join(', ')}.`,
    );
  }
  return { enabled, modelTier: modelTier as ModelTier };
}

/** Coerce a possibly-undefined/corrupt record into a valid config. */
function normalizeConfig(input: Partial<AgentConfig> | undefined): AgentConfig {
  if (!input || typeof input !== 'object') return { ...DEFAULT_AGENT_CONFIG };
  try {
    return validateConfig(input);
  } catch {
    return { ...DEFAULT_AGENT_CONFIG };
  }
}

/** Parse the stored JSON map; corrupt/missing rows fall back to an empty map. */
function parseStoredMap(raw: string | null): AgentConfigMap {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out: AgentConfigMap = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      out[key] = normalizeConfig(value as Partial<AgentConfig>);
    }
    return out;
  } catch {
    return {};
  }
}

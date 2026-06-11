import { BadRequestException, Body, Controller, Get, HttpCode, Post } from '@nestjs/common';

import { RequiresCapability } from '../auth/require-capability.decorator';
import { SettingsService } from './settings.service';

/**
 * Governance Configuration Center — one typed JSON document persisted through
 * the existing SettingsService/SystemSetting plumbing under the
 * `governance.config` key.
 *
 * On every save the controller ALSO writes `governance.escalateAfterDays`
 * as its own setting key, because the escalation sweep reads that single
 * scalar directly (it must not have to parse the whole config document).
 *
 * Both routes are gated on `canEditPolicy` — the same capability that owns
 * /admin/settings and the policy editor.
 */

/** The typed governance configuration document. */
export interface GovernanceConfig {
  /** Days an unacknowledged critical item waits before auto-escalation. */
  escalateAfterDays: number;
  /** Run rule evaluation automatically after every successful ingest. */
  autoEvaluateOnIngest: boolean;
  /** Critical governance decisions require two distinct approvers. */
  dualApprovalForCritical: boolean;
  /** Relative weights of the governance-status roll-up components (sum ≈ 1). */
  statusWeights: {
    alerts: number;
    escalations: number;
    confidence: number;
  };
}

/** Setting key holding the JSON config document. */
export const GOVERNANCE_CONFIG_SETTING_KEY = 'governance.config';
/** Scalar mirror of `escalateAfterDays` — read directly by the escalation sweep. */
export const GOVERNANCE_ESCALATE_AFTER_DAYS_SETTING_KEY = 'governance.escalateAfterDays';

/** Defaults applied when nothing is persisted yet. */
export const DEFAULT_GOVERNANCE_CONFIG: GovernanceConfig = {
  escalateAfterDays: 7,
  autoEvaluateOnIngest: false,
  dualApprovalForCritical: true,
  // Named basis: alerts carry the largest share of the status roll-up,
  // escalations next, confidence the remainder. Sum is exactly 1.
  statusWeights: { alerts: 0.4, escalations: 0.35, confidence: 0.25 },
};

interface GovernanceConfigResponse {
  config: GovernanceConfig;
  /** false → the defaults above are in effect (nothing persisted yet). */
  configured: boolean;
  updatedBy: string | null;
  updatedAt: string | null;
}

interface SaveGovernanceConfigBody extends Partial<GovernanceConfig> {
  updatedBy?: string | null;
}

@Controller('admin/governance-config')
export class GovernanceConfigController {
  constructor(private readonly settings: SettingsService) {}

  @Get()
  @RequiresCapability('canEditPolicy')
  async get(): Promise<GovernanceConfigResponse> {
    const [raw, meta] = await Promise.all([
      this.settings.getPlaintext(GOVERNANCE_CONFIG_SETTING_KEY),
      this.settings.describe(GOVERNANCE_CONFIG_SETTING_KEY),
    ]);
    return {
      config: parseStoredConfig(raw),
      configured: meta.configured,
      updatedBy: meta.updatedBy,
      updatedAt: meta.updatedAt,
    };
  }

  @Post()
  @HttpCode(200)
  @RequiresCapability('canEditPolicy')
  async save(@Body() body: SaveGovernanceConfigBody): Promise<GovernanceConfigResponse> {
    if (!body || typeof body !== 'object') {
      throw new BadRequestException('A governance config body is required.');
    }
    const config = validateGovernanceConfig(body);
    const updatedBy = typeof body.updatedBy === 'string' ? body.updatedBy : null;

    await this.settings.set(GOVERNANCE_CONFIG_SETTING_KEY, JSON.stringify(config), updatedBy);
    // The scalar mirror the escalation sweep reads — written on EVERY save so
    // the two keys can never drift apart.
    await this.settings.set(
      GOVERNANCE_ESCALATE_AFTER_DAYS_SETTING_KEY,
      String(config.escalateAfterDays),
      updatedBy,
    );

    return this.get();
  }
}

// ───────────────────────── validation / parsing ─────────────────────────

/** Range-validate an incoming config; throws BadRequest with the field name. */
export function validateGovernanceConfig(input: Partial<GovernanceConfig>): GovernanceConfig {
  const d = DEFAULT_GOVERNANCE_CONFIG;

  const escalateAfterDays = input.escalateAfterDays ?? d.escalateAfterDays;
  if (!Number.isInteger(escalateAfterDays) || escalateAfterDays < 1 || escalateAfterDays > 365) {
    throw new BadRequestException('escalateAfterDays must be an integer between 1 and 365.');
  }

  const autoEvaluateOnIngest = input.autoEvaluateOnIngest ?? d.autoEvaluateOnIngest;
  if (typeof autoEvaluateOnIngest !== 'boolean') {
    throw new BadRequestException('autoEvaluateOnIngest must be a boolean.');
  }

  const dualApprovalForCritical = input.dualApprovalForCritical ?? d.dualApprovalForCritical;
  if (typeof dualApprovalForCritical !== 'boolean') {
    throw new BadRequestException('dualApprovalForCritical must be a boolean.');
  }

  const weights = input.statusWeights ?? d.statusWeights;
  for (const field of ['alerts', 'escalations', 'confidence'] as const) {
    const v = weights?.[field];
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > 1) {
      throw new BadRequestException(`statusWeights.${field} must be a number between 0 and 1.`);
    }
  }
  const sum = weights.alerts + weights.escalations + weights.confidence;
  if (sum < 0.99 || sum > 1.01) {
    throw new BadRequestException(
      `statusWeights must sum to 1 (±0.01) — got ${sum.toFixed(3)}. ` +
        'Adjust the three weights so they describe a full distribution.',
    );
  }

  return {
    escalateAfterDays,
    autoEvaluateOnIngest,
    dualApprovalForCritical,
    statusWeights: {
      alerts: weights.alerts,
      escalations: weights.escalations,
      confidence: weights.confidence,
    },
  };
}

/** Parse the stored JSON document; corrupt/missing rows fall back to defaults. */
function parseStoredConfig(raw: string | null): GovernanceConfig {
  if (!raw) return { ...DEFAULT_GOVERNANCE_CONFIG, statusWeights: { ...DEFAULT_GOVERNANCE_CONFIG.statusWeights } };
  try {
    return validateGovernanceConfig(JSON.parse(raw) as Partial<GovernanceConfig>);
  } catch {
    // A historical row that fails today's validation must not brick the GET —
    // surface the defaults; the next save overwrites the bad document.
    return { ...DEFAULT_GOVERNANCE_CONFIG, statusWeights: { ...DEFAULT_GOVERNANCE_CONFIG.statusWeights } };
  }
}

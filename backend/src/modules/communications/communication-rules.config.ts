import type { CommunicationCategory, CommunicationCriticality } from './communication.entity';

/**
 * Project communication rules (Mr. Ayham, 2026-06-19). The project admin defines
 * the official channels, approved recipients/roles, unread-alert period, the
 * escalation matrix, required-acknowledgement categories, required response time,
 * deemed-notice rules, criticality and the responsible party per category.
 *
 * Stored as a versioned JSON document per company (see CommunicationRule), so
 * rules can change without code deployments. `resolveFor(companyId)` falls back
 * to the global default below when a company has not authored its own.
 */
export interface EscalationTier {
  /** Tier ordinal (1 = first escalation). */
  level: number;
  /** Hours after `sentAt` (still unopened/unactioned) before this tier fires. */
  afterHours: number;
  /** Role the notice is escalated to (mirrors Ayham's matrix: consultant → contractor → pmo → owner → client). */
  toRole: string;
}

export interface CommunicationRulesConfig {
  /** Official channels a communication may be registered on. */
  channels: string[];
  /** Approved recipient email addresses (empty = any recipient allowed). */
  approvedRecipients: string[];
  /** Approved recipient roles (empty = any role allowed). */
  approvedRoles: string[];
  /** Hours unopened before the automatic unread alert fires. */
  unreadAlertHours: number;
  /** Ordered escalation matrix applied to unopened/unactioned official notices. */
  escalationLevels: EscalationTier[];
  /** Categories that mandate an explicit acknowledgement. */
  requiredAckCategories: CommunicationCategory[];
  /** Categories that mandate a content decision (accept/reject) — a response. */
  requiredResponseCategories: CommunicationCategory[];
  /** Hours within which a required response must be given (the response SLA). */
  requiredResponseHours: number;
  /** Categories treated as critical (drives default criticality + ack). */
  criticalCategories: CommunicationCategory[];
  /** Deemed-notice: where contractually approved, an unopened notice is deemed served. */
  deemedNoticeEnabled: boolean;
  /** Hours unopened after which the notice is deemed served (when enabled). */
  deemedNoticeHours: number;
  /** Responsible party (role) accountable per category. */
  responsibleByCategory: Partial<Record<CommunicationCategory, string>>;
}

export const ALL_CATEGORIES: CommunicationCategory[] = [
  'rfi', 'ncr', 'delay-notice', 'approval-request', 'claim-notice',
  'instruction', 'variation', 'daily-report', 'meeting-minutes', 'general',
];

/**
 * Sensible governance defaults. The escalation matrix walks the project chain:
 * 24h → PMO, 48h → consultant, 72h → owner (mirrors the communication matrix in
 * Ayham's brief). Critical contractual notices (NCR / claim / delay / variation /
 * instruction) require acknowledgement; claims/variations also require a response.
 */
export const DEFAULT_COMMUNICATION_RULES: CommunicationRulesConfig = {
  channels: ['Sigma Project Channel', 'Official Project Email'],
  approvedRecipients: [],
  approvedRoles: [],
  unreadAlertHours: 24,
  escalationLevels: [
    { level: 1, afterHours: 24, toRole: 'pmo' },
    { level: 2, afterHours: 48, toRole: 'consultant' },
    { level: 3, afterHours: 72, toRole: 'owner' },
  ],
  requiredAckCategories: ['ncr', 'claim-notice', 'delay-notice', 'instruction', 'variation'],
  requiredResponseCategories: ['rfi', 'approval-request', 'claim-notice', 'variation'],
  requiredResponseHours: 72,
  criticalCategories: ['ncr', 'claim-notice', 'delay-notice'],
  deemedNoticeEnabled: false,
  deemedNoticeHours: 72,
  responsibleByCategory: {
    rfi: 'consultant',
    ncr: 'contractor',
    'delay-notice': 'pmo',
    'approval-request': 'consultant',
    'claim-notice': 'pmo',
    instruction: 'contractor',
    variation: 'pmo',
    'daily-report': 'contractor',
    'meeting-minutes': 'pmo',
    general: 'pmo',
  },
};

const clampInt = (v: unknown, min: number, max: number, fallback: number): number => {
  const n = typeof v === 'number' ? Math.round(v) : Number.parseInt(String(v ?? ''), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
};

const cleanStrings = (v: unknown): string[] =>
  Array.isArray(v) ? v.map((s) => String(s).trim()).filter(Boolean).slice(0, 64) : [];

const cleanCategories = (v: unknown): CommunicationCategory[] =>
  Array.isArray(v)
    ? (v.map((s) => String(s).trim()).filter((s): s is CommunicationCategory => (ALL_CATEGORIES as string[]).includes(s)))
    : [];

/**
 * Validate + merge a partial rules document onto the defaults, range-checking
 * every field (mirrors the governance-config validation pattern). Never throws —
 * unknown/invalid fields fall back to the default so the saved document is always
 * coherent.
 */
export function validateCommunicationRules(input: Partial<CommunicationRulesConfig> | undefined | null): CommunicationRulesConfig {
  const d = DEFAULT_COMMUNICATION_RULES;
  const i = input ?? {};

  const tiersRaw = Array.isArray(i.escalationLevels) ? i.escalationLevels : d.escalationLevels;
  const escalationLevels: EscalationTier[] = tiersRaw
    .map((t, idx) => ({
      level: clampInt((t as EscalationTier)?.level, 1, 9, idx + 1),
      afterHours: clampInt((t as EscalationTier)?.afterHours, 1, 24 * 90, d.escalationLevels[idx]?.afterHours ?? 24),
      toRole: String((t as EscalationTier)?.toRole ?? 'pmo').trim().slice(0, 32) || 'pmo',
    }))
    .sort((a, b) => a.afterHours - b.afterHours)
    .slice(0, 9);

  return {
    channels: cleanStrings(i.channels).length ? cleanStrings(i.channels) : d.channels,
    approvedRecipients: cleanStrings(i.approvedRecipients),
    approvedRoles: cleanStrings(i.approvedRoles),
    unreadAlertHours: clampInt(i.unreadAlertHours, 1, 24 * 30, d.unreadAlertHours),
    escalationLevels: escalationLevels.length ? escalationLevels : d.escalationLevels,
    requiredAckCategories: i.requiredAckCategories !== undefined ? cleanCategories(i.requiredAckCategories) : d.requiredAckCategories,
    requiredResponseCategories: i.requiredResponseCategories !== undefined ? cleanCategories(i.requiredResponseCategories) : d.requiredResponseCategories,
    requiredResponseHours: clampInt(i.requiredResponseHours, 1, 24 * 60, d.requiredResponseHours),
    criticalCategories: i.criticalCategories !== undefined ? cleanCategories(i.criticalCategories) : d.criticalCategories,
    deemedNoticeEnabled: typeof i.deemedNoticeEnabled === 'boolean' ? i.deemedNoticeEnabled : d.deemedNoticeEnabled,
    deemedNoticeHours: clampInt(i.deemedNoticeHours, 1, 24 * 90, d.deemedNoticeHours),
    responsibleByCategory:
      i.responsibleByCategory && typeof i.responsibleByCategory === 'object'
        ? Object.fromEntries(
            Object.entries(i.responsibleByCategory)
              .filter(([k]) => (ALL_CATEGORIES as string[]).includes(k))
              .map(([k, val]) => [k, String(val).trim().slice(0, 32)]),
          )
        : d.responsibleByCategory,
  };
}

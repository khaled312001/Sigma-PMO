/**
 * Decision-category derivation (Req R7, Mr. Ayham acceptance).
 *
 * Classifies a governance decision into one domain so the UI can show what KIND
 * of decision it is and — critically — so the platform can HARD-BLOCK
 * auto-approval for sensitive domains (financial / contractual / safety). Pure
 * + deterministic: derived from the triggering alert's code and the decision's
 * FIDIC clause alone, no LLM, no I/O. Mirrors the longest-prefix style of
 * `decision-templates.ts`.
 *
 * Precedence (first match wins):
 *   1. safety       — fire / safety / authority / hazard alert codes
 *   2. financial    — cost / payment / budget / claim / variation / EVM codes
 *   3. contractual  — a FIDIC clause is mapped, or contract/notice/EOT codes
 *   4. schedule     — schedule / duration / progress / delay codes
 *   5. quality      — quality / NCR / defect / inspection codes
 *   6. operational  — resource / reporting / data codes
 *   7. general      — fallback (still requires human approval; not auto-blocked)
 */

export type DecisionCategory =
  | 'financial'
  | 'contractual'
  | 'safety'
  | 'schedule'
  | 'quality'
  | 'operational'
  | 'general';

/** Domains for which the system must NEVER auto-approve (R7 hard block). */
export const AUTO_APPROVAL_BLOCKED_CATEGORIES: ReadonlySet<DecisionCategory> = new Set<DecisionCategory>([
  'financial',
  'contractual',
  'safety',
]);

/** Substring families per category, tested against the UPPER-CASED alert code. */
const CATEGORY_CODE_PATTERNS: Array<[DecisionCategory, string[]]> = [
  ['safety', ['SAFETY', 'FIRE', 'HAZARD', 'AUTHORITY', 'PERMIT', 'INCIDENT', 'LIFE_SAFETY']],
  ['financial', ['COST', 'PAYMENT', 'BUDGET', 'CLAIM', 'VARIATION', 'PRICE', 'EVM', 'CASHFLOW', 'CASH_FLOW', 'INVOICE', 'CERTIFIC']],
  ['contractual', ['CONTRACT', 'NOTICE', 'EOT', 'TIME_BAR', 'DETERMINATION', 'DEEMED', 'FIDIC', 'DISPUTE']],
  ['schedule', ['SCHEDULE', 'DURATION', 'PROGRESS', 'DELAY', 'BASELINE', 'SLIP', 'BEHIND']],
  ['quality', ['QUALITY', 'NCR', 'DEFECT', 'INSPECT', 'ITP', 'SNAG', 'CLASH']],
  ['operational', ['RESOURCE', 'REPORT', 'DATA', 'STALE', 'COMPLETENESS', 'UTILITY', 'READINESS']],
];

/**
 * Derive the category for a decision from its triggering alert code + FIDIC
 * clause. `fidicClause` is a strong signal of a contractual decision, but a
 * safety / financial alert code still wins over it (a fire alert with a clause
 * mapping is a SAFETY decision first). Returns `general` when nothing matches.
 */
export function deriveDecisionCategory(
  alertCode: string | null | undefined,
  fidicClause: string | null | undefined,
): DecisionCategory {
  const code = (alertCode ?? '').toUpperCase();

  // 1. safety wins outright — life-safety overrides any other classification.
  if (matches(code, 'safety')) return 'safety';
  // 2. financial next — money decisions are hard-blocked from auto-approval.
  if (matches(code, 'financial')) return 'financial';
  // 3. contractual — explicit contract codes OR a mapped FIDIC clause.
  if (matches(code, 'contractual') || hasFidicClause(fidicClause)) return 'contractual';
  // 4–6. non-blocked operational domains.
  if (matches(code, 'schedule')) return 'schedule';
  if (matches(code, 'quality')) return 'quality';
  if (matches(code, 'operational')) return 'operational';
  return 'general';
}

/** True when the decision's category is in the auto-approval-blocked set. */
export function isAutoApprovalBlocked(category: string | null | undefined): boolean {
  return category != null && AUTO_APPROVAL_BLOCKED_CATEGORIES.has(category as DecisionCategory);
}

function matches(code: string, category: DecisionCategory): boolean {
  const patterns = CATEGORY_CODE_PATTERNS.find(([c]) => c === category)?.[1] ?? [];
  return patterns.some((p) => code.includes(p));
}

function hasFidicClause(clause: string | null | undefined): boolean {
  return typeof clause === 'string' && clause.trim().length > 0;
}

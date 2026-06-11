import { Injectable } from '@nestjs/common';

/**
 * The deterministic inputs the entitlement ladder reads off a Claim (+ its
 * optional linked letter dates). Pure data — the service does no I/O.
 */
export interface EntitlementInput {
  responsibleParty: string | null;
  evidenceRefs: string[] | null;
  estimatedDays: number | null;
  estimatedAmount: string | number | null;
  basis: string | null;
  /** Claim raise date (ISO) — used as the notice reference when no letter date. */
  claimDate: string | Date | null;
  /** Earliest linked-letter date (ISO) for this project, when available. */
  noticeLetterDate: string | Date | null;
  /** Contractual response window in days from the linked letter, when available. */
  noticeDeadlineDays: number | null;
  /** The delay-event date the claim links to (ISO), when derivable. */
  delayEventDate: string | Date | null;
}

export interface CriterionResult {
  key: string;
  label: string;
  /** true / false, or null when the data needed to decide is absent. */
  pass: boolean | null;
  detail: string;
}

export type EntitlementLikelihood = 'high' | 'medium' | 'low';

export interface EntitlementAssessment {
  entitlementLikelihood: EntitlementLikelihood;
  /** # of criteria that passed (nulls do NOT count as passes). */
  passedCount: number;
  /** # of criteria that were decidable (not null). */
  decidableCount: number;
  criteria: CriterionResult[];
  source: string;
  basis: string;
}

export const ENTITLEMENT_RUBRIC_VERSION = 'sigma-entitlement-rubric-v1';

/**
 * EntitlementService — deterministic FIDIC entitlement screening (Mr. Ayham's
 * L6 responsibility assessment). For each claim it evaluates four named
 * criteria and rolls them into a likelihood ladder:
 *   high   — all decidable criteria pass;
 *   medium — at least 2 criteria pass;
 *   low    — fewer than 2 pass.
 * No LLM — every result names the row contents that produced it.
 */
@Injectable()
export class EntitlementService {
  assess(input: EntitlementInput): EntitlementAssessment {
    const criteria: CriterionResult[] = [
      this.responsibilityNotContractor(input),
      this.delayEventLinked(input),
      this.noticeWithinDeadline(input),
      this.quantumDocumented(input),
    ];

    const passedCount = criteria.filter((c) => c.pass === true).length;
    const decidableCount = criteria.filter((c) => c.pass !== null).length;

    // High requires ALL decidable criteria to pass AND at least 3 decidable.
    const allDecidablePass = decidableCount > 0 && criteria.every((c) => c.pass !== false);
    let entitlementLikelihood: EntitlementLikelihood;
    if (allDecidablePass && passedCount >= 3 && decidableCount >= 3) {
      entitlementLikelihood = 'high';
    } else if (passedCount >= 2) {
      entitlementLikelihood = 'medium';
    } else {
      entitlementLikelihood = 'low';
    }

    return {
      entitlementLikelihood,
      passedCount,
      decidableCount,
      criteria,
      source: ENTITLEMENT_RUBRIC_VERSION,
      basis:
        'high = all decidable criteria pass (≥3 decidable, ≥3 passing); medium = ≥2 passing; low = <2 passing. ' +
        'Criteria that cannot be decided from the available data are reported as null and never count as a pass.',
    };
  }

  /** responsibilityNotContractor — the contractor is not the responsible party. */
  private responsibilityNotContractor(input: EntitlementInput): CriterionResult {
    const party = (input.responsibleParty ?? '').trim().toLowerCase();
    if (!party) {
      return crit('responsibilityNotContractor', 'Responsibility not the contractor', null,
        'No responsible party recorded on the claim.');
    }
    const contractorOwned = party === 'contractor';
    return crit('responsibilityNotContractor', 'Responsibility not the contractor', !contractorOwned,
      contractorOwned
        ? 'Responsible party is the contractor — no entitlement against the employer.'
        : `Responsible party is "${input.responsibleParty}" (not the contractor).`);
  }

  /** delayEventLinked — the claim links at least one evidence reference. */
  private delayEventLinked(input: EntitlementInput): CriterionResult {
    const n = (input.evidenceRefs ?? []).length;
    return crit('delayEventLinked', 'Delay / contract event linked', n > 0,
      n > 0 ? `${n} evidence reference(s) linked.` : 'No evidence references linked to the claim.');
  }

  /**
   * noticeWithinDeadline — the claim/notice was raised within the contractual
   * window. Decidable only when both a notice reference date and a deadline are
   * known; otherwise null (per the mission spec: compare letter dates if
   * available, else null).
   */
  private noticeWithinDeadline(input: EntitlementInput): CriterionResult {
    const letterMs = toMs(input.noticeLetterDate);
    const deadline = input.noticeDeadlineDays;
    if (letterMs === null || deadline === null || deadline < 0) {
      return crit('noticeWithinDeadline', 'Notice served within the deadline', null,
        'No linked letter date or contractual deadline available to test the notice window.');
    }
    // Reference event the notice responds to: the delay event, else the claim date.
    const eventMs = toMs(input.delayEventDate) ?? toMs(input.claimDate);
    if (eventMs === null) {
      return crit('noticeWithinDeadline', 'Notice served within the deadline', null,
        'No event/claim date to measure the notice window against.');
    }
    const elapsedDays = (letterMs - eventMs) / DAY_MS;
    const within = elapsedDays <= deadline;
    return crit('noticeWithinDeadline', 'Notice served within the deadline', within,
      `Notice raised ${Math.round(elapsedDays)} day(s) after the event vs a ${deadline}-day deadline.`);
  }

  /** quantumDocumented — a time and/or cost quantum is recorded. */
  private quantumDocumented(input: EntitlementInput): CriterionResult {
    const amount = toNum(input.estimatedAmount);
    const days = input.estimatedDays;
    const hasAmount = amount !== null && amount > 0;
    const hasDays = days !== null && days > 0;
    const documented = hasAmount || hasDays;
    return crit('quantumDocumented', 'Quantum documented', documented,
      documented
        ? `Quantum recorded${hasDays ? ` (${days} day(s))` : ''}${hasAmount ? ` (amount ${amount})` : ''}.`
        : 'Neither a time nor a cost quantum is recorded on the claim.');
  }
}

const DAY_MS = 24 * 60 * 60 * 1000;

function crit(key: string, label: string, pass: boolean | null, detail: string): CriterionResult {
  return { key, label, pass, detail };
}
function toMs(d: string | Date | null | undefined): number | null {
  if (d === null || d === undefined) return null;
  const ms = d instanceof Date ? d.getTime() : Date.parse(String(d));
  return Number.isFinite(ms) ? ms : null;
}
function toNum(v: string | number | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === 'string' ? Number.parseFloat(v) : v;
  return Number.isFinite(n) ? n : null;
}

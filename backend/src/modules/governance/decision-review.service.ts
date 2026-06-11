import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';

import { Alert, DecisionReview, GovernanceDecision, User } from '../canonical/entities';

const ALLOWED_ACTIONS = new Set(['approve', 'reject', 'acknowledge']);

/**
 * Chain state of a governance decision's approval workflow:
 *  - `approved`                 — fully approved (single approve for non-critical;
 *                                 two distinct approvers for critical).
 *  - `awaiting-second-approval` — a critical decision has exactly one approve;
 *                                 a SECOND, DISTINCT approver is still required.
 *  - `rejected`                 — the latest action is a reject.
 *  - `acknowledged`             — latest action is an acknowledge, no approval yet.
 *  - `pending`                  — no review recorded yet.
 */
export type DecisionChainState =
  | 'approved'
  | 'awaiting-second-approval'
  | 'rejected'
  | 'acknowledged'
  | 'pending';

/** Lightweight approver fact surfaced in chain responses. */
export interface ChainApproval {
  performedByDisplay: string | null;
  createdAt: string;
}

/** Result of recording a review — the row plus the derived chain state. */
export interface ReviewRecordResult {
  review: DecisionReview;
  chainState: DecisionChainState;
  /** Distinct approvers so far (by display name). */
  approvals: ChainApproval[];
  /** True for critical decisions that require two distinct approvers. */
  requiresDualApproval: boolean;
  /** Approvals still needed to reach `approved` (0 when already approved). */
  approvalsRemaining: number;
}

@Injectable()
export class DecisionReviewService {
  constructor(
    @InjectRepository(DecisionReview) private readonly reviews: Repository<DecisionReview>,
    @InjectRepository(GovernanceDecision) private readonly decisions: Repository<GovernanceDecision>,
    @InjectRepository(Alert) private readonly alerts: Repository<Alert>,
  ) {}

  /**
   * Record one review action, enforcing the approval-chain rules, and return
   * the derived chain state.
   *
   * Dual-approval rule (escalation chain): a decision whose triggering alert is
   * `severity = 'critical'` requires TWO approvals by DISTINCT actors. The
   * first `approve` lands the chain in `awaiting-second-approval`; a second
   * `approve` by a DIFFERENT actor lands it in `approved`. A second `approve`
   * by the SAME actor is rejected with 409 — one person cannot self-quorum a
   * critical governance decision.
   */
  async record(
    decisionId: string,
    action: string,
    comment: string | null,
    actor: User | null,
  ): Promise<ReviewRecordResult> {
    if (!ALLOWED_ACTIONS.has(action)) {
      throw new BadRequestException(`Unknown action "${action}"; allowed: approve | reject | acknowledge`);
    }
    // Audit-trail integrity: every review must attribute to a real actor.
    if (!actor || !actor.id) {
      throw new UnauthorizedException('decision review requires an authenticated actor');
    }
    const decision = await this.decisions.findOne({ where: { id: decisionId } });
    if (!decision) throw new NotFoundException(`Decision ${decisionId} not found`);

    const alert = await this.alerts.findOne({ where: { id: decision.alertId } });
    const requiresDualApproval = alert?.severity === 'critical';
    const actorDisplay = actor.displayName ?? actor.email;

    // Same-actor second-approval guard for the critical dual-approval chain.
    if (action === 'approve' && requiresDualApproval) {
      const prior = await this.reviews.find({ where: { decisionId, action: 'approve' } });
      const alreadyApprovedBySameActor = prior.some(
        (r) => r.performedByUserId === actor.id ||
          (r.performedByDisplay != null && r.performedByDisplay === actorDisplay),
      );
      if (alreadyApprovedBySameActor) {
        throw new ConflictException(
          'This critical decision already carries your approval; a SECOND, DISTINCT approver is required.',
        );
      }
    }

    const saved = await this.reviews.save(
      this.reviews.create({
        decisionId,
        alertId: decision.alertId,
        action,
        comment,
        performedByUserId: actor.id,
        performedByDisplay: actorDisplay,
      }),
    );

    const all = await this.reviews.find({ where: { decisionId }, order: { createdAt: 'DESC' } });
    const chain = computeChainState(all, requiresDualApproval);
    return {
      review: saved,
      chainState: chain.state,
      approvals: chain.approvals,
      requiresDualApproval,
      approvalsRemaining: chain.approvalsRemaining,
    };
  }

  listForDecision(decisionId: string): Promise<DecisionReview[]> {
    return this.reviews.find({ where: { decisionId }, order: { createdAt: 'DESC' } });
  }

  /**
   * Batch variant of listForDecision. Single SQL round-trip, grouped client-
   * side. Returns a map keyed by decisionId; ids with no reviews map to [].
   */
  async listForDecisionMany(decisionIds: string[]): Promise<Record<string, DecisionReview[]>> {
    if (decisionIds.length === 0) return {};
    const rows = await this.reviews.find({
      where: { decisionId: In(decisionIds) },
      order: { createdAt: 'DESC' },
    });
    const out: Record<string, DecisionReview[]> = {};
    for (const id of decisionIds) out[id] = [];
    for (const r of rows) (out[r.decisionId] ??= []).push(r);
    return out;
  }

  listForAlert(alertId: string): Promise<DecisionReview[]> {
    return this.reviews.find({ where: { alertId }, order: { createdAt: 'DESC' } });
  }

  /**
   * Derive the chain state for a single decision without recording anything —
   * used by the decisions/approval list endpoints to surface `chainState` +
   * `approvals[]` alongside each decision.
   */
  async chainStateFor(decisionId: string): Promise<{
    chainState: DecisionChainState;
    approvals: ChainApproval[];
    requiresDualApproval: boolean;
    approvalsRemaining: number;
  }> {
    const decision = await this.decisions.findOne({ where: { id: decisionId } });
    if (!decision) throw new NotFoundException(`Decision ${decisionId} not found`);
    const alert = await this.alerts.findOne({ where: { id: decision.alertId } });
    const requiresDualApproval = alert?.severity === 'critical';
    const all = await this.reviews.find({ where: { decisionId }, order: { createdAt: 'DESC' } });
    const chain = computeChainState(all, requiresDualApproval);
    return {
      chainState: chain.state,
      approvals: chain.approvals,
      requiresDualApproval,
      approvalsRemaining: chain.approvalsRemaining,
    };
  }

  /**
   * Batch chain-state resolver. One SQL round-trip for the reviews of all
   * supplied decisions; maps each decisionId to its chain state. Decisions
   * whose triggering alert is critical require dual approval — `criticalDecisionIds`
   * carries that classification (resolved by the caller from the alert join).
   */
  async chainStatesFor(
    decisionIds: string[],
    criticalDecisionIds: Set<string>,
  ): Promise<Record<string, {
    chainState: DecisionChainState;
    approvals: ChainApproval[];
    requiresDualApproval: boolean;
    approvalsRemaining: number;
  }>> {
    const out: Record<string, {
      chainState: DecisionChainState;
      approvals: ChainApproval[];
      requiresDualApproval: boolean;
      approvalsRemaining: number;
    }> = {};
    if (decisionIds.length === 0) return out;
    const byDecision = await this.listForDecisionMany(decisionIds);
    for (const id of decisionIds) {
      const requiresDualApproval = criticalDecisionIds.has(id);
      const chain = computeChainState(byDecision[id] ?? [], requiresDualApproval);
      out[id] = {
        chainState: chain.state,
        approvals: chain.approvals,
        requiresDualApproval,
        approvalsRemaining: chain.approvalsRemaining,
      };
    }
    return out;
  }
}

/**
 * Pure chain-state derivation from a decision's reviews (any order). Returns
 * the state, the distinct approver list, and how many approvals are still
 * required to reach `approved`.
 */
export function computeChainState(
  reviews: DecisionReview[],
  requiresDualApproval: boolean,
): {
  state: DecisionChainState;
  approvals: ChainApproval[];
  approvalsRemaining: number;
} {
  if (reviews.length === 0) {
    return {
      state: 'pending',
      approvals: [],
      approvalsRemaining: requiresDualApproval ? 2 : 1,
    };
  }

  // Latest first.
  const ordered = [...reviews].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
  const latest = ordered[0];

  // A reject is terminal regardless of prior approvals.
  if (latest.action === 'reject') {
    return { state: 'rejected', approvals: [], approvalsRemaining: requiresDualApproval ? 2 : 1 };
  }

  // Distinct approvers (by user id, falling back to display name).
  const seen = new Set<string>();
  const approvals: ChainApproval[] = [];
  for (const r of ordered) {
    if (r.action !== 'approve') continue;
    const key = r.performedByUserId ?? r.performedByDisplay ?? r.id;
    if (seen.has(key)) continue;
    seen.add(key);
    approvals.push({ performedByDisplay: r.performedByDisplay, createdAt: toIso(r.createdAt) });
  }

  const required = requiresDualApproval ? 2 : 1;
  const distinctApprovals = approvals.length;
  const approvalsRemaining = Math.max(0, required - distinctApprovals);

  if (distinctApprovals >= required) {
    return { state: 'approved', approvals, approvalsRemaining: 0 };
  }
  if (distinctApprovals > 0) {
    // Some approval recorded but quorum not met → awaiting the next approver.
    return { state: 'awaiting-second-approval', approvals, approvalsRemaining };
  }
  // No approvals, latest is an acknowledge.
  return { state: 'acknowledged', approvals, approvalsRemaining };
}

/** Normalise a Date | ISO string into an ISO string (defensive for both shapes). */
function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

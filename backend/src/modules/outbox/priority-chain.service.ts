import { Injectable, Logger } from '@nestjs/common';

import { Layer } from '../../common/enums';

/**
 * Default layer priority order per ADR-0013 (Accepted 2026-06-09).
 *
 * Reads top-to-bottom: GOVERNANCE wins on contractual conflicts; PLANNING
 * beats ENGINEERING because schedule commitments are contracted while
 * design intent is iterative; REPORTS sits below the operational layers
 * (a report never overrides the truth it reports on); SIMULATION is last
 * because a what-if branch must never influence the canonical truth.
 *
 * Editing this list is the single supported way to change priority. The
 * order is logged on every conflict so an audit trail covers every change.
 */
export const LAYER_PRIORITY: readonly Layer[] = [
  Layer.GOVERNANCE,
  Layer.PLANNING,
  Layer.ENGINEERING,
  Layer.REPORTS,
  Layer.SIMULATION,
];

/** One competing claim handed to the resolver. */
export interface LayerClaim<T = unknown> {
  layer: Layer;
  /** Free-form payload the consumer will keep when this layer wins. */
  payload: T;
}

/** Result of a single conflict resolution. */
export interface PriorityResolution<T> {
  winner: LayerClaim<T>;
  losers: LayerClaim<T>[];
  appliedPriority: readonly Layer[];
}

/**
 * Cross-layer priority chain resolver (ADR-0012 Stage 2 + ADR-0013).
 *
 * When two or more Outbox events touch the same subject row (same project
 * / alert / decision) and disagree, this service decides which layer's
 * version of the event wins. Callers hand in the competing claims and we
 * sort by the active LAYER_PRIORITY constant.
 *
 * The resolution is intentionally pure (no DB writes). Persistence is the
 * caller's responsibility — typically the OutboxEvent consumer marks the
 * winning event `processed` and the losers `superseded-by-priority`.
 */
@Injectable()
export class PriorityChainService {
  private readonly logger = new Logger(PriorityChainService.name);

  /** Resolve a conflict between ≥1 competing layer claims for the same subject. */
  resolve<T>(claims: LayerClaim<T>[], subjectRef: string): PriorityResolution<T> {
    if (!claims.length) {
      throw new Error('PriorityChainService.resolve: at least one claim is required');
    }
    const indexed = claims.map((c) => ({
      claim: c,
      rank: LAYER_PRIORITY.indexOf(c.layer),
    }));
    // Unknown layer → push to the bottom (rank Infinity) so it can never silently win.
    const sorted = [...indexed].sort((a, b) => {
      const ra = a.rank === -1 ? Number.POSITIVE_INFINITY : a.rank;
      const rb = b.rank === -1 ? Number.POSITIVE_INFINITY : b.rank;
      return ra - rb;
    });

    const winner = sorted[0].claim;
    const losers = sorted.slice(1).map((s) => s.claim);

    if (losers.length > 0) {
      this.logger.log(
        `Priority conflict for "${subjectRef}": ${winner.layer} wins over ` +
          `[${losers.map((l) => l.layer).join(', ')}] ` +
          `under priority order [${LAYER_PRIORITY.join(' > ')}].`,
      );
    }

    return { winner, losers, appliedPriority: LAYER_PRIORITY };
  }

  /** Public accessor for the active order — used by the audit page. */
  activeOrder(): readonly Layer[] {
    return LAYER_PRIORITY;
  }
}

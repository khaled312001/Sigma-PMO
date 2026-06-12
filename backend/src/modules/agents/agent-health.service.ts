import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { AgentExecution } from '../canonical/entities';
import { AgentRegistry } from './agent.registry';

/**
 * One agent's operational health, derived purely from its `AgentExecution`
 * audit rows. Every figure is deterministic and reproducible from the rows
 * themselves (no clock, no randomness) — the same discipline the rest of the
 * platform applies to its numbers.
 */
export interface AgentHealth {
  agentKey: string;
  layer: string | null;
  /** Whether this key is still in the live registry (vs. only historical rows). */
  registered: boolean;
  runs: number;
  completed: number;
  failed: number;
  /** completed / total, 0–1 (0 when no runs). */
  successRate: number;
  /** Mean of non-null confidenceOverall across all runs, 0–1 (null when none). */
  avgConfidence: number | null;
  /** Status of the most recent run by finishedAt/createdAt. */
  lastStatus: string | null;
  /** Governance tier of the most recent run that contributed one. */
  lastGovernanceStatus: string | null;
  /** ISO timestamp of the most recent run (null when none). */
  lastRunAt: string | null;
  /**
   * 0–100, higher = healthier governance posture. Starts at 100 and is
   * penalised for recent orange/red governance verdicts and failures, weighted
   * so the most recent runs dominate (recency-weighted).
   */
  governanceImpactScore: number;
  /** healthy ≥ 75 · degraded ≥ 50 · failing < 50 (also failing on a failed last run). */
  healthStatus: 'healthy' | 'degraded' | 'failing';
  /** Plain-English provenance of every figure above. */
  basis: Record<string, string>;
}

/** GET /agents/health — the registry-wide health roll-up. */
export interface AgentHealthReport {
  asOfDate: string;
  agents: AgentHealth[];
  totals: {
    agents: number;
    healthy: number;
    degraded: number;
    failing: number;
    totalRuns: number;
  };
  basis: Record<string, string>;
}

/** How many of the most recent runs feed the recency-weighted impact score. */
const IMPACT_WINDOW = 20;

const GOVERNANCE_IMPACT_BASIS =
  'governanceImpactScore = round(100 − 100·Σ(wᵢ·penaltyᵢ)/Σwᵢ) over the latest ' +
  `${IMPACT_WINDOW} runs, newest first; weight wᵢ = ${IMPACT_WINDOW}−i (linear recency); ` +
  'penalty: red/failed = 1.0, orange = 0.6, yellow = 0.25, green/other = 0. ' +
  '100 when the agent has never run.';

/**
 * AgentHealthService — turns the central `AgentExecution` audit trail into a
 * per-agent operational health view (run counts, success rate, mean
 * confidence, last status, and a recency-weighted governance-impact score).
 *
 * Deterministic-first: every number is a named formula over the rows; nothing
 * is read from the system clock and nothing varies by randomness, so the same
 * rows always produce the same report.
 */
@Injectable()
export class AgentHealthService {
  constructor(
    @InjectRepository(AgentExecution)
    private readonly executions: Repository<AgentExecution>,
    private readonly registry: AgentRegistry,
  ) {}

  /**
   * Build the health report for every agent that has EITHER a live registry
   * entry OR at least one historical execution row, so retired agents with
   * audit history are still visible.
   */
  async report(asOfDate = '2026-06-12'): Promise<AgentHealthReport> {
    // Pull a bounded, newest-first window of audit rows and bucket by agentKey.
    // 5000 rows is generous for this platform yet caps worst-case memory.
    const rows = await this.executions.find({
      order: { createdAt: 'DESC' },
      take: 5000,
    });

    const byAgent = new Map<string, AgentExecution[]>();
    for (const row of rows) {
      const list = byAgent.get(row.agentKey);
      if (list) list.push(row);
      else byAgent.set(row.agentKey, [row]);
    }

    // The registry is the source of truth for layer + "still live"; seed the
    // key set with it so a registered agent with zero runs still appears.
    const registered = new Map<string, string>();
    for (const d of this.registry.list()) registered.set(d.agentKey, d.layer);

    const keys = new Set<string>([...registered.keys(), ...byAgent.keys()]);
    const agents = [...keys]
      .map((agentKey) =>
        this.healthFor(
          agentKey,
          byAgent.get(agentKey) ?? [],
          registered.has(agentKey),
          registered.get(agentKey) ?? null,
        ),
      )
      // Sickest first so the screen leads with what needs attention; ties by key.
      .sort(
        (a, b) =>
          a.governanceImpactScore - b.governanceImpactScore ||
          a.agentKey.localeCompare(b.agentKey),
      );

    const totals = {
      agents: agents.length,
      healthy: agents.filter((a) => a.healthStatus === 'healthy').length,
      degraded: agents.filter((a) => a.healthStatus === 'degraded').length,
      failing: agents.filter((a) => a.healthStatus === 'failing').length,
      totalRuns: agents.reduce((sum, a) => sum + a.runs, 0),
    };

    return {
      asOfDate,
      agents,
      totals,
      basis: {
        scope:
          'One row per registered agent and/or per agentKey present in the ' +
          'agent_execution audit trail (latest 5000 rows). Sorted sickest-first.',
        governanceImpactScore: GOVERNANCE_IMPACT_BASIS,
        healthStatus:
          'healthy when governanceImpactScore ≥ 75; degraded ≥ 50; failing < 50 ' +
          'OR the most recent run failed.',
      },
    };
  }

  /** Reduce one agent's audit rows (already newest-first) to its health view. */
  private healthFor(
    agentKey: string,
    rows: AgentExecution[],
    isRegistered: boolean,
    layer: string | null,
  ): AgentHealth {
    const runs = rows.length;
    const completed = rows.filter((r) => r.status === 'completed').length;
    const failed = rows.filter((r) => r.status === 'failed').length;
    const successRate = runs > 0 ? round3(completed / runs) : 0;

    const confidences = rows
      .map((r) => r.confidenceOverall)
      .filter((v): v is number => v !== null && v !== undefined && Number.isFinite(v));
    const avgConfidence =
      confidences.length > 0
        ? round3(confidences.reduce((a, b) => a + b, 0) / confidences.length)
        : null;

    // `rows` is ordered by createdAt DESC, so the head is the latest run.
    const last = rows[0] ?? null;
    const lastStatus = last?.status ?? null;
    const lastRunAtDate = last?.finishedAt ?? last?.createdAt ?? null;
    const lastRunAt = lastRunAtDate ? new Date(lastRunAtDate).toISOString() : null;
    const lastGovernanceStatus =
      rows.find((r) => r.governanceStatus !== null && r.governanceStatus !== undefined)
        ?.governanceStatus ?? null;

    const governanceImpactScore = this.impactScore(rows);

    // A failed most-recent run is an immediate failing signal regardless of the
    // longer-window impact score — the operator must see the freshest failure.
    const lastFailed = lastStatus === 'failed';
    const healthStatus: AgentHealth['healthStatus'] =
      lastFailed || governanceImpactScore < 50
        ? 'failing'
        : governanceImpactScore < 75
          ? 'degraded'
          : 'healthy';

    return {
      agentKey,
      layer,
      registered: isRegistered,
      runs,
      completed,
      failed,
      successRate,
      avgConfidence,
      lastStatus,
      lastGovernanceStatus: lastGovernanceStatus ? String(lastGovernanceStatus) : null,
      lastRunAt,
      governanceImpactScore,
      healthStatus,
      basis: {
        successRate: 'completed / total runs (0 when no runs).',
        avgConfidence: 'mean of non-null AgentExecution.confidenceOverall across all runs.',
        governanceImpactScore: GOVERNANCE_IMPACT_BASIS,
      },
    };
  }

  /**
   * Recency-weighted governance-impact score in [0,100]. Penalises the latest
   * `IMPACT_WINDOW` runs by their governance verdict (and failures), weighting
   * newer runs more so a fresh red drags the score harder than an old one.
   */
  private impactScore(rows: AgentExecution[]): number {
    if (rows.length === 0) return 100;
    const window = rows.slice(0, IMPACT_WINDOW);
    let weightedPenalty = 0;
    let weightSum = 0;
    window.forEach((r, i) => {
      const weight = IMPACT_WINDOW - i; // newest run gets the largest weight
      weightSum += weight;
      weightedPenalty += weight * runPenalty(r);
    });
    if (weightSum === 0) return 100;
    const score = 100 - 100 * (weightedPenalty / weightSum);
    return Math.round(Math.max(0, Math.min(100, score)));
  }
}

/** Penalty in [0,1] a single run contributes to the impact score. */
function runPenalty(run: AgentExecution): number {
  if (run.status === 'failed') return 1;
  switch ((run.governanceStatus ?? '').toString().toLowerCase()) {
    case 'red':
      return 1;
    case 'orange':
      return 0.6;
    case 'yellow':
      return 0.25;
    default:
      return 0; // green or no governance contribution
  }
}

const round3 = (n: number): number => Math.round(n * 1000) / 1000;

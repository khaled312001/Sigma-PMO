import { Injectable } from '@nestjs/common';

export type RiskTier = 'low' | 'medium' | 'high' | 'critical';

export interface ScoredRisk {
  probability: number;
  impact: number;
  priorityScore: number;
  tier: RiskTier;
}

/**
 * RiskScoringService — pure probability×impact scoring (Mr. Ayham's L5 risk
 * prioritization). priorityScore = probability × impact, both [0,1]; the tier
 * comes from fixed thresholds so the prioritisation is deterministic and
 * explainable. Unit-tested in isolation.
 */
@Injectable()
export class RiskScoringService {
  score(probability: number, impact: number): ScoredRisk {
    const p = clamp01(probability);
    const i = clamp01(impact);
    const priorityScore = Math.round(p * i * 1000) / 1000;
    return { probability: p, impact: i, priorityScore, tier: this.tier(priorityScore) };
  }

  tier(priorityScore: number): RiskTier {
    if (priorityScore >= 0.6) return 'critical';
    if (priorityScore >= 0.35) return 'high';
    if (priorityScore >= 0.15) return 'medium';
    return 'low';
  }

  /** A risk warrants an escalation trigger once it reaches `high`. */
  needsEscalation(priorityScore: number): boolean {
    return priorityScore >= 0.35;
  }
}

const clamp01 = (n: number): number => Math.max(0, Math.min(1, Number.isFinite(n) ? n : 0));

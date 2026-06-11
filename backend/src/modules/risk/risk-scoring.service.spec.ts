import { RiskScoringService } from './risk-scoring.service';

describe('RiskScoringService — deterministic probability×impact (L5)', () => {
  const svc = new RiskScoringService();

  it('priorityScore is probability × impact', () => {
    expect(svc.score(0.5, 0.5).priorityScore).toBe(0.25);
    expect(svc.score(0.8, 0.9).priorityScore).toBe(0.72);
  });

  it('tiers map by threshold', () => {
    expect(svc.score(0.2, 0.2).tier).toBe('low'); // 0.04
    expect(svc.score(0.5, 0.4).tier).toBe('medium'); // 0.20
    expect(svc.score(0.7, 0.6).tier).toBe('high'); // 0.42
    expect(svc.score(0.9, 0.8).tier).toBe('critical'); // 0.72
  });

  it('clamps out-of-range inputs', () => {
    const r = svc.score(1.5, -0.3);
    expect(r.probability).toBe(1);
    expect(r.impact).toBe(0);
    expect(r.priorityScore).toBe(0);
    expect(r.tier).toBe('low');
  });

  it('escalation triggers at high and above', () => {
    expect(svc.needsEscalation(0.34)).toBe(false);
    expect(svc.needsEscalation(0.35)).toBe(true);
    expect(svc.needsEscalation(0.7)).toBe(true);
  });
});

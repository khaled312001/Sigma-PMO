import {
  QUANTITY_STAGES,
  COST_STAGES,
  REVENUE_STAGES,
  CASHFLOW_STAGES,
  STAGE_LABELS,
  isValidStage,
  stageIndex,
  stagesFor,
  toleranceFor,
} from './traceability-chains';

describe('traceability chains', () => {
  it('quantity chain is BIM → … → Paid (9 stages, ordered)', () => {
    expect([...QUANTITY_STAGES]).toEqual(['bim', 'boq', 'tender', 'procured', 'delivered', 'installed', 'claimed', 'certified', 'paid']);
    expect(stageIndex('quantity', 'bim')).toBe(0);
    expect(stageIndex('quantity', 'paid')).toBe(8);
  });

  it('cost chain is Budget → … → Final (7 stages)', () => {
    expect([...COST_STAGES]).toEqual(['budget', 'tender', 'awarded', 'procurement', 'actual', 'forecast', 'final']);
  });

  it('revenue + cashflow chains exist (Investment Governance)', () => {
    expect(REVENUE_STAGES[0]).toBe('rev_forecast');
    expect(REVENUE_STAGES[REVENUE_STAGES.length - 1]).toBe('rev_final');
    expect(CASHFLOW_STAGES).toContain('cf_variance');
    expect(stagesFor('revenue').length).toBe(7);
    expect(stagesFor('cashflow').length).toBe(5);
  });

  it('every stage has a human label', () => {
    for (const dim of ['quantity', 'cost', 'revenue', 'cashflow'] as const) {
      for (const s of stagesFor(dim)) expect(STAGE_LABELS[s]).toBeTruthy();
    }
  });

  it('stage validation rejects cross-dimension stages', () => {
    expect(isValidStage('quantity', 'paid')).toBe(true);
    expect(isValidStage('quantity', 'budget')).toBe(false);
    expect(isValidStage('revenue', 'collections')).toBe(true);
    expect(isValidStage('cost', 'collections')).toBe(false);
  });

  it('paid-vs-certified is the tightest quantity tolerance', () => {
    expect(toleranceFor('paid').crit).toBeLessThan(toleranceFor('boq').crit);
    expect(toleranceFor('collections').warn).toBeLessThanOrEqual(0.05);
  });
});

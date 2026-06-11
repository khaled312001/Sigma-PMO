import {
  ProjectRollupMetrics,
  aggregateChildren,
  benefitRealizationPct,
  worstOfStatuses,
} from './rollup-math';

/**
 * Pure-function tests for the BAC-weighted parent aggregation — the highest-
 * risk piece of the roll-up surface. Everything here is I/O-free.
 */
describe('rollup-math', () => {
  const leaf = (over: Partial<ProjectRollupMetrics>): ProjectRollupMetrics => ({
    bac: 100, ev: 50, pv: 50, ac: 50, spi: 1, cpi: 1,
    governanceStatus: 'green',
    openRiskCount: 0, maxRiskScore: 0, openClaimCount: 0, claimExposure: 0,
    benefitRealizationPct: 50,
    ...over,
  });

  describe('benefitRealizationPct', () => {
    it('green: 100*(EV/BAC)*1', () => {
      expect(benefitRealizationPct(60, 100, 'green')).toBe(60);
    });
    it('orange applies the 0.6 multiplier', () => {
      expect(benefitRealizationPct(100, 100, 'orange')).toBe(60);
    });
    it('red applies the 0.4 multiplier', () => {
      expect(benefitRealizationPct(50, 100, 'red')).toBe(20); // 100*0.5*0.4
    });
    it('zero BAC yields 0 (no divide-by-zero)', () => {
      expect(benefitRealizationPct(10, 0, 'green')).toBe(0);
    });
    it('unknown status defaults the multiplier to 1', () => {
      expect(benefitRealizationPct(40, 100, null)).toBe(40);
    });
  });

  describe('worstOfStatuses', () => {
    it('picks the worst tier', () => {
      expect(worstOfStatuses(['green', 'orange', 'yellow'])).toBe('orange');
      expect(worstOfStatuses(['green', 'red'])).toBe('red');
    });
    it('ignores null/unknown and returns null when nothing known', () => {
      expect(worstOfStatuses([null, 'bogus'])).toBeNull();
    });
  });

  describe('aggregateChildren — BAC weighting', () => {
    it('weights cpi/spi by each child BAC, not a flat mean', () => {
      // Big project ($900) at CPI 0.9; tiny project ($100) at CPI 1.5.
      // Flat mean would be 1.2; BAC-weighted = (0.9*900 + 1.5*100)/1000 = 0.96.
      const big = leaf({ bac: 900, cpi: 0.9, spi: 0.9 });
      const small = leaf({ bac: 100, cpi: 1.5, spi: 1.5 });
      const parent = aggregateChildren([big, small], null);
      expect(parent.cpi).toBeCloseTo(0.96, 3);
      expect(parent.spi).toBeCloseTo(0.96, 3);
      expect(parent.bac).toBe(1000);
    });

    it('sums EV/PV/AC and the registers, maxes the risk score', () => {
      const a = leaf({ bac: 100, ev: 40, pv: 50, ac: 60, openRiskCount: 2, maxRiskScore: 0.3, openClaimCount: 1, claimExposure: 1000 });
      const b = leaf({ bac: 200, ev: 80, pv: 90, ac: 70, openRiskCount: 3, maxRiskScore: 0.7, openClaimCount: 2, claimExposure: 2500 });
      const parent = aggregateChildren([a, b], null);
      expect(parent.ev).toBe(120);
      expect(parent.pv).toBe(140);
      expect(parent.ac).toBe(130);
      expect(parent.openRiskCount).toBe(5);
      expect(parent.maxRiskScore).toBe(0.7);
      expect(parent.openClaimCount).toBe(3);
      expect(parent.claimExposure).toBe(3500);
    });

    it('drops children whose index is null from the weighted mean', () => {
      const costed = leaf({ bac: 100, cpi: 0.8 });
      const noCost = leaf({ bac: 900, cpi: null, ac: 0 });
      const parent = aggregateChildren([costed, noCost], null);
      // Only the costed child contributes — parent cpi == 0.8, not diluted.
      expect(parent.cpi).toBeCloseTo(0.8, 3);
    });

    it('benefit% is BAC-weighted across children', () => {
      const big = leaf({ bac: 900, benefitRealizationPct: 30 });
      const small = leaf({ bac: 100, benefitRealizationPct: 90 });
      const parent = aggregateChildren([big, small], null);
      // (30*900 + 90*100)/1000 = 36
      expect(parent.benefitRealizationPct).toBe(36);
    });

    it('status falls back to worst-of-children when no own status', () => {
      const parent = aggregateChildren(
        [leaf({ governanceStatus: 'green' }), leaf({ governanceStatus: 'red' })],
        null,
      );
      expect(parent.governanceStatus).toBe('red');
    });

    it('an explicit own status overrides worst-of-children', () => {
      const parent = aggregateChildren(
        [leaf({ governanceStatus: 'red' })],
        'yellow',
      );
      expect(parent.governanceStatus).toBe('yellow');
    });

    it('a node with no children yields null indices and 0 sums', () => {
      const parent = aggregateChildren([], null);
      expect(parent.bac).toBe(0);
      expect(parent.cpi).toBeNull();
      expect(parent.spi).toBeNull();
      expect(parent.benefitRealizationPct).toBe(0);
      expect(parent.governanceStatus).toBeNull();
    });
  });
});

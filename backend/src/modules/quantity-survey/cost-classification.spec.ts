import {
  classifyElement,
  classificationMatrix,
  codesForElement,
  ELEMENT_LIBRARY,
} from './cost-classification';
import { CostEstimationService } from './cost-estimation.service';

describe('Global Cost Classification Framework', () => {
  it('classifies free-text labels to the right element + standard code', () => {
    expect(classifyElement('Reinforced concrete pile foundation', 'NRM').element).toBe('substructure');
    expect(classifyElement('Reinforced concrete pile foundation', 'NRM').code).toBe('1');
    expect(classifyElement('Curtain wall facade cladding', 'UNIFORMAT').element).toBe('external_walls');
    expect(classifyElement('Curtain wall facade cladding', 'UNIFORMAT').code).toBe('B2010');
    expect(classifyElement('HVAC ducting and chiller', 'MASTERFORMAT').code).toBe('23 00 00');
    expect(classifyElement('Electrical distribution board', 'CESMM').element).toBe('services_electrical');
  });

  it('falls back to "other" at low confidence, never inventing a code', () => {
    const c = classifyElement('zzz nonsense label', 'NRM');
    expect(c.element).toBe('other');
    expect(c.confidence).toBeLessThan(0.5);
    expect(c.matchedKeyword).toBeNull();
  });

  it('every element maps across all four standards', () => {
    for (const e of ELEMENT_LIBRARY) {
      const codes = codesForElement(e.element)!;
      expect(codes.NRM).toBeTruthy();
      expect(codes.UNIFORMAT).toBeTruthy();
      expect(codes.MASTERFORMAT).toBeTruthy();
      expect(codes.CESMM).toBeTruthy();
    }
    expect(classificationMatrix().length).toBe(ELEMENT_LIBRARY.length);
  });
});

describe('CostEstimationService', () => {
  const svc = new CostEstimationService();

  it('area-benchmark estimate is internally consistent + classified', () => {
    // residential costPerSqmBua = 4200, Dubai costFactor = 1.0
    const out = svc.estimate({ projectType: 'residential', areaSqm: 10000, standard: 'NRM', city: 'Dubai' });
    expect(out.ratePerSqm).toBeCloseTo(4200, 0);
    // Total ≈ rate × area (distributed across elements, renormalized).
    expect(out.totalAmount).toBeGreaterThan(0);
    // Element shares sum to ~1.
    const shareSum = out.elements.reduce((s, e) => s + e.sharePct, 0);
    expect(shareSum).toBeCloseTo(1, 1);
    // Every element line carries its NRM code + a positive amount.
    for (const e of out.elements) {
      expect(e.code).toBeTruthy();
      expect(e.standard).toBe('NRM');
      expect(e.amount).toBeGreaterThan(0);
    }
    // Σ element amounts = total.
    const sum = out.elements.reduce((s, e) => s + e.amount, 0);
    expect(Math.round(sum)).toBe(Math.round(out.totalAmount));
    // Value engineering names the 3 highest-cost elements.
    expect(out.benchmark.valueEngineering).toHaveLength(3);
  });

  it('location factor scales the rate (Cairo 0.55× vs Dubai 1.0×)', () => {
    const dubai = svc.estimate({ projectType: 'residential', areaSqm: 1000, city: 'Dubai' });
    const cairo = svc.estimate({ projectType: 'residential', areaSqm: 1000, city: 'Cairo' });
    expect(cairo.totalAmount).toBeCloseTo(dubai.totalAmount * 0.55, -3);
  });
});

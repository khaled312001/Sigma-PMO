import { VendorIntelligenceService } from './vendor-intelligence.service';

describe('VendorIntelligenceService.score', () => {
  const svc = new VendorIntelligenceService(null as never);

  it('a strong, experienced, reliable vendor qualifies', () => {
    const s = svc.score({
      yearsActive: 20, completedProjects: 40, financialStanding: 'strong',
      certifications: ['ISO 9001', 'ISO 45001'], onTimeDeliveryRate: 0.95, defectRate: 0.02, disputes: 0,
    });
    expect(s.qualificationScore).toBeGreaterThanOrEqual(55);
    expect(s.riskScore).toBeLessThan(50);
    expect(s.status).toBe('qualified');
  });

  it('a weak, late, dispute-heavy vendor is high-risk / disqualified', () => {
    const s = svc.score({
      yearsActive: 1, completedProjects: 1, financialStanding: 'weak',
      onTimeDeliveryRate: 0.4, defectRate: 0.3, disputes: 5, singleSourceDependence: true,
    });
    expect(s.riskScore).toBeGreaterThanOrEqual(60);
    expect(s.status === 'disqualified' || s.status === 'provisional').toBe(true);
    expect(s.performanceScore).toBeLessThan(s.qualificationScore + 50);
  });

  it('scores are bounded 0–100 and deterministic', () => {
    const a = svc.score({ yearsActive: 8, onTimeDeliveryRate: 0.8, defectRate: 0.05 });
    const b = svc.score({ yearsActive: 8, onTimeDeliveryRate: 0.8, defectRate: 0.05 });
    expect(a).toEqual(b);
    for (const v of [a.qualificationScore, a.evaluationScore, a.performanceScore, a.riskScore]) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(100);
    }
  });
});

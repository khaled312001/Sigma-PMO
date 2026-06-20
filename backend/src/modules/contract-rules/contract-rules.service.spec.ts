import { ContractRulesService } from './contract-rules.service';

/**
 * ContractRulesService.evaluate() — the deterministic procedural verdict
 * (Mr. Ayham acceptance #2). evaluate() is pure (no DB), so we test it directly.
 */
describe('ContractRulesService.evaluate', () => {
  const svc = new ContractRulesService(null as never, null as never);

  it('PRESERVES a notice served within the window', () => {
    const r = svc.evaluate({ eventDate: '2026-01-01', actionDate: '2026-01-20', daysToAct: 28 });
    expect(r.verdict).toBe('preserved');
    expect(r.deadline).toBe('2026-01-29');
    expect(r.withinTime).toBe(true);
  });

  it('flags WEAK when just past the deadline within the grace margin', () => {
    const r = svc.evaluate({ eventDate: '2026-01-01', actionDate: '2026-01-31', daysToAct: 28, graceDays: 3 });
    expect(r.verdict).toBe('weak');
  });

  it('TIME-BARS a notice served well after the deadline', () => {
    const r = svc.evaluate({ eventDate: '2026-01-01', actionDate: '2026-03-01', daysToAct: 28 });
    expect(r.verdict).toBe('time_barred');
  });

  it('reports PENDING when no action yet and time remains', () => {
    const r = svc.evaluate({ eventDate: '2026-06-01', daysToAct: 28, asOf: '2026-06-10' });
    expect(r.verdict).toBe('pending');
    expect(r.remainingDays).toBe(19);
  });

  it('TIME-BARS when no action and the window has lapsed', () => {
    const r = svc.evaluate({ eventDate: '2026-01-01', daysToAct: 28, asOf: '2026-06-20' });
    expect(r.verdict).toBe('time_barred');
  });
});

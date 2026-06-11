import { EntitlementInput, EntitlementService } from './entitlement.service';

describe('EntitlementService — deterministic FIDIC entitlement ladder (L6)', () => {
  const svc = new EntitlementService();

  const base: EntitlementInput = {
    responsibleParty: 'client',
    evidenceRefs: ['alert-1'],
    estimatedDays: 14,
    estimatedAmount: '50000.00',
    basis: 'Employer-instructed variation caused the delay.',
    claimDate: '2026-01-20',
    noticeLetterDate: '2026-01-25',
    noticeDeadlineDays: 28,
    delayEventDate: '2026-01-10',
  };

  it('all four criteria pass → high', () => {
    const r = svc.assess(base);
    expect(r.criteria.map((c) => c.pass)).toEqual([true, true, true, true]);
    expect(r.passedCount).toBe(4);
    expect(r.entitlementLikelihood).toBe('high');
  });

  it('contractor-owned responsibility fails the first criterion → not high', () => {
    const r = svc.assess({ ...base, responsibleParty: 'contractor' });
    expect(r.criteria[0].pass).toBe(false);
    // 3 of 4 still pass → medium
    expect(r.passedCount).toBe(3);
    expect(r.entitlementLikelihood).toBe('medium');
  });

  it('exactly two passing criteria → medium', () => {
    // responsibility ok + evidence linked; no quantum; notice undecidable.
    const r = svc.assess({
      ...base,
      estimatedDays: null,
      estimatedAmount: null,
      noticeLetterDate: null,
      noticeDeadlineDays: null,
    });
    expect(r.passedCount).toBe(2);
    expect(r.entitlementLikelihood).toBe('medium');
  });

  it('fewer than two passing criteria → low', () => {
    const r = svc.assess({
      ...base,
      responsibleParty: 'contractor', // fail
      evidenceRefs: [], // fail
      estimatedDays: null,
      estimatedAmount: null, // fail
      noticeLetterDate: null,
      noticeDeadlineDays: null, // null
    });
    expect(r.passedCount).toBe(0);
    expect(r.entitlementLikelihood).toBe('low');
  });

  it('notice beyond the deadline fails the notice criterion', () => {
    const r = svc.assess({
      ...base,
      delayEventDate: '2026-01-01',
      noticeLetterDate: '2026-03-01', // ~59 days later vs 28-day deadline
    });
    const notice = r.criteria.find((c) => c.key === 'noticeWithinDeadline');
    expect(notice?.pass).toBe(false);
  });

  it('notice undecidable (no letter/deadline) is null, not a pass', () => {
    const r = svc.assess({ ...base, noticeLetterDate: null, noticeDeadlineDays: null });
    const notice = r.criteria.find((c) => c.key === 'noticeWithinDeadline');
    expect(notice?.pass).toBeNull();
    // 3 decidable, all pass, but only 3 passing & 3 decidable → still high (≥3/≥3).
    expect(r.passedCount).toBe(3);
    expect(r.decidableCount).toBe(3);
    expect(r.entitlementLikelihood).toBe('high');
  });

  it('missing responsible party makes that criterion null', () => {
    const r = svc.assess({ ...base, responsibleParty: null });
    expect(r.criteria[0].pass).toBeNull();
  });
});

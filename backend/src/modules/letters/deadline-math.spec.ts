import { computeDeadline } from './deadline-math';

describe('computeDeadline — deterministic FIDIC deadline math (plan §3.5 step 4)', () => {
  // Monday 2026-06-01 as the receipt anchor; "now" injected everywhere.
  const RECEIVED = '2026-06-01T09:30:00.000Z';

  it('adds calendar days (FIDIC default): 28 days from 2026-06-01 → 2026-06-29', () => {
    const r = computeDeadline(RECEIVED, 28, 'calendar', new Date('2026-06-01T00:00:00Z'));
    expect(r.mustRespondBy).toBe('2026-06-29');
    expect(r.remainingDays).toBe(28);
    expect(r.overdue).toBe(false);
  });

  it('ignores the time-of-day on both anchors (date-level math)', () => {
    const a = computeDeadline('2026-06-01T23:59:59Z', 7, 'calendar', new Date('2026-06-01T00:01:00Z'));
    const b = computeDeadline('2026-06-01T00:00:01Z', 7, 'calendar', new Date('2026-06-01T22:00:00Z'));
    expect(a.mustRespondBy).toBe('2026-06-08');
    expect(b.mustRespondBy).toBe('2026-06-08');
    expect(a.remainingDays).toBe(7);
    expect(b.remainingDays).toBe(7);
  });

  it('working mode skips the UAE weekend (Sat+Sun): 5 working days from Mon → next Mon', () => {
    // Mon 2026-06-01 + 5 working days = Tue..Fri (4) + Mon 08 (5th, Sat 06 + Sun 07 skipped).
    const r = computeDeadline('2026-06-01', 5, 'working', new Date('2026-06-01T00:00:00Z'));
    expect(r.mustRespondBy).toBe('2026-06-08');
    expect(r.remainingDays).toBe(7);
  });

  it('working mode handles receipt on a weekend (Sat → first working day counts from Mon)', () => {
    // Sat 2026-06-06 + 1 working day: Sun skipped, lands Mon 2026-06-08.
    const r = computeDeadline('2026-06-06', 1, 'working', new Date('2026-06-06T00:00:00Z'));
    expect(r.mustRespondBy).toBe('2026-06-08');
  });

  it('flags overdue with negative remainingDays', () => {
    const r = computeDeadline(RECEIVED, 7, 'calendar', new Date('2026-06-10T00:00:00Z'));
    expect(r.mustRespondBy).toBe('2026-06-08');
    expect(r.remainingDays).toBe(-2);
    expect(r.overdue).toBe(true);
  });

  it('zero days means due on the receipt date itself', () => {
    const r = computeDeadline(RECEIVED, 0, 'calendar', new Date('2026-06-01T00:00:00Z'));
    expect(r.mustRespondBy).toBe('2026-06-01');
    expect(r.remainingDays).toBe(0);
    expect(r.overdue).toBe(false);
  });

  it('rejects negative and non-integer day counts', () => {
    expect(() => computeDeadline(RECEIVED, -1)).toThrow(/non-negative integer/);
    expect(() => computeDeadline(RECEIVED, 3.5)).toThrow(/non-negative integer/);
  });

  it('rejects an unparseable receipt date', () => {
    expect(() => computeDeadline('not-a-date', 28)).toThrow(/invalid date/);
  });
});

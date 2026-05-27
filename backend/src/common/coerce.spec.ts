import { asDate, asFraction, asNumber, asString, toDateOnly } from './coerce';

describe('coerce.asString', () => {
  it('trims and rejects empty', () => {
    expect(asString('  hello ')).toBe('hello');
    expect(asString('   ')).toBeNull();
    expect(asString(null)).toBeNull();
    expect(asString(undefined)).toBeNull();
    expect(asString(42)).toBe('42');
  });
});

describe('coerce.asNumber', () => {
  it('parses numeric strings including thousands separators', () => {
    expect(asNumber('1,234.5')).toBe(1234.5);
    expect(asNumber(0)).toBe(0);
    expect(asNumber('abc')).toBeNull();
    expect(asNumber(null)).toBeNull();
    expect(asNumber(Number.POSITIVE_INFINITY)).toBeNull();
  });
});

describe('coerce.asFraction', () => {
  it('returns a fraction in [0,1]', () => {
    expect(asFraction(0.5)).toBe(0.5);
    expect(asFraction(50)).toBe(0.5);
    expect(asFraction(150)).toBe(1);
    expect(asFraction(-5)).toBe(0);
    expect(asFraction('25')).toBe(0.25);
    expect(asFraction(null)).toBeNull();
  });
});

describe('coerce.asDate / toDateOnly', () => {
  it('parses ISO and DD/MM/YYYY deterministically', () => {
    expect(toDateOnly(asDate('2026-05-20'))).toBe('2026-05-20');
    expect(toDateOnly(asDate('2026-05-20 08:00'))).toBe('2026-05-20');
    expect(toDateOnly(asDate('20/05/2026'))).toBe('2026-05-20');
    expect(toDateOnly(asDate('20-05-2026'))).toBe('2026-05-20');
  });

  it('rejects ambiguous and invalid values', () => {
    expect(asDate('not a date')).toBeNull();
    expect(asDate('')).toBeNull();
    expect(asDate(null)).toBeNull();
  });

  it('handles Excel serial date numbers', () => {
    // 2026-05-20 is Excel serial 46_162 (days since 1899-12-30).
    expect(toDateOnly(asDate(46162))).toBe('2026-05-20');
  });
});

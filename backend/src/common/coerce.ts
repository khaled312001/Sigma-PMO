/**
 * Deterministic value-coercion helpers shared by parsers, the normalizer, and
 * validation. Every coercion is pure and predictable — no locale guessing — so
 * the same input always yields the same canonical value (governance: the
 * pipeline is deterministic-first).
 */

export function asString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const str = String(value).trim();
  return str.length === 0 ? null : str;
}

export function asNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  // Strip thousands separators and surrounding whitespace; keep sign/decimal.
  const cleaned = String(value).trim().replace(/,/g, '');
  if (cleaned === '') return null;
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : null;
}

/** Coerce to a percentage fraction in [0, 1]. Accepts 0-1 or 0-100 inputs. */
export function asFraction(value: unknown): number | null {
  const num = asNumber(value);
  if (num === null) return null;
  const fraction = num > 1 ? num / 100 : num;
  if (fraction < 0) return 0;
  if (fraction > 1) return 1;
  return fraction;
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})/;
const DMY_DATE = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/;

/**
 * Parse a date from common, unambiguous formats only:
 *  - ISO `YYYY-MM-DD[...]`
 *  - `DD/MM/YYYY` or `DD-MM-YYYY` (Primavera/Excel exports)
 *  - a JS Date or Excel epoch number
 * Returns null if the value cannot be parsed deterministically.
 */
export function asDate(value: unknown): Date | null {
  if (value === null || value === undefined || value === '') return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;

  if (typeof value === 'number') {
    // Excel serial date (days since 1899-12-30).
    const epoch = Date.UTC(1899, 11, 30);
    const ms = epoch + value * 86_400_000;
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  const str = String(value).trim();
  if (str === '') return null;

  const iso = ISO_DATE.exec(str);
  if (iso) {
    const d = new Date(Date.UTC(+iso[1], +iso[2] - 1, +iso[3]));
    return Number.isNaN(d.getTime()) ? null : d;
  }

  const dmy = DMY_DATE.exec(str);
  if (dmy) {
    const d = new Date(Date.UTC(+dmy[3], +dmy[2] - 1, +dmy[1]));
    return Number.isNaN(d.getTime()) ? null : d;
  }

  return null;
}

/** Format a Date as `YYYY-MM-DD` (UTC) for MySQL DATE columns. */
export function toDateOnly(value: Date | null): string | null {
  if (!value) return null;
  return value.toISOString().slice(0, 10);
}

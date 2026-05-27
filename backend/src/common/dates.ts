/** Date utilities used by rules and reporting. All work in UTC. */

import { asDate } from './coerce';

export function parseIsoDate(value: unknown): Date | null {
  return asDate(value);
}

/** Whole-day difference `b - a` (UTC). Returns null if either side is invalid. */
export function daysBetween(a: unknown, b: unknown): number | null {
  const da = parseIsoDate(a);
  const db = parseIsoDate(b);
  if (!da || !db) return null;
  return Math.round((db.getTime() - da.getTime()) / 86_400_000);
}

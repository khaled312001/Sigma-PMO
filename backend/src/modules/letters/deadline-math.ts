/**
 * Deterministic FIDIC deadline math — post-meeting plan §3.5 step 4.
 *
 * «الموعد النهائي يُحسب حسابياً، مش بالذكاء الاصطناعي» — the persona may
 * IDENTIFY the clause and its day-count, but the date arithmetic itself is
 * plain code so it is reproducible, testable, and never hallucinated.
 *
 * FIDIC "days" are calendar days (1999 GC 1.1.3.9 / 2017 GC 1.1.31 both
 * define "day" as a calendar day) — `calendar` is therefore the default
 * mode. `working` mode exists for policy addons that override the contract
 * default; it skips the UAE weekend (Saturday + Sunday, per the 2022
 * federal workweek decree).
 *
 * All math is date-level in UTC so the result is independent of server
 * timezone. No LLM, no Date.now() hidden inside — `now` is an explicit
 * parameter (defaulted) so specs are deterministic.
 */

export type DeadlineMode = 'calendar' | 'working';

export interface DeadlineResult {
  /** ISO date (`YYYY-MM-DD`) the response is contractually due. */
  mustRespondBy: string;
  /** Whole days from `now` to the due date — negative means overdue. */
  remainingDays: number;
  /** Convenience flag: `remainingDays < 0`. */
  overdue: boolean;
}

const DAY_MS = 86_400_000;

/** Collapse any date/ISO string to a UTC midnight timestamp (date-level). */
function toUtcMidnight(value: string | Date): number {
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) {
    throw new Error(`computeDeadline: invalid date "${String(value)}"`);
  }
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

/** UAE weekend since 2022: Saturday (6) + Sunday (0). */
function isUaeWeekend(utcMidnight: number): boolean {
  const dow = new Date(utcMidnight).getUTCDay();
  return dow === 6 || dow === 0;
}

/**
 * Compute the must-respond-by date for a letter.
 *
 * @param receivedAt   when the letter was received (ISO string or Date) —
 *                     the countdown anchor. We use the draft's `createdAt`
 *                     because that is when the incoming letter entered the
 *                     system (plan §3.5: receipt date starts the clock).
 * @param deadlineDays the clause's day-count (e.g. 28 for Sub-Clause 20.1).
 *                     Must be a non-negative integer.
 * @param mode         `calendar` (FIDIC default) or `working` (skips
 *                     UAE Sat+Sun).
 * @param now          injected clock for deterministic tests.
 */
export function computeDeadline(
  receivedAt: string | Date,
  deadlineDays: number,
  mode: DeadlineMode = 'calendar',
  now: Date = new Date(),
): DeadlineResult {
  if (!Number.isInteger(deadlineDays) || deadlineDays < 0) {
    throw new Error(
      `computeDeadline: deadlineDays must be a non-negative integer, got ${String(deadlineDays)}`,
    );
  }

  const received = toUtcMidnight(receivedAt);
  let due = received;
  if (mode === 'calendar') {
    due = received + deadlineDays * DAY_MS;
  } else {
    let added = 0;
    while (added < deadlineDays) {
      due += DAY_MS;
      if (!isUaeWeekend(due)) added += 1;
    }
  }

  const today = toUtcMidnight(now);
  const remainingDays = Math.round((due - today) / DAY_MS);
  return {
    mustRespondBy: new Date(due).toISOString().slice(0, 10),
    remainingDays,
    overdue: remainingDays < 0,
  };
}

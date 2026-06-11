import { Injectable } from '@nestjs/common';

/**
 * One activity's earned-schedule-relevant numbers (subset of canonical Activity).
 * `budgetedCost` is the cost weight used to draw the cumulative PV curve; the
 * activity contributes its budget *linearly* between plannedStart..plannedFinish.
 */
export interface EsActivityInput {
  budgetedCost: number | null;
  plannedStart: string | null; // YYYY-MM-DD
  plannedFinish: string | null; // YYYY-MM-DD
}

export interface EarnedScheduleInput {
  projectPlannedStart: string | null;
  projectPlannedFinish: string | null;
  /** "As of" date; defaults to today when null. */
  dataDate: string | null;
  /** Current Earned Value (currency), already computed by EvmService. */
  ev: number;
  activities: EsActivityInput[];
}

export interface EarnedScheduleResult {
  /** Earned Schedule (months-equivalent expressed in DAYS): the time at which
   *  cumulative PV first equals current EV, interpolated on the PV curve. */
  es: number | null;
  /** Actual Time — days from project plannedStart to dataDate (or today). */
  at: number | null;
  /** Schedule Performance Index (time) — ES / AT. */
  spiT: number | null;
  /** Planned duration in days (plannedStart..plannedFinish). */
  plannedDurationDays: number | null;
  /** Forecast duration = plannedDuration / SPI(t), capped at 3× plan. */
  predictedDurationDays: number | null;
  /** plannedStart + predictedDuration, YYYY-MM-DD. */
  predictedCompletionDate: string | null;
  /** True when the 3× cap clamped the forecast (very poor performance). */
  capped: boolean;
  /** Human-readable bases for every derived number (audit trail). */
  basis: {
    es: string;
    at: string;
    spiT: string;
    predictedDuration: string;
    curvePoints: number;
  };
}

/**
 * EarnedScheduleService — pure, deterministic Earned-Schedule math (Lipke's
 * time-based extension of EVM, AACE 17R-97 forecasting). No LLM, no I/O.
 *
 * Method:
 *  1. Build a piecewise-linear cumulative Planned-Value curve over the project
 *     duration. Each activity adds its `budgetedCost` linearly across its
 *     plannedStart..plannedFinish window; the curve is sampled at every
 *     activity boundary (a monotonic, non-decreasing step-free curve).
 *  2. AT = days from project plannedStart to dataDate (or today).
 *  3. ES = the time-offset (days from project start) at which the cumulative PV
 *     curve first reaches the current EV, by linear interpolation between the
 *     two bracketing curve points.
 *  4. SPI(t) = ES / AT; predictedDuration = plannedDuration / SPI(t) (cap 3×);
 *     predictedCompletion = plannedStart + predictedDuration.
 */
@Injectable()
export class EarnedScheduleService {
  compute(input: EarnedScheduleInput): EarnedScheduleResult {
    const startMs = parseDate(input.projectPlannedStart);
    const finishMs = parseDate(input.projectPlannedFinish);
    const asOfMs = parseDate(input.dataDate) ?? Date.now();

    const emptyBasis = {
      es: 'no project plannedStart — ES undefined',
      at: 'no project plannedStart — AT undefined',
      spiT: 'ES or AT undefined',
      predictedDuration: 'SPI(t) undefined',
      curvePoints: 0,
    };
    if (startMs === null) {
      return {
        es: null, at: null, spiT: null, plannedDurationDays: null,
        predictedDurationDays: null, predictedCompletionDate: null, capped: false,
        basis: emptyBasis,
      };
    }

    const at = Math.max(0, daysBetween(startMs, asOfMs));
    const plannedDurationDays =
      finishMs !== null ? Math.max(0, daysBetween(startMs, finishMs)) : null;

    // ── Build the cumulative PV curve as (offsetDays, cumPV) points. ──
    // Sample at every activity boundary offset within [0, plannedDuration].
    const offsets = new Set<number>([0]);
    if (plannedDurationDays !== null) offsets.add(plannedDurationDays);
    const acts = input.activities
      .map((a) => ({
        budget: a.budgetedCost ?? 0,
        s: parseDate(a.plannedStart),
        f: parseDate(a.plannedFinish),
      }))
      .filter((a) => a.budget > 0 && a.s !== null);
    for (const a of acts) {
      offsets.add(clampOffset(daysBetween(startMs, a.s as number)));
      if (a.f !== null) offsets.add(clampOffset(daysBetween(startMs, a.f as number)));
    }
    const sortedOffsets = [...offsets].filter((o) => o >= 0).sort((x, y) => x - y);

    // Cumulative PV at a given day-offset: sum over activities of the fraction
    // of each activity's budget that should be planned-earned by that offset.
    const cumPvAt = (offset: number): number => {
      let pv = 0;
      for (const a of acts) {
        const aStart = clampOffset(daysBetween(startMs, a.s as number));
        const aFinish = a.f !== null ? clampOffset(daysBetween(startMs, a.f as number)) : aStart;
        const span = aFinish - aStart;
        if (offset <= aStart) continue;
        if (offset >= aFinish || span <= 0) { pv += a.budget; continue; }
        pv += a.budget * ((offset - aStart) / span);
      }
      return pv;
    };

    const curve = sortedOffsets.map((o) => ({ offset: o, pv: round2(cumPvAt(o)) }));

    // ── Interpolate ES: first offset where cumPV >= EV. ──
    const ev = Math.max(0, input.ev);
    let es: number | null = null;
    if (curve.length >= 2 && ev > 0) {
      const totalPv = curve[curve.length - 1].pv;
      if (ev >= totalPv) {
        es = curve[curve.length - 1].offset;
      } else {
        for (let i = 1; i < curve.length; i += 1) {
          const lo = curve[i - 1];
          const hi = curve[i];
          if (hi.pv >= ev) {
            const span = hi.pv - lo.pv;
            const frac = span > 0 ? (ev - lo.pv) / span : 0;
            es = round2(lo.offset + frac * (hi.offset - lo.offset));
            break;
          }
        }
      }
    } else if (ev <= 0) {
      es = 0;
    }

    const spiT = es !== null && at > 0 ? round3(es / at) : null;

    let predictedDurationDays: number | null = null;
    let capped = false;
    if (plannedDurationDays !== null && spiT !== null && spiT > 0) {
      const raw = plannedDurationDays / spiT;
      const cap = plannedDurationDays * 3;
      predictedDurationDays = Math.round(Math.min(raw, cap));
      capped = raw > cap;
    } else if (plannedDurationDays !== null && spiT === 0) {
      predictedDurationDays = plannedDurationDays * 3;
      capped = true;
    }

    const predictedCompletionDate =
      predictedDurationDays !== null
        ? toIsoDate(startMs + predictedDurationDays * DAY_MS)
        : null;

    return {
      es,
      at,
      spiT,
      plannedDurationDays,
      predictedDurationDays,
      predictedCompletionDate,
      capped,
      basis: {
        es:
          es === null
            ? 'EV is zero or PV curve has <2 points — ES undefined'
            : `Interpolated on the cumulative PV curve: first day-offset where cumulative planned value reaches EV ${round2(ev)}.`,
        at: `Days from project plannedStart (${input.projectPlannedStart}) to dataDate (${input.dataDate ?? 'today'}).`,
        spiT:
          spiT === null
            ? 'ES or AT undefined'
            : `SPI(t) = ES ${es} / AT ${at}.`,
        predictedDuration:
          predictedDurationDays === null
            ? 'planned duration or SPI(t) undefined'
            : `plannedDuration ${plannedDurationDays} / SPI(t) ${spiT}${capped ? ' (capped at 3× plan)' : ''}.`,
        curvePoints: curve.length,
      },
    };
  }
}

const DAY_MS = 24 * 60 * 60 * 1000;

function parseDate(d: string | null | undefined): number | null {
  if (!d) return null;
  const ms = Date.parse(d);
  return Number.isFinite(ms) ? ms : null;
}
function daysBetween(aMs: number, bMs: number): number {
  return (bMs - aMs) / DAY_MS;
}
function clampOffset(n: number): number {
  return n < 0 ? 0 : n;
}
function toIsoDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}
const round2 = (n: number): number => Math.round(n * 100) / 100;
const round3 = (n: number): number => Math.round(n * 1000) / 1000;

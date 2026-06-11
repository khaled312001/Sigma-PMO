import { Injectable } from '@nestjs/common';

/**
 * One activity's EVM-relevant numbers (subset of the canonical Activity).
 * Strings (the MySQL decimal driver returns strings) are coerced by the caller.
 */
export interface EvmActivityInput {
  budgetedCost: number | null;
  actualCost: number | null;
  plannedPctComplete: number | null; // [0,1]
  actualPctComplete: number | null; // [0,1]
}

/** Earned-Value Management result (PMI standard formulas). */
export interface EvmResult {
  /** Budget At Completion — Σ budgetedCost. */
  bac: number;
  /** Planned Value — Σ budgetedCost × plannedPct. */
  pv: number;
  /** Earned Value — Σ budgetedCost × actualPct. */
  ev: number;
  /** Actual Cost — Σ actualCost. */
  ac: number;
  /** Schedule Variance — EV − PV (negative = behind). */
  sv: number;
  /** Cost Variance — EV − AC (negative = over budget). */
  cv: number;
  /** Schedule Performance Index — EV / PV (1 = on plan). */
  spi: number | null;
  /** Cost Performance Index — EV / AC (1 = on budget). */
  cpi: number | null;
  /** Estimate At Completion — BAC / CPI. */
  eac: number | null;
  /** Estimate To Complete — EAC − AC. */
  etc: number | null;
  /** Variance At Completion — BAC − EAC. */
  vac: number | null;
  /** Activities that carried a budget (sample size for the indices). */
  costedActivityCount: number;
}

/**
 * EvmService — pure, deterministic Earned-Value math (Mr. Ayham's L4 EVM
 * indicators). No LLM, no I/O — the L4 analytics agent feeds it canonical
 * activity rows and gets back the standard PMI indicators. Unit-tested against
 * known-answer fixtures.
 */
@Injectable()
export class EvmService {
  compute(activities: EvmActivityInput[]): EvmResult {
    let bac = 0, pv = 0, ev = 0, ac = 0, costed = 0;
    for (const a of activities) {
      const budget = num(a.budgetedCost);
      const actual = num(a.actualCost);
      const planned = clamp01(num(a.plannedPctComplete));
      const earned = clamp01(num(a.actualPctComplete));
      if (budget > 0) costed += 1;
      bac += budget;
      pv += budget * planned;
      ev += budget * earned;
      ac += actual;
    }
    const sv = ev - pv;
    const cv = ev - ac;
    const spi = pv > 0 ? ev / pv : null;
    const cpi = ac > 0 ? ev / ac : null;
    const eac = cpi && cpi > 0 ? bac / cpi : null;
    const etc = eac !== null ? eac - ac : null;
    const vac = eac !== null ? bac - eac : null;
    return {
      bac: round(bac), pv: round(pv), ev: round(ev), ac: round(ac),
      sv: round(sv), cv: round(cv),
      spi: spi === null ? null : round3(spi),
      cpi: cpi === null ? null : round3(cpi),
      eac: eac === null ? null : round(eac),
      etc: etc === null ? null : round(etc),
      vac: vac === null ? null : round(vac),
      costedActivityCount: costed,
    };
  }
}

function num(v: number | string | null | undefined): number {
  if (v === null || v === undefined) return 0;
  const n = typeof v === 'string' ? Number.parseFloat(v) : v;
  return Number.isFinite(n) ? n : 0;
}
const clamp01 = (n: number): number => Math.max(0, Math.min(1, n));
const round = (n: number): number => Math.round(n * 100) / 100;
const round3 = (n: number): number => Math.round(n * 1000) / 1000;

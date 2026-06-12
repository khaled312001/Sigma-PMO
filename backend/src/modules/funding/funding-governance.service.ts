import { Injectable, Logger } from '@nestjs/common';

import { FundingFacility } from '../canonical/entities';
import { FinancialModelService } from '../feasibility/financial-model.service';
import { FundingService } from './funding.service';

/** A single funding governance finding (NOT persisted — funding owns no entity). */
export interface FundingFinding {
  type:
    | 'dscr-breach'
    | 'covenant-breach'
    | 'drawdown-exposure'
    | 'refinancing-risk'
    | 'funding-availability';
  severity: 'critical' | 'warning' | 'info';
  title: string;
  description: string;
  recommendation: string;
  /** References tying the finding back to its facility + computed quantum. */
  refs: Record<string, unknown>;
}

/** A modelled covenant inside FundingFacility.details.covenants. */
interface CovenantSpec {
  name?: string;
  metric?: string;
  /** '>=' | '<=' | '>' | '<' | '=' — direction the current value must satisfy. */
  operator?: string;
  threshold?: number;
  current?: number;
  unit?: string;
}

/** The composite funding-health result. */
export interface FundingHealthResult {
  projectKey: string;
  asOfDate: string;
  /** 0..100 composite. */
  score: number;
  status: 'green' | 'yellow' | 'orange' | 'red';
  components: {
    dscrHeadroom: number;
    covenantCompliance: number;
    refiRunway: number;
  };
  facilities: number;
  totals: {
    committed: number;
    drawn: number;
    repaid: number;
    undrawn: number;
    outstanding: number;
    utilizationPct: number | null;
  };
  narrative: string;
}

/**
 * FundingGovernanceService — the deterministic funding governance engine
 * (Mr. Ayham, 2026-06-12 active scope). Connects Revenue Governance to
 * Investment Governance: it reads a project's funding facilities and derives,
 * from explicit named formulas, the financing risk signals — DSCR breaches,
 * covenant breaches, drawdown exposure, refinancing-runway risk and undrawn
 * availability — plus a 0..100 funding-health composite. Pure deterministic
 * (every number from a named formula); the AI layer only narrates these later.
 * Findings are NOT persisted (this module owns no entity) — they are computed
 * on demand from the facility state.
 */
@Injectable()
export class FundingGovernanceService {
  private readonly logger = new Logger(FundingGovernanceService.name);

  /** Drawdown is "exposed" once utilization exceeds this fraction of the limit. */
  private static readonly DRAWDOWN_EXPOSURE_THRESHOLD = 0.9;
  /** Refinancing risk window: maturity within this many days of the as-of date. */
  private static readonly REFI_WINDOW_DAYS = 365;

  constructor(
    private readonly funding: FundingService,
    private readonly model: FinancialModelService,
  ) {}

  /**
   * Validate the funding position and return findings (not persisted). One pass
   * over every current facility raising the five deterministic signals. Pure —
   * `asOfDate` is the only time input (defaults to the deterministic platform
   * date), so the result is reproducible.
   */
  async validate(projectKey: string, asOfDate = '2026-06-12'): Promise<{
    projectKey: string;
    asOfDate: string;
    findings: FundingFinding[];
    facilitiesChecked: number;
  }> {
    const facilities = await this.funding.list(projectKey);
    const asOf = parseDate(asOfDate);
    const findings: FundingFinding[] = [];

    for (const f of facilities) {
      const amount = num(f.amount);
      const drawn = num(f.drawnAmount);
      const repaid = num(f.repaidAmount);
      const outstanding = Math.max(0, drawn - repaid);
      const label = `${f.businessKey} — ${f.name}`;

      // 1) DSCR breach: currentDscr < dscrCovenant.
      if (f.dscrCovenant !== null && f.currentDscr !== null && f.currentDscr < f.dscrCovenant) {
        const headroom = round4(f.currentDscr - f.dscrCovenant);
        findings.push({
          type: 'dscr-breach',
          severity: f.currentDscr < f.dscrCovenant * 0.9 ? 'critical' : 'warning',
          title: `DSCR covenant breach — ${label}`,
          description:
            `Current DSCR ${f.currentDscr.toFixed(2)}x is below the ${f.dscrCovenant.toFixed(2)}x covenant ` +
            `(headroom ${headroom.toFixed(2)}x). The facility is failing its debt-service-coverage test.`,
          recommendation:
            'Engage the lender on a covenant waiver/reset; protect cash by deferring discretionary spend, ' +
            'and re-test coverage against the revised revenue plan before the next measurement date.',
          refs: { businessKey: f.businessKey, currentDscr: f.currentDscr, dscrCovenant: f.dscrCovenant, headroom },
        });
      }

      // 2) Covenant breaches declared in details.covenants.
      for (const c of covenantsOf(f)) {
        const breach = covenantBreached(c);
        if (breach) {
          findings.push({
            type: 'covenant-breach',
            severity: 'warning',
            title: `Covenant breach: ${c.name ?? c.metric ?? 'covenant'} — ${label}`,
            description:
              `Covenant "${c.name ?? c.metric}" requires ${c.metric ?? 'metric'} ${c.operator ?? '>='} ${c.threshold}` +
              `${c.unit ? c.unit : ''}; current ${c.current}${c.unit ? c.unit : ''} fails the test.`,
            recommendation:
              'Notify the lender per the facility agreement, document the cure period, and prepare a remediation ' +
              'plan; an uncured financial covenant can trigger cross-default and acceleration.',
            refs: { businessKey: f.businessKey, covenant: c },
          });
        }
      }

      // 3) Drawdown exposure: drawn / amount > 0.9.
      const utilization = amount > 0 ? drawn / amount : 0;
      if (utilization > FundingGovernanceService.DRAWDOWN_EXPOSURE_THRESHOLD) {
        findings.push({
          type: 'drawdown-exposure',
          severity: utilization >= 1 ? 'critical' : 'warning',
          title: `High drawdown exposure (${(utilization * 100).toFixed(0)}%) — ${label}`,
          description:
            `Drawn ${money(drawn)} of a ${money(amount)} ${f.currency} facility ` +
            `(${(utilization * 100).toFixed(0)}% utilized). Remaining headroom ${money(Math.max(0, amount - drawn))} ${f.currency}.`,
          recommendation:
            'Confirm the remaining cost-to-complete is funded; if headroom is thin, arrange an upsize or a ' +
            'standby facility before the contingency is exhausted.',
          refs: { businessKey: f.businessKey, drawn, amount, utilizationPct: round4(utilization) },
        });
      }

      // 4) Refinancing risk: maturity within REFI_WINDOW_DAYS of as-of with outstanding > 0.
      if (f.maturityDate && outstanding > 0) {
        const maturity = parseDate(f.maturityDate);
        if (maturity) {
          const days = daysBetween(asOf, maturity);
          if (days <= FundingGovernanceService.REFI_WINDOW_DAYS) {
            findings.push({
              type: 'refinancing-risk',
              severity: days <= 90 ? 'critical' : 'warning',
              title: `Refinancing risk — ${label} matures in ${days}d`,
              description:
                `Facility matures ${f.maturityDate} (${days} day(s) from ${asOfDate}) with ${money(outstanding)} ` +
                `${f.currency} still outstanding. A refinancing/repayment plan is needed inside the ${FundingGovernanceService.REFI_WINDOW_DAYS}-day window.`,
              recommendation:
                'Launch the refinancing process now (term sheet, lender outreach) or schedule the repayment from ' +
                'operating cash/exit proceeds; do not let the maturity wall approach unhedged.',
              refs: { businessKey: f.businessKey, maturityDate: f.maturityDate, daysToMaturity: days, outstanding },
            });
          }
        }
      }

      // 5) Funding availability: undrawn = amount - drawn (informational signal).
      const undrawn = Math.max(0, amount - drawn);
      if (f.status === 'active' && undrawn > 0 && utilization <= FundingGovernanceService.DRAWDOWN_EXPOSURE_THRESHOLD) {
        findings.push({
          type: 'funding-availability',
          severity: 'info',
          title: `Undrawn availability ${money(undrawn)} ${f.currency} — ${label}`,
          description:
            `${money(undrawn)} ${f.currency} remains available to draw on this facility ` +
            `(${(utilization * 100).toFixed(0)}% utilized). This is the funding headroom backing the remaining programme.`,
          recommendation:
            'Hold the undrawn portion as committed liquidity against the cost-to-complete + contingency; ' +
            'avoid cancelling capacity that the schedule risk may still require.',
          refs: { businessKey: f.businessKey, undrawn, amount, drawn },
        });
      }
    }

    findings.sort((a, b) => SEV_ORDER[a.severity] - SEV_ORDER[b.severity]);
    this.logger.log(`Funding validation for ${projectKey} (asOf ${asOfDate}): ${findings.length} finding(s) across ${facilities.length} facility(ies).`);
    return { projectKey, asOfDate, findings, facilitiesChecked: facilities.length };
  }

  /**
   * Annual debt service for a facility via the amortizing annuity (reuses the
   * deterministic financial model). Returns 0 when the facility carries no
   * priced/tenored debt (e.g. equity / grant).
   */
  debtService(facility: FundingFacility): number {
    const principal = num(facility.amount);
    const rate = facility.interestRatePct;
    const years = facility.tenorYears;
    if (!rate || !years || rate <= 0 || years <= 0) return 0;
    return round2(this.model.annuity(principal, rate, years));
  }

  /**
   * Funding-health composite (0..100) + status. Three deterministic components
   * averaged with explicit weights:
   *   - dscrHeadroom (45%): how far DSCR sits above its covenant across debt
   *     facilities (mapped onto 0..1; at-covenant = 0.5, +0.4x or more = 1.0).
   *   - covenantCompliance (30%): share of declared covenants currently passing.
   *   - refiRunway (25%): time to the nearest at-risk maturity vs the refi
   *     window (full runway = 1.0, at/over the wall = 0.0).
   * Status thresholds: >=80 green, >=60 yellow, >=40 orange, else red. With no
   * facilities the position is "green" (nothing financed = nothing at risk),
   * with an explicit narrative.
   */
  async fundingHealth(projectKey: string, asOfDate = '2026-06-12'): Promise<FundingHealthResult> {
    const facilities = await this.funding.list(projectKey);
    const asOf = parseDate(asOfDate);

    const totals = this.totals(facilities);

    if (facilities.length === 0) {
      return {
        projectKey, asOfDate, score: 100, status: 'green',
        components: { dscrHeadroom: 1, covenantCompliance: 1, refiRunway: 1 },
        facilities: 0, totals,
        narrative: 'No funding facilities recorded — there is no financing risk to govern yet. Add the project’s debt/equity facilities to begin DSCR, covenant and refinancing monitoring.',
      };
    }

    // ── Component 1: DSCR headroom across debt facilities. ──
    const dscrFacilities = facilities.filter((f) => f.dscrCovenant !== null && f.currentDscr !== null);
    const dscrHeadroom = dscrFacilities.length
      ? avg(dscrFacilities.map((f) => {
          // headroom ratio: (current - covenant) mapped so covenant→0.5, +0.4→1.0, -0.4→0.1.
          const delta = (f.currentDscr as number) - (f.dscrCovenant as number);
          return clamp01(0.5 + delta);
        }))
      : 0.85; // no DSCR-tested debt → mostly-healthy default, not a false alarm.

    // ── Component 2: covenant compliance (declared covenants). ──
    const allCovenants = facilities.flatMap((f) => covenantsOf(f));
    const covenantCompliance = allCovenants.length
      ? allCovenants.filter((c) => !covenantBreached(c)).length / allCovenants.length
      : 1; // none declared → not penalized.

    // ── Component 3: refinancing runway (nearest at-risk maturity). ──
    const runwayDays = facilities
      .filter((f) => f.maturityDate && Math.max(0, num(f.drawnAmount) - num(f.repaidAmount)) > 0)
      .map((f) => daysBetween(asOf, parseDate(f.maturityDate as string)))
      .filter((d): d is number => d !== null);
    const nearest = runwayDays.length ? Math.min(...runwayDays) : null;
    const refiRunway = nearest === null
      ? 1
      : clamp01(nearest / FundingGovernanceService.REFI_WINDOW_DAYS);

    const components = {
      dscrHeadroom: round4(dscrHeadroom),
      covenantCompliance: round4(covenantCompliance),
      refiRunway: round4(refiRunway),
    };
    const composite = 0.45 * dscrHeadroom + 0.3 * covenantCompliance + 0.25 * refiRunway;
    const score = Math.round(clamp01(composite) * 100);
    const status: FundingHealthResult['status'] =
      score >= 80 ? 'green' : score >= 60 ? 'yellow' : score >= 40 ? 'orange' : 'red';

    const narrative = this.narrate(score, status, components, totals, nearest);
    this.logger.log(`Funding health for ${projectKey} (asOf ${asOfDate}): ${score}/100 (${status}).`);
    return { projectKey, asOfDate, score, status, components, facilities: facilities.length, totals, narrative };
  }

  // ── helpers ──

  private totals(facilities: FundingFacility[]): FundingHealthResult['totals'] {
    let committed = 0;
    let drawn = 0;
    let repaid = 0;
    for (const f of facilities) {
      committed += num(f.amount);
      drawn += num(f.drawnAmount);
      repaid += num(f.repaidAmount);
    }
    const undrawn = Math.max(0, committed - drawn);
    const outstanding = Math.max(0, drawn - repaid);
    return {
      committed: round2(committed),
      drawn: round2(drawn),
      repaid: round2(repaid),
      undrawn: round2(undrawn),
      outstanding: round2(outstanding),
      utilizationPct: committed > 0 ? round4(drawn / committed) : null,
    };
  }

  private narrate(
    score: number,
    status: string,
    c: FundingHealthResult['components'],
    totals: FundingHealthResult['totals'],
    nearestMaturityDays: number | null,
  ): string {
    const band = status === 'green' ? 'healthy' : status === 'yellow' ? 'watch' : status === 'orange' ? 'stressed' : 'critical';
    const util = totals.utilizationPct !== null ? `${(totals.utilizationPct * 100).toFixed(0)}% drawn` : 'no drawdown';
    const refi = nearestMaturityDays === null
      ? 'no near-term maturities'
      : `nearest maturity in ${nearestMaturityDays}d`;
    return (
      `Funding health ${score}/100 (${band}). ` +
      `DSCR headroom ${(c.dscrHeadroom * 100).toFixed(0)}%, covenant compliance ${(c.covenantCompliance * 100).toFixed(0)}%, ` +
      `refinancing runway ${(c.refiRunway * 100).toFixed(0)}%. ` +
      `Position: ${money(totals.committed)} committed, ${util}, ${money(totals.outstanding)} outstanding; ${refi}.`
    );
  }
}

// ── covenant evaluation ──

function covenantsOf(f: FundingFacility): CovenantSpec[] {
  const raw = (f.details as { covenants?: unknown } | null)?.covenants;
  return Array.isArray(raw) ? (raw as CovenantSpec[]) : [];
}

/** True when the covenant's current value fails its operator/threshold test. */
function covenantBreached(c: CovenantSpec): boolean {
  if (typeof c.current !== 'number' || typeof c.threshold !== 'number') return false;
  switch (c.operator ?? '>=') {
    case '>=': return c.current < c.threshold;
    case '>': return c.current <= c.threshold;
    case '<=': return c.current > c.threshold;
    case '<': return c.current >= c.threshold;
    case '=':
    case '==': return c.current !== c.threshold;
    default: return false;
  }
}

const SEV_ORDER: Record<FundingFinding['severity'], number> = { critical: 0, warning: 1, info: 2 };

// ── numeric + date utilities (deterministic, total) ──

const num = (v: unknown): number => {
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : 0;
};
const round2 = (n: number): number => Math.round(n * 100) / 100;
const round4 = (n: number): number => Math.round(n * 10000) / 10000;
const money = (n: number): string => round2(n).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
const clamp01 = (n: number): number => Math.max(0, Math.min(1, n));
const avg = (xs: number[]): number => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);

/** Parse an ISO date (YYYY-MM-DD) into a UTC Date; null when unparseable. */
function parseDate(s: string): Date {
  const d = new Date(`${s}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? new Date('2026-06-12T00:00:00Z') : d;
}

/** Whole days from `a` to `b` (positive when b is later). */
function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

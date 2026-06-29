import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';

import { FeasibilityAssessment } from '../canonical/entities/feasibility-assessment.entity';
import { FundingFacility } from '../canonical/entities/funding-facility.entity';
import { FinancialModelService } from '../feasibility/financial-model.service';

/**
 * A single bankability governance finding (NOT persisted — this module owns no
 * entity; it reads feasibility + funding canonical data).
 */
export interface BankabilityFinding {
  type:
    | 'dscr-below-covenant'
    | 'thin-coverage'
    | 'funding-gap'
    | 'leverage-exposure'
    | 'no-feasibility-basis';
  severity: 'critical' | 'warning' | 'info';
  title: string;
  description: string;
  recommendation: string;
  /** References tying the finding back to its source figures (audit trail). */
  refs: Record<string, unknown>;
}

/** One amortization row of the deterministic debt schedule. */
export interface DebtScheduleRow {
  year: number;
  openingBalance: number;
  payment: number;
  interest: number;
  principal: number;
  closingBalance: number;
}

/** The DSCR picture — model min/avg + the worst facility covenant headroom. */
export interface DscrSummary {
  /** Minimum DSCR from the latest feasibility model run (null when none). */
  modelMinDscr: number | null;
  /** Average DSCR from the latest feasibility model run (null when none). */
  modelAvgDscr: number | null;
  /** The minimum covenant required across active debt facilities (null = none). */
  requiredCovenant: number | null;
  /** Worst (current − covenant) headroom across facilities (null = none). */
  worstFacilityHeadroom: number | null;
  /** The DSCR the bankability verdict is measured against (model min, else facility current). */
  effectiveDscr: number | null;
}

/** CAPEX (uses) vs committed facilities (sources). */
export interface FundingRequirements {
  /** CAPEX envelope from the latest feasibility assessment (null when none). */
  capex: number | null;
  /** Debt the feasibility model assumed (null when none). */
  modelDebt: number | null;
  /** Equity the feasibility model assumed (null when none). */
  modelEquity: number | null;
  /** Sum of committed facility amounts on the project. */
  facilitiesCommitted: number;
  /** Sum drawn across facilities. */
  facilitiesDrawn: number;
  /** capex − facilitiesCommitted (positive = unfunded gap). */
  fundingGap: number | null;
  /** facilitiesCommitted / capex (null when no capex). */
  coverageRatio: number | null;
}

/** A readiness summary for an audience package (investor / lender). */
export interface PackageReadiness {
  audience: 'investor' | 'lender';
  /** 0..number of checks that pass. */
  itemsReady: number;
  itemsTotal: number;
  ready: boolean;
  checklist: Array<{ item: string; ready: boolean; value: string }>;
}

/** The composite bankability assessment. */
export interface BankabilityAssessment {
  projectKey: string;
  asOfDate: string;
  /** 0..100 composite. */
  score: number;
  /** bankable | bankable-with-conditions | not-bankable. */
  verdict: 'bankable' | 'bankable-with-conditions' | 'not-bankable';
  status: 'green' | 'yellow' | 'orange' | 'red';
  components: {
    dscrCoverage: number;
    fundingCoverage: number;
    leverageHeadroom: number;
  };
  dscr: DscrSummary;
  fundingRequirements: FundingRequirements;
  debtSchedule: DebtScheduleRow[];
  investorPackage: PackageReadiness;
  lenderPackage: PackageReadiness;
  feasibilityBasis: {
    assessmentId: string | null;
    level: number | null;
    recommendation: string | null;
    riskRating: string | null;
  } | null;
  facilities: number;
  narrative: string;
}

/**
 * BankabilityService — the deterministic Bankability Intelligence engine
 * (Mr. Ayham, 2026-06-13 full governance lifecycle). It transforms feasibility
 * outputs into a lender-ready package: it READS the latest FeasibilityAssessment
 * (NPV/IRR/DSCR/CAPEX) and the project's FundingFacility rows and derives, from
 * explicit named formulas, the DSCR picture, an annuity-based debt schedule,
 * funding requirements (CAPEX vs committed facilities), a 0..100 bankability
 * assessment + verdict, and investor/lender package readiness summaries. Pure
 * deterministic (every number from a named formula); the AI layer only narrates
 * these later. Owns no entity — nothing is persisted; outputs are computed on
 * demand from feasibility + funding state.
 */
@Injectable()
export class BankabilityService {
  private readonly logger = new Logger(BankabilityService.name);

  /** Bankability floor for DSCR when no facility covenant is declared. */
  private static readonly DEFAULT_DSCR_FLOOR = 1.2;
  /** Maximum prudent leverage (debt / CAPEX) before it strains bankability. */
  private static readonly MAX_LEVERAGE = 0.7;
  /** Funding coverage considered fully banked at/above this ratio. */
  private static readonly FULL_COVERAGE = 1.0;

  constructor(
    @InjectRepository(FeasibilityAssessment)
    private readonly assessments: Repository<FeasibilityAssessment>,
    @InjectRepository(FundingFacility)
    private readonly facilities: Repository<FundingFacility>,
    private readonly model: FinancialModelService,
  ) {}

  /**
   * The latest feasibility assessment that backs bankability for a project.
   * Project-scoped (Mr. Ayham acceptance 2026-06-28): an assessment stamped with
   * `projectBusinessKey = projectKey` is preferred so "bankability for P-1000"
   * uses the P-1000 opportunity assessment, NOT the globally-latest unrelated
   * run. When the project has no scoped assessment, falls back to the global
   * latest (project-agnostic rows, projectBusinessKey null). Within each scope,
   * Level-2 (the professional study run) wins, else the latest run of any level.
   * Deterministic: ordered by createdAt DESC, tie-broken by id.
   */
  private async latestAssessment(projectKey?: string): Promise<FeasibilityAssessment | null> {
    if (projectKey) {
      const scopedL2 = await this.assessments.find({
        where: { projectBusinessKey: projectKey, level: 2 },
        order: { createdAt: 'DESC' },
        take: 1,
      });
      if (scopedL2[0]) return scopedL2[0];
      const scopedAny = await this.assessments.find({
        where: { projectBusinessKey: projectKey },
        order: { createdAt: 'DESC' },
        take: 1,
      });
      if (scopedAny[0]) return scopedAny[0];
    }
    // Global fallback: latest project-agnostic assessment (no project scope set).
    const level2 = await this.assessments.find({
      where: { projectBusinessKey: IsNull(), level: 2 },
      order: { createdAt: 'DESC' },
      take: 1,
    });
    if (level2[0]) return level2[0];
    const any = await this.assessments.find({
      where: { projectBusinessKey: IsNull() },
      order: { createdAt: 'DESC' },
      take: 1,
    });
    return any[0] ?? null;
  }

  /** Current funding facilities for a project (mirrors FundingService.list). */
  private listFacilities(projectKey: string): Promise<FundingFacility[]> {
    return this.facilities.find({
      where: { projectBusinessKey: projectKey, isCurrent: true },
    });
  }

  // ──────────────────────── deterministic outputs ────────────────────────

  /** (1) DSCR picture from the feasibility model + facility covenants. */
  private dscrSummary(
    assessment: FeasibilityAssessment | null,
    facilities: FundingFacility[],
  ): DscrSummary {
    const results = (assessment?.results ?? {}) as { dscr?: { min?: unknown; avg?: unknown } };
    const modelMinDscr = numOrNull(results.dscr?.min);
    const modelAvgDscr = numOrNull(results.dscr?.avg);

    const debtFacilities = facilities.filter(
      (f) => f.facilityType !== 'equity' && f.facilityType !== 'grant',
    );
    const covenants = debtFacilities
      .map((f) => f.dscrCovenant)
      .filter((c): c is number => typeof c === 'number');
    const requiredCovenant = covenants.length ? Math.max(...covenants) : null;

    let worstFacilityHeadroom: number | null = null;
    let worstCurrent: number | null = null;
    for (const f of facilities) {
      if (f.currentDscr !== null && f.dscrCovenant !== null) {
        const headroom = round4(f.currentDscr - f.dscrCovenant);
        if (worstFacilityHeadroom === null || headroom < worstFacilityHeadroom) {
          worstFacilityHeadroom = headroom;
          worstCurrent = f.currentDscr;
        }
      }
    }

    // The DSCR the verdict is measured against: the feasibility model min (the
    // bankability-grade figure) when present, else the worst facility current.
    const effectiveDscr = modelMinDscr ?? worstCurrent;
    return { modelMinDscr, modelAvgDscr, requiredCovenant, worstFacilityHeadroom, effectiveDscr };
  }

  /**
   * (2) Annuity-based amortization schedule for the project's senior debt. Uses
   * the feasibility model's debt amount + the dominant facility's pricing/tenor
   * (falls back to the assessment's input pricing). Reuses the deterministic
   * financial model annuity + remainingBalance math.
   */
  private debtSchedule(
    assessment: FeasibilityAssessment | null,
    facilities: FundingFacility[],
  ): DebtScheduleRow[] {
    const inputs = (assessment?.inputs ?? {}) as Record<string, unknown>;
    const results = (assessment?.results ?? {}) as { debtAmount?: unknown };

    // Principal: prefer the model's debt amount; else the largest debt facility.
    const debtFacilities = facilities.filter(
      (f) => f.facilityType !== 'equity' && f.facilityType !== 'grant',
    );
    const facilityPrincipal = debtFacilities.reduce((s, f) => s + num(f.amount), 0);
    const principal = numOrNull(results.debtAmount) ?? facilityPrincipal;
    if (!principal || principal <= 0) return [];

    // Rate + tenor: prefer the dominant facility, else the assessment inputs.
    const dominant = [...debtFacilities].sort((a, b) => num(b.amount) - num(a.amount))[0];
    const rate =
      (dominant?.interestRatePct ?? null) !== null
        ? (dominant!.interestRatePct as number)
        : numOrNull(inputs.interestRatePct) ?? 0.06;
    const tenorYears =
      (dominant?.tenorYears ?? null) !== null
        ? (dominant!.tenorYears as number)
        : Math.round(numOrNull(inputs.tenorYears) ?? 15);

    if (tenorYears <= 0) return [];
    const payment = this.model.annuity(principal, rate, tenorYears);

    const rows: DebtScheduleRow[] = [];
    let balance = principal;
    for (let k = 1; k <= tenorYears; k += 1) {
      const interest = round2(balance * rate);
      const principalPaid = round2(payment - interest);
      const closing = round2(this.model.remainingBalance(principal, rate, tenorYears, k));
      rows.push({
        year: k,
        openingBalance: round2(balance),
        payment: round2(payment),
        interest,
        principal: principalPaid,
        closingBalance: Math.max(0, closing),
      });
      balance = closing;
    }
    return rows;
  }

  /** (3) Funding requirements: CAPEX (uses) vs committed facilities (sources). */
  private fundingRequirements(
    assessment: FeasibilityAssessment | null,
    facilities: FundingFacility[],
  ): FundingRequirements {
    const inputs = (assessment?.inputs ?? {}) as Record<string, unknown>;
    const results = (assessment?.results ?? {}) as { debtAmount?: unknown; equityAmount?: unknown };
    const capex = numOrNull(inputs.capex);
    const modelDebt = numOrNull(results.debtAmount);
    const modelEquity = numOrNull(results.equityAmount);

    let facilitiesCommitted = 0;
    let facilitiesDrawn = 0;
    for (const f of facilities) {
      facilitiesCommitted += num(f.amount);
      facilitiesDrawn += num(f.drawnAmount);
    }

    const fundingGap = capex !== null ? round2(capex - facilitiesCommitted) : null;
    const coverageRatio =
      capex !== null && capex > 0 ? round4(facilitiesCommitted / capex) : null;

    return {
      capex: capex !== null ? round2(capex) : null,
      modelDebt: modelDebt !== null ? round2(modelDebt) : null,
      modelEquity: modelEquity !== null ? round2(modelEquity) : null,
      facilitiesCommitted: round2(facilitiesCommitted),
      facilitiesDrawn: round2(facilitiesDrawn),
      fundingGap,
      coverageRatio,
    };
  }

  /** (5) Investor + Lender package readiness summaries. */
  private packages(
    assessment: FeasibilityAssessment | null,
    dscr: DscrSummary,
    req: FundingRequirements,
  ): { investor: PackageReadiness; lender: PackageReadiness } {
    const results = (assessment?.results ?? {}) as {
      npv?: unknown;
      projectIrr?: unknown;
      paybackYears?: unknown;
    };
    const npv = numOrNull(results.npv);
    const irr = numOrNull(results.projectIrr);
    const payback = numOrNull(results.paybackYears);
    const floor = dscr.requiredCovenant ?? BankabilityService.DEFAULT_DSCR_FLOOR;

    const investorChecklist = [
      { item: 'Feasibility study available', ready: assessment !== null, value: assessment ? `level ${assessment.level}` : 'none' },
      { item: 'NPV positive', ready: npv !== null && npv > 0, value: npv !== null ? money(npv) : '—' },
      { item: 'Project IRR present', ready: irr !== null, value: irr !== null ? `${(irr * 100).toFixed(1)}%` : '—' },
      { item: 'Payback within horizon', ready: payback !== null, value: payback !== null ? `${payback}y` : 'beyond' },
      { item: 'Risk rating acceptable', ready: assessment !== null && ['low', 'moderate'].includes(assessment.riskRating), value: assessment?.riskRating ?? '—' },
    ];

    const lenderChecklist = [
      { item: 'Feasibility study available', ready: assessment !== null, value: assessment ? `level ${assessment.level}` : 'none' },
      { item: `Effective DSCR ≥ ${floor.toFixed(2)}`, ready: dscr.effectiveDscr !== null && dscr.effectiveDscr >= floor, value: dscr.effectiveDscr !== null ? `${dscr.effectiveDscr.toFixed(2)}x` : '—' },
      { item: 'Debt schedule derivable', ready: (req.modelDebt ?? 0) > 0 || req.facilitiesCommitted > 0, value: money(req.modelDebt ?? req.facilitiesCommitted) },
      { item: 'Funding fully committed', ready: req.coverageRatio !== null && req.coverageRatio >= BankabilityService.FULL_COVERAGE, value: req.coverageRatio !== null ? `${(req.coverageRatio * 100).toFixed(0)}%` : '—' },
      { item: 'Leverage ≤ 70%', ready: this.leverage(req) !== null && (this.leverage(req) as number) <= BankabilityService.MAX_LEVERAGE, value: this.leverage(req) !== null ? `${((this.leverage(req) as number) * 100).toFixed(0)}%` : '—' },
    ];

    return {
      investor: this.readiness('investor', investorChecklist),
      lender: this.readiness('lender', lenderChecklist),
    };
  }

  /** Leverage = modelDebt / capex (the gearing the lender prices against). */
  private leverage(req: FundingRequirements): number | null {
    if (req.capex !== null && req.capex > 0 && req.modelDebt !== null) {
      return round4(req.modelDebt / req.capex);
    }
    return null;
  }

  private readiness(
    audience: 'investor' | 'lender',
    checklist: Array<{ item: string; ready: boolean; value: string }>,
  ): PackageReadiness {
    const itemsReady = checklist.filter((c) => c.ready).length;
    return { audience, itemsReady, itemsTotal: checklist.length, ready: itemsReady === checklist.length, checklist };
  }

  /**
   * Validate the bankability position and return findings (not persisted). Pure
   * — `asOfDate` is the only time input (defaults to the deterministic platform
   * date), so the result is reproducible.
   */
  async validate(projectKey: string, asOfDate = '2026-06-12'): Promise<{
    projectKey: string;
    asOfDate: string;
    findings: BankabilityFinding[];
    facilitiesChecked: number;
  }> {
    const [assessment, facilities] = await Promise.all([
      this.latestAssessment(projectKey),
      this.listFacilities(projectKey),
    ]);
    const findings: BankabilityFinding[] = [];

    if (!assessment) {
      findings.push({
        type: 'no-feasibility-basis',
        severity: 'warning',
        title: 'No feasibility basis for bankability',
        description:
          'No feasibility assessment is recorded, so DSCR, debt schedule and funding requirements cannot be derived into a lender-ready package.',
        recommendation:
          'Run a Level-2 feasibility study on the backing investment opportunity, then re-run bankability to produce the investor + lender packages.',
        refs: { assessment: null },
      });
    }

    const dscr = this.dscrSummary(assessment, facilities);
    const req = this.fundingRequirements(assessment, facilities);
    const floor = dscr.requiredCovenant ?? BankabilityService.DEFAULT_DSCR_FLOOR;

    // 1) DSCR below covenant (the headline bankability test).
    if (dscr.effectiveDscr !== null && dscr.effectiveDscr < floor) {
      const headroom = round4(dscr.effectiveDscr - floor);
      findings.push({
        type: 'dscr-below-covenant',
        severity: dscr.effectiveDscr < floor * 0.9 ? 'critical' : 'warning',
        title: `DSCR ${dscr.effectiveDscr.toFixed(2)}x below the ${floor.toFixed(2)}x bankability floor`,
        description:
          `The effective debt-service-coverage ratio ${dscr.effectiveDscr.toFixed(2)}x is below the ${floor.toFixed(2)}x ` +
          `${dscr.requiredCovenant !== null ? 'facility covenant' : 'default bankability floor'} (headroom ${headroom.toFixed(2)}x). ` +
          'Lenders will not size senior debt against coverage this thin.',
        recommendation:
          'Re-gear the structure: reduce debt quantum, extend tenor, or lift stabilized EBITDA in the feasibility model until the min DSCR clears the covenant.',
        refs: { effectiveDscr: dscr.effectiveDscr, floor, headroom, requiredCovenant: dscr.requiredCovenant },
      });
    } else if (dscr.effectiveDscr !== null && dscr.effectiveDscr < floor + 0.1) {
      // 2) Thin coverage: passes, but with < 0.10x headroom over the floor.
      findings.push({
        type: 'thin-coverage',
        severity: 'warning',
        title: `Thin DSCR headroom (${(dscr.effectiveDscr - floor).toFixed(2)}x over floor)`,
        description:
          `DSCR ${dscr.effectiveDscr.toFixed(2)}x clears the ${floor.toFixed(2)}x floor but with only ` +
          `${(dscr.effectiveDscr - floor).toFixed(2)}x of headroom — a modest revenue or rate shock would breach it.`,
        recommendation:
          'Stress the downside DSCR case and build a DSRA / cash-sweep into the term sheet before approaching lenders.',
        refs: { effectiveDscr: dscr.effectiveDscr, floor },
      });
    }

    // 3) Funding gap: committed facilities below the CAPEX envelope.
    if (req.fundingGap !== null && req.fundingGap > 0 && req.capex !== null && req.capex > 0) {
      const gapPct = round4(req.fundingGap / req.capex);
      findings.push({
        type: 'funding-gap',
        severity: gapPct > 0.25 ? 'critical' : 'warning',
        title: `Funding gap ${money(req.fundingGap)} (${(gapPct * 100).toFixed(0)}% of CAPEX)`,
        description:
          `Committed facilities ${money(req.facilitiesCommitted)} fall short of the ${money(req.capex)} CAPEX envelope ` +
          `by ${money(req.fundingGap)} (${(gapPct * 100).toFixed(0)}% uncommitted). The sources & uses do not yet balance.`,
        recommendation:
          'Close the gap before the lender package goes out: secure additional debt/equity commitments or de-scope CAPEX to match committed sources.',
        refs: { fundingGap: req.fundingGap, capex: req.capex, facilitiesCommitted: req.facilitiesCommitted, gapPct },
      });
    }

    // 4) Leverage exposure: model gearing above the prudent ceiling.
    const leverage = this.leverage(req);
    if (leverage !== null && leverage > BankabilityService.MAX_LEVERAGE) {
      findings.push({
        type: 'leverage-exposure',
        severity: leverage > 0.8 ? 'critical' : 'warning',
        title: `High leverage ${(leverage * 100).toFixed(0)}% (ceiling ${(BankabilityService.MAX_LEVERAGE * 100).toFixed(0)}%)`,
        description:
          `Model gearing is ${(leverage * 100).toFixed(0)}% debt of CAPEX, above the ${(BankabilityService.MAX_LEVERAGE * 100).toFixed(0)}% ` +
          'prudent bankability ceiling. Over-geared structures compress DSCR and raise refinancing risk.',
        recommendation:
          'Increase the equity contribution or reduce debt quantum to bring gearing to ≤70% before structuring the senior facility.',
        refs: { leverage, ceiling: BankabilityService.MAX_LEVERAGE, modelDebt: req.modelDebt, capex: req.capex },
      });
    }

    findings.sort((a, b) => SEV_ORDER[a.severity] - SEV_ORDER[b.severity]);
    this.logger.log(`Bankability validation for ${projectKey} (asOf ${asOfDate}): ${findings.length} finding(s) over ${facilities.length} facility(ies).`);
    return { projectKey, asOfDate, findings, facilitiesChecked: facilities.length };
  }

  /**
   * (4) Bankability assessment 0..100 + verdict. Three deterministic components
   * averaged with explicit weights:
   *   - dscrCoverage (45%): effective DSCR vs the floor (at-floor = 0.5,
   *     +0.5x or more = 1.0, −0.5x or worse = 0.0).
   *   - fundingCoverage (35%): committed facilities ÷ CAPEX, clamped 0..1.
   *   - leverageHeadroom (20%): how far gearing sits under the 70% ceiling
   *     (at-ceiling = 0.5, 0% debt = 1.0, 100% debt = 0.0).
   * Verdict: score ≥ 75 AND DSCR ≥ floor → bankable; score ≥ 50 →
   * bankable-with-conditions; else not-bankable. Status thresholds: ≥80 green,
   * ≥60 yellow, ≥40 orange, else red.
   */
  async assess(projectKey: string, asOfDate = '2026-06-12'): Promise<BankabilityAssessment> {
    const [assessment, facilities] = await Promise.all([
      this.latestAssessment(projectKey),
      this.listFacilities(projectKey),
    ]);

    const dscr = this.dscrSummary(assessment, facilities);
    const req = this.fundingRequirements(assessment, facilities);
    const debtSchedule = this.debtSchedule(assessment, facilities);
    const { investor, lender } = this.packages(assessment, dscr, req);
    const floor = dscr.requiredCovenant ?? BankabilityService.DEFAULT_DSCR_FLOOR;

    // ── Component 1: DSCR coverage. ──
    const dscrCoverage = dscr.effectiveDscr === null
      ? 0.5 // no DSCR basis → neutral, not a false pass or fail.
      : clamp01(0.5 + (dscr.effectiveDscr - floor)); // at-floor → 0.5, +0.5 → 1.0.

    // ── Component 2: funding coverage. ──
    const fundingCoverage = req.coverageRatio === null
      ? (facilities.length > 0 ? 0.6 : 0.4) // no CAPEX basis → mildly under.
      : clamp01(req.coverageRatio);

    // ── Component 3: leverage headroom. ──
    const leverage = this.leverage(req);
    const leverageHeadroom = leverage === null
      ? 0.7 // unknown gearing → mostly-healthy default.
      : clamp01(1 - leverage / (BankabilityService.MAX_LEVERAGE * 2)); // 0%→1.0, 70%→0.5, 140%→0.

    const components = {
      dscrCoverage: round4(dscrCoverage),
      fundingCoverage: round4(fundingCoverage),
      leverageHeadroom: round4(leverageHeadroom),
    };
    const composite = 0.45 * dscrCoverage + 0.35 * fundingCoverage + 0.2 * leverageHeadroom;
    const score = Math.round(clamp01(composite) * 100);

    const dscrPasses = dscr.effectiveDscr !== null && dscr.effectiveDscr >= floor;
    const verdict: BankabilityAssessment['verdict'] =
      score >= 75 && dscrPasses ? 'bankable'
      : score >= 50 ? 'bankable-with-conditions'
      : 'not-bankable';
    const status: BankabilityAssessment['status'] =
      score >= 80 ? 'green' : score >= 60 ? 'yellow' : score >= 40 ? 'orange' : 'red';

    const feasibilityBasis = assessment
      ? {
          assessmentId: assessment.id,
          level: assessment.level,
          recommendation: assessment.recommendation,
          riskRating: assessment.riskRating,
        }
      : null;

    const narrative = this.narrate(score, verdict, components, dscr, req, debtSchedule.length);
    this.logger.log(`Bankability for ${projectKey} (asOf ${asOfDate}): ${score}/100 (${verdict}).`);
    return {
      projectKey,
      asOfDate,
      score,
      verdict,
      status,
      components,
      dscr,
      fundingRequirements: req,
      debtSchedule,
      investorPackage: investor,
      lenderPackage: lender,
      feasibilityBasis,
      facilities: facilities.length,
      narrative,
    };
  }

  private narrate(
    score: number,
    verdict: string,
    c: BankabilityAssessment['components'],
    dscr: DscrSummary,
    req: FundingRequirements,
    scheduleRows: number,
  ): string {
    const dscrTxt = dscr.effectiveDscr === null ? 'no DSCR basis' : `effective DSCR ${dscr.effectiveDscr.toFixed(2)}x`;
    const cover = req.coverageRatio === null ? 'no CAPEX basis' : `${(req.coverageRatio * 100).toFixed(0)}% of CAPEX committed`;
    const gap = req.fundingGap !== null && req.fundingGap > 0 ? `, funding gap ${money(req.fundingGap)}` : '';
    return (
      `Bankability ${score}/100 (${verdict}). ` +
      `DSCR coverage ${(c.dscrCoverage * 100).toFixed(0)}%, funding coverage ${(c.fundingCoverage * 100).toFixed(0)}%, ` +
      `leverage headroom ${(c.leverageHeadroom * 100).toFixed(0)}%. ` +
      `Position: ${dscrTxt}, ${cover}${gap}; ${scheduleRows}-year debt schedule derived.`
    );
  }
}

// ── numeric utilities (deterministic, total) ──

const num = (v: unknown): number => {
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : 0;
};
const numOrNull = (v: unknown): number | null => {
  if (v === null || v === undefined) return null;
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : null;
};
const round2 = (n: number): number => Math.round(n * 100) / 100;
const round4 = (n: number): number => Math.round(n * 10000) / 10000;
const money = (n: number): string => round2(n).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
const clamp01 = (n: number): number => Math.max(0, Math.min(1, n));

const SEV_ORDER: Record<BankabilityFinding['severity'], number> = { critical: 0, warning: 1, info: 2 };

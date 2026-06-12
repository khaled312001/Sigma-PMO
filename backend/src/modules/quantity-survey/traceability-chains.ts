/**
 * Quantity Governance + Cost Governance traceability chains (Mr. Ayham,
 * 2026-06-12 follow-up). Sigma tracks every number through its full lifecycle
 * and, at each hop, computes the variance, raises findings, and keeps the
 * provenance needed to answer: where did the number originate, how/why did it
 * change, who approved it, and what evidence supports it.
 */

/**
 * The four governance dimensions. Revenue Governance (Mr. Ayham, 2026-06-12
 * follow-up) completes the transformation from Project Governance to
 * Investment Governance — governing not only what is spent (cost/quantity) but
 * what is earned (revenue) and how cash evolves (cashflow).
 */
export type LedgerDimension = 'quantity' | 'cost' | 'revenue' | 'cashflow';

/** The quantity governance chain — 9 stages, BIM → … → Paid. */
export const QUANTITY_STAGES = [
  'bim', 'boq', 'tender', 'procured', 'delivered', 'installed', 'claimed', 'certified', 'paid',
] as const;

/** The cost governance chain — 7 stages, Budget → … → Final. */
export const COST_STAGES = [
  'budget', 'tender', 'awarded', 'procurement', 'actual', 'forecast', 'final',
] as const;

/** The revenue governance chain — 7 stages, Forecast → … → Final Revenue. */
export const REVENUE_STAGES = [
  'rev_forecast', 'business_case', 'funding_model', 'actual_revenue', 'collections', 'rev_reforecast', 'rev_final',
] as const;

/** The cash-flow governance chain — Forecast → Actual → Variance → Reforecast. */
export const CASHFLOW_STAGES = [
  'cf_forecast', 'cf_actual', 'cf_variance', 'cf_reforecast', 'cf_final',
] as const;

export type QuantityStage = (typeof QUANTITY_STAGES)[number];
export type CostStage = (typeof COST_STAGES)[number];

export const STAGE_LABELS: Record<string, string> = {
  // quantity
  bim: 'BIM Quantity', boq: 'BOQ Quantity', tender: 'Tender Quantity', procured: 'Procured Quantity',
  delivered: 'Delivered Quantity', installed: 'Installed Quantity', claimed: 'Claimed Quantity',
  certified: 'Certified Quantity', paid: 'Paid Quantity',
  // cost
  budget: 'Budget Cost', awarded: 'Awarded Cost', procurement: 'Procurement Cost',
  actual: 'Actual Cost', forecast: 'Forecast Cost', final: 'Final Cost',
  // revenue
  rev_forecast: 'Revenue Forecast', business_case: 'Approved Business Case', funding_model: 'Funding Model',
  actual_revenue: 'Actual Revenue', collections: 'Collections', rev_reforecast: 'Forecast Revenue', rev_final: 'Final Revenue',
  // cashflow
  cf_forecast: 'Cash Flow Forecast', cf_actual: 'Actual Cash Flow', cf_variance: 'Variance Analysis',
  cf_reforecast: 'Reforecast Cash Flow', cf_final: 'Final Cash Flow',
};

/** Domain-appropriate Arabic labels for the lifecycle stages. */
export const STAGE_LABELS_AR: Record<string, string> = {
  // quantity
  bim: 'كمية النموذج (BIM)', boq: 'كمية جدول الكميات', tender: 'كمية المناقصة', procured: 'الكمية المشتراة',
  delivered: 'الكمية المورّدة', installed: 'الكمية المركّبة', claimed: 'الكمية المطالَب بها',
  certified: 'الكمية المعتمَدة', paid: 'الكمية المدفوعة',
  // cost
  budget: 'التكلفة التقديرية (الميزانية)', awarded: 'تكلفة الترسية', procurement: 'تكلفة التوريد',
  actual: 'التكلفة الفعلية', forecast: 'التكلفة المتوقعة', final: 'التكلفة النهائية',
  // revenue
  rev_forecast: 'الإيراد المتوقع', business_case: 'دراسة الجدوى المعتمدة', funding_model: 'نموذج التمويل',
  actual_revenue: 'الإيراد الفعلي', collections: 'التحصيلات', rev_reforecast: 'إعادة توقّع الإيراد', rev_final: 'الإيراد النهائي',
  // cashflow
  cf_forecast: 'التدفق النقدي المتوقع', cf_actual: 'التدفق النقدي الفعلي', cf_variance: 'تحليل الانحراف',
  cf_reforecast: 'إعادة توقّع التدفق', cf_final: 'التدفق النقدي النهائي',
};

export function stagesFor(dimension: LedgerDimension): readonly string[] {
  switch (dimension) {
    case 'quantity': return QUANTITY_STAGES;
    case 'cost': return COST_STAGES;
    case 'revenue': return REVENUE_STAGES;
    case 'cashflow': return CASHFLOW_STAGES;
    default: return [];
  }
}

export function isValidStage(dimension: LedgerDimension, stage: string): boolean {
  return stagesFor(dimension).includes(stage as never);
}

export function stageIndex(dimension: LedgerDimension, stage: string): number {
  return stagesFor(dimension).indexOf(stage as never);
}

/**
 * Per-hop variance tolerance: beyond `warn` → warning finding, beyond `crit` →
 * critical. Some hops are expected to match closely (paid vs certified must be
 * tight); others tolerate more (forecast vs actual). Documented per chain.
 */
export const HOP_TOLERANCE: Record<string, { warn: number; crit: number }> = {
  // quantity hops (keyed by the destination stage)
  boq: { warn: 0.1, crit: 0.25 },        // BOQ vs BIM
  procured: { warn: 0.1, crit: 0.2 },     // procured vs tender/BOQ
  delivered: { warn: 0.05, crit: 0.15 },  // delivered vs procured
  installed: { warn: 0.1, crit: 0.25 },   // installed vs delivered
  claimed: { warn: 0.08, crit: 0.2 },     // claimed vs installed (over-claim risk)
  certified: { warn: 0.05, crit: 0.12 },  // certified vs claimed
  paid: { warn: 0.02, crit: 0.05 },       // paid vs certified (must be tight)
  // cost hops
  awarded: { warn: 0.08, crit: 0.2 },
  procurement: { warn: 0.08, crit: 0.2 },
  actual: { warn: 0.1, crit: 0.25 },
  final: { warn: 0.05, crit: 0.12 },
  // revenue hops
  business_case: { warn: 0.1, crit: 0.25 },     // business case vs forecast
  actual_revenue: { warn: 0.1, crit: 0.2 },     // actual vs funding-model plan
  collections: { warn: 0.05, crit: 0.15 },      // collections vs actual revenue (DSO risk)
  rev_reforecast: { warn: 0.1, crit: 0.25 },
  rev_final: { warn: 0.05, crit: 0.12 },
  // cashflow hops
  cf_actual: { warn: 0.1, crit: 0.25 },
  cf_reforecast: { warn: 0.1, crit: 0.25 },
  cf_final: { warn: 0.05, crit: 0.12 },
};

export const DEFAULT_TOLERANCE = { warn: 0.1, crit: 0.25 };

export function toleranceFor(stage: string): { warn: number; crit: number } {
  return HOP_TOLERANCE[stage] ?? DEFAULT_TOLERANCE;
}

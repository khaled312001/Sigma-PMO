'use client';

import { useCallback, useEffect, useState } from 'react';

import { AiAnalysisPanel } from '../../components/AiAnalysisPanel';
import { AuthGate } from '../../components/AuthGate';
import { GaugeChart } from '../../components/Charts';
import { GovernanceStatusBadge } from '../../components/GovernanceStatusBadge';
import { IconSparkles } from '../../components/Icons';
import { useToast } from '../../components/ToastProvider';
import { useI18n } from '../../lib/i18n';
import { useCurrentProjectKey } from '../../lib/project-context';
import { api } from '../../lib/api';
import { Button, Card, EmptyState, PageHeader, Pill, SeverityBadge } from '../../components/ui';

// ── Local API response types (the bankability surface owns these shapes) ──

interface DebtScheduleRow {
  year: number;
  openingBalance: number;
  payment: number;
  interest: number;
  principal: number;
  closingBalance: number;
}

interface PackageReadiness {
  audience: 'investor' | 'lender';
  itemsReady: number;
  itemsTotal: number;
  ready: boolean;
  checklist: Array<{ item: string; ready: boolean; value: string }>;
}

interface BankabilityAssessment {
  projectKey: string;
  asOfDate: string;
  score: number;
  verdict: 'bankable' | 'bankable-with-conditions' | 'not-bankable';
  status: 'green' | 'yellow' | 'orange' | 'red';
  components: { dscrCoverage: number; fundingCoverage: number; leverageHeadroom: number };
  dscr: {
    modelMinDscr: number | null;
    modelAvgDscr: number | null;
    requiredCovenant: number | null;
    worstFacilityHeadroom: number | null;
    effectiveDscr: number | null;
  };
  fundingRequirements: {
    capex: number | null;
    modelDebt: number | null;
    modelEquity: number | null;
    facilitiesCommitted: number;
    facilitiesDrawn: number;
    fundingGap: number | null;
    coverageRatio: number | null;
  };
  debtSchedule: DebtScheduleRow[];
  investorPackage: PackageReadiness;
  lenderPackage: PackageReadiness;
  feasibilityBasis: { assessmentId: string | null; level: number | null; recommendation: string | null; riskRating: string | null } | null;
  facilities: number;
  narrative: string;
}

interface BankabilityFinding {
  type: 'dscr-below-covenant' | 'thin-coverage' | 'funding-gap' | 'leverage-exposure' | 'no-feasibility-basis';
  severity: 'critical' | 'warning' | 'info';
  title: string;
  description: string;
  recommendation: string;
  refs: Record<string, unknown>;
}

export default function BankabilityRoute() {
  return (
    <AuthGate capability="canRunBankability" surface="Bankability Intelligence">
      <BankabilityPage />
    </AuthGate>
  );
}

function BankabilityPage() {
  const { lang } = useI18n();
  const ar = lang === 'ar';
  const projectKey = useCurrentProjectKey();
  const toast = useToast();
  const [assessment, setAssessment] = useState<BankabilityAssessment | null>(null);
  const [findings, setFindings] = useState<BankabilityFinding[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [asmt, finds] = await Promise.all([
        api<BankabilityAssessment>(`/bankability/assessment?projectKey=${encodeURIComponent(projectKey)}`),
        api<BankabilityFinding[]>(`/bankability/findings?projectKey=${encodeURIComponent(projectKey)}`),
      ]);
      setAssessment(asmt); setFindings(finds);
    } catch (e) {
      toast.error(ar ? 'تعذّر تحميل بيانات القابلية للتمويل البنكي' : 'Failed to load bankability data', (e as Error).message);
    }
  }, [projectKey, toast, ar]);

  useEffect(() => { void refresh(); }, [refresh]);

  const run = async () => {
    setBusy('gov');
    try {
      await api('/bankability/governance/run', { method: 'POST', body: JSON.stringify({ projectKey }) });
      toast.success(ar ? 'تم تشغيل حوكمة القابلية للتمويل البنكي' : 'Bankability governance complete');
      await refresh();
    } catch (e) {
      toast.error(ar ? 'فشل التشغيل' : 'Run failed', (e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={`Bankability Intelligence · ext.bankability · ${projectKey}`}
        title={ar ? 'القابلية للتمويل البنكي' : 'Bankability Intelligence'}
        description={ar
          ? 'تحويل مخرجات دراسة الجدوى إلى حزمة جاهزة للمُقرِض — نسبة تغطية خدمة الدين (DSCR) مقابل التعهّد، وجدول إطفاء الدين، ومتطلبات التمويل (الإنفاق الرأسمالي مقابل التسهيلات الملتزَمة)، وحكم القابلية للتمويل، وجاهزية حزمتي المستثمر والمُقرِض. يقرأ بيانات الجدوى والتمويل القائمة.'
          : 'Transform feasibility outputs into a lender-ready package — DSCR vs covenant, debt schedule, funding requirements (CAPEX vs committed facilities), a bankability verdict and investor + lender package readiness. Reads existing feasibility + funding data.'}
        actions={(
          <Button variant="success" size="sm" disabled={busy === 'gov'} onClick={run}>
            {busy === 'gov' ? (ar ? 'جارٍ…' : 'Running…') : (ar ? 'تشغيل حوكمة القابلية للتمويل' : 'Run bankability governance')}
          </Button>
        )}
      />

      {/* Bankability score + verdict + DSCR */}
      <div className="grid gap-6 lg:grid-cols-[auto,1fr]">
        <Card title={ar ? 'القابلية للتمويل البنكي' : 'Bankability'} hint={assessment ? `${ar ? 'حتى' : 'as of'} ${assessment.asOfDate}` : undefined}>
          {!assessment ? (
            <p className="text-sm text-slate-400">…</p>
          ) : (
            <div className="flex flex-col items-center gap-3">
              <GaugeChart
                value={assessment.score}
                max={100}
                width={220}
                label={`${assessment.score}`}
                hint={ar ? 'من 100' : 'of 100'}
              />
              <GovernanceStatusBadge status={assessment.status} />
              <VerdictPill verdict={assessment.verdict} ar={ar} />
              <div className="grid w-full grid-cols-3 gap-2">
                <Component label={ar ? 'تغطية DSCR' : 'DSCR coverage'} value={assessment.components.dscrCoverage} ar={ar} />
                <Component label={ar ? 'تغطية التمويل' : 'Funding'} value={assessment.components.fundingCoverage} ar={ar} />
                <Component label={ar ? 'هامش الرفع' : 'Leverage'} value={assessment.components.leverageHeadroom} ar={ar} />
              </div>
            </div>
          )}
        </Card>

        <Card title={ar ? 'متطلبات التمويل ونسبة DSCR' : 'Funding requirements & DSCR'} hint={assessment?.narrative}>
          {!assessment ? (
            <p className="text-sm text-slate-400">…</p>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <Stat label={ar ? 'الإنفاق الرأسمالي' : 'CAPEX'} value={m(assessment.fundingRequirements.capex)} />
                <Stat label={ar ? 'الملتزَم (تسهيلات)' : 'Committed'} value={m(assessment.fundingRequirements.facilitiesCommitted)} />
                <Stat
                  label={ar ? 'فجوة التمويل' : 'Funding gap'}
                  value={m(assessment.fundingRequirements.fundingGap)}
                  tone={(assessment.fundingRequirements.fundingGap ?? 0) > 0 ? 'amber' : 'emerald'}
                />
                <Stat label={ar ? 'دين النموذج' : 'Model debt'} value={m(assessment.fundingRequirements.modelDebt)} />
                <Stat label={ar ? 'حقوق ملكية النموذج' : 'Model equity'} value={m(assessment.fundingRequirements.modelEquity)} />
                <Stat
                  label={ar ? 'نسبة التغطية' : 'Coverage'}
                  value={p(assessment.fundingRequirements.coverageRatio)}
                  tone={(assessment.fundingRequirements.coverageRatio ?? 0) >= 1 ? 'emerald' : 'amber'}
                />
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Stat label={ar ? 'أدنى DSCR (نموذج)' : 'Min DSCR'} value={x(assessment.dscr.modelMinDscr)} tone={dscrTone(assessment.dscr.effectiveDscr, assessment.dscr.requiredCovenant)} />
                <Stat label={ar ? 'متوسط DSCR (نموذج)' : 'Avg DSCR'} value={x(assessment.dscr.modelAvgDscr)} />
                <Stat label={ar ? 'تعهّد مطلوب' : 'Covenant'} value={x(assessment.dscr.requiredCovenant)} />
                <Stat label={ar ? 'DSCR الفعّال' : 'Effective DSCR'} value={x(assessment.dscr.effectiveDscr)} tone={dscrTone(assessment.dscr.effectiveDscr, assessment.dscr.requiredCovenant)} />
              </div>
              {assessment.feasibilityBasis ? (
                <p className="text-xs text-slate-400">
                  {ar ? 'أساس الجدوى:' : 'Feasibility basis:'}{' '}
                  <span className="text-slate-200">{ar ? 'المستوى' : 'level'} {assessment.feasibilityBasis.level}</span>
                  {assessment.feasibilityBasis.recommendation ? <> · <Pill tone="violet">{String(assessment.feasibilityBasis.recommendation).replace(/_/g, ' ')}</Pill></> : null}
                  {assessment.feasibilityBasis.riskRating ? <> · <Pill tone="slate">{assessment.feasibilityBasis.riskRating}</Pill></> : null}
                </p>
              ) : (
                <p className="text-xs text-amber-300">{ar ? 'لا يوجد تقييم جدوى يدعم القابلية للتمويل — شغّل دراسة جدوى من المستوى الثاني أولاً.' : 'No feasibility assessment backs bankability — run a Level-2 study first.'}</p>
              )}
            </div>
          )}
        </Card>
      </div>

      {/* Package readiness */}
      {assessment && (
        <div className="grid gap-6 lg:grid-cols-2">
          <PackageCard pkg={assessment.investorPackage} title={ar ? 'حزمة المستثمر' : 'Investor package'} ar={ar} />
          <PackageCard pkg={assessment.lenderPackage} title={ar ? 'حزمة المُقرِض' : 'Lender package'} ar={ar} />
        </div>
      )}

      {/* Debt schedule */}
      <Card
        title={ar ? 'جدول إطفاء الدين' : 'Debt schedule'}
        hint={ar ? 'إطفاء سنوي قائم على القسط الثابت من نموذج الجدوى والتسهيلات' : 'Annuity-based annual amortization from the feasibility model + facilities'}
      >
        {!assessment || assessment.debtSchedule.length === 0 ? (
          <EmptyState
            title={ar ? 'لا يوجد جدول دين' : 'No debt schedule'}
            description={ar ? 'لا يوجد دين في نموذج الجدوى أو تسهيلات دين مسجّلة لاشتقاق جدول الإطفاء.' : 'No model debt or debt facilities recorded to derive an amortization schedule.'}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-slate-800 text-start text-[11px] uppercase tracking-wider text-slate-400">
                  <th className="px-2 py-2 text-start">{ar ? 'السنة' : 'Year'}</th>
                  <th className="px-2 py-2 text-end">{ar ? 'الرصيد الافتتاحي' : 'Opening'}</th>
                  <th className="px-2 py-2 text-end">{ar ? 'القسط' : 'Payment'}</th>
                  <th className="px-2 py-2 text-end">{ar ? 'الفائدة' : 'Interest'}</th>
                  <th className="px-2 py-2 text-end">{ar ? 'أصل الدين' : 'Principal'}</th>
                  <th className="px-2 py-2 text-end">{ar ? 'الرصيد الختامي' : 'Closing'}</th>
                </tr>
              </thead>
              <tbody>
                {assessment.debtSchedule.map((r) => (
                  <tr key={r.year} className="border-b border-slate-800/60 hover:bg-slate-900/50">
                    <td className="px-2 py-2 font-mono text-[11px] text-sky-300" dir="ltr">{r.year}</td>
                    <td className="px-2 py-2 text-end font-mono tabular-nums text-slate-200" dir="ltr">{r.openingBalance.toLocaleString()}</td>
                    <td className="px-2 py-2 text-end font-mono tabular-nums text-slate-200" dir="ltr">{r.payment.toLocaleString()}</td>
                    <td className="px-2 py-2 text-end font-mono tabular-nums text-amber-300" dir="ltr">{r.interest.toLocaleString()}</td>
                    <td className="px-2 py-2 text-end font-mono tabular-nums text-emerald-300" dir="ltr">{r.principal.toLocaleString()}</td>
                    <td className="px-2 py-2 text-end font-mono tabular-nums text-slate-200" dir="ltr">{r.closingBalance.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Findings */}
      {findings.length > 0 && (
        <Card title={ar ? 'نتائج حوكمة القابلية للتمويل' : 'Bankability governance findings'} hint={ar ? 'تُحسَب حتمياً من بيانات الجدوى والتمويل (غير مُخزَّنة)' : 'Computed deterministically from feasibility + funding state (not persisted)'}>
          <div className="space-y-2">
            {findings.map((f, i) => (
              <div key={`${f.type}-${i}`} className="rounded-lg border border-slate-700/70 bg-slate-900/60 px-3 py-2">
                <div className="flex flex-wrap items-center gap-2">
                  <SeverityBadge severity={f.severity} />
                  <GovernanceStatusBadge status={f.severity === 'critical' ? 'orange' : f.severity === 'warning' ? 'yellow' : 'green'} size="sm" showLabel={false} />
                  <Pill tone="slate">{findingTypeLabel(f.type, ar)}</Pill>
                  <span className="flex-1 text-sm font-semibold text-slate-100">{f.title}</span>
                </div>
                <p className="mt-1 text-xs text-slate-300">{f.description}</p>
                <p className="mt-1 text-xs text-sky-200"><IconSparkles className="me-1 inline h-3 w-3" />{f.recommendation}</p>
              </div>
            ))}
          </div>
        </Card>
      )}

      <AiAnalysisPanel endpoint="/bankability/ai-analysis" body={{ projectKey }} />
    </div>
  );
}

// ── small presentational pieces ──

function Component({ label, value, ar }: { label: string; value: number; ar: boolean }) {
  void ar;
  const tone = value >= 0.75 ? 'text-emerald-300' : value >= 0.5 ? 'text-amber-300' : 'text-rose-300';
  return (
    <div className="rounded-lg border border-slate-700/70 bg-slate-900/60 px-2 py-1.5 text-center">
      <p className="text-[9px] uppercase tracking-wider text-slate-400">{label}</p>
      <p className={`text-sm font-bold tabular-nums ${tone}`} dir="ltr">{(value * 100).toFixed(0)}%</p>
    </div>
  );
}

function Stat({ label, value, tone = 'slate' }: { label: string; value: string; tone?: 'slate' | 'emerald' | 'amber' | 'rose' }) {
  const color = tone === 'emerald' ? 'text-emerald-300' : tone === 'amber' ? 'text-amber-300' : tone === 'rose' ? 'text-rose-300' : 'text-slate-100';
  return (
    <div className="rounded-xl border border-slate-700/70 bg-slate-900/60 p-3">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{label}</p>
      <p className={`mt-1 text-base font-bold tabular-nums ${color}`} dir="ltr">{value}</p>
    </div>
  );
}

function VerdictPill({ verdict, ar }: { verdict: BankabilityAssessment['verdict']; ar: boolean }) {
  const map: Record<BankabilityAssessment['verdict'], { tone: 'emerald' | 'amber' | 'rose'; en: string; ar: string }> = {
    bankable: { tone: 'emerald', en: 'Bankable', ar: 'قابل للتمويل' },
    'bankable-with-conditions': { tone: 'amber', en: 'Bankable with conditions', ar: 'قابل للتمويل بشروط' },
    'not-bankable': { tone: 'rose', en: 'Not bankable', ar: 'غير قابل للتمويل' },
  };
  const v = map[verdict];
  return <Pill tone={v.tone}>{ar ? v.ar : v.en}</Pill>;
}

function PackageCard({ pkg, title, ar }: { pkg: PackageReadiness; title: string; ar: boolean }) {
  return (
    <Card
      title={title}
      hint={`${pkg.itemsReady}/${pkg.itemsTotal} ${ar ? 'جاهز' : 'ready'}`}
    >
      <div className="mb-2 flex items-center gap-2">
        <Pill tone={pkg.ready ? 'emerald' : 'amber'}>{pkg.ready ? (ar ? 'جاهزة' : 'ready') : (ar ? 'غير مكتملة' : 'incomplete')}</Pill>
      </div>
      <ul className="space-y-1">
        {pkg.checklist.map((c, i) => (
          <li key={`${c.item}-${i}`} className="flex items-center gap-2 text-xs">
            <Pill tone={c.ready ? 'emerald' : 'rose'}>{c.ready ? (ar ? 'نعم' : 'ok') : (ar ? 'لا' : 'no')}</Pill>
            <span className="flex-1 text-slate-300">{c.item}</span>
            <span className="font-mono tabular-nums text-slate-400" dir="ltr">{c.value}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

// ── label maps + formatters ──

function findingTypeLabel(t: BankabilityFinding['type'], ar: boolean): string {
  const map: Record<BankabilityFinding['type'], { en: string; ar: string }> = {
    'dscr-below-covenant': { en: 'DSCR', ar: 'DSCR' },
    'thin-coverage': { en: 'Thin cover', ar: 'تغطية ضعيفة' },
    'funding-gap': { en: 'Funding gap', ar: 'فجوة تمويل' },
    'leverage-exposure': { en: 'Leverage', ar: 'الرفع المالي' },
    'no-feasibility-basis': { en: 'No basis', ar: 'لا أساس' },
  };
  return ar ? map[t].ar : map[t].en;
}

const m = (n: number | null | undefined): string => (n === null || n === undefined ? '—' : `${(n / 1_000_000).toFixed(2)}M`);
const p = (n: number | null | undefined): string => (n === null || n === undefined ? '—' : `${(n * 100).toFixed(1)}%`);
const x = (n: number | null | undefined): string => (n === null || n === undefined ? '—' : `${n.toFixed(2)}x`);
const dscrTone = (eff: number | null, covenant: number | null): 'emerald' | 'amber' | 'rose' | 'slate' => {
  if (eff === null) return 'slate';
  const floor = covenant ?? 1.2;
  return eff < floor ? 'rose' : eff < floor + 0.1 ? 'amber' : 'emerald';
};

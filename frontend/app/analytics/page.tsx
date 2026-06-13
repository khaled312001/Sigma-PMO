'use client';

/**
 * /analytics — the L4 Analytics Agent surface (Mr. Ayham's Layer 4): EVM
 * indicators (SPI/CPI/EAC/VAC), productivity KPIs, schedule + cost forecast,
 * Earned Schedule (time-based forecasting), SPI/CPI trends and a whole-estate
 * portfolio roll-up. Deterministic — the numbers come from canonical rows.
 */

import { useCallback, useEffect, useState } from 'react';

import { AuthGate } from '../../components/AuthGate';
import { BarChart, GaugeChart, LineChart, CHART_PALETTE } from '../../components/Charts';
import { IconRefresh } from '../../components/Icons';
import { Card, EmptyState, ErrorBanner, PageHeader, Pill } from '../../components/ui';
import { api } from '../../lib/api';
import { useI18n } from '../../lib/i18n';
import { useCurrentProjectKey } from '../../lib/project-context';

interface EvmResult {
  bac: number; pv: number; ev: number; ac: number; sv: number; cv: number;
  spi: number | null; cpi: number | null; eac: number | null; etc: number | null; vac: number | null;
  costedActivityCount: number;
}
interface Productivity {
  activityCount: number; completedCount: number; inProgressCount: number; notStartedCount: number;
  avgPlannedPct: number; avgActualPct: number; progressDeltaPct: number; completionRate: number;
}
interface Forecast { scheduleHealth: 'on-track' | 'at-risk' | 'slipping'; projectedCostOverrunPct: number | null; note: string }
interface AnalyticsResult { nodeBusinessKey: string; evm: EvmResult; productivity: Productivity; forecast: Forecast }

interface EarnedScheduleResult {
  projectKey: string;
  es: number | null; at: number | null; spiT: number | null;
  plannedDurationDays: number | null; predictedDurationDays: number | null;
  predictedCompletionDate: string | null; capped: boolean;
  basis: { es: string; at: string; spiT: string; predictedDuration: string; curvePoints: number };
}

type TrendDirection = 'improving' | 'stable' | 'deteriorating';
interface TrendSeries {
  metric: 'spi' | 'cpi';
  points: Array<{ computedAt: string; value: number }>;
  slopePer30Days: number | null;
  direction: TrendDirection;
  latest: number | null;
}
interface TrendsResult {
  projectKey: string; sampleCount: number;
  history: Array<{ computedAt: string; spi: number | null; cpi: number | null }>;
  spi: TrendSeries; cpi: TrendSeries; basis: string;
}

interface PortfolioRow {
  projectKey: string; name: string;
  programBusinessKey: string | null; portfolioBusinessKey: string | null;
  pv: number; ev: number; ac: number; bac: number; spi: number | null; cpi: number | null;
}
interface PortfolioResult {
  projectCount: number;
  totals: { pv: number; ev: number; ac: number; bac: number };
  weightedSpi: number | null; weightedCpi: number | null;
  rows: PortfolioRow[]; basis: string;
}

export default function AnalyticsPageRoute() {
  return (
    <AuthGate capability="canEvaluateRules" surface="Analytics">
      <AnalyticsPage />
    </AuthGate>
  );
}

function money(n: number): string {
  return new Intl.NumberFormat('en', { maximumFractionDigits: 0 }).format(n);
}

const DIRECTION_TONE: Record<TrendDirection, 'emerald' | 'slate' | 'rose'> = {
  improving: 'emerald', stable: 'slate', deteriorating: 'rose',
};

const DIRECTION_LABEL: Record<TrendDirection, { en: string; ar: string }> = {
  improving: { en: 'improving', ar: 'في تحسّن' },
  stable: { en: 'stable', ar: 'مستقر' },
  deteriorating: { en: 'deteriorating', ar: 'في تدهور' },
};

const SCHEDULE_HEALTH_LABEL: Record<Forecast['scheduleHealth'], { en: string; ar: string }> = {
  'on-track': { en: 'on track', ar: 'ضمن المسار' },
  'at-risk': { en: 'at risk', ar: 'معرّض للخطر' },
  slipping: { en: 'slipping', ar: 'منزلق عن المسار' },
};

function AnalyticsPage() {
  const projectKey = useCurrentProjectKey();
  const { lang } = useI18n();
  const ar = lang === 'ar';
  const [tab, setTab] = useState<'project' | 'portfolio'>('project');

  const [data, setData] = useState<AnalyticsResult | null>(null);
  const [es, setEs] = useState<EarnedScheduleResult | null>(null);
  const [trends, setTrends] = useState<TrendsResult | null>(null);
  const [portfolio, setPortfolio] = useState<PortfolioResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!projectKey) return;
    setLoading(true);
    try {
      const q = `projectKey=${encodeURIComponent(projectKey)}`;
      const [r, e, t, p] = await Promise.all([
        api<AnalyticsResult>(`/analytics/evm?${q}`),
        api<EarnedScheduleResult>(`/analytics/earned-schedule?${q}`).catch(() => null),
        api<TrendsResult>(`/analytics/trends?${q}`).catch(() => null),
        api<PortfolioResult>(`/analytics/portfolio`).catch(() => null),
      ]);
      setData(r); setEs(e); setTrends(t); setPortfolio(p);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [projectKey]);

  useEffect(() => { void load(); }, [load]);

  const evm = data?.evm;
  const prod = data?.productivity;
  const fc = data?.forecast;
  const healthTone = fc?.scheduleHealth === 'slipping' ? 'rose' : fc?.scheduleHealth === 'at-risk' ? 'amber' : 'emerald';

  return (
    <div className="space-y-6" dir={ar ? 'rtl' : 'ltr'}>
      <PageHeader
        eyebrow={ar ? 'الطبقة 4 · التحليلات' : 'Layer 4 · Analytics'}
        title={ar ? 'التحليلات والقيمة المكتسبة' : 'Analytics & Earned Value'}
        description={
          ar
            ? 'مؤشرات القيمة المكتسبة الحتمية (SPI / CPI / EAC / VAC) والجدول المكتسب ومؤشرات الإنتاجية والاتجاهات إضافةً إلى تجميع المحفظة على مستوى المنشأة بالكامل — محسوبة من بنود الأنشطة المرجعية، دون أي نموذج لغوي.'
            : 'Deterministic EVM (SPI / CPI / EAC / VAC), Earned Schedule, productivity KPIs, trends and a ' +
              'whole-estate portfolio roll-up — computed from canonical activity rows, never an LLM.'
        }
        actions={
          <button type="button" onClick={load} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-200 hover:border-slate-500">
            <IconRefresh className="h-3.5 w-3.5" /> {ar ? 'تحديث' : 'Refresh'}
          </button>
        }
      />

      {/* Tabs */}
      <div className="flex gap-1 rounded-lg border border-slate-800 bg-slate-900/40 p-1 text-xs">
        {(['project', 'portfolio'] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`rounded-md px-3 py-1.5 font-medium transition ${
              tab === t ? 'bg-slate-800 text-slate-100' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {t === 'project' ? (ar ? 'هذا المشروع' : 'This project') : (ar ? 'المحفظة' : 'Portfolio')}
          </button>
        ))}
      </div>

      <ErrorBanner message={error} />

      {tab === 'portfolio' ? (
        <PortfolioSection portfolio={portfolio} loading={loading} ar={ar} />
      ) : loading ? (
        <Card><div className="h-40 animate-pulse rounded bg-slate-800/40" /></Card>
      ) : !evm ? (
        <EmptyState title={ar ? 'لا توجد تحليلات' : 'No analytics'} description={ar ? `لا توجد بيانات أنشطة لتحليلها للمشروع ${projectKey}.` : `No activity data to analyse for ${projectKey}.`} />
      ) : (
        <>
          {/* Forecast banner */}
          {fc && (
            <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-800 bg-slate-900/50 px-4 py-3">
              <Pill tone={healthTone}>{ar ? SCHEDULE_HEALTH_LABEL[fc.scheduleHealth].ar : SCHEDULE_HEALTH_LABEL[fc.scheduleHealth].en}</Pill>
              {fc.projectedCostOverrunPct !== null && (
                <span className="text-sm text-slate-200">
                  {ar
                    ? `${fc.projectedCostOverrunPct >= 0 ? 'تجاوز' : 'توفير'} التكلفة المتوقّع:`
                    : `Projected cost ${fc.projectedCostOverrunPct >= 0 ? 'overrun' : 'saving'}:`}{' '}
                  <strong className={fc.projectedCostOverrunPct >= 0 ? 'text-rose-300' : 'text-emerald-300'} dir="ltr">
                    {fc.projectedCostOverrunPct >= 0 ? '+' : ''}{fc.projectedCostOverrunPct}%
                  </strong>
                </span>
              )}
              <span className="text-xs text-slate-500">{fc.note}</span>
            </div>
          )}

          {/* Earned Schedule */}
          {es && <EarnedScheduleCard es={es} ar={ar} />}

          {/* EVM gauges */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Card title={ar ? 'أداء الجدول الزمني (SPI)' : 'Schedule Performance (SPI)'}>
              {evm.spi !== null ? (
                <GaugeChart value={Math.min(evm.spi, 1.5)} max={1.5} label={evm.spi.toFixed(3)} hint={evm.spi >= 1 ? (ar ? 'ضمن المسار أو متقدّم عليه' : 'on/ahead of schedule') : (ar ? 'متأخّر عن الجدول' : 'behind schedule')} />
              ) : <p className="text-sm text-slate-500">{ar ? 'لا يوجد خط أساس للقيمة المخطّطة.' : 'No planned-value baseline.'}</p>}
            </Card>
            <Card title={ar ? 'أداء التكلفة (CPI)' : 'Cost Performance (CPI)'}>
              {evm.cpi !== null ? (
                <GaugeChart value={Math.min(evm.cpi, 1.5)} max={1.5} label={evm.cpi.toFixed(3)} hint={evm.cpi >= 1 ? (ar ? 'ضمن الميزانية أو دونها' : 'on/under budget') : (ar ? 'تجاوز الميزانية' : 'over budget')} />
              ) : <p className="text-sm text-slate-500">{ar ? 'لا توجد بيانات تكلفة فعلية.' : 'No actual-cost data.'}</p>}
            </Card>
          </div>

          {/* Trends */}
          {trends && <TrendsCard trends={trends} ar={ar} />}

          {/* EVM money tiles */}
          <Card title={ar ? 'القيمة المكتسبة (بالعملة)' : 'Earned Value (currency)'}>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              {[
                { k: 'BAC', v: evm.bac, t: 'slate' },
                { k: 'PV', v: evm.pv, t: 'sky' },
                { k: 'EV', v: evm.ev, t: 'emerald' },
                { k: 'AC', v: evm.ac, t: 'amber' },
                { k: 'EAC', v: evm.eac, t: evm.vac !== null && evm.vac < 0 ? 'rose' : 'slate' },
                { k: 'VAC', v: evm.vac, t: evm.vac !== null && evm.vac < 0 ? 'rose' : 'emerald' },
              ].map((c) => (
                <div key={c.k} className="rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{c.k}</p>
                  <p className="mt-0.5 text-sm font-semibold tabular-nums text-slate-100" dir="ltr">
                    {c.v === null ? '—' : money(c.v)}
                  </p>
                </div>
              ))}
            </div>
            <p className="mt-2 text-[11px] text-slate-500">{ar ? `يستند هذا المؤشّر إلى ${evm.costedActivityCount} نشاطًا مُسعّرًا.` : `${evm.costedActivityCount} costed activit(ies) underpin these indices.`}</p>
          </Card>

          {/* Productivity */}
          {prod && (
            <Card title={ar ? 'الإنتاجية والتقدّم' : 'Productivity & progress'}>
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <BarChart
                  title={ar ? 'حالة الأنشطة' : 'Activity status'}
                  data={[
                    { label: ar ? 'مكتملة' : 'Completed', value: prod.completedCount, accent: '#10b981' },
                    { label: ar ? 'قيد التنفيذ' : 'In progress', value: prod.inProgressCount, accent: '#0ea5e9' },
                    { label: ar ? 'لم تبدأ' : 'Not started', value: prod.notStartedCount, accent: '#64748b' },
                  ]}
                />
                <div className="flex flex-col justify-center gap-2 text-sm text-slate-200">
                  <div className="flex items-center justify-between"><span className="text-slate-500">{ar ? 'متوسط المخطّط' : 'Avg planned'}</span><strong className="tabular-nums">{prod.avgPlannedPct}%</strong></div>
                  <div className="flex items-center justify-between"><span className="text-slate-500">{ar ? 'متوسط الفعلي' : 'Avg actual'}</span><strong className="tabular-nums">{prod.avgActualPct}%</strong></div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">{ar ? 'فارق التقدّم' : 'Progress delta'}</span>
                    <Pill tone={prod.progressDeltaPct >= 0 ? 'emerald' : 'rose'}>{prod.progressDeltaPct >= 0 ? '+' : ''}{prod.progressDeltaPct} {ar ? 'نقطة مئوية' : 'pp'}</Pill>
                  </div>
                  <div className="flex items-center justify-between"><span className="text-slate-500">{ar ? 'معدّل الإنجاز' : 'Completion rate'}</span><strong className="tabular-nums">{Math.round(prod.completionRate * 100)}%</strong></div>
                </div>
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

function EarnedScheduleCard({ es, ar }: { es: EarnedScheduleResult; ar: boolean }) {
  const spiTTone = es.spiT === null ? 'slate' : es.spiT >= 1 ? 'emerald' : es.spiT >= 0.9 ? 'amber' : 'rose';
  return (
    <Card title={ar ? 'الجدول المكتسب (تنبؤ زمني)' : 'Earned Schedule (time-based forecast)'}>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="flex items-center justify-center">
          {es.spiT !== null ? (
            <GaugeChart
              value={Math.min(es.spiT, 1.5)}
              max={1.5}
              label={es.spiT.toFixed(3)}
              hint={es.spiT >= 1 ? (ar ? 'متقدّم عن الجدول (زمنيًا)' : 'ahead of schedule (time)') : (ar ? 'متأخّر عن الجدول (زمنيًا)' : 'behind schedule (time)')}
              title="SPI(t)"
            />
          ) : (
            <p className="text-sm text-slate-500">{ar ? 'بيانات الجدول غير كافية لاحتساب SPI(t).' : 'Not enough schedule data to compute SPI(t).'}</p>
          )}
        </div>
        <div className="flex flex-col justify-center gap-2 text-sm text-slate-200">
          <div className="flex items-center justify-between">
            <span className="text-slate-500">{ar ? 'الجدول المكتسب (ES)' : 'Earned Schedule (ES)'}</span>
            <strong className="tabular-nums" dir="ltr">{es.es === null ? '—' : `${es.es} ${ar ? 'يوم' : 'd'}`}</strong>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-500">{ar ? 'الزمن الفعلي (AT)' : 'Actual Time (AT)'}</span>
            <strong className="tabular-nums" dir="ltr">{es.at === null ? '—' : `${es.at} ${ar ? 'يوم' : 'd'}`}</strong>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-500">SPI(t)</span>
            <Pill tone={spiTTone}>{es.spiT === null ? (ar ? 'غير متاح' : 'n/a') : es.spiT.toFixed(3)}</Pill>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-500">{ar ? 'المدّة المخطّطة' : 'Planned duration'}</span>
            <strong className="tabular-nums" dir="ltr">{es.plannedDurationDays === null ? '—' : `${es.plannedDurationDays} ${ar ? 'يوم' : 'd'}`}</strong>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-500">{ar ? 'المدّة المتوقّعة' : 'Predicted duration'}</span>
            <strong className="tabular-nums" dir="ltr">
              {es.predictedDurationDays === null ? '—' : `${es.predictedDurationDays} ${ar ? 'يوم' : 'd'}`}{es.capped ? (ar ? ' (مُقيّدة)' : ' (capped)') : ''}
            </strong>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-500">{ar ? 'الإنجاز المتوقّع' : 'Predicted completion'}</span>
            <strong className="tabular-nums" dir="ltr">{es.predictedCompletionDate ?? '—'}</strong>
          </div>
        </div>
      </div>
      <p className="mt-2 text-[11px] text-slate-500">{es.basis.es} {es.basis.predictedDuration}</p>
    </Card>
  );
}

function TrendsCard({ trends, ar }: { trends: TrendsResult; ar: boolean }) {
  if (trends.sampleCount < 2) {
    return (
      <Card title={ar ? 'اتجاهات SPI / CPI' : 'SPI / CPI trends'}>
        <p className="text-sm text-slate-500">
          {ar
            ? `لا تتوفّر سوى ${trends.sampleCount} لقطة تحليلية حتى الآن — يلزم وجود لقطتين على الأقل لرسم الاتجاه. أعد تشغيل وكيل التحليلات L4 على مدى الزمن لبناء السلسلة.`
            : `Only ${trends.sampleCount} analytics snapshot(s) so far — at least two are needed to plot a trend. Re-run the L4 analytics agent over time to build the series.`}
        </p>
      </Card>
    );
  }
  const spiPts = trends.spi.points.map((p, i) => ({ x: shortDate(p.computedAt, i), y: p.value }));
  const cpiPts = trends.cpi.points.map((p, i) => ({ x: shortDate(p.computedAt, i), y: p.value }));
  return (
    <Card title={ar ? 'اتجاهات SPI / CPI' : 'SPI / CPI trends'}>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="text-xs text-slate-400">SPI</span>
        <Pill tone={DIRECTION_TONE[trends.spi.direction]}>{ar ? DIRECTION_LABEL[trends.spi.direction].ar : DIRECTION_LABEL[trends.spi.direction].en}</Pill>
        {trends.spi.slopePer30Days !== null && (
          <span className="font-mono text-[10px] text-slate-500" dir="ltr">
            slope {trends.spi.slopePer30Days >= 0 ? '+' : ''}{trends.spi.slopePer30Days}/30d
          </span>
        )}
        <span className="mx-2 text-slate-700">·</span>
        <span className="text-xs text-slate-400">CPI</span>
        <Pill tone={DIRECTION_TONE[trends.cpi.direction]}>{ar ? DIRECTION_LABEL[trends.cpi.direction].ar : DIRECTION_LABEL[trends.cpi.direction].en}</Pill>
        {trends.cpi.slopePer30Days !== null && (
          <span className="font-mono text-[10px] text-slate-500" dir="ltr">
            slope {trends.cpi.slopePer30Days >= 0 ? '+' : ''}{trends.cpi.slopePer30Days}/30d
          </span>
        )}
      </div>
      <LineChart
        height={220}
        yLabel={ar ? 'المؤشّر' : 'index'}
        series={[
          { label: 'SPI', points: spiPts, accent: CHART_PALETTE.sky },
          { label: 'CPI', points: cpiPts, accent: CHART_PALETTE.emerald },
        ]}
      />
      <p className="mt-2 text-[11px] text-slate-500">{trends.basis}</p>
    </Card>
  );
}

function PortfolioSection({ portfolio, loading, ar }: { portfolio: PortfolioResult | null; loading: boolean; ar: boolean }) {
  if (loading) return <Card><div className="h-40 animate-pulse rounded bg-slate-800/40" /></Card>;
  if (!portfolio || portfolio.projectCount === 0) {
    return <EmptyState title={ar ? 'لا توجد بيانات للمحفظة' : 'No portfolio data'} description={ar ? 'لم يُعثر على مشاريع حالية ذات نشاط قابل للتحليل.' : 'No current projects with analysable activity were found.'} />;
  }
  return (
    <div className="space-y-4">
      {/* Weighted KPIs */}
      <Card title={ar ? 'مؤشرات أداء المحفظة (مرجّحة بالميزانية BAC)' : 'Portfolio KPIs (BAC-weighted)'}>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {[
            { k: ar ? 'المشاريع' : 'Projects', v: String(portfolio.projectCount) },
            { k: 'BAC', v: money(portfolio.totals.bac) },
            { k: 'PV', v: money(portfolio.totals.pv) },
            { k: 'EV', v: money(portfolio.totals.ev) },
            { k: 'AC', v: money(portfolio.totals.ac) },
            { k: ar ? 'SPI المرجّح' : 'Wtd SPI', v: portfolio.weightedSpi === null ? '—' : portfolio.weightedSpi.toFixed(3) },
          ].map((c) => (
            <div key={c.k} className="rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{c.k}</p>
              <p className="mt-0.5 text-sm font-semibold tabular-nums text-slate-100" dir="ltr">{c.v}</p>
            </div>
          ))}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-400">
          <span>{ar ? 'CPI المرجّح:' : 'Weighted CPI:'}</span>
          <Pill tone={portfolio.weightedCpi === null ? 'slate' : portfolio.weightedCpi >= 1 ? 'emerald' : 'rose'}>
            {portfolio.weightedCpi === null ? (ar ? 'غير متاح' : 'n/a') : portfolio.weightedCpi.toFixed(3)}
          </Pill>
        </div>
        <p className="mt-2 text-[11px] text-slate-500">{portfolio.basis}</p>
      </Card>

      {/* Per-project table */}
      <Card title={ar ? 'الأداء حسب المشروع' : 'Per-project performance'}>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-800 text-[10px] uppercase tracking-wider text-slate-500">
                <th className="py-2 pe-3 font-semibold">{ar ? 'المشروع' : 'Project'}</th>
                <th className="py-2 pe-3 text-right font-semibold">BAC</th>
                <th className="py-2 pe-3 text-right font-semibold">PV</th>
                <th className="py-2 pe-3 text-right font-semibold">EV</th>
                <th className="py-2 pe-3 text-right font-semibold">AC</th>
                <th className="py-2 pe-3 text-right font-semibold">SPI</th>
                <th className="py-2 text-right font-semibold">CPI</th>
              </tr>
            </thead>
            <tbody>
              {portfolio.rows.map((r) => (
                <tr key={r.projectKey} className="border-b border-slate-800/60">
                  <td className="py-2 pe-3">
                    <span className="text-slate-100">{r.name}</span>
                    <span className="ms-1 font-mono text-[10px] text-slate-500" dir="ltr">{r.projectKey}</span>
                  </td>
                  <td className="py-2 pe-3 text-right tabular-nums text-slate-300" dir="ltr">{money(r.bac)}</td>
                  <td className="py-2 pe-3 text-right tabular-nums text-slate-300" dir="ltr">{money(r.pv)}</td>
                  <td className="py-2 pe-3 text-right tabular-nums text-slate-300" dir="ltr">{money(r.ev)}</td>
                  <td className="py-2 pe-3 text-right tabular-nums text-slate-300" dir="ltr">{money(r.ac)}</td>
                  <td className="py-2 pe-3 text-right tabular-nums" dir="ltr">
                    <span className={indexTone(r.spi)}>{r.spi === null ? '—' : r.spi.toFixed(2)}</span>
                  </td>
                  <td className="py-2 text-right tabular-nums" dir="ltr">
                    <span className={indexTone(r.cpi)}>{r.cpi === null ? '—' : r.cpi.toFixed(2)}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function indexTone(v: number | null): string {
  if (v === null) return 'text-slate-500';
  if (v >= 1) return 'text-emerald-300';
  if (v >= 0.9) return 'text-amber-300';
  return 'text-rose-300';
}
function shortDate(iso: string, fallbackIdx: number): string {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return `#${fallbackIdx + 1}`;
  return new Date(ms).toISOString().slice(5, 10); // MM-DD
}

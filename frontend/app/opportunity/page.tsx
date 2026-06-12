'use client';

import { useCallback, useEffect, useState } from 'react';

import { AiAnalysisPanel } from '../../components/AiAnalysisPanel';
import { AuthGate } from '../../components/AuthGate';
import { GovernanceStatusBadge } from '../../components/GovernanceStatusBadge';
import { GaugeChart } from '../../components/Charts';
import { IconSparkles } from '../../components/Icons';
import { useToast } from '../../components/ToastProvider';
import { useI18n } from '../../lib/i18n';
import { useCurrentProjectKey } from '../../lib/project-context';
import { api } from '../../lib/api';
import { Button, Card, EmptyState, PageHeader, Pill } from '../../components/ui';

/* ---- Local response types (the /opportunity surface is owned by this page) ---- */

interface OpportunityScores {
  opportunityScore: number;
  marketAttractiveness: number;
  competitionScore: number;
  fundingAttractiveness: number;
  regulatoryComplexity: number;
  basis?: Record<string, string>;
  factors?: {
    sectorRiskScore?: number;
    hurdleIrrPct?: number;
    annualRevenueYieldPct?: number;
    marketStrength?: number;
    countryRisk?: number;
    costFactor?: number;
  };
}

interface ScreeningRecord {
  id: string;
  code: string;
  title: string;
  projectType: string;
  country: string | null;
  city: string | null;
  estimatedInvestment: string | null;
  currency: string;
  inputs: Record<string, unknown>;
  scores: OpportunityScores;
  opportunityScore: number;
  recommendation: string;
  governanceStatus: string;
  createdBy: string | null;
  createdAt?: string;
}

interface MarketSignal {
  score: number;
  band: 'low' | 'moderate' | 'high' | 'very_high';
  basis: string;
}

interface MarketSnapshot {
  projectType: string;
  projectTypeLabel: string;
  city: string | null;
  country: string | null;
  demand: MarketSignal;
  supply: MarketSignal;
  competition: MarketSignal;
  industryBenchmarks: {
    annualRevenueYieldPct: number;
    opexPctOfRevenue: number;
    costPerSqmBua: number;
    hurdleIrrPct: number;
    discountRatePct: number;
    terminalValueMultiple: number;
    basis: string;
  };
  trends: Array<{ signal: string; direction: 'up' | 'down' | 'flat'; note: string }>;
}

/* ----------------------------- Bilingual labels ----------------------------- */

const PROJECT_TYPE_LABELS: Record<string, { en: string; ar: string }> = {
  residential: { en: 'Residential', ar: 'سكني' },
  commercial_office: { en: 'Commercial office', ar: 'مكاتب تجارية' },
  retail: { en: 'Retail / mall', ar: 'تجزئة / مركز تسوق' },
  hospitality: { en: 'Hospitality / hotel', ar: 'ضيافة / فندق' },
  industrial: { en: 'Industrial', ar: 'صناعي' },
  logistics: { en: 'Logistics / warehousing', ar: 'لوجستيات / مستودعات' },
  healthcare: { en: 'Healthcare', ar: 'رعاية صحية' },
  education: { en: 'Education', ar: 'تعليمي' },
  mixed_use: { en: 'Mixed-use', ar: 'متعدد الاستخدامات' },
  infrastructure: { en: 'Infrastructure', ar: 'بنية تحتية' },
};

const REC_LABELS: Record<string, { en: string; ar: string; tone: 'emerald' | 'amber' | 'rose' }> = {
  proceed_to_feasibility: { en: 'Proceed to feasibility', ar: 'المضي إلى دراسة الجدوى', tone: 'emerald' },
  watchlist: { en: 'Watchlist', ar: 'قائمة المراقبة', tone: 'amber' },
  reject: { en: 'Reject', ar: 'رفض', tone: 'rose' },
};

const BAND_LABELS: Record<MarketSignal['band'], { en: string; ar: string; tone: 'emerald' | 'sky' | 'amber' | 'rose' }> = {
  very_high: { en: 'Very high', ar: 'مرتفع جداً', tone: 'emerald' },
  high: { en: 'High', ar: 'مرتفع', tone: 'sky' },
  moderate: { en: 'Moderate', ar: 'متوسط', tone: 'amber' },
  low: { en: 'Low', ar: 'منخفض', tone: 'rose' },
};

const TREND_LABELS: Record<string, { en: string; ar: string }> = {
  investability: { en: 'Investability', ar: 'جاذبية الاستثمار' },
  operating_margin: { en: 'Operating margin', ar: 'هامش التشغيل' },
  build_cost: { en: 'Build cost', ar: 'تكلفة البناء' },
  exit_value: { en: 'Exit value', ar: 'قيمة الخروج' },
};

export default function OpportunityRoute() {
  return (
    <AuthGate capability="canRunOpportunity" surface="Opportunity Intelligence">
      <OpportunityPage />
    </AuthGate>
  );
}

function OpportunityPage() {
  const { lang } = useI18n();
  const ar = lang === 'ar';
  const projectKey = useCurrentProjectKey();
  const toast = useToast();

  const [projectTypes, setProjectTypes] = useState<string[]>([]);
  const [screenings, setScreenings] = useState<ScreeningRecord[]>([]);
  const [market, setMarket] = useState<MarketSnapshot | null>(null);

  // Market-card selectors (also seed the form defaults).
  const [marketType, setMarketType] = useState('mixed_use');
  const [marketCity, setMarketCity] = useState('Dubai');
  const [marketCountry, setMarketCountry] = useState('UAE');

  const ptLabel = useCallback(
    (t: string) => (ar ? PROJECT_TYPE_LABELS[t]?.ar : PROJECT_TYPE_LABELS[t]?.en) ?? t,
    [ar],
  );

  const loadScreenings = useCallback(async () => {
    try {
      setScreenings(await api<ScreeningRecord[]>('/opportunity/screenings'));
    } catch (e) {
      toast.error(ar ? 'تعذّر تحميل الفرص' : 'Failed to load screenings', (e as Error).message);
    }
  }, [toast, ar]);

  const loadMarket = useCallback(async () => {
    try {
      const q = new URLSearchParams({ projectType: marketType });
      if (marketCity) q.set('city', marketCity);
      if (marketCountry) q.set('country', marketCountry);
      setMarket(await api<MarketSnapshot>(`/opportunity/market?${q.toString()}`));
    } catch (e) {
      toast.error(ar ? 'تعذّر تحميل بيانات السوق' : 'Failed to load market data', (e as Error).message);
    }
  }, [marketType, marketCity, marketCountry, toast, ar]);

  useEffect(() => {
    void (async () => {
      try {
        const res = await api<{ projectTypes: string[] }>('/opportunity/project-types');
        setProjectTypes(res.projectTypes);
      } catch {
        /* non-fatal — the form falls back to the label map keys */
      }
    })();
    void loadScreenings();
  }, [loadScreenings]);

  useEffect(() => {
    void loadMarket();
  }, [loadMarket]);

  const types = projectTypes.length ? projectTypes : Object.keys(PROJECT_TYPE_LABELS);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={`Opportunity Intelligence · ext.opportunity · ${projectKey}`}
        title={ar ? 'استخبارات الفرص الاستثمارية' : 'Opportunity Intelligence'}
        description={
          ar
            ? 'البوابة الأولى لدورة حياة الاستثمار: تقييم الفكرة حتمياً (0–100) قبل صرف أي جهد على دراسة الجدوى — جاذبية السوق والمنافسة والتمويل والتعقيد التنظيمي، ثم توصية بالمضي أو المراقبة أو الرفض.'
            : 'The first gate of the investment lifecycle: score an idea deterministically (0–100) before any feasibility effort is spent — market attractiveness, competition, funding and regulatory complexity, then a proceed / watchlist / reject recommendation.'
        }
      />

      {/* New screening */}
      <NewScreeningForm
        ar={ar}
        types={types}
        ptLabel={ptLabel}
        defaults={{ projectType: marketType, city: marketCity, country: marketCountry }}
        onCreated={async () => {
          await loadScreenings();
        }}
      />

      {/* Screenings list */}
      <Card
        title={ar ? 'الفرص المُقيَّمة' : 'Scored opportunities'}
        hint={ar ? 'كل درجة مشتقة من صيغة مُسمّاة على مكتبة افتراضات سيغما — قابلة للتكرار والتدقيق' : 'Every score derives from a named formula over the Sigma assumption library — reproducible and auditable'}
        actions={
          <Button variant="ghost" size="sm" onClick={() => void loadScreenings()}>
            {ar ? 'تحديث' : 'Refresh'}
          </Button>
        }
      >
        {screenings.length === 0 ? (
          <EmptyState
            title={ar ? 'لا توجد فرص مُقيَّمة بعد' : 'No opportunities scored yet'}
            description={ar ? 'أنشئ أول تقييم فرصة من النموذج أعلاه.' : 'Create your first screening from the form above.'}
          />
        ) : (
          <div className="space-y-3">
            {screenings.map((s) => (
              <ScreeningCard key={s.id} s={s} ar={ar} ptLabel={ptLabel} />
            ))}
          </div>
        )}
      </Card>

      {/* Market intelligence */}
      <Card
        title={ar ? 'استخبارات السوق' : 'Market Intelligence'}
        hint={ar ? 'الطلب والعرض والمنافسة ومعايير القطاع — لقطة حتمية من مكتبة الافتراضات' : 'Demand, supply, competition and industry benchmarks — a deterministic snapshot from the assumption library'}
      >
        <div className="mb-4 flex flex-wrap items-end gap-2">
          <Field label={ar ? 'نوع المشروع' : 'Project type'}>
            <select className={FIELD} value={marketType} onChange={(e) => setMarketType(e.target.value)}>
              {types.map((t) => (
                <option key={t} value={t}>
                  {ptLabel(t)}
                </option>
              ))}
            </select>
          </Field>
          <Field label={ar ? 'المدينة' : 'City'}>
            <input className={FIELD} value={marketCity} onChange={(e) => setMarketCity(e.target.value)} />
          </Field>
          <Field label={ar ? 'الدولة' : 'Country'}>
            <input className={FIELD} value={marketCountry} onChange={(e) => setMarketCountry(e.target.value)} />
          </Field>
          <Button variant="primary" size="sm" onClick={() => void loadMarket()}>
            {ar ? 'تحديث السوق' : 'Update market'}
          </Button>
        </div>

        {!market ? (
          <p className="text-sm text-slate-400">…</p>
        ) : (
          <MarketView market={market} ar={ar} ptLabel={ptLabel} />
        )}
      </Card>

      <AiAnalysisPanel endpoint="/opportunity/ai-analysis" body={{ projectKey, projectType: marketType, city: marketCity, country: marketCountry }} />
    </div>
  );
}

/* -------------------------------- Sub-views -------------------------------- */

function ScreeningCard({ s, ar, ptLabel }: { s: ScreeningRecord; ar: boolean; ptLabel: (t: string) => string }) {
  const rec = REC_LABELS[s.recommendation] ?? { en: s.recommendation, ar: s.recommendation, tone: 'slate' as const };
  const loc = [s.city, s.country].filter(Boolean).join(', ');
  const inv = s.estimatedInvestment ? Number(s.estimatedInvestment) : null;
  return (
    <div className="rounded-xl border border-slate-700/70 bg-slate-900/60 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs text-sky-300" dir="ltr">{s.code}</span>
            <span className="text-sm font-semibold text-slate-100">{s.title}</span>
            <GovernanceStatusBadge status={s.governanceStatus} size="sm" />
          </div>
          <p className="mt-0.5 text-xs text-slate-400">
            {ptLabel(s.projectType)}
            {loc && <> · {loc}</>}
            {inv != null && (
              <> · <span dir="ltr">{(inv / 1_000_000).toLocaleString(undefined, { maximumFractionDigits: 2 })}M {s.currency}</span></>
            )}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-end">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{ar ? 'درجة الفرصة' : 'Opportunity'}</p>
            <p className="text-2xl font-bold tabular-nums text-slate-50">{s.opportunityScore}</p>
          </div>
          <Pill tone={rec.tone}>
            <IconSparkles className="me-1 inline h-3 w-3" />
            {ar ? rec.ar : rec.en}
          </Pill>
        </div>
      </div>

      {/* Four pillars — the composite (above) + these four = the five sub-scores. */}
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <ScoreTile label={ar ? 'جاذبية السوق' : 'Market'} value={s.scores.marketAttractiveness} higherBetter />
        <ScoreTile label={ar ? 'الموقف التنافسي' : 'Competition'} value={s.scores.competitionScore} higherBetter hint={ar ? 'أعلى = منافسة أقل' : 'higher = less competition'} />
        <ScoreTile label={ar ? 'جاذبية التمويل' : 'Funding'} value={s.scores.fundingAttractiveness} higherBetter />
        <ScoreTile label={ar ? 'التعقيد التنظيمي' : 'Regulatory'} value={s.scores.regulatoryComplexity} higherBetter={false} hint={ar ? 'أعلى = أسوأ' : 'higher = worse'} />
      </div>
    </div>
  );
}

function ScoreTile({
  label,
  value,
  higherBetter,
  hint,
}: {
  label: string;
  value: number;
  higherBetter: boolean;
  hint?: string;
}) {
  // For "higher is worse" scores, invert the goodness test for the colour.
  const good = higherBetter ? value >= 60 : value <= 40;
  const mid = higherBetter ? value >= 45 : value <= 55;
  const tone = good ? 'emerald' : mid ? 'amber' : 'rose';
  const bar: Record<string, string> = { emerald: 'bg-emerald-500', amber: 'bg-amber-400', rose: 'bg-rose-500' };
  return (
    <div className="rounded-lg border border-slate-700/70 bg-slate-900/50 px-3 py-2">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{label}</p>
      <p className="mt-0.5 text-lg font-bold tabular-nums text-slate-100">{value}</p>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-800">
        <div className={`h-full ${bar[tone]}`} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
      </div>
      {hint && <p className="mt-1 text-[9px] text-slate-500">{hint}</p>}
    </div>
  );
}

function MarketView({ market, ar, ptLabel }: { market: MarketSnapshot; ar: boolean; ptLabel: (t: string) => string }) {
  const b = market.industryBenchmarks;
  const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
  const arrow = (d: 'up' | 'down' | 'flat') => (d === 'up' ? '▲' : d === 'down' ? '▼' : '—');
  const arrowTone = (d: 'up' | 'down' | 'flat') => (d === 'up' ? 'text-emerald-400' : d === 'down' ? 'text-rose-400' : 'text-slate-400');
  return (
    <div className="space-y-4">
      <p className="text-xs text-slate-400">
        {ptLabel(market.projectType)}
        {[market.city, market.country].filter(Boolean).length > 0 && <> · {[market.city, market.country].filter(Boolean).join(', ')}</>}
      </p>

      {/* Demand / supply / competition gauges */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <SignalGauge label={ar ? 'الطلب' : 'Demand'} sig={market.demand} ar={ar} />
        <SignalGauge label={ar ? 'العرض' : 'Supply'} sig={market.supply} ar={ar} />
        <SignalGauge label={ar ? 'المنافسة' : 'Competition'} sig={market.competition} ar={ar} />
      </div>

      {/* Industry benchmarks */}
      <div>
        <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">{ar ? 'معايير القطاع' : 'Industry benchmarks'}</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <Bench label={ar ? 'عائد الإيراد السنوي' : 'Annual revenue yield'} value={pct(b.annualRevenueYieldPct)} />
          <Bench label={ar ? 'التشغيل / الإيراد' : 'Opex / revenue'} value={pct(b.opexPctOfRevenue)} />
          <Bench label={ar ? 'التكلفة / م²' : 'Cost / m²'} value={`${b.costPerSqmBua.toLocaleString()} AED`} />
          <Bench label={ar ? 'عتبة العائد الداخلي' : 'Hurdle IRR'} value={pct(b.hurdleIrrPct)} />
          <Bench label={ar ? 'معدل الخصم' : 'Discount rate'} value={pct(b.discountRatePct)} />
          <Bench label={ar ? 'مضاعف الخروج' : 'Exit multiple'} value={`${b.terminalValueMultiple}×`} />
        </div>
        <p className="mt-1.5 text-[10px] text-slate-500">{b.basis}</p>
      </div>

      {/* Trend signals */}
      <div>
        <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">{ar ? 'إشارات الاتجاه' : 'Trend signals'}</p>
        <div className="flex flex-wrap gap-2">
          {market.trends.map((t) => (
            <div key={t.signal} className="flex items-center gap-2 rounded-lg border border-slate-700/70 bg-slate-900/50 px-3 py-1.5">
              <span className={`text-sm ${arrowTone(t.direction)}`}>{arrow(t.direction)}</span>
              <span className="text-xs font-semibold text-slate-200">{(ar ? TREND_LABELS[t.signal]?.ar : TREND_LABELS[t.signal]?.en) ?? t.signal}</span>
              <span className="text-[10px] text-slate-500" dir="ltr">{t.note}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function SignalGauge({ label, sig, ar }: { label: string; sig: MarketSignal; ar: boolean }) {
  const band = BAND_LABELS[sig.band];
  return (
    <div className="rounded-xl border border-slate-700/70 bg-slate-900/50 p-3 text-center">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{label}</p>
      <div className="mx-auto mt-1 w-28">
        <GaugeChart value={sig.score} max={100} />
      </div>
      <div className="mt-1">
        <Pill tone={band.tone}>{ar ? band.ar : band.en}</Pill>
      </div>
      <p className="mt-1.5 text-[9px] leading-tight text-slate-500" dir="ltr">{sig.basis}</p>
    </div>
  );
}

function Bench({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-700/70 bg-slate-900/50 px-3 py-2">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{label}</p>
      <p className="mt-0.5 text-sm font-bold tabular-nums text-slate-100" dir="ltr">{value}</p>
    </div>
  );
}

/* --------------------------------- Form ----------------------------------- */

const FIELD = 'rounded-lg border border-slate-700 bg-slate-900/70 px-3 py-2 text-sm text-slate-100';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="text-xs text-slate-400">
      {label}
      <div className="mt-1">{children}</div>
    </label>
  );
}

function NewScreeningForm({
  ar,
  types,
  ptLabel,
  defaults,
  onCreated,
}: {
  ar: boolean;
  types: string[];
  ptLabel: (t: string) => string;
  defaults: { projectType: string; city: string; country: string };
  onCreated: () => Promise<void>;
}) {
  const toast = useToast();
  const [title, setTitle] = useState('');
  const [projectType, setProjectType] = useState(defaults.projectType);
  const [city, setCity] = useState(defaults.city);
  const [country, setCountry] = useState(defaults.country);
  const [estimatedInvestment, setEstimatedInvestment] = useState('');
  const [businessObjective, setBusinessObjective] = useState('');
  const [fundingStructure, setFundingStructure] = useState('');
  const [busy, setBusy] = useState(false);
  const [lastResult, setLastResult] = useState<{ code: string; score: number; recommendation: string } | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      toast.error(ar ? 'العنوان مطلوب' : 'Title is required');
      return;
    }
    setBusy(true);
    try {
      const res = await api<{ screening: ScreeningRecord }>('/opportunity/screenings', {
        method: 'POST',
        body: JSON.stringify({
          title: title.trim(),
          projectType,
          city: city || null,
          country: country || null,
          estimatedInvestment: estimatedInvestment ? Number(estimatedInvestment) : null,
          businessObjective: businessObjective || null,
          fundingStructure: fundingStructure || null,
        }),
      });
      setLastResult({
        code: res.screening.code,
        score: res.screening.opportunityScore,
        recommendation: res.screening.recommendation,
      });
      toast.success(
        ar ? 'تم تقييم الفرصة' : 'Opportunity scored',
        `${res.screening.code} · ${res.screening.opportunityScore}/100`,
      );
      setTitle('');
      setEstimatedInvestment('');
      setBusinessObjective('');
      setFundingStructure('');
      await onCreated();
    } catch (err) {
      toast.error(ar ? 'فشل التقييم' : 'Screening failed', (err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const rec = lastResult ? REC_LABELS[lastResult.recommendation] : null;

  return (
    <Card
      title={ar ? 'تقييم فرصة جديدة' : 'New opportunity screening'}
      hint={ar ? 'يُحسب التقييم حتمياً ويُشغَّل وكيل ext.opportunity تلقائياً' : 'Scored deterministically; the ext.opportunity agent runs automatically'}
    >
      <form onSubmit={submit} className="space-y-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Field label={ar ? 'عنوان الفرصة' : 'Opportunity title'}>
            <input
              required
              className={`block w-full ${FIELD}`}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={ar ? 'مثال: برج سكني في الخليج التجاري' : 'e.g. Residential tower in Business Bay'}
            />
          </Field>
          <Field label={ar ? 'نوع المشروع' : 'Project type'}>
            <select className={`block w-full ${FIELD}`} value={projectType} onChange={(e) => setProjectType(e.target.value)}>
              {types.map((t) => (
                <option key={t} value={t}>
                  {ptLabel(t)}
                </option>
              ))}
            </select>
          </Field>
          <Field label={ar ? 'الاستثمار التقديري' : 'Estimated investment'}>
            <input
              type="number"
              min="0"
              className={`block w-full ${FIELD}`}
              value={estimatedInvestment}
              onChange={(e) => setEstimatedInvestment(e.target.value)}
              placeholder={ar ? 'بالعملة المحلية' : 'in local currency'}
              dir="ltr"
            />
          </Field>
          <Field label={ar ? 'المدينة' : 'City'}>
            <input className={`block w-full ${FIELD}`} value={city} onChange={(e) => setCity(e.target.value)} />
          </Field>
          <Field label={ar ? 'الدولة' : 'Country'}>
            <input className={`block w-full ${FIELD}`} value={country} onChange={(e) => setCountry(e.target.value)} />
          </Field>
          <Field label={ar ? 'هيكل التمويل' : 'Funding structure'}>
            <input
              className={`block w-full ${FIELD}`}
              value={fundingStructure}
              onChange={(e) => setFundingStructure(e.target.value)}
              placeholder={ar ? 'مثال: 60% دين / 40% حقوق ملكية' : 'e.g. 60% debt / 40% equity'}
            />
          </Field>
        </div>
        <Field label={ar ? 'الهدف التجاري' : 'Business objective'}>
          <input
            className={`block w-full ${FIELD}`}
            value={businessObjective}
            onChange={(e) => setBusinessObjective(e.target.value)}
            placeholder={ar ? 'ما الهدف من هذه الفرصة؟' : 'What is the objective of this opportunity?'}
          />
        </Field>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" variant="success" size="sm" disabled={busy}>
            {busy ? (ar ? 'جارٍ التقييم…' : 'Scoring…') : ar ? 'تقييم الفرصة' : 'Score opportunity'}
          </Button>
          {lastResult && rec && (
            <span className="inline-flex items-center gap-2 text-xs text-slate-300">
              <span className="font-mono text-sky-300" dir="ltr">{lastResult.code}</span>
              <span className="font-bold tabular-nums text-slate-100">{lastResult.score}/100</span>
              <Pill tone={rec.tone}>{ar ? rec.ar : rec.en}</Pill>
            </span>
          )}
        </div>
      </form>
    </Card>
  );
}

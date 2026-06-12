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

// ── Local API response types (the funding surface owns these shapes) ──

interface FundingFacilityRecord {
  id: string;
  businessKey: string;
  name: string;
  lenderName: string | null;
  facilityType: string;
  amount: string;
  currency: string;
  interestRatePct: number | null;
  tenorYears: number | null;
  drawnAmount: string;
  repaidAmount: string;
  dscrCovenant: number | null;
  currentDscr: number | null;
  maturityDate: string | null;
  status: string;
}

interface FundingHealth {
  projectKey: string;
  asOfDate: string;
  score: number;
  status: 'green' | 'yellow' | 'orange' | 'red';
  components: { dscrHeadroom: number; covenantCompliance: number; refiRunway: number };
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

interface FundingFinding {
  type: 'dscr-breach' | 'covenant-breach' | 'drawdown-exposure' | 'refinancing-risk' | 'funding-availability';
  severity: 'critical' | 'warning' | 'info';
  title: string;
  description: string;
  recommendation: string;
  refs: Record<string, unknown>;
}

const FACILITY_TYPES = ['senior-debt', 'mezzanine', 'equity', 'grant', 'revolving'] as const;

export default function FundingRoute() {
  return (
    <AuthGate capability="canRunFunding" surface="Funding Governance">
      <FundingPage />
    </AuthGate>
  );
}

function FundingPage() {
  const { lang } = useI18n();
  const ar = lang === 'ar';
  const projectKey = useCurrentProjectKey();
  const toast = useToast();
  const [facilities, setFacilities] = useState<FundingFacilityRecord[]>([]);
  const [health, setHealth] = useState<FundingHealth | null>(null);
  const [findings, setFindings] = useState<FundingFinding[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [fac, hlth, finds] = await Promise.all([
        api<FundingFacilityRecord[]>(`/funding/facilities?projectKey=${encodeURIComponent(projectKey)}`),
        api<FundingHealth>(`/funding/health?projectKey=${encodeURIComponent(projectKey)}`),
        api<FundingFinding[]>(`/funding/findings?projectKey=${encodeURIComponent(projectKey)}`),
      ]);
      setFacilities(fac); setHealth(hlth); setFindings(finds);
    } catch (e) {
      toast.error(ar ? 'تعذّر تحميل بيانات التمويل' : 'Failed to load funding data', (e as Error).message);
    }
  }, [projectKey, toast, ar]);

  useEffect(() => { void refresh(); }, [refresh]);

  const run = async () => {
    setBusy('gov');
    try {
      await api('/funding/governance/run', { method: 'POST', body: JSON.stringify({ projectKey }) });
      toast.success(ar ? 'تم تشغيل حوكمة التمويل' : 'Funding governance complete');
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
        eyebrow={`Funding Governance · ext.funding · ${projectKey}`}
        title={ar ? 'حوكمة التمويل' : 'Funding Governance'}
        description={ar
          ? 'حوكمة كيفية تمويل المشروع — التسهيلات التمويلية والسحوبات ونسبة تغطية خدمة الدين (DSCR) والتعهّدات ومخاطر إعادة التمويل. يربط حوكمة الإيرادات بحوكمة الاستثمار.'
          : 'Govern how the project is financed — facilities, drawdown, DSCR + covenant monitoring, debt service and refinancing risk. Connects Revenue Governance to Investment Governance.'}
        actions={(
          <Button variant="success" size="sm" disabled={busy === 'gov'} onClick={run}>
            {busy === 'gov' ? (ar ? 'جارٍ…' : 'Running…') : (ar ? 'تشغيل حوكمة التمويل' : 'Run funding governance')}
          </Button>
        )}
      />

      {/* Funding health + position */}
      <div className="grid gap-6 lg:grid-cols-[auto,1fr]">
        <Card title={ar ? 'صحة التمويل' : 'Funding Health'} hint={health ? `${ar ? 'حتى' : 'as of'} ${health.asOfDate}` : undefined}>
          {!health ? (
            <p className="text-sm text-slate-400">…</p>
          ) : (
            <div className="flex flex-col items-center gap-3">
              <GaugeChart
                value={health.score}
                max={100}
                width={220}
                label={`${health.score}`}
                hint={ar ? 'من 100' : 'of 100'}
              />
              <GovernanceStatusBadge status={health.status} />
              <div className="grid w-full grid-cols-3 gap-2">
                <Component label={ar ? 'هامش DSCR' : 'DSCR headroom'} value={health.components.dscrHeadroom} ar={ar} />
                <Component label={ar ? 'الامتثال للتعهّدات' : 'Covenants'} value={health.components.covenantCompliance} ar={ar} />
                <Component label={ar ? 'مدى إعادة التمويل' : 'Refi runway'} value={health.components.refiRunway} ar={ar} />
              </div>
            </div>
          )}
        </Card>

        <Card title={ar ? 'مركز التمويل' : 'Funding position'} hint={health?.narrative}>
          {!health ? (
            <p className="text-sm text-slate-400">…</p>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <Stat label={ar ? 'الملتزَم' : 'Committed'} value={m(health.totals.committed)} />
                <Stat label={ar ? 'المسحوب' : 'Drawn'} value={m(health.totals.drawn)} />
                <Stat label={ar ? 'المتاح (غير مسحوب)' : 'Undrawn'} value={m(health.totals.undrawn)} tone="emerald" />
                <Stat label={ar ? 'المسدّد' : 'Repaid'} value={m(health.totals.repaid)} />
                <Stat label={ar ? 'القائم' : 'Outstanding'} value={m(health.totals.outstanding)} tone="amber" />
                <Stat label={ar ? 'نسبة الاستخدام' : 'Utilization'} value={health.totals.utilizationPct !== null ? p(health.totals.utilizationPct) : '—'} />
              </div>
            </div>
          )}
        </Card>
      </div>

      {/* Facilities table */}
      <Card
        title={ar ? 'التسهيلات التمويلية' : 'Funding facilities'}
        hint={ar ? 'القرض/حقوق الملكية، المُقرِض، النوع، القيمة، المسحوب، DSCR مقابل التعهّد، الحالة' : 'Loan/equity, lender, type, amount, drawn, DSCR vs covenant, status'}
      >
        {facilities.length === 0 ? (
          <EmptyState
            title={ar ? 'لا توجد تسهيلات بعد' : 'No facilities yet'}
            description={ar ? 'أضف أول تسهيل تمويلي لبدء مراقبة DSCR والتعهّدات وإعادة التمويل.' : 'Add the first funding facility to begin DSCR, covenant and refinancing monitoring.'}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b border-slate-800 text-start text-[11px] uppercase tracking-wider text-slate-400">
                  <th className="px-2 py-2 text-start">{ar ? 'التسهيل' : 'Facility'}</th>
                  <th className="px-2 py-2 text-start">{ar ? 'المُقرِض' : 'Lender'}</th>
                  <th className="px-2 py-2 text-start">{ar ? 'النوع' : 'Type'}</th>
                  <th className="px-2 py-2 text-end">{ar ? 'القيمة' : 'Amount'}</th>
                  <th className="px-2 py-2 text-end">{ar ? 'المسحوب' : 'Drawn'}</th>
                  <th className="px-2 py-2 text-center">DSCR</th>
                  <th className="px-2 py-2 text-center">{ar ? 'الحالة' : 'Status'}</th>
                </tr>
              </thead>
              <tbody>
                {facilities.map((f) => {
                  const amount = num(f.amount);
                  const drawn = num(f.drawnAmount);
                  const util = amount > 0 ? drawn / amount : 0;
                  return (
                    <tr key={f.id} className="border-b border-slate-800/60 hover:bg-slate-900/50">
                      <td className="px-2 py-2">
                        <span className="font-mono text-[11px] text-sky-300" dir="ltr">{f.businessKey}</span>{' '}
                        <span className="font-medium text-slate-100">{f.name}</span>
                      </td>
                      <td className="px-2 py-2 text-slate-300">{f.lenderName ?? '—'}</td>
                      <td className="px-2 py-2"><Pill tone="violet">{facilityTypeLabel(f.facilityType, ar)}</Pill></td>
                      <td className="px-2 py-2 text-end font-mono tabular-nums text-slate-200" dir="ltr">{num(f.amount).toLocaleString()} {f.currency}</td>
                      <td className="px-2 py-2 text-end font-mono tabular-nums text-slate-200" dir="ltr">
                        {drawn.toLocaleString()}
                        <span className={`ms-1 text-[10px] ${util > 0.9 ? 'text-rose-300' : 'text-slate-500'}`}>({(util * 100).toFixed(0)}%)</span>
                      </td>
                      <td className="px-2 py-2 text-center"><DscrCell current={f.currentDscr} covenant={f.dscrCovenant} ar={ar} /></td>
                      <td className="px-2 py-2 text-center"><StatusPill status={f.status} ar={ar} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <div className="mt-3">
          <AddFacilityForm projectKey={projectKey} ar={ar} onDone={refresh} />
        </div>
      </Card>

      {/* Findings */}
      {findings.length > 0 && (
        <Card title={ar ? 'نتائج حوكمة التمويل' : 'Funding governance findings'} hint={ar ? 'تُحسَب حتمياً من حالة التسهيلات (غير مُخزَّنة)' : 'Computed deterministically from facility state (not persisted)'}>
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

      <AiAnalysisPanel endpoint="/funding/ai-analysis" body={{ projectKey }} />
    </div>
  );
}

// ── small presentational pieces ──

function Component({ label, value, ar }: { label: string; value: number; ar: boolean }) {
  const tone = value >= 0.75 ? 'text-emerald-300' : value >= 0.5 ? 'text-amber-300' : 'text-rose-300';
  return (
    <div className="rounded-lg border border-slate-700/70 bg-slate-900/60 px-2 py-1.5 text-center">
      <p className="text-[9px] uppercase tracking-wider text-slate-400">{label}</p>
      <p className={`text-sm font-bold tabular-nums ${tone}`} dir="ltr">{(value * 100).toFixed(0)}%</p>
    </div>
  );
}

function Stat({ label, value, tone = 'slate' }: { label: string; value: string; tone?: 'slate' | 'emerald' | 'amber' }) {
  const color = tone === 'emerald' ? 'text-emerald-300' : tone === 'amber' ? 'text-amber-300' : 'text-slate-100';
  return (
    <div className="rounded-xl border border-slate-700/70 bg-slate-900/60 p-3">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{label}</p>
      <p className={`mt-1 text-base font-bold tabular-nums ${color}`} dir="ltr">{value}</p>
    </div>
  );
}

function DscrCell({ current, covenant, ar }: { current: number | null; covenant: number | null; ar: boolean }) {
  if (current === null && covenant === null) return <span className="text-xs text-slate-500">—</span>;
  const breach = current !== null && covenant !== null && current < covenant;
  const tone = current === null ? 'slate' : covenant === null ? 'sky' : breach ? 'rose' : 'emerald';
  return (
    <span className="inline-flex flex-col items-center">
      <Pill tone={tone}>
        <span dir="ltr">{current !== null ? `${current.toFixed(2)}x` : '—'}{covenant !== null ? ` / ${covenant.toFixed(2)}x` : ''}</span>
      </Pill>
      {breach && <span className="mt-0.5 text-[9px] font-semibold text-rose-300">{ar ? 'مخالفة' : 'breach'}</span>}
    </span>
  );
}

function StatusPill({ status, ar }: { status: string; ar: boolean }) {
  const map: Record<string, { tone: 'emerald' | 'rose' | 'sky' | 'slate'; en: string; ar: string }> = {
    active: { tone: 'emerald', en: 'active', ar: 'نشط' },
    breached: { tone: 'rose', en: 'breached', ar: 'مخالف' },
    refinanced: { tone: 'sky', en: 'refinanced', ar: 'مُعاد تمويله' },
    closed: { tone: 'slate', en: 'closed', ar: 'مُغلق' },
  };
  const s = map[status] ?? { tone: 'slate' as const, en: status, ar: status };
  return <Pill tone={s.tone}>{ar ? s.ar : s.en}</Pill>;
}

function AddFacilityForm({ projectKey, ar, onDone }: { projectKey: string; ar: boolean; onDone: () => Promise<void> }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [lenderName, setLenderName] = useState('');
  const [facilityType, setFacilityType] = useState<(typeof FACILITY_TYPES)[number]>('senior-debt');
  const [amount, setAmount] = useState('');
  const [drawnAmount, setDrawnAmount] = useState('');
  const [interestRatePct, setInterestRatePct] = useState('');
  const [tenorYears, setTenorYears] = useState('');
  const [dscrCovenant, setDscrCovenant] = useState('');
  const [currentDscr, setCurrentDscr] = useState('');
  const [maturityDate, setMaturityDate] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api('/funding/facilities', {
        method: 'POST',
        body: JSON.stringify({
          projectKey,
          name,
          lenderName: lenderName || null,
          facilityType,
          amount: Number(amount),
          currency: 'AED',
          drawnAmount: drawnAmount ? Number(drawnAmount) : 0,
          interestRatePct: interestRatePct ? Number(interestRatePct) / 100 : null,
          tenorYears: tenorYears ? Number(tenorYears) : null,
          dscrCovenant: dscrCovenant ? Number(dscrCovenant) : null,
          currentDscr: currentDscr ? Number(currentDscr) : null,
          maturityDate: maturityDate || null,
        }),
      });
      toast.success(ar ? 'تمت إضافة التسهيل' : 'Facility added');
      setName(''); setLenderName(''); setAmount(''); setDrawnAmount('');
      setInterestRatePct(''); setTenorYears(''); setDscrCovenant(''); setCurrentDscr(''); setMaturityDate('');
      setOpen(false);
      await onDone();
    } catch (err) {
      toast.error(ar ? 'فشلت الإضافة' : 'Add failed', (err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const field = 'mt-1 block rounded-lg border border-slate-700 bg-slate-900/70 px-3 py-2 text-sm text-slate-100';

  if (!open) {
    return <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>{ar ? '+ إضافة تسهيل تمويلي' : '+ Add facility'}</Button>;
  }
  return (
    <form onSubmit={submit} className="grid grid-cols-1 gap-3 rounded-lg border border-slate-700/70 bg-slate-900/40 p-4 sm:grid-cols-2 lg:grid-cols-3">
      <label className="text-xs text-slate-400">{ar ? 'الاسم' : 'Name'}
        <input required className={field} value={name} onChange={(e) => setName(e.target.value)} placeholder={ar ? 'مثال: قرض الإنشاء الأقدم' : 'e.g. Senior construction loan'} />
      </label>
      <label className="text-xs text-slate-400">{ar ? 'المُقرِض' : 'Lender'}
        <input className={field} value={lenderName} onChange={(e) => setLenderName(e.target.value)} />
      </label>
      <label className="text-xs text-slate-400">{ar ? 'النوع' : 'Type'}
        <select className={field} value={facilityType} onChange={(e) => setFacilityType(e.target.value as (typeof FACILITY_TYPES)[number])}>
          {FACILITY_TYPES.map((t) => <option key={t} value={t}>{facilityTypeLabel(t, ar)}</option>)}
        </select>
      </label>
      <label className="text-xs text-slate-400">{ar ? 'القيمة (AED)' : 'Amount (AED)'}
        <input required type="number" min="0" step="any" className={field} value={amount} onChange={(e) => setAmount(e.target.value)} />
      </label>
      <label className="text-xs text-slate-400">{ar ? 'المسحوب (AED)' : 'Drawn (AED)'}
        <input type="number" min="0" step="any" className={field} value={drawnAmount} onChange={(e) => setDrawnAmount(e.target.value)} />
      </label>
      <label className="text-xs text-slate-400">{ar ? 'سعر الفائدة %' : 'Interest rate %'}
        <input type="number" min="0" step="any" className={field} value={interestRatePct} onChange={(e) => setInterestRatePct(e.target.value)} placeholder="6.5" />
      </label>
      <label className="text-xs text-slate-400">{ar ? 'المدة (سنوات)' : 'Tenor (years)'}
        <input type="number" min="0" step="1" className={field} value={tenorYears} onChange={(e) => setTenorYears(e.target.value)} />
      </label>
      <label className="text-xs text-slate-400">{ar ? 'تعهّد DSCR' : 'DSCR covenant'}
        <input type="number" min="0" step="any" className={field} value={dscrCovenant} onChange={(e) => setDscrCovenant(e.target.value)} placeholder="1.20" />
      </label>
      <label className="text-xs text-slate-400">{ar ? 'DSCR الحالي' : 'Current DSCR'}
        <input type="number" min="0" step="any" className={field} value={currentDscr} onChange={(e) => setCurrentDscr(e.target.value)} placeholder="1.35" />
      </label>
      <label className="text-xs text-slate-400">{ar ? 'تاريخ الاستحقاق' : 'Maturity date'}
        <input type="date" className={field} value={maturityDate} onChange={(e) => setMaturityDate(e.target.value)} dir="ltr" />
      </label>
      <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-1">
        <Button type="submit" variant="primary" disabled={busy}>{busy ? '…' : (ar ? 'إضافة' : 'Add facility')}</Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>{ar ? 'إلغاء' : 'Cancel'}</Button>
      </div>
    </form>
  );
}

// ── label maps + formatters ──

function facilityTypeLabel(t: string, ar: boolean): string {
  const map: Record<string, { en: string; ar: string }> = {
    'senior-debt': { en: 'Senior debt', ar: 'دين أقدم' },
    mezzanine: { en: 'Mezzanine', ar: 'تمويل وسيط' },
    equity: { en: 'Equity', ar: 'حقوق ملكية' },
    grant: { en: 'Grant', ar: 'منحة' },
    revolving: { en: 'Revolving', ar: 'متجدّد' },
  };
  const e = map[t];
  return e ? (ar ? e.ar : e.en) : t;
}

function findingTypeLabel(t: FundingFinding['type'], ar: boolean): string {
  const map: Record<FundingFinding['type'], { en: string; ar: string }> = {
    'dscr-breach': { en: 'DSCR', ar: 'DSCR' },
    'covenant-breach': { en: 'Covenant', ar: 'تعهّد' },
    'drawdown-exposure': { en: 'Drawdown', ar: 'سحب' },
    'refinancing-risk': { en: 'Refinancing', ar: 'إعادة تمويل' },
    'funding-availability': { en: 'Availability', ar: 'توافر' },
  };
  return ar ? map[t].ar : map[t].en;
}

const num = (v: string | number | null | undefined): number => {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? ''));
  return Number.isFinite(n) ? n : 0;
};
const m = (n: number | null | undefined): string => (n === null || n === undefined ? '—' : `${(n / 1_000_000).toFixed(2)}M`);
const p = (n: number | null | undefined): string => (n === null || n === undefined ? '—' : `${(n * 100).toFixed(1)}%`);

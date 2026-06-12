'use client';

import { useCallback, useEffect, useState } from 'react';

import { AiAnalysisPanel } from '../../components/AiAnalysisPanel';
import { AuthGate } from '../../components/AuthGate';
import { GovernanceStatusBadge } from '../../components/GovernanceStatusBadge';
import { IconSparkles } from '../../components/Icons';
import { useToast } from '../../components/ToastProvider';
import { useI18n } from '../../lib/i18n';
import { useCurrentProjectKey } from '../../lib/project-context';
import {
  api,
  ChainResponse,
  ChainsInfo,
  QsFindingRecord,
  RevenueImpact,
} from '../../lib/api';
import { Button, Card, EmptyState, PageHeader, Pill, SeverityBadge } from '../../components/ui';

export default function RevenueRoute() {
  return (
    <AuthGate capability="canRunRevenueGovernance" surface="Revenue Governance">
      <RevenuePage />
    </AuthGate>
  );
}

function RevenuePage() {
  const { lang } = useI18n();
  const ar = lang === 'ar';
  const projectKey = useCurrentProjectKey();
  const toast = useToast();
  const [chains, setChains] = useState<ChainsInfo | null>(null);
  const [revChain, setRevChain] = useState<ChainResponse | null>(null);
  const [impact, setImpact] = useState<RevenueImpact | null>(null);
  const [findings, setFindings] = useState<QsFindingRecord[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [ch, chain, imp, finds] = await Promise.all([
        api<ChainsInfo>('/revenue/chains'),
        api<ChainResponse>(`/revenue/chain?projectKey=${encodeURIComponent(projectKey)}&dimension=revenue&subjectKey=project`),
        api<RevenueImpact>(`/revenue/impact?projectKey=${encodeURIComponent(projectKey)}`),
        api<QsFindingRecord[]>(`/revenue/findings?projectKey=${encodeURIComponent(projectKey)}`),
      ]);
      setChains(ch); setRevChain(chain); setImpact(imp); setFindings(finds);
    } catch (e) { toast.error(ar ? 'تعذّر تحميل بيانات الإيراد' : 'Failed to load revenue data', (e as Error).message); }
  }, [projectKey, toast, ar]);

  useEffect(() => { void refresh(); }, [refresh]);

  const run = async () => {
    setBusy('gov');
    try {
      await api('/revenue/governance/run', { method: 'POST', body: JSON.stringify({ projectKey }) });
      toast.success(ar ? 'تم تشغيل حوكمة الإيراد' : 'Revenue governance complete');
      await refresh();
    } catch (e) { toast.error(ar ? 'فشل التشغيل' : 'Run failed', (e as Error).message); }
    finally { setBusy(null); }
  };

  const labelFor = (stage: string) => (ar ? chains?.revenue?.labelsAr?.[stage] : chains?.revenue?.labels?.[stage]) ?? stage;
  const m = (n: number | null | undefined) => (n === null || n === undefined ? '—' : `${(n / 1_000_000).toFixed(2)}M`);
  const p = (n: number | null | undefined) => (n === null || n === undefined ? '—' : `${(n * 100).toFixed(1)}%`);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={`Revenue Governance · ext.revenue_governance · ${projectKey}`}
        title={ar ? 'حوكمة الإيرادات والتدفق النقدي' : 'Revenue & Cash-Flow Governance'}
        description={ar
          ? 'حوكمة ما يُكتسَب لا ما يُنفَق فقط — سلسلة الإيراد من التوقع حتى النهائي، وأثر الانحراف على صافي القيمة الحالية ومعدل العائد الداخلي وفترة الاسترداد.'
          : 'Govern what is earned, not only what is spent — the revenue lifecycle from forecast to final, and the impact of variances on NPV, IRR and Payback.'}
        actions={<Button variant="success" size="sm" disabled={busy === 'gov'} onClick={run}>{busy === 'gov' ? (ar ? 'جارٍ…' : 'Running…') : (ar ? 'تشغيل حوكمة الإيراد' : 'Run revenue governance')}</Button>}
      />

      {/* Impact on NPV / IRR / Payback */}
      <Card title={ar ? 'الأثر على المؤشرات الاستثمارية' : 'Investment impact (NPV / IRR / Payback)'} hint={impact?.basis}>
        {!impact || impact.revenue.ratio === null ? (
          <p className="text-sm text-slate-400">{ar ? 'سجّل توقّع الإيراد وقيمة فعلية واحدة على الأقل لحساب الأثر.' : 'Record a revenue forecast and at least one actual/reforecast to compute the impact.'}</p>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <Pill tone={impact.revenue.ratio >= 0.95 ? 'emerald' : impact.revenue.ratio >= 0.85 ? 'amber' : 'rose'}>
                {ar ? 'الإيراد' : 'Revenue'}: {p(impact.revenue.ratio)} {ar ? 'من التوقع' : 'of forecast'}
              </Pill>
              <span className="text-xs text-slate-400" dir="ltr">{m(impact.revenue.forecast)} → {m(impact.revenue.latest)}</span>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <ImpactTile label="NPV" base={m(impact.base?.npv)} adj={m(impact.adjusted?.npv)} delta={m(impact.impact?.deltaNpv)} good={(impact.impact?.deltaNpv ?? 0) >= 0} />
              <ImpactTile label="IRR" base={p(impact.base?.projectIrr)} adj={p(impact.adjusted?.projectIrr)} delta={impact.impact?.deltaIrrPct != null ? `${(impact.impact.deltaIrrPct * 100).toFixed(1)}pts` : '—'} good={(impact.impact?.deltaIrrPct ?? 0) >= 0} />
              <ImpactTile label={ar ? 'الاسترداد (سنة)' : 'Payback (yr)'} base={String(impact.base?.paybackYears ?? '—')} adj={String(impact.adjusted?.paybackYears ?? '—')} delta={impact.impact?.deltaPaybackYears != null ? `${impact.impact.deltaPaybackYears > 0 ? '+' : ''}${impact.impact.deltaPaybackYears}` : '—'} good={(impact.impact?.deltaPaybackYears ?? 0) <= 0} />
            </div>
            <div className="rounded-lg border border-sky-500/30 bg-sky-500/5 px-3 py-2 text-xs text-sky-100"><IconSparkles className="me-1 inline h-3 w-3" />{impact.recommendation}</div>
          </div>
        )}
      </Card>

      {/* Revenue chain ledger */}
      <Card title={ar ? 'سلسلة حوكمة الإيراد (التتبّع الكامل)' : 'Revenue governance chain (full traceability)'} hint={ar ? 'من أين جاء الرقم؟ كيف تغيّر؟ من اعتمده؟' : 'Where did the number originate, how did it change, who approved it?'}>
        {!revChain ? <p className="text-sm text-slate-400">…</p> : (
          <div className="space-y-2">
            {revChain.stages.map((s) => (
              <div key={s.stage} className={`flex flex-wrap items-center gap-3 rounded-lg border px-3 py-2 ${s.recorded ? 'border-slate-700/70 bg-slate-900/60' : 'border-dashed border-slate-800 bg-transparent opacity-60'}`}>
                <span className="w-44 text-sm font-semibold text-slate-100">{labelFor(s.stage)}</span>
                {s.recorded ? (
                  <>
                    <span className="font-mono text-sm tabular-nums text-emerald-300" dir="ltr">{s.value?.toLocaleString()} {s.currency ?? ''}</span>
                    {s.variancePctFromPrev !== null && (
                      <Pill tone={Math.abs(s.variancePctFromPrev) < 0.05 ? 'slate' : s.variancePctFromPrev < 0 ? 'rose' : 'emerald'}>
                        {(s.variancePctFromPrev * 100).toFixed(1)}% {ar ? 'مقابل' : 'vs'} {labelFor(s.varianceFromStage ?? '')}
                      </Pill>
                    )}
                    {s.originType && <span className="text-[11px] text-slate-400">{ar ? 'المصدر' : 'origin'}: {s.originType}</span>}
                    {s.approvedBy && <span className="text-[11px] text-slate-400">{ar ? 'اعتمده' : 'approved'}: {s.approvedBy}</span>}
                    {s.historyDepth > 1 && <span className="text-[11px] text-amber-300">{s.historyDepth} {ar ? 'مراجعات' : 'revisions'}</span>}
                  </>
                ) : <span className="text-xs text-slate-500">{ar ? 'غير مسجّل' : 'not recorded'}</span>}
              </div>
            ))}
            <RecordStageForm projectKey={projectKey} chains={chains} ar={ar} onDone={refresh} />
          </div>
        )}
      </Card>

      {/* Findings */}
      {findings.length > 0 && (
        <Card title={ar ? 'نتائج حوكمة الإيراد' : 'Revenue governance findings'}>
          <div className="space-y-2">
            {findings.map((f) => (
              <div key={f.id} className="rounded-lg border border-slate-700/70 bg-slate-900/60 px-3 py-2">
                <div className="flex flex-wrap items-center gap-2">
                  <SeverityBadge severity={f.severity as 'critical' | 'warning' | 'info'} />
                  <GovernanceStatusBadge status={f.severity === 'critical' ? 'orange' : 'yellow'} size="sm" showLabel={false} />
                  <span className="flex-1 text-sm font-semibold text-slate-100">{f.title}</span>
                </div>
                <p className="mt-1 text-xs text-slate-300">{f.description}</p>
              </div>
            ))}
          </div>
        </Card>
      )}

      <AiAnalysisPanel endpoint="/revenue/ai-analysis" body={{ projectKey }} />
    </div>
  );
}

function ImpactTile({ label, base, adj, delta, good }: { label: string; base: string; adj: string; delta: string; good: boolean }) {
  return (
    <div className={`rounded-xl border p-3 ${good ? 'border-emerald-500/40 bg-emerald-500/5' : 'border-rose-500/40 bg-rose-500/5'}`}>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{label}</p>
      <p className="mt-1 text-sm tabular-nums text-slate-300" dir="ltr">{base} → <span className="font-bold text-slate-50">{adj}</span></p>
      <p className={`text-xs font-semibold tabular-nums ${good ? 'text-emerald-300' : 'text-rose-300'}`} dir="ltr">Δ {delta}</p>
    </div>
  );
}

function RecordStageForm({ projectKey, chains, ar, onDone }: { projectKey: string; chains: ChainsInfo | null; ar: boolean; onDone: () => Promise<void> }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [dimension, setDimension] = useState<'revenue' | 'cashflow'>('revenue');
  const [stage, setStage] = useState('rev_forecast');
  const [value, setValue] = useState('');
  const [originType, setOriginType] = useState('business-case');
  const [approvedBy, setApprovedBy] = useState('');
  const [changeReason, setChangeReason] = useState('');
  const [busy, setBusy] = useState(false);
  const stageOpts = chains?.[dimension]?.stages ?? [];

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true);
    try {
      await api('/revenue/record', { method: 'POST', body: JSON.stringify({
        projectKey, dimension, subjectKey: 'project', subjectLabel: ar ? 'إيراد المشروع' : 'Project revenue',
        stage, value: Number(value), currency: 'AED', originType, approvedBy: approvedBy || null, changeReason: changeReason || null,
      }) });
      toast.success(ar ? 'تم التسجيل' : 'Stage recorded'); setValue(''); setOpen(false); await onDone();
    } catch (err) { toast.error(ar ? 'فشل التسجيل' : 'Record failed', (err as Error).message); }
    finally { setBusy(false); }
  };
  const field = 'rounded-lg border border-slate-700 bg-slate-900/70 px-3 py-2 text-sm text-slate-100';

  if (!open) return <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>{ar ? '+ تسجيل مرحلة في السلسلة' : '+ Record a chain stage'}</Button>;
  return (
    <form onSubmit={submit} className="flex flex-wrap items-end gap-2 rounded-lg border border-slate-700/70 bg-slate-900/40 p-3">
      <label className="text-xs text-slate-400">{ar ? 'البُعد' : 'Dimension'}<select className={`mt-1 block ${field}`} value={dimension} onChange={(e) => { setDimension(e.target.value as 'revenue' | 'cashflow'); setStage(chains?.[e.target.value]?.stages?.[0] ?? ''); }}><option value="revenue">{ar ? 'إيراد' : 'revenue'}</option><option value="cashflow">{ar ? 'تدفق نقدي' : 'cashflow'}</option></select></label>
      <label className="text-xs text-slate-400">{ar ? 'المرحلة' : 'Stage'}<select className={`mt-1 block ${field}`} value={stage} onChange={(e) => setStage(e.target.value)}>{stageOpts.map((s) => <option key={s} value={s}>{(ar ? chains?.[dimension]?.labelsAr?.[s] : chains?.[dimension]?.labels?.[s]) ?? s}</option>)}</select></label>
      <label className="text-xs text-slate-400">{ar ? 'القيمة' : 'Value'}<input required type="number" className={`mt-1 block ${field}`} value={value} onChange={(e) => setValue(e.target.value)} /></label>
      <label className="text-xs text-slate-400">{ar ? 'المصدر' : 'Origin'}<input className={`mt-1 block ${field}`} value={originType} onChange={(e) => setOriginType(e.target.value)} /></label>
      <label className="text-xs text-slate-400">{ar ? 'اعتمده' : 'Approved by'}<input className={`mt-1 block ${field}`} value={approvedBy} onChange={(e) => setApprovedBy(e.target.value)} /></label>
      <label className="text-xs text-slate-400">{ar ? 'سبب التغيير' : 'Change reason'}<input className={`mt-1 block ${field}`} value={changeReason} onChange={(e) => setChangeReason(e.target.value)} /></label>
      <Button type="submit" variant="primary" disabled={busy}>{busy ? '…' : (ar ? 'تسجيل' : 'Record')}</Button>
    </form>
  );
}

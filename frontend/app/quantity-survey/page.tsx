'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import { AiAnalysisPanel } from '../../components/AiAnalysisPanel';
import { AuthGate } from '../../components/AuthGate';
import { DonutChart, CHART_PALETTE } from '../../components/Charts';
import { GovernanceStatusBadge } from '../../components/GovernanceStatusBadge';
import { IconSparkles } from '../../components/Icons';
import { useToast } from '../../components/ToastProvider';
import { useI18n } from '../../lib/i18n';
import { useCurrentProjectKey } from '../../lib/project-context';
import {
  api,
  ChainResponse,
  ChainsInfo,
  ClassificationInfo,
  ClassificationStandard,
  CostEstimateRecord,
  LedgerDimension,
  QsFindingRecord,
} from '../../lib/api';
import { Button, Card, EmptyState, PageHeader, Pill, SeverityBadge } from '../../components/ui';

export default function QuantitySurveyRoute() {
  return (
    <AuthGate capability="canRunQuantitySurvey" surface="Quantity Survey Intelligence">
      <QuantitySurveyPage />
    </AuthGate>
  );
}

type Tab = 'estimates' | 'classification' | 'traceability' | 'governance';

const PROJECT_TYPES = ['residential', 'commercial_office', 'retail', 'hospitality', 'industrial', 'logistics', 'healthcare', 'education', 'mixed_use'];
const STANDARDS: ClassificationStandard[] = ['NRM', 'UNIFORMAT', 'MASTERFORMAT', 'CESMM'];
const STAGES = ['conceptual', 'budget', 'cost-plan', 'tender', 'forecast', 'final-account'];

function QuantitySurveyPage() {
  const projectKey = useCurrentProjectKey();
  const toast = useToast();
  const [tab, setTab] = useState<Tab>('estimates');
  const [estimates, setEstimates] = useState<CostEstimateRecord[]>([]);
  const [findings, setFindings] = useState<QsFindingRecord[]>([]);
  const [classification, setClassification] = useState<ClassificationInfo | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [est, finds] = await Promise.all([
        api<CostEstimateRecord[]>(`/quantity-survey/estimates?projectKey=${encodeURIComponent(projectKey)}`),
        api<QsFindingRecord[]>(`/quantity-survey/governance/findings?projectKey=${encodeURIComponent(projectKey)}`),
      ]);
      setEstimates(est);
      setFindings(finds);
    } catch (e) { toast.error('Failed to load QS data', (e as Error).message); }
  }, [projectKey, toast]);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    if (tab === 'classification' && !classification) {
      api<ClassificationInfo>('/quantity-survey/classification/standards').then(setClassification).catch(() => {});
    }
  }, [tab, classification]);

  const runGovernance = async () => {
    setBusy('gov');
    try {
      const r = await api<{ findings: QsFindingRecord[] }>(`/quantity-survey/governance/run`, {
        method: 'POST', body: JSON.stringify({ projectKey }),
      });
      toast.success('QS governance complete', `${r.findings.length} open finding(s)`);
      await refresh();
    } catch (e) { toast.error('Governance run failed', (e as Error).message); }
    finally { setBusy(null); }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={`Quantity Survey Intelligence · ext.quantity_survey · ${projectKey}`}
        title="Quantity Survey & Cost Governance"
        description="Concept-to-final-account cost & quantity governance — classified to NRM / UniFormat / MasterFormat / CESMM. BIM → Quantity → Cost → Governance."
        actions={<Button variant="success" size="sm" disabled={busy === 'gov'} onClick={runGovernance}>{busy === 'gov' ? 'Running…' : 'Run QS governance'}</Button>}
      />

      <nav className="flex flex-wrap gap-2" role="tablist">
        {([['estimates', `Cost Estimates${estimates.length ? ` (${estimates.length})` : ''}`], ['classification', 'Classification Framework'], ['traceability', 'Traceability'], ['governance', `Governance${findings.length ? ` (${findings.length})` : ''}`]] as Array<[Tab, string]>).map(([k, label]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
            className={`rounded-full border px-3.5 py-1.5 text-xs font-semibold transition ${tab === k ? 'border-sky-500/60 bg-sky-500/15 text-sky-100' : 'border-slate-700 text-slate-300 hover:border-slate-500 hover:text-slate-100'}`}>
            {label}
          </button>
        ))}
      </nav>

      {tab === 'estimates' && <EstimatesTab projectKey={projectKey} estimates={estimates} onChange={refresh} />}
      {tab === 'classification' && <ClassificationTab info={classification} />}
      {tab === 'traceability' && <TraceabilityTab projectKey={projectKey} />}
      {tab === 'governance' && <GovernanceTab findings={findings} onChange={refresh} />}

      <AiAnalysisPanel endpoint="/quantity-survey/ai-analysis" body={{ projectKey }} />
    </div>
  );
}

// ── Traceability: quantity + cost lifecycle chains ──
function TraceabilityTab({ projectKey }: { projectKey: string }) {
  const { lang } = useI18n();
  const ar = lang === 'ar';
  const toast = useToast();
  const [chains, setChains] = useState<ChainsInfo | null>(null);
  const [dimension, setDimension] = useState<LedgerDimension>('quantity');
  const [subjectKey, setSubjectKey] = useState('element:frame');
  const [chain, setChain] = useState<ChainResponse | null>(null);

  useEffect(() => { api<ChainsInfo>('/quantity-survey/traceability/chains').then(setChains).catch(() => {}); }, []);
  const load = useCallback(async () => {
    try { setChain(await api<ChainResponse>(`/quantity-survey/traceability/chain?projectKey=${encodeURIComponent(projectKey)}&dimension=${dimension}&subjectKey=${encodeURIComponent(subjectKey)}`)); }
    catch (e) { toast.error('Failed', (e as Error).message); }
  }, [projectKey, dimension, subjectKey, toast]);
  useEffect(() => { void load(); }, [load]);

  const labelFor = (stage: string) => (ar ? chains?.[dimension]?.labelsAr?.[stage] : chains?.[dimension]?.labels?.[stage]) ?? stage;
  const field = 'rounded-lg border border-slate-700 bg-slate-900/70 px-3 py-2 text-sm text-slate-100';

  return (
    <div className="space-y-4">
      <Card title={ar ? 'سلسلة التتبّع (كمية / تكلفة)' : 'Lifecycle traceability chain (quantity / cost)'} hint={ar ? 'BIM → BOQ → … → مدفوع / ميزانية → … → نهائي — من أين جاء الرقم؟ كيف ولماذا تغيّر؟ من اعتمده؟' : 'BIM → BOQ → … → Paid / Budget → … → Final — origin, change, approver, evidence at every hop.'}>
        <div className="mb-3 flex flex-wrap items-end gap-2">
          <label className="text-xs text-slate-400">{ar ? 'البُعد' : 'Dimension'}<select className={`mt-1 block ${field}`} value={dimension} onChange={(e) => setDimension(e.target.value as LedgerDimension)}><option value="quantity">{ar ? 'كمية' : 'quantity'}</option><option value="cost">{ar ? 'تكلفة' : 'cost'}</option></select></label>
          <label className="text-xs text-slate-400">{ar ? 'الموضوع' : 'Subject'}<input className={`mt-1 block ${field}`} value={subjectKey} onChange={(e) => setSubjectKey(e.target.value)} /></label>
          <Button variant="ghost" size="sm" onClick={load}>{ar ? 'عرض' : 'Load'}</Button>
        </div>
        {!chain || chain.stages.every((s) => !s.recorded) ? (
          <EmptyState title={ar ? 'لا توجد سلسلة مسجّلة' : 'No chain recorded'} description={ar ? 'سجّل قيم المراحل عبر الـ API أو حوكمة الإيراد لرؤية التتبّع الكامل.' : 'Record stage values (API or the revenue surface) to see the full chain.'} />
        ) : (
          <div className="space-y-1.5">
            {chain.stages.map((s) => (
              <div key={s.stage} className={`flex flex-wrap items-center gap-3 rounded-lg border px-3 py-1.5 ${s.recorded ? 'border-slate-700/70 bg-slate-900/60' : 'border-dashed border-slate-800 opacity-60'}`}>
                <span className="w-40 text-sm text-slate-100">{labelFor(s.stage)}</span>
                {s.recorded ? (<>
                  <span className="font-mono text-sm tabular-nums text-emerald-300" dir="ltr">{s.value?.toLocaleString()} {s.unit ?? ''}</span>
                  {s.variancePctFromPrev !== null && <Pill tone={Math.abs(s.variancePctFromPrev) < 0.05 ? 'slate' : 'rose'}>{(s.variancePctFromPrev * 100).toFixed(1)}%</Pill>}
                  {s.originType && <span className="text-[11px] text-slate-400">{ar ? 'المصدر' : 'origin'}: {s.originType}</span>}
                  {s.approvedBy && <span className="text-[11px] text-slate-400">{ar ? 'اعتمده' : 'by'}: {s.approvedBy}</span>}
                </>) : <span className="text-xs text-slate-500">{ar ? 'غير مسجّل' : 'not recorded'}</span>}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

// ── Cost Estimates ──
function EstimatesTab({ projectKey, estimates, onChange }: { projectKey: string; estimates: CostEstimateRecord[]; onChange: () => Promise<void> }) {
  const toast = useToast();
  const [form, setForm] = useState({ stage: 'conceptual', projectType: 'residential', areaSqm: '10000', standard: 'NRM' as ClassificationStandard, city: 'Dubai' });
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<string | null>(null);

  const create = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true);
    try {
      await api<CostEstimateRecord>('/quantity-survey/estimates', {
        method: 'POST',
        body: JSON.stringify({ projectKey, stage: form.stage, projectType: form.projectType, areaSqm: Number(form.areaSqm), standard: form.standard, city: form.city }),
      });
      toast.success('Estimate created'); await onChange();
    } catch (err) { toast.error('Create failed', (err as Error).message); }
    finally { setBusy(false); }
  };
  const field = 'rounded-lg border border-slate-700 bg-slate-900/70 px-3 py-2 text-sm text-slate-100';

  return (
    <div className="space-y-5">
      <Card title="New classified cost estimate" hint="Area × Sigma benchmark, distributed across the classification elements">
        <form onSubmit={create} className="flex flex-wrap items-end gap-3">
          <label className="text-xs text-slate-400">Stage<select className={`mt-1 block ${field}`} value={form.stage} onChange={(e) => setForm({ ...form, stage: e.target.value })}>{STAGES.map((s) => <option key={s} value={s}>{s}</option>)}</select></label>
          <label className="text-xs text-slate-400">Project type<select className={`mt-1 block ${field}`} value={form.projectType} onChange={(e) => setForm({ ...form, projectType: e.target.value })}>{PROJECT_TYPES.map((s) => <option key={s} value={s}>{s}</option>)}</select></label>
          <label className="text-xs text-slate-400">Area (m²)<input className={`mt-1 block ${field}`} type="number" value={form.areaSqm} onChange={(e) => setForm({ ...form, areaSqm: e.target.value })} /></label>
          <label className="text-xs text-slate-400">Standard<select className={`mt-1 block ${field}`} value={form.standard} onChange={(e) => setForm({ ...form, standard: e.target.value as ClassificationStandard })}>{STANDARDS.map((s) => <option key={s} value={s}>{s}</option>)}</select></label>
          <label className="text-xs text-slate-400">City<input className={`mt-1 block ${field}`} value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} /></label>
          <Button type="submit" variant="primary" disabled={busy}>{busy ? 'Creating…' : 'Create estimate'}</Button>
        </form>
      </Card>

      {estimates.length === 0 ? (
        <EmptyState title="No estimates yet" description="Create a classified cost estimate — or generate one from the project's BIM model." />
      ) : estimates.map((e) => (
        <div key={e.id} className="rounded-xl border border-slate-700/70 bg-slate-900/60">
          <button onClick={() => setOpen(open === e.id ? null : e.id)} className="flex w-full flex-wrap items-center gap-3 px-4 py-3 text-start">
            <Pill tone="violet">{e.stage}</Pill>
            <span className="flex-1 truncate text-sm font-semibold text-slate-100">{e.title}</span>
            <Pill tone="sky">{e.standard}</Pill>
            <span className="font-mono text-sm tabular-nums text-emerald-300" dir="ltr">{e.currency} {(Number(e.totalAmount) / 1_000_000).toFixed(2)}M</span>
            {e.ratePerSqm && <span className="text-xs text-slate-400" dir="ltr">{e.currency} {Number(e.ratePerSqm).toFixed(0)}/m²</span>}
          </button>
          {open === e.id && (
            <div className="border-t border-slate-800 px-4 py-3">
              <table className="w-full text-xs">
                <thead><tr className="text-slate-400"><th className="px-2 py-1 text-start">Code</th><th className="px-2 py-1 text-start">Element</th><th className="px-2 py-1 text-end">Qty</th><th className="px-2 py-1 text-end">Rate</th><th className="px-2 py-1 text-end">Amount</th><th className="px-2 py-1 text-end">Share</th></tr></thead>
                <tbody>
                  {e.elements.map((el, i) => (
                    <tr key={i} className="border-t border-slate-800/60">
                      <td className="px-2 py-1 font-mono text-sky-300" dir="ltr">{el.code}</td>
                      <td className="px-2 py-1 text-slate-200">{el.label}</td>
                      <td className="px-2 py-1 text-end tabular-nums text-slate-300" dir="ltr">{el.quantity ?? '—'}</td>
                      <td className="px-2 py-1 text-end tabular-nums text-slate-300" dir="ltr">{el.rate ?? '—'}</td>
                      <td className="px-2 py-1 text-end tabular-nums text-slate-100" dir="ltr">{(el.amount / 1000).toFixed(0)}k</td>
                      <td className="px-2 py-1 text-end tabular-nums text-slate-400" dir="ltr">{(el.sharePct * 100).toFixed(1)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Classification Framework ──
function ClassificationTab({ info }: { info: ClassificationInfo | null }) {
  if (!info) return <p className="text-sm text-slate-400">Loading…</p>;
  return (
    <div className="space-y-4">
      <Card title="Global Cost Classification Framework" hint={`${info.version} · Sigma's own engine — no commercial cost databases`}>
        <div className="mb-3 flex flex-wrap gap-2">
          {info.standards.map((s) => <Pill key={s.key} tone="sky">{s.label}</Pill>)}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead><tr className="bg-slate-800/80 text-slate-300"><th className="px-2 py-1.5 text-start">Element</th><th className="px-2 py-1.5">NRM</th><th className="px-2 py-1.5">UniFormat</th><th className="px-2 py-1.5">MasterFormat</th><th className="px-2 py-1.5">CESMM</th><th className="px-2 py-1.5 text-end">Cost share</th></tr></thead>
            <tbody>
              {info.matrix.map((m) => (
                <tr key={m.element} className="border-t border-slate-800 odd:bg-slate-900/40">
                  <td className="px-2 py-1.5 text-slate-200">{m.label}</td>
                  <td className="px-2 py-1.5 text-center font-mono text-sky-300" dir="ltr">{m.codes.NRM}</td>
                  <td className="px-2 py-1.5 text-center font-mono text-slate-300" dir="ltr">{m.codes.UNIFORMAT}</td>
                  <td className="px-2 py-1.5 text-center font-mono text-slate-300" dir="ltr">{m.codes.MASTERFORMAT}</td>
                  <td className="px-2 py-1.5 text-center font-mono text-slate-300" dir="ltr">{m.codes.CESMM}</td>
                  <td className="px-2 py-1.5 text-end tabular-nums text-slate-400" dir="ltr">{(m.costShare * 100).toFixed(0)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

// ── Governance findings ──
function GovernanceTab({ findings, onChange }: { findings: QsFindingRecord[]; onChange: () => Promise<void> }) {
  const toast = useToast();
  const dist = useMemo(() => {
    const c = { critical: 0, warning: 0, info: 0 };
    for (const f of findings) if (f.status !== 'dismissed') c[(f.severity as 'critical' | 'warning' | 'info')] = (c[(f.severity as 'critical' | 'warning' | 'info')] ?? 0) + 1;
    return c;
  }, [findings]);

  const setStatus = async (id: string, status: string) => {
    try { await api(`/quantity-survey/governance/findings/${id}/status`, { method: 'POST', body: JSON.stringify({ status }) }); await onChange(); }
    catch (e) { toast.error('Update failed', (e as Error).message); }
  };

  if (findings.length === 0) {
    return <EmptyState title="No QS findings" description="Run QS governance — it cross-checks BOQ vs BIM quantities, over-measurement, duplicates and quantity-to-cost." />;
  }
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-4">
        <GovernanceStatusBadge status={dist.critical > 0 ? 'orange' : dist.warning > 0 ? 'yellow' : 'green'} />
        <DonutChart size={120} thickness={16} data={[
          { label: 'Critical', value: dist.critical, accent: '#ef4444' },
          { label: 'Warning', value: dist.warning, accent: '#f59e0b' },
          { label: 'Info', value: dist.info, accent: CHART_PALETTE.crimson },
        ].filter((d) => d.value > 0)} centerValue={String(findings.length)} centerLabel="findings" />
      </div>
      {findings.map((f) => (
        <div key={f.id} className="rounded-xl border border-slate-700/70 bg-slate-900/60 px-4 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <SeverityBadge severity={f.severity as 'critical' | 'warning' | 'info'} />
            <Pill tone="slate">{f.findingType}</Pill>
            <span className="flex-1 text-sm font-semibold text-slate-100">{f.title}</span>
            {f.quantum && <span className="font-mono text-xs text-amber-300" dir="ltr">AED {Number(f.quantum).toLocaleString()}</span>}
            <Pill tone={f.status === 'open' ? 'rose' : 'emerald'}>{f.status}</Pill>
          </div>
          <p className="mt-1.5 text-xs text-slate-300">{f.description}</p>
          {f.status === 'open' && (
            <div className="mt-2 flex gap-2">
              <Button variant="ghost" size="sm" onClick={() => setStatus(f.id, 'reviewed')}>Mark reviewed</Button>
              <Button variant="ghost" size="sm" onClick={() => setStatus(f.id, 'dismissed')}>Dismiss</Button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

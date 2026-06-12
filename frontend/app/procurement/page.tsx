'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import { AiAnalysisPanel } from '../../components/AiAnalysisPanel';
import { AuthGate } from '../../components/AuthGate';
import { GovernanceStatusBadge } from '../../components/GovernanceStatusBadge';
import { useToast } from '../../components/ToastProvider';
import { useCurrentProjectKey } from '../../lib/project-context';
import {
  api,
  ProcurementFindingRecord,
  ProcurementPackageRecord,
  VendorRecord,
} from '../../lib/api';
import { Button, Card, EmptyState, PageHeader, Pill, SeverityBadge } from '../../components/ui';

export default function ProcurementRoute() {
  return (
    <AuthGate capability="canRunProcurement" surface="Procurement Intelligence">
      <ProcurementPage />
    </AuthGate>
  );
}

type Tab = 'packages' | 'vendors' | 'governance';

function ProcurementPage() {
  const projectKey = useCurrentProjectKey();
  const toast = useToast();
  const [tab, setTab] = useState<Tab>('packages');
  const [packages, setPackages] = useState<ProcurementPackageRecord[]>([]);
  const [vendors, setVendors] = useState<VendorRecord[]>([]);
  const [findings, setFindings] = useState<ProcurementFindingRecord[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [pkgs, vnds, finds] = await Promise.all([
        api<ProcurementPackageRecord[]>(`/procurement/packages?projectKey=${encodeURIComponent(projectKey)}`),
        api<VendorRecord[]>(`/procurement/vendors`),
        api<ProcurementFindingRecord[]>(`/procurement/governance/findings?projectKey=${encodeURIComponent(projectKey)}`),
      ]);
      setPackages(pkgs); setVendors(vnds); setFindings(finds);
    } catch (e) { toast.error('Failed to load procurement data', (e as Error).message); }
  }, [projectKey, toast]);

  useEffect(() => { void refresh(); }, [refresh]);

  const runGovernance = async () => {
    setBusy('gov');
    try {
      const r = await api<{ findings: ProcurementFindingRecord[] }>(`/procurement/governance/run`, {
        method: 'POST', body: JSON.stringify({ projectKey }),
      });
      toast.success('Procurement governance complete', `${r.findings.length} open finding(s)`);
      await refresh();
    } catch (e) { toast.error('Governance run failed', (e as Error).message); }
    finally { setBusy(null); }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={`Procurement Intelligence · ext.procurement · ${projectKey}`}
        title="Procurement & Supply-Chain Governance"
        description="Procurement planning, vendor intelligence, RFQ/bid governance, delivery tracking, and cross-source validation (BIM vs procured vs installed; planned vs actual delivery)."
        actions={<Button variant="success" size="sm" disabled={busy === 'gov'} onClick={runGovernance}>{busy === 'gov' ? 'Running…' : 'Run procurement governance'}</Button>}
      />

      <nav className="flex flex-wrap gap-2" role="tablist">
        {([['packages', `Packages${packages.length ? ` (${packages.length})` : ''}`], ['vendors', `Vendors${vendors.length ? ` (${vendors.length})` : ''}`], ['governance', `Governance${findings.length ? ` (${findings.length})` : ''}`]] as Array<[Tab, string]>).map(([k, label]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
            className={`rounded-full border px-3.5 py-1.5 text-xs font-semibold transition ${tab === k ? 'border-sky-500/60 bg-sky-500/15 text-sky-100' : 'border-slate-700 text-slate-300 hover:border-slate-500 hover:text-slate-100'}`}>
            {label}
          </button>
        ))}
      </nav>

      {tab === 'packages' && <PackagesTab projectKey={projectKey} packages={packages} onChange={refresh} />}
      {tab === 'vendors' && <VendorsTab vendors={vendors} onChange={refresh} />}
      {tab === 'governance' && <GovernanceTab findings={findings} onChange={refresh} />}

      <AiAnalysisPanel endpoint="/procurement/ai-analysis" body={{ projectKey }} />
    </div>
  );
}

const STATUS_TONE: Record<string, 'slate' | 'sky' | 'emerald' | 'amber' | 'rose' | 'violet'> = {
  planned: 'slate', rfq: 'sky', evaluated: 'violet', awarded: 'emerald', delivering: 'amber', delivered: 'emerald',
};

function PackagesTab({ projectKey, packages, onChange }: { projectKey: string; packages: ProcurementPackageRecord[]; onChange: () => Promise<void> }) {
  const toast = useToast();
  const [form, setForm] = useState({ title: '', category: 'concrete', unit: 'm3', longLead: false, leadTimeDays: '90', requiredOnSiteDate: '', plannedDeliveryDate: '', bimQuantity: '', estimatedCost: '' });
  const [busy, setBusy] = useState(false);

  const create = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true);
    try {
      await api<ProcurementPackageRecord>('/procurement/packages', {
        method: 'POST',
        body: JSON.stringify({
          projectKey, title: form.title, category: form.category, unit: form.unit,
          longLead: form.longLead, leadTimeDays: form.leadTimeDays ? Number(form.leadTimeDays) : null,
          requiredOnSiteDate: form.requiredOnSiteDate || null, plannedDeliveryDate: form.plannedDeliveryDate || null,
          bimQuantity: form.bimQuantity ? Number(form.bimQuantity) : null,
          estimatedCost: form.estimatedCost ? Number(form.estimatedCost) : null,
        }),
      });
      toast.success('Package created'); await onChange();
      setForm({ ...form, title: '' });
    } catch (err) { toast.error('Create failed', (err as Error).message); }
    finally { setBusy(false); }
  };
  const field = 'rounded-lg border border-slate-700 bg-slate-900/70 px-3 py-2 text-sm text-slate-100';

  return (
    <div className="space-y-5">
      <Card title="New procurement package" hint="Carries the BIM / procured / installed quantities the governance layer compares">
        <form onSubmit={create} className="flex flex-wrap items-end gap-3">
          <label className="text-xs text-slate-400">Title<input required className={`mt-1 block ${field}`} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Structural steel" /></label>
          <label className="text-xs text-slate-400">Category<input className={`mt-1 block ${field}`} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} /></label>
          <label className="text-xs text-slate-400">Unit<input className={`mt-1 block w-20 ${field}`} value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} /></label>
          <label className="text-xs text-slate-400">BIM qty<input className={`mt-1 block w-24 ${field}`} type="number" value={form.bimQuantity} onChange={(e) => setForm({ ...form, bimQuantity: e.target.value })} /></label>
          <label className="text-xs text-slate-400">Planned delivery<input className={`mt-1 block ${field}`} type="date" value={form.plannedDeliveryDate} onChange={(e) => setForm({ ...form, plannedDeliveryDate: e.target.value })} /></label>
          <label className="flex items-center gap-1.5 text-xs text-slate-400"><input type="checkbox" checked={form.longLead} onChange={(e) => setForm({ ...form, longLead: e.target.checked })} /> Long-lead</label>
          <Button type="submit" variant="primary" disabled={busy}>{busy ? 'Creating…' : 'Add package'}</Button>
        </form>
      </Card>

      {packages.length === 0 ? (
        <EmptyState title="No packages yet" description="Add a procurement package, or generate a material plan from the BIM model." />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-700/70">
          <table className="w-full text-xs">
            <thead><tr className="bg-slate-800/80 text-slate-300">
              <th className="px-2.5 py-2 text-start">Ref</th><th className="px-2.5 py-2 text-start">Title</th><th className="px-2.5 py-2 text-start">Category</th><th className="px-2.5 py-2">Status</th>
              <th className="px-2.5 py-2 text-end">BIM</th><th className="px-2.5 py-2 text-end">Procured</th><th className="px-2.5 py-2 text-end">Installed</th><th className="px-2.5 py-2">Planned</th><th className="px-2.5 py-2">Long-lead</th>
            </tr></thead>
            <tbody>
              {packages.map((p) => (
                <tr key={p.id} className="border-t border-slate-800 odd:bg-slate-900/40">
                  <td className="px-2.5 py-1.5 font-mono text-sky-300" dir="ltr">{p.businessKey}</td>
                  <td className="px-2.5 py-1.5 text-slate-100">{p.title}</td>
                  <td className="px-2.5 py-1.5 text-slate-300">{p.category}</td>
                  <td className="px-2.5 py-1.5 text-center"><Pill tone={STATUS_TONE[p.status] ?? 'slate'}>{p.status}</Pill></td>
                  <td className="px-2.5 py-1.5 text-end tabular-nums text-slate-300" dir="ltr">{p.bimQuantity ?? '—'}</td>
                  <td className="px-2.5 py-1.5 text-end tabular-nums text-slate-300" dir="ltr">{p.procuredQuantity ?? '—'}</td>
                  <td className="px-2.5 py-1.5 text-end tabular-nums text-slate-300" dir="ltr">{p.installedQuantity ?? '—'}</td>
                  <td className="px-2.5 py-1.5 text-center text-slate-400" dir="ltr">{p.plannedDeliveryDate ?? '—'}</td>
                  <td className="px-2.5 py-1.5 text-center">{p.longLead ? <Pill tone="amber">long-lead</Pill> : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function VendorsTab({ vendors, onChange }: { vendors: VendorRecord[]; onChange: () => Promise<void> }) {
  const toast = useToast();
  const [form, setForm] = useState({ name: '', category: 'concrete', country: 'UAE', yearsActive: '10', onTimeDeliveryRate: '0.9', defectRate: '0.04', financialStanding: 'adequate' });
  const [busy, setBusy] = useState(false);

  const create = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true);
    try {
      await api<VendorRecord>('/procurement/vendors', {
        method: 'POST',
        body: JSON.stringify({
          name: form.name, category: form.category, country: form.country,
          inputs: { yearsActive: Number(form.yearsActive), onTimeDeliveryRate: Number(form.onTimeDeliveryRate), defectRate: Number(form.defectRate), financialStanding: form.financialStanding },
        }),
      });
      toast.success('Vendor added'); await onChange(); setForm({ ...form, name: '' });
    } catch (err) { toast.error('Create failed', (err as Error).message); }
    finally { setBusy(false); }
  };
  const field = 'rounded-lg border border-slate-700 bg-slate-900/70 px-3 py-2 text-sm text-slate-100';
  const scoreColor = (n: number, invert = false) => (invert ? n < 40 : n >= 60) ? 'text-emerald-300' : (invert ? n < 70 : n >= 40) ? 'text-amber-300' : 'text-rose-300';

  return (
    <div className="space-y-5">
      <Card title="New vendor" hint="Intelligence scores (qualification / evaluation / performance / risk) are computed deterministically">
        <form onSubmit={create} className="flex flex-wrap items-end gap-3">
          <label className="text-xs text-slate-400">Name<input required className={`mt-1 block ${field}`} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
          <label className="text-xs text-slate-400">Category<input className={`mt-1 block ${field}`} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} /></label>
          <label className="text-xs text-slate-400">Years active<input className={`mt-1 block w-20 ${field}`} type="number" value={form.yearsActive} onChange={(e) => setForm({ ...form, yearsActive: e.target.value })} /></label>
          <label className="text-xs text-slate-400">On-time rate<input className={`mt-1 block w-20 ${field}`} type="number" step="0.05" value={form.onTimeDeliveryRate} onChange={(e) => setForm({ ...form, onTimeDeliveryRate: e.target.value })} /></label>
          <label className="text-xs text-slate-400">Finance<select className={`mt-1 block ${field}`} value={form.financialStanding} onChange={(e) => setForm({ ...form, financialStanding: e.target.value })}><option value="strong">strong</option><option value="adequate">adequate</option><option value="weak">weak</option></select></label>
          <Button type="submit" variant="primary" disabled={busy}>{busy ? 'Adding…' : 'Add vendor'}</Button>
        </form>
      </Card>

      {vendors.length === 0 ? (
        <EmptyState title="No vendors yet" description="Add suppliers — the engine scores qualification, performance and risk for bid governance." />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-700/70">
          <table className="w-full text-xs">
            <thead><tr className="bg-slate-800/80 text-slate-300"><th className="px-2.5 py-2 text-start">Ref</th><th className="px-2.5 py-2 text-start">Vendor</th><th className="px-2.5 py-2 text-start">Category</th><th className="px-2.5 py-2 text-end">Qualification</th><th className="px-2.5 py-2 text-end">Performance</th><th className="px-2.5 py-2 text-end">Risk</th><th className="px-2.5 py-2">Status</th></tr></thead>
            <tbody>
              {vendors.map((v) => (
                <tr key={v.id} className="border-t border-slate-800 odd:bg-slate-900/40">
                  <td className="px-2.5 py-1.5 font-mono text-sky-300" dir="ltr">{v.businessKey}</td>
                  <td className="px-2.5 py-1.5 text-slate-100">{v.name}</td>
                  <td className="px-2.5 py-1.5 text-slate-300">{v.category}</td>
                  <td className={`px-2.5 py-1.5 text-end tabular-nums ${scoreColor(v.qualificationScore)}`} dir="ltr">{v.qualificationScore}</td>
                  <td className={`px-2.5 py-1.5 text-end tabular-nums ${scoreColor(v.performanceScore)}`} dir="ltr">{v.performanceScore}</td>
                  <td className={`px-2.5 py-1.5 text-end tabular-nums ${scoreColor(v.riskScore, true)}`} dir="ltr">{v.riskScore}</td>
                  <td className="px-2.5 py-1.5 text-center"><Pill tone={v.status === 'qualified' ? 'emerald' : v.status === 'disqualified' ? 'rose' : 'amber'}>{v.status}</Pill></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function GovernanceTab({ findings, onChange }: { findings: ProcurementFindingRecord[]; onChange: () => Promise<void> }) {
  const toast = useToast();
  const dist = useMemo(() => {
    const c = { critical: 0, warning: 0, info: 0 };
    for (const f of findings) if (f.status !== 'dismissed') c[(f.severity as 'critical' | 'warning' | 'info')] += 1;
    return c;
  }, [findings]);

  const setStatus = async (id: string, status: string) => {
    try { await api(`/procurement/governance/findings/${id}/status`, { method: 'POST', body: JSON.stringify({ status }) }); await onChange(); }
    catch (e) { toast.error('Update failed', (e as Error).message); }
  };

  if (findings.length === 0) {
    return <EmptyState title="No procurement findings" description="Run procurement governance — it cross-checks BIM vs procured vs installed quantities, planned vs actual delivery, long-lead exposure and vendor risk." />;
  }
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <GovernanceStatusBadge status={dist.critical > 0 ? 'orange' : dist.warning > 0 ? 'yellow' : 'green'} />
        <span className="text-xs text-slate-400">{dist.critical} critical · {dist.warning} warning · {findings.length} total</span>
      </div>
      {findings.map((f) => (
        <div key={f.id} className="rounded-xl border border-slate-700/70 bg-slate-900/60 px-4 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <SeverityBadge severity={f.severity as 'critical' | 'warning' | 'info'} />
            <Pill tone="slate">{f.findingType}</Pill>
            <span className="flex-1 text-sm font-semibold text-slate-100">{f.title}</span>
            <Pill tone={f.status === 'open' ? 'rose' : 'emerald'}>{f.status}</Pill>
          </div>
          <p className="mt-1.5 text-xs text-slate-300">{f.description}</p>
          {f.recommendation && <p className="mt-1 text-xs text-sky-300">→ {f.recommendation}</p>}
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

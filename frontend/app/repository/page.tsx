'use client';

/**
 * /repository — the L1 Data Collection document repository (Mr. Ayham's Layer 1
 * record families: RFIs, Submittals, NCRs, Change Requests, Procurement /
 * Resource / Cost logs, Site Photos). Browse by type + register a record.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';

import { AuthGate } from '../../components/AuthGate';
import { IconDatabase, IconRefresh, IconUpload } from '../../components/Icons';
import { useToast } from '../../components/ToastProvider';
import { Button, Card, EmptyState, ErrorBanner, PageHeader, Pill } from '../../components/ui';
import { api } from '../../lib/api';
import { CAPABILITIES } from '../../lib/capabilities';
import { useMe } from '../../lib/me-context';
import { useCurrentProjectKey } from '../../lib/project-context';

interface RecordRow {
  id: string; recordType: string; refNumber: string; title: string;
  status: string | null; party: string | null; raisedDate: string | null;
  dueDate: string | null; amount: string | null;
}

const TYPE_LABEL: Record<string, string> = {
  rfi: 'RFI', submittal: 'Submittal', ncr: 'NCR', 'change-request': 'Change Request',
  'procurement-log': 'Procurement', 'resource-log': 'Resource Log', 'cost-report': 'Cost Report',
  'site-photo': 'Site Photo', other: 'Other',
};

export default function RepositoryRoute() {
  return (
    <AuthGate surface="Document Repository">
      <RepositoryPage />
    </AuthGate>
  );
}

function RepositoryPage() {
  const toast = useToast();
  const projectKey = useCurrentProjectKey();
  const { me } = useMe();
  const canIngest = !!(me?.user?.role && CAPABILITIES[me.user.role].canIngest);

  const [rows, setRows] = useState<RecordRow[] | null>(null);
  const [inventory, setInventory] = useState<Record<string, number>>({});
  const [filter, setFilter] = useState<string>('all');
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  const load = useCallback(async () => {
    if (!projectKey) return;
    try {
      const [r, inv] = await Promise.all([
        api<RecordRow[]>(`/records?projectKey=${encodeURIComponent(projectKey)}`),
        api<Record<string, number>>(`/records/inventory?projectKey=${encodeURIComponent(projectKey)}`),
      ]);
      setRows(r); setInventory(inv); setError(null);
    } catch (e) { setError((e as Error).message); setRows([]); }
  }, [projectKey]);

  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => (filter === 'all' ? rows ?? [] : (rows ?? []).filter((r) => r.recordType === filter)), [rows, filter]);
  const total = rows?.length ?? 0;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Layer 1 · Data Collection"
        title="Document Repository"
        description="Every collected project record (RFIs, Submittals, NCRs, Change Requests, Procurement / Resource / Cost logs, Site Photos) — append-only and versioned, feeding the downstream agents."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="ghost" size="sm" onClick={load}><IconRefresh className="h-3.5 w-3.5" /> Refresh</Button>
            {canIngest && <Button variant="primary" size="sm" onClick={() => setShowForm((v) => !v)}><IconUpload className="h-3.5 w-3.5" /> Register record</Button>}
          </div>
        }
      />
      <ErrorBanner message={error} />

      {canIngest && showForm && (
        <RecordForm projectKey={projectKey} onCancel={() => setShowForm(false)} onSaved={async () => { setShowForm(false); await load(); }} toast={toast} />
      )}

      <div className="flex flex-wrap items-center gap-1.5">
        <button type="button" onClick={() => setFilter('all')} aria-pressed={filter === 'all'} className={chip(filter === 'all')}>All <span className="ms-1 font-mono text-[9px] text-slate-400">{total}</span></button>
        {Object.entries(inventory).map(([t, n]) => (
          <button key={t} type="button" onClick={() => setFilter(t)} aria-pressed={filter === t} className={chip(filter === t)}>
            {TYPE_LABEL[t] ?? t} <span className="ms-1 font-mono text-[9px] text-slate-400">{n}</span>
          </button>
        ))}
      </div>

      {rows === null ? (
        <Card><div className="h-24 animate-pulse rounded bg-slate-800/40" /></Card>
      ) : filtered.length === 0 ? (
        <EmptyState icon={<IconDatabase className="h-8 w-8" />} title="No records" description={canIngest ? 'Register the first project record to populate L1.' : 'Records appear here once collected.'} />
      ) : (
        <Card padded={false}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-800 text-[10px] uppercase tracking-wider text-slate-500">
                <tr><th className="px-4 py-2 text-start">Type</th><th className="px-4 py-2 text-start">Ref</th><th className="px-4 py-2 text-start">Title</th><th className="px-4 py-2 text-start">Status</th><th className="px-4 py-2 text-start">Party</th><th className="px-4 py-2 text-start">Due</th></tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.id} className="border-b border-slate-800/50 last:border-b-0">
                    <td className="px-4 py-2"><Pill tone="sky">{TYPE_LABEL[r.recordType] ?? r.recordType}</Pill></td>
                    <td className="px-4 py-2 font-mono text-xs text-slate-300" dir="ltr">{r.refNumber}</td>
                    <td className="px-4 py-2 text-slate-100">{r.title}</td>
                    <td className="px-4 py-2 text-slate-300">{r.status ?? '—'}</td>
                    <td className="px-4 py-2 text-slate-300">{r.party ?? '—'}</td>
                    <td className="px-4 py-2 text-slate-400" dir="ltr">{r.dueDate ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

function chip(active: boolean): string {
  return `inline-flex items-center rounded-full border px-3 py-1 text-xs transition ${active ? 'border-sky-500/50 bg-sky-500/15 text-sky-200' : 'border-slate-800 bg-slate-900/40 text-slate-300 hover:border-slate-600'}`;
}

function RecordForm({
  projectKey, onCancel, onSaved, toast,
}: {
  projectKey: string;
  onCancel: () => void;
  onSaved: () => void | Promise<void>;
  toast: ReturnType<typeof useToast>;
}) {
  const [recordType, setRecordType] = useState('rfi');
  const [refNumber, setRefNumber] = useState('');
  const [title, setTitle] = useState('');
  const [status, setStatus] = useState('open');
  const [party, setParty] = useState('contractor');
  const [dueDate, setDueDate] = useState('');
  const [busy, setBusy] = useState(false);
  const cls = 'mt-1 w-full rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-sky-500 focus:outline-none';
  const lab = 'text-[11px] font-semibold uppercase tracking-wider text-slate-400';

  const submit = async () => {
    if (!refNumber.trim() || !title.trim()) return;
    setBusy(true);
    try {
      await api('/records', { method: 'POST', body: JSON.stringify({ projectKey: projectKey, projectBusinessKey: projectKey, recordType, refNumber: refNumber.trim(), title: title.trim(), status, party, dueDate: dueDate || null }) });
      toast.success('Record registered', `${refNumber.trim()} added to L1.`);
      await onSaved();
    } catch (e) { toast.error('Register failed', (e as Error).message); }
    finally { setBusy(false); }
  };

  return (
    <Card title="Register a project record">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div><label className={lab}>Type</label><select className={cls} value={recordType} onChange={(e) => setRecordType(e.target.value)}>{Object.entries(TYPE_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
        <div><label className={lab}>Ref number</label><input className={`${cls} font-mono`} dir="ltr" value={refNumber} onChange={(e) => setRefNumber(e.target.value)} placeholder="RFI-014" /></div>
        <div><label className={lab}>Status</label><input className={cls} value={status} onChange={(e) => setStatus(e.target.value)} /></div>
        <div className="sm:col-span-2"><label className={lab}>Title</label><input className={cls} value={title} onChange={(e) => setTitle(e.target.value)} /></div>
        <div><label className={lab}>Party</label><select className={cls} value={party} onChange={(e) => setParty(e.target.value)}>{['contractor', 'consultant', 'client', 'subcontractor'].map((p) => <option key={p} value={p}>{p}</option>)}</select></div>
        <div><label className={lab}>Due date</label><input type="date" className={cls} value={dueDate} onChange={(e) => setDueDate(e.target.value)} /></div>
      </div>
      <div className="mt-3 flex justify-end gap-2"><Button variant="ghost" size="sm" onClick={onCancel}>Cancel</Button><Button variant="primary" size="sm" disabled={busy || !refNumber.trim() || !title.trim()} onClick={submit}>{busy ? 'Saving…' : 'Register'}</Button></div>
    </Card>
  );
}

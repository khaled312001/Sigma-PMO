'use client';

/**
 * /risk — the L5 Risk Agent register (Mr. Ayham's Layer 5). Probability × impact
 * heat-map + the scored register with mitigations + escalation triggers.
 */

import { useCallback, useEffect, useState } from 'react';

import { AuthGate } from '../../components/AuthGate';
import { IconRefresh, IconSparkles } from '../../components/Icons';
import { useToast } from '../../components/ToastProvider';
import { Button, Card, EmptyState, ErrorBanner, PageHeader, Pill } from '../../components/ui';
import { api } from '../../lib/api';
import { CAPABILITIES } from '../../lib/capabilities';
import { useMe } from '../../lib/me-context';
import { useCurrentProjectKey } from '../../lib/project-context';

interface RiskRow {
  id: string; title: string; category: string;
  probability: number; impact: number; priorityScore: number; tier: string;
  source: string; mitigation: string; escalationTrigger: string | null; status: string;
}

export default function RiskPageRoute() {
  return (
    <AuthGate surface="Risk">
      <RiskPage />
    </AuthGate>
  );
}

const TIER_TONE: Record<string, 'emerald' | 'sky' | 'amber' | 'rose'> = {
  low: 'emerald', medium: 'sky', high: 'amber', critical: 'rose',
};

function RiskPage() {
  const toast = useToast();
  const projectKey = useCurrentProjectKey();
  const { me } = useMe();
  const canRun = !!(me?.user?.role && CAPABILITIES[me.user.role].canEvaluateRules);

  const [rows, setRows] = useState<RiskRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!projectKey) return;
    try {
      const r = await api<RiskRow[]>(`/risk?projectKey=${encodeURIComponent(projectKey)}`);
      setRows(r); setError(null);
    } catch (e) { setError((e as Error).message); setRows([]); }
  }, [projectKey]);

  useEffect(() => { void load(); }, [load]);

  const run = async () => {
    setBusy(true);
    try {
      await api(`/agents/l5.risk/run`, { method: 'POST', body: JSON.stringify({ projectKey }) });
      toast.success('Risk agent ran', 'Register refreshed from the latest alerts + EVM signals.');
      await load();
    } catch (e) { toast.error('Risk run failed', (e as Error).message); }
    finally { setBusy(false); }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Layer 5 · Risk"
        title="Risk Register"
        description="Risks derived deterministically from L2 alerts and L4 EVM, scored probability × impact, with mitigations and escalation triggers."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="ghost" size="sm" onClick={load}><IconRefresh className="h-3.5 w-3.5" /> Refresh</Button>
            {canRun && <Button variant="primary" size="sm" disabled={busy} onClick={run}><IconSparkles className="h-3.5 w-3.5" /> {busy ? 'Running…' : 'Run risk agent'}</Button>}
          </div>
        }
      />
      <ErrorBanner message={error} />

      {rows && rows.length > 0 && <HeatMap rows={rows} />}

      {rows === null ? (
        <Card><div className="h-24 animate-pulse rounded bg-slate-800/40" /></Card>
      ) : rows.length === 0 ? (
        <EmptyState title="No risks yet" description={canRun ? 'Run the risk agent to derive the register from current findings.' : 'The register appears once a reviewer runs the risk agent.'} />
      ) : (
        <div className="space-y-2">
          {rows.map((r) => (
            <Card key={r.id}>
              <div className="flex flex-wrap items-center gap-2">
                <Pill tone={TIER_TONE[r.tier] ?? 'slate'}>{r.tier}</Pill>
                <Pill tone="slate">{r.category}</Pill>
                <span className="text-sm font-medium text-slate-100">{r.title}</span>
                <span className="ms-auto font-mono text-[10px] text-slate-500" dir="ltr">priority {r.priorityScore}</span>
              </div>
              <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Meter label="Probability" value={r.probability} />
                <Meter label="Impact" value={r.impact} />
              </div>
              <p className="mt-2 text-sm text-slate-300"><span className="text-slate-500">Mitigation:</span> {r.mitigation}</p>
              {r.escalationTrigger && (
                <p className="mt-1 text-sm text-amber-300"><span className="text-amber-500/80">Escalation:</span> {r.escalationTrigger}</p>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function Meter({ label, value }: { label: string; value: number }) {
  const pct = Math.round(value * 100);
  const tone = pct >= 70 ? 'bg-rose-500' : pct >= 40 ? 'bg-amber-400' : 'bg-emerald-500';
  return (
    <div>
      <div className="flex items-center justify-between text-[11px]"><span className="text-slate-500">{label}</span><span className="tabular-nums text-slate-300">{pct}%</span></div>
      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-800"><div className={`h-full ${tone}`} style={{ width: `${pct}%` }} /></div>
    </div>
  );
}

/** Compact 5×5 probability/impact heat-map placing each risk in its cell. */
function HeatMap({ rows }: { rows: RiskRow[] }) {
  const cell = (p: number, i: number) => rows.filter((r) => bucket(r.probability) === p && bucket(r.impact) === i).length;
  const colour = (p: number, i: number) => {
    const score = ((p + 1) / 5) * ((i + 1) / 5);
    if (score >= 0.6) return 'bg-rose-600/70';
    if (score >= 0.35) return 'bg-amber-500/60';
    if (score >= 0.15) return 'bg-sky-600/50';
    return 'bg-emerald-700/40';
  };
  return (
    <Card title="Probability × impact heat-map">
      <div className="flex gap-2">
        <div className="flex flex-col-reverse justify-between py-1 text-[9px] text-slate-500" style={{ height: 160 }}>
          <span>low P</span><span>high P</span>
        </div>
        <div className="grid flex-1 grid-rows-5 gap-1">
          {[4, 3, 2, 1, 0].map((p) => (
            <div key={p} className="grid grid-cols-5 gap-1">
              {[0, 1, 2, 3, 4].map((i) => {
                const c = cell(p, i);
                return (
                  <div key={i} className={`grid place-items-center rounded ${colour(p, i)} text-xs font-bold text-white`} style={{ height: 28 }}>
                    {c > 0 ? c : ''}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
      <div className="mt-1 flex justify-between px-6 text-[9px] text-slate-500"><span>low impact</span><span>high impact</span></div>
    </Card>
  );
}

function bucket(v: number): number {
  return Math.max(0, Math.min(4, Math.floor(v * 5 - 1e-9)));
}

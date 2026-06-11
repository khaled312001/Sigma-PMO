'use client';

/**
 * /executive — the L7 Executive Intelligence dashboard (Mr. Ayham's Layer 7):
 * strategic KPIs + a one-line governance headline for the current project.
 */

import { useCallback, useEffect, useState } from 'react';

import { AuthGate } from '../../components/AuthGate';
import { GovernanceStatusBadge } from '../../components/GovernanceStatusBadge';
import { IconRefresh } from '../../components/Icons';
import { Card, EmptyState, ErrorBanner, PageHeader, Pill } from '../../components/ui';
import { api } from '../../lib/api';
import { useCurrentProjectKey } from '../../lib/project-context';

interface Kpis {
  governanceStatus: string | null; scheduleHealth: string; costHealth: string;
  spi: number | null; cpi: number | null; projectedCostOverrunPct: number | null;
  riskExposure: number; criticalRisks: number; potentialClaims: number; openCorrectiveActions: number;
}
interface ExecutivePack { nodeBusinessKey: string; kpis: Kpis; headline: string }

export default function ExecutiveRoute() {
  return (
    <AuthGate surface="Executive">
      <ExecutivePage />
    </AuthGate>
  );
}

function Tile({ label, value, tone = 'slate' }: { label: string; value: React.ReactNode; tone?: 'slate' | 'emerald' | 'amber' | 'rose' | 'sky' }) {
  const ring: Record<string, string> = { slate: 'ring-slate-700', emerald: 'ring-emerald-600/50', amber: 'ring-amber-500/50', rose: 'ring-rose-600/50', sky: 'ring-sky-600/50' };
  return (
    <div className={`rounded-xl border border-slate-800 bg-slate-950/40 px-4 py-3 ring-1 ${ring[tone]}`}>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{label}</p>
      <p className="mt-1 text-lg font-semibold text-slate-100">{value}</p>
    </div>
  );
}

function ExecutivePage() {
  const projectKey = useCurrentProjectKey();
  const [pack, setPack] = useState<ExecutivePack | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!projectKey) return;
    setLoading(true);
    try {
      const p = await api<ExecutivePack>(`/executive/overview?projectKey=${encodeURIComponent(projectKey)}`);
      setPack(p); setError(null);
    } catch (e) { setError((e as Error).message); setPack(null); }
    finally { setLoading(false); }
  }, [projectKey]);

  useEffect(() => { void load(); }, [load]);

  const k = pack?.kpis;
  const costTone = k?.costHealth === 'over-budget' ? 'rose' : k?.costHealth === 'watch' ? 'amber' : k?.costHealth === 'on-budget' ? 'emerald' : 'slate';
  const schedTone = k?.scheduleHealth === 'slipping' ? 'rose' : k?.scheduleHealth === 'at-risk' ? 'amber' : 'emerald';

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Layer 7 · Executive Intelligence"
        title="Executive Dashboard"
        description="Strategic performance indicators consolidated from every layer — the executive view of governance, schedule, cost, risk and claims."
        actions={<button type="button" onClick={load} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-200 hover:border-slate-500"><IconRefresh className="h-3.5 w-3.5" /> Refresh</button>}
      />
      <ErrorBanner message={error} />

      {loading ? (
        <Card><div className="h-32 animate-pulse rounded bg-slate-800/40" /></Card>
      ) : !k ? (
        <EmptyState title="No executive data" description={`Nothing to summarise for ${projectKey} yet.`} />
      ) : (
        <>
          <Card>
            <div className="flex flex-wrap items-center gap-3">
              <GovernanceStatusBadge status={k.governanceStatus} />
              <p className="text-sm text-slate-200">{pack?.headline}</p>
            </div>
          </Card>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <Tile label="Governance" value={<GovernanceStatusBadge status={k.governanceStatus} />} />
            <Tile label="Schedule health" value={<Pill tone={schedTone}>{k.scheduleHealth.replace('-', ' ')}</Pill>} tone={schedTone} />
            <Tile label="Cost health" value={<Pill tone={costTone}>{k.costHealth.replace('-', ' ')}</Pill>} tone={costTone} />
            <Tile label="SPI" value={k.spi === null ? '—' : k.spi.toFixed(3)} />
            <Tile label="CPI" value={k.cpi === null ? '—' : k.cpi.toFixed(3)} tone={k.cpi !== null && k.cpi < 0.95 ? 'rose' : 'slate'} />
            <Tile label="Projected overrun" value={k.projectedCostOverrunPct === null ? '—' : `${k.projectedCostOverrunPct >= 0 ? '+' : ''}${k.projectedCostOverrunPct}%`} tone={k.projectedCostOverrunPct !== null && k.projectedCostOverrunPct > 0 ? 'rose' : 'emerald'} />
            <Tile label="Risk exposure" value={k.riskExposure.toFixed(3)} tone={k.riskExposure >= 0.6 ? 'rose' : k.riskExposure >= 0.35 ? 'amber' : 'slate'} />
            <Tile label="Critical risks" value={k.criticalRisks} tone={k.criticalRisks > 0 ? 'rose' : 'slate'} />
            <Tile label="Potential claims" value={k.potentialClaims} tone={k.potentialClaims > 0 ? 'amber' : 'slate'} />
            <Tile label="Open actions" value={k.openCorrectiveActions} tone={k.openCorrectiveActions > 0 ? 'sky' : 'slate'} />
          </div>
        </>
      )}
    </div>
  );
}

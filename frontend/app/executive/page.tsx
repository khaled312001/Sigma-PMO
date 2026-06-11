'use client';

/**
 * /executive — the L7 Executive Intelligence dashboard (Mr. Ayham's Layer 7):
 * strategic KPIs + a one-line governance headline for the current project.
 */

import { useCallback, useEffect, useState } from 'react';

import { AuthGate } from '../../components/AuthGate';
import { GaugeChart } from '../../components/Charts';
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

interface StrategicKpis {
  projectKey: string;
  strategicObjectiveAlignment: number;
  portfolioValueTracking: { totalBAC: number; totalEV: number; totalAC: number; valueDeliveredPct: number };
  benefitsRealizationPct: number;
  enterpriseGovernanceScore: number;
  basis: Record<string, string>;
}

export default function ExecutiveRoute() {
  return (
    <AuthGate capability="canEvaluateRules" surface="Executive">
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
  const [strategic, setStrategic] = useState<StrategicKpis | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!projectKey) return;
    setLoading(true);
    try {
      const [p, s] = await Promise.all([
        api<ExecutivePack>(`/executive/overview?projectKey=${encodeURIComponent(projectKey)}`),
        api<StrategicKpis>(`/executive/strategic?projectKey=${encodeURIComponent(projectKey)}`).catch(() => null),
      ]);
      setPack(p); setStrategic(s); setError(null);
    } catch (e) { setError((e as Error).message); setPack(null); setStrategic(null); }
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

          {strategic && <StrategicSection s={strategic} />}
        </>
      )}
    </div>
  );
}

/** Compact currency formatter (e.g. 12.3M / 4.5K) for the value-tracking card. */
function money(n: number): string {
  if (!Number.isFinite(n)) return '—';
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return `${Math.round(n)}`;
}

function StrategicSection({ s }: { s: StrategicKpis }) {
  const pv = s.portfolioValueTracking;
  const alignTone = s.strategicObjectiveAlignment >= 70 ? 'emerald' : s.strategicObjectiveAlignment >= 40 ? 'amber' : 'rose';
  const benefitTone = s.benefitsRealizationPct >= 70 ? 'emerald' : s.benefitsRealizationPct >= 40 ? 'amber' : 'rose';
  const govTone = s.enterpriseGovernanceScore >= 75 ? 'emerald' : s.enterpriseGovernanceScore >= 50 ? 'amber' : 'rose';
  const valuePct = Math.max(0, Math.min(100, pv.valueDeliveredPct));
  return (
    <section className="space-y-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">Strategic</p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card title="Strategic Objective Alignment">
          <div className="flex items-center justify-center">
            <GaugeChart
              value={s.strategicObjectiveAlignment}
              max={100}
              width={190}
              label={`${s.strategicObjectiveAlignment}`}
              hint={alignTone === 'emerald' ? 'ALIGNED' : alignTone === 'amber' ? 'PARTIAL' : 'WEAK'}
            />
          </div>
          <p className="mt-2 text-[11px] text-slate-500">{s.basis.strategicObjectiveAlignment}</p>
        </Card>

        <Card title="Portfolio Value Tracking">
          <dl className="grid grid-cols-3 gap-2 text-center">
            <div><dt className="text-[10px] uppercase tracking-wider text-slate-500">BAC</dt><dd className="text-base font-semibold tabular-nums text-slate-100">{money(pv.totalBAC)}</dd></div>
            <div><dt className="text-[10px] uppercase tracking-wider text-slate-500">EV</dt><dd className="text-base font-semibold tabular-nums text-emerald-300">{money(pv.totalEV)}</dd></div>
            <div><dt className="text-[10px] uppercase tracking-wider text-slate-500">AC</dt><dd className="text-base font-semibold tabular-nums text-amber-300">{money(pv.totalAC)}</dd></div>
          </dl>
          <div className="mt-3">
            <div className="mb-1 flex items-center justify-between text-[11px] text-slate-400">
              <span>Value delivered</span>
              <span className="tabular-nums text-slate-200">{pv.valueDeliveredPct}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-800">
              <div className="h-full rounded-full bg-emerald-500/70" style={{ width: `${valuePct}%` }} />
            </div>
          </div>
        </Card>

        <Card title="Benefits Realization" hint={s.basis.benefitsRealizationPct}>
          <p className={`text-4xl font-semibold tabular-nums ${benefitTone === 'emerald' ? 'text-emerald-300' : benefitTone === 'amber' ? 'text-amber-300' : 'text-rose-300'}`}>
            {s.benefitsRealizationPct}<span className="ms-1 text-lg text-slate-500">%</span>
          </p>
          <p className="mt-2 text-[11px] text-slate-500">EV/BAC weighted by the governance-status multiplier (deterministic heuristic v1).</p>
        </Card>

        <Card title="Enterprise Governance Score">
          <div className="flex items-center justify-center">
            <GaugeChart
              value={s.enterpriseGovernanceScore}
              max={100}
              width={190}
              label={`${s.enterpriseGovernanceScore}`}
              hint={govTone === 'emerald' ? 'HEALTHY' : govTone === 'amber' ? 'WATCH' : 'AT RISK'}
            />
          </div>
          <p className="mt-2 text-[11px] text-slate-500">{s.basis.enterpriseGovernanceScore}</p>
        </Card>
      </div>
    </section>
  );
}

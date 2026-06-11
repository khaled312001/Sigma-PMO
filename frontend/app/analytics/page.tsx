'use client';

/**
 * /analytics — the L4 Analytics Agent surface (Mr. Ayham's Layer 4): EVM
 * indicators (SPI/CPI/EAC/VAC), productivity KPIs, schedule + cost forecast.
 * Deterministic — the numbers come from canonical activity rows.
 */

import { useCallback, useEffect, useState } from 'react';

import { AuthGate } from '../../components/AuthGate';
import { BarChart, GaugeChart } from '../../components/Charts';
import { IconRefresh } from '../../components/Icons';
import { Card, EmptyState, ErrorBanner, PageHeader, Pill } from '../../components/ui';
import { api } from '../../lib/api';
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

export default function AnalyticsPageRoute() {
  return (
    <AuthGate surface="Analytics">
      <AnalyticsPage />
    </AuthGate>
  );
}

function money(n: number): string {
  return new Intl.NumberFormat('en', { maximumFractionDigits: 0 }).format(n);
}

function AnalyticsPage() {
  const projectKey = useCurrentProjectKey();
  const [data, setData] = useState<AnalyticsResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!projectKey) return;
    setLoading(true);
    try {
      const r = await api<AnalyticsResult>(`/analytics/evm?projectKey=${encodeURIComponent(projectKey)}`);
      setData(r);
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
    <div className="space-y-6">
      <PageHeader
        eyebrow="Layer 4 · Analytics"
        title="Analytics & Earned Value"
        description={
          'Deterministic EVM (SPI / CPI / EAC / VAC), productivity KPIs and schedule + cost forecasting ' +
          'computed from canonical activity rows — never an LLM.'
        }
        actions={
          <button type="button" onClick={load} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-200 hover:border-slate-500">
            <IconRefresh className="h-3.5 w-3.5" /> Refresh
          </button>
        }
      />

      <ErrorBanner message={error} />

      {loading ? (
        <Card><div className="h-40 animate-pulse rounded bg-slate-800/40" /></Card>
      ) : !evm ? (
        <EmptyState title="No analytics" description={`No activity data to analyse for ${projectKey}.`} />
      ) : (
        <>
          {/* Forecast banner */}
          {fc && (
            <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-800 bg-slate-900/50 px-4 py-3">
              <Pill tone={healthTone}>{fc.scheduleHealth.replace('-', ' ')}</Pill>
              {fc.projectedCostOverrunPct !== null && (
                <span className="text-sm text-slate-200">
                  Projected cost {fc.projectedCostOverrunPct >= 0 ? 'overrun' : 'saving'}:{' '}
                  <strong className={fc.projectedCostOverrunPct >= 0 ? 'text-rose-300' : 'text-emerald-300'}>
                    {fc.projectedCostOverrunPct >= 0 ? '+' : ''}{fc.projectedCostOverrunPct}%
                  </strong>
                </span>
              )}
              <span className="text-xs text-slate-500">{fc.note}</span>
            </div>
          )}

          {/* EVM gauges */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Card title="Schedule Performance (SPI)">
              {evm.spi !== null ? (
                <GaugeChart value={Math.min(evm.spi, 1.5)} max={1.5} label={evm.spi.toFixed(3)} hint={evm.spi >= 1 ? 'on/ahead of schedule' : 'behind schedule'} />
              ) : <p className="text-sm text-slate-500">No planned-value baseline.</p>}
            </Card>
            <Card title="Cost Performance (CPI)">
              {evm.cpi !== null ? (
                <GaugeChart value={Math.min(evm.cpi, 1.5)} max={1.5} label={evm.cpi.toFixed(3)} hint={evm.cpi >= 1 ? 'on/under budget' : 'over budget'} />
              ) : <p className="text-sm text-slate-500">No actual-cost data.</p>}
            </Card>
          </div>

          {/* EVM money tiles */}
          <Card title="Earned Value (currency)">
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
            <p className="mt-2 text-[11px] text-slate-500">{evm.costedActivityCount} costed activit(ies) underpin these indices.</p>
          </Card>

          {/* Productivity */}
          {prod && (
            <Card title="Productivity & progress">
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <BarChart
                  title="Activity status"
                  data={[
                    { label: 'Completed', value: prod.completedCount, accent: '#10b981' },
                    { label: 'In progress', value: prod.inProgressCount, accent: '#0ea5e9' },
                    { label: 'Not started', value: prod.notStartedCount, accent: '#64748b' },
                  ]}
                />
                <div className="flex flex-col justify-center gap-2 text-sm text-slate-200">
                  <div className="flex items-center justify-between"><span className="text-slate-500">Avg planned</span><strong className="tabular-nums">{prod.avgPlannedPct}%</strong></div>
                  <div className="flex items-center justify-between"><span className="text-slate-500">Avg actual</span><strong className="tabular-nums">{prod.avgActualPct}%</strong></div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Progress delta</span>
                    <Pill tone={prod.progressDeltaPct >= 0 ? 'emerald' : 'rose'}>{prod.progressDeltaPct >= 0 ? '+' : ''}{prod.progressDeltaPct} pp</Pill>
                  </div>
                  <div className="flex items-center justify-between"><span className="text-slate-500">Completion rate</span><strong className="tabular-nums">{Math.round(prod.completionRate * 100)}%</strong></div>
                </div>
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

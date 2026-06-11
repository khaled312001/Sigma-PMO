'use client';

/**
 * /risk — the L5 Risk Agent register (Mr. Ayham's Layer 5). Probability × impact
 * heat-map + the scored register with mitigations + escalation triggers, plus a
 * deterministic mitigation library (expandable per risk), a category-correlation
 * card and a whole-estate portfolio-risk strip.
 */

import { useCallback, useEffect, useState } from 'react';

import { AuthGate } from '../../components/AuthGate';
import { IconChevronRight, IconRefresh, IconSparkles } from '../../components/Icons';
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

interface MitigationOption { title: string; action: string; when: string; weight: string }
interface MitigationMatch {
  category: string; resolvedCategory: string; source: string; options: MitigationOption[];
}
interface MitigationsResult {
  projectKey: string; source: string; openRiskCount: number;
  rows: Array<{ risk: RiskRow; mitigation: MitigationMatch }>;
}

interface CorrelationResult {
  projectKey: string; categories: string[]; matrix: number[][];
  pairs: Array<{ a: string; b: string; count: number }>;
  sharedSourceGroups: Array<{ source: string; riskIds: string[]; titles: string[] }>;
  clusters: Array<{ name: string; categories: string[]; riskCount: number }>;
  basis: string;
}

interface PortfolioRiskResult {
  projectCount: number;
  totals: { openRiskCount: number; sumScore: number; maxScore: number };
  rows: Array<{
    projectKey: string; name: string; openRiskCount: number;
    sumScore: number; maxScore: number; topTier: string | null;
  }>;
  byPortfolio: Array<{ key: string; openRiskCount: number; sumScore: number; maxScore: number; projectCount: number }>;
  byProgram: Array<{ key: string; openRiskCount: number; sumScore: number; maxScore: number; projectCount: number }>;
  basis: string;
}

export default function RiskPageRoute() {
  return (
    <AuthGate capability="canEvaluateRules" surface="Risk">
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
  const [mitigations, setMitigations] = useState<MitigationsResult | null>(null);
  const [correlation, setCorrelation] = useState<CorrelationResult | null>(null);
  const [portfolio, setPortfolio] = useState<PortfolioRiskResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const load = useCallback(async () => {
    if (!projectKey) return;
    try {
      const q = `projectKey=${encodeURIComponent(projectKey)}`;
      const [r, m, c, p] = await Promise.all([
        api<RiskRow[]>(`/risk?${q}`),
        api<MitigationsResult>(`/risk/mitigations?${q}`).catch(() => null),
        api<CorrelationResult>(`/risk/correlation?${q}`).catch(() => null),
        api<PortfolioRiskResult>(`/risk/portfolio`).catch(() => null),
      ]);
      setRows(r); setMitigations(m); setCorrelation(c); setPortfolio(p);
      setError(null);
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

  const mitigationFor = (riskId: string): MitigationMatch | null =>
    mitigations?.rows.find((row) => row.risk.id === riskId)?.mitigation ?? null;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Layer 5 · Risk"
        title="Risk Register"
        description="Risks derived deterministically from L2 alerts and L4 EVM, scored probability × impact, with library-matched mitigations, category correlation and a portfolio-risk roll-up."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="ghost" size="sm" onClick={load}><IconRefresh className="h-3.5 w-3.5" /> Refresh</Button>
            {canRun && <Button variant="primary" size="sm" disabled={busy} onClick={run}><IconSparkles className="h-3.5 w-3.5" /> {busy ? 'Running…' : 'Run risk agent'}</Button>}
          </div>
        }
      />
      <ErrorBanner message={error} />

      {portfolio && portfolio.projectCount > 0 && <PortfolioStrip portfolio={portfolio} />}

      {rows && rows.length > 0 && <HeatMap rows={rows} />}

      {correlation && correlation.categories.length > 0 && <CorrelationCard correlation={correlation} />}

      {rows === null ? (
        <Card><div className="h-24 animate-pulse rounded bg-slate-800/40" /></Card>
      ) : rows.length === 0 ? (
        <EmptyState title="No risks yet" description={canRun ? 'Run the risk agent to derive the register from current findings.' : 'The register appears once a reviewer runs the risk agent.'} />
      ) : (
        <div className="space-y-2">
          {rows.map((r) => {
            const match = mitigationFor(r.id);
            const isOpen = !!expanded[r.id];
            return (
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

                {match && match.options.length > 0 && (
                  <div className="mt-2">
                    <button
                      type="button"
                      onClick={() => setExpanded((s) => ({ ...s, [r.id]: !s[r.id] }))}
                      className="inline-flex items-center gap-1 text-xs text-sky-300 hover:text-sky-200"
                    >
                      <IconChevronRight className={`h-3.5 w-3.5 transition-transform ${isOpen ? 'rotate-90' : ''}`} />
                      {isOpen ? 'Hide' : 'Show'} {match.options.length} mitigation option(s)
                      <span className="ms-1 font-mono text-[10px] text-slate-500" dir="ltr">{match.source}</span>
                    </button>
                    {isOpen && (
                      <ul className="mt-2 space-y-2 border-s border-slate-800 ps-3">
                        {match.options.map((o, i) => (
                          <li key={i} className="text-sm">
                            <div className="flex flex-wrap items-center gap-2">
                              <Pill tone={o.weight === 'recovery' ? 'rose' : o.weight === 'corrective' ? 'amber' : 'sky'}>{o.weight}</Pill>
                              <span className="font-medium text-slate-100">{o.title}</span>
                            </div>
                            <p className="mt-0.5 text-slate-300">{o.action}</p>
                            <p className="mt-0.5 text-[11px] text-slate-500"><span className="uppercase tracking-wider">When:</span> {o.when}</p>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function PortfolioStrip({ portfolio }: { portfolio: PortfolioRiskResult }) {
  return (
    <Card title="Portfolio risk (whole estate)">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { k: 'Projects', v: String(portfolio.projectCount) },
          { k: 'Open risks', v: String(portfolio.totals.openRiskCount) },
          { k: 'Σ priority', v: portfolio.totals.sumScore.toFixed(2) },
          { k: 'Max priority', v: portfolio.totals.maxScore.toFixed(2) },
        ].map((c) => (
          <div key={c.k} className="rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{c.k}</p>
            <p className="mt-0.5 text-sm font-semibold tabular-nums text-slate-100" dir="ltr">{c.v}</p>
          </div>
        ))}
      </div>
      {(portfolio.byPortfolio.length > 0 || portfolio.byProgram.length > 0) && (
        <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
          {portfolio.byPortfolio.length > 0 && (
            <GroupTable title="By portfolio" groups={portfolio.byPortfolio} />
          )}
          {portfolio.byProgram.length > 0 && (
            <GroupTable title="By program" groups={portfolio.byProgram} />
          )}
        </div>
      )}
      <p className="mt-2 text-[11px] text-slate-500">{portfolio.basis}</p>
    </Card>
  );
}

function GroupTable({ title, groups }: { title: string; groups: Array<{ key: string; openRiskCount: number; sumScore: number; maxScore: number; projectCount: number }> }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950/30 p-3">
      <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">{title}</p>
      <table className="w-full text-left text-xs">
        <thead>
          <tr className="text-[9px] uppercase tracking-wider text-slate-500">
            <th className="py-1 pe-2 font-semibold">Key</th>
            <th className="py-1 pe-2 text-right font-semibold">Projects</th>
            <th className="py-1 pe-2 text-right font-semibold">Open</th>
            <th className="py-1 text-right font-semibold">Σ priority</th>
          </tr>
        </thead>
        <tbody>
          {groups.map((g) => (
            <tr key={g.key} className="border-t border-slate-800/60">
              <td className="py-1 pe-2 font-mono text-slate-300" dir="ltr">{g.key}</td>
              <td className="py-1 pe-2 text-right tabular-nums text-slate-400" dir="ltr">{g.projectCount}</td>
              <td className="py-1 pe-2 text-right tabular-nums text-slate-400" dir="ltr">{g.openRiskCount}</td>
              <td className="py-1 text-right tabular-nums text-slate-300" dir="ltr">{g.sumScore.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CorrelationCard({ correlation }: { correlation: CorrelationResult }) {
  const { categories, matrix } = correlation;
  const max = Math.max(1, ...matrix.flat());
  const cellTone = (v: number, diag: boolean) => {
    if (v === 0) return 'bg-slate-900/40 text-slate-600';
    const ratio = v / max;
    if (diag) return 'bg-slate-700/50 text-slate-200';
    if (ratio >= 0.66) return 'bg-rose-600/60 text-slate-50';
    if (ratio >= 0.33) return 'bg-amber-500/50 text-slate-50';
    return 'bg-sky-600/40 text-slate-100';
  };
  return (
    <Card title="Risk correlation (category co-occurrence)">
      <div className="overflow-x-auto">
        <table className="text-xs">
          <thead>
            <tr>
              <th className="p-1" />
              {categories.map((c) => (
                <th key={c} className="p-1 text-[9px] font-semibold uppercase tracking-wider text-slate-500">{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {categories.map((rowCat, i) => (
              <tr key={rowCat}>
                <th className="p-1 text-right text-[9px] font-semibold uppercase tracking-wider text-slate-500">{rowCat}</th>
                {categories.map((colCat, j) => (
                  <td key={colCat} className="p-0.5">
                    <div className={`grid h-7 w-7 place-items-center rounded text-[11px] font-semibold tabular-nums ${cellTone(matrix[i][j], i === j)}`}>
                      {matrix[i][j] > 0 ? matrix[i][j] : ''}
                    </div>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {correlation.clusters.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {correlation.clusters.map((cl) => (
            <Pill key={cl.name} tone="violet">{cl.name} · {cl.riskCount} risk(s)</Pill>
          ))}
        </div>
      )}
      {correlation.sharedSourceGroups.length > 0 && (
        <ul className="mt-2 space-y-1 text-[11px] text-slate-400">
          {correlation.sharedSourceGroups.map((g) => (
            <li key={g.source}>
              <span className="font-mono text-slate-300" dir="ltr">{g.source}</span>: {g.titles.join(', ')}
            </li>
          ))}
        </ul>
      )}
      <p className="mt-2 text-[11px] text-slate-500">{correlation.basis}</p>
    </Card>
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
                  <div key={i} className={`grid place-items-center rounded ${colour(p, i)} text-xs font-bold text-slate-50`} style={{ height: 28 }}>
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

'use client';

/**
 * /governance-command — the L8 Sigma Governance AI command center (the
 * centerpiece). Enterprise-down governance oversight: the 4-tier status
 * distribution, every node's consolidated verdict (which agents ran, open
 * risks/claims/actions), and the corrective-action queue. This is the
 * "Governance Decision Support System, not a reporting tool" surface — it
 * recomputes and issues actions, not just displays.
 */

import { useCallback, useEffect, useState } from 'react';

import { AuthGate } from '../../components/AuthGate';
import { DonutChart } from '../../components/Charts';
import { GovernanceStatusBadge } from '../../components/GovernanceStatusBadge';
import { IconRefresh, IconShield, IconSparkles } from '../../components/Icons';
import { useToast } from '../../components/ToastProvider';
import { Button, Card, EmptyState, ErrorBanner, PageHeader, Pill } from '../../components/ui';
import { api } from '../../lib/api';
import { CAPABILITIES } from '../../lib/capabilities';
import { useMe } from '../../lib/me-context';

interface AgentRollup { agentKey: string; layer: string; status: string; governanceStatus: string | null; escalationLevel: string | null; confidence: number | null }
interface ConsolidatedNode {
  nodeType: string; nodeBusinessKey: string; governanceStatus: string | null; score: number | null;
  agents: AgentRollup[]; openCorrectiveActions: number; openRisks: number; criticalRisks: number;
  potentialClaims: number; topRisks: Array<{ title: string; tier: string; priorityScore: number }>;
}
interface Overview { nodes: ConsolidatedNode[]; statusTally: Record<string, number> }
interface CorrectiveAction { id: string; title: string; description: string; sourceLayer: string; priority: string; escalationLevel: string | null; status: string }

const STATUS_ACCENT: Record<string, string> = { green: '#10b981', yellow: '#fbbf24', orange: '#f97316', red: '#dc2626', unknown: '#475569' };

export default function GovernanceCommandRoute() {
  return (
    <AuthGate capability="canEvaluateRules" surface="Governance command">
      <GovernanceCommand />
    </AuthGate>
  );
}

function GovernanceCommand() {
  const toast = useToast();
  const { me } = useMe();
  const canRun = !!(me?.user?.role && CAPABILITIES[me.user.role].canEvaluateRules);

  const [overview, setOverview] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [actions, setActions] = useState<CorrectiveAction[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const o = await api<Overview>('/governance-command/overview');
      setOverview(o); setError(null);
      if (!selected && o.nodes[0]) setSelected(o.nodes[0].nodeBusinessKey);
    } catch (e) { setError((e as Error).message); }
  }, [selected]);

  useEffect(() => { void load(); }, [load]);

  const loadActions = useCallback(async (key: string) => {
    try {
      const a = await api<CorrectiveAction[]>(`/governance-command/actions?nodeKey=${encodeURIComponent(key)}`);
      setActions(a);
    } catch { setActions([]); }
  }, []);

  useEffect(() => { if (selected) void loadActions(selected); }, [selected, loadActions]);

  const recompute = async (key: string) => {
    setBusy(key);
    try {
      await api('/governance-command/recompute', { method: 'POST', body: JSON.stringify({ nodeKey: key, nodeType: 'project' }) });
      toast.success('Consolidated', `${key}: L8 recomputed status + corrective actions.`);
      await load();
      await loadActions(key);
    } catch (e) { toast.error('Recompute failed', (e as Error).message); }
    finally { setBusy(null); }
  };

  const advance = async (id: string, status: string, key: string) => {
    try {
      await api(`/governance-command/actions/${id}/status`, { method: 'POST', body: JSON.stringify({ status }) });
      await loadActions(key);
    } catch (e) { toast.error('Update failed', (e as Error).message); }
  };

  const tally = overview?.statusTally ?? {};
  const donutData = (['red', 'orange', 'yellow', 'green', 'unknown'] as const)
    .map((k) => ({ label: k, value: tally[k] ?? 0, accent: STATUS_ACCENT[k] }))
    .filter((d) => d.value > 0);
  const totalNodes = overview?.nodes.length ?? 0;
  const selectedNode = overview?.nodes.find((n) => n.nodeBusinessKey === selected) ?? null;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Layer 8 · Sigma Governance AI"
        title="Governance Command Center"
        description="The final authority: every node's consolidated 4-tier verdict, the agents behind it, and the corrective-action queue. Recompute re-runs the L8 consolidation and re-issues actions."
        actions={<Button variant="ghost" size="sm" onClick={load}><IconRefresh className="h-3.5 w-3.5" /> Refresh</Button>}
      />
      <ErrorBanner message={error} />

      {/* Status distribution + headline tiles */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <Card title="Governance status distribution">
          {donutData.length > 0 ? (
            <DonutChart data={donutData} size={180} centerValue={totalNodes} centerLabel="nodes" />
          ) : <p className="text-sm text-slate-500">No nodes yet.</p>}
        </Card>
        <Card title="Portfolio governance oversight">
          {overview === null ? (
            <div className="h-24 animate-pulse rounded bg-slate-800/40" />
          ) : overview.nodes.length === 0 ? (
            <EmptyState title="No nodes" description="No current projects to consolidate." />
          ) : (
            <ul className="space-y-1.5" aria-label="Nodes">
              {overview.nodes.map((n) => (
                <li key={n.nodeBusinessKey}>
                  <button
                    type="button"
                    onClick={() => setSelected(n.nodeBusinessKey)}
                    className={`flex w-full flex-wrap items-center gap-2 rounded-lg border px-3 py-2 text-start transition ${
                      selected === n.nodeBusinessKey ? 'border-sky-500/60 bg-sky-500/5' : 'border-slate-800 hover:border-slate-600'
                    }`}
                  >
                    <GovernanceStatusBadge status={n.governanceStatus} size="sm" />
                    <span className="font-mono text-xs text-slate-200" dir="ltr">{n.nodeBusinessKey}</span>
                    <span className="ms-auto flex items-center gap-2 text-[10px] text-slate-400">
                      <span>{n.agents.length} agents</span>
                      {n.criticalRisks > 0 && <Pill tone="rose">{n.criticalRisks} crit risk</Pill>}
                      {n.potentialClaims > 0 && <Pill tone="amber">{n.potentialClaims} claim</Pill>}
                      {n.openCorrectiveActions > 0 && <Pill tone="violet">{n.openCorrectiveActions} action</Pill>}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {/* Selected node detail */}
      {selectedNode && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card
            title={`Consolidated verdict · ${selectedNode.nodeBusinessKey}`}
            actions={canRun && (
              <Button variant="primary" size="sm" disabled={busy === selectedNode.nodeBusinessKey} onClick={() => recompute(selectedNode.nodeBusinessKey)}>
                <IconSparkles className="h-3.5 w-3.5" /> {busy === selectedNode.nodeBusinessKey ? 'Consolidating…' : 'Recompute (L8)'}
              </Button>
            )}
          >
            <div className="mb-3 flex items-center gap-2">
              <GovernanceStatusBadge status={selectedNode.governanceStatus} />
              {selectedNode.score !== null && <span className="text-xs text-slate-500">risk score {selectedNode.score.toFixed(2)}</span>}
            </div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Agents consolidated</p>
            <ul className="mt-1 space-y-1">
              {selectedNode.agents.map((a) => (
                <li key={a.agentKey} className="flex items-center gap-2 text-xs">
                  <span className="font-mono text-slate-300" dir="ltr">{a.agentKey}</span>
                  <span className={a.status === 'completed' ? 'text-emerald-400' : 'text-rose-400'}>{a.status}</span>
                  {a.governanceStatus && <GovernanceStatusBadge status={a.governanceStatus} size="sm" showLabel={false} />}
                  {a.escalationLevel && <Pill tone="rose">{a.escalationLevel}</Pill>}
                  {a.confidence !== null && <span className="ms-auto text-slate-500">conf {Math.round(a.confidence * 100)}%</span>}
                </li>
              ))}
              {selectedNode.agents.length === 0 && <li className="text-xs text-slate-500">No agent runs yet — run the pipeline first.</li>}
            </ul>
            {selectedNode.topRisks.length > 0 && (
              <>
                <p className="mt-3 text-[10px] font-semibold uppercase tracking-wider text-slate-500">Top risks</p>
                <ul className="mt-1 space-y-1">
                  {selectedNode.topRisks.map((r, i) => (
                    <li key={i} className="flex items-center gap-2 text-xs">
                      <Pill tone={r.tier === 'critical' ? 'rose' : r.tier === 'high' ? 'amber' : 'sky'}>{r.tier}</Pill>
                      <span className="text-slate-200">{r.title}</span>
                      <span className="ms-auto font-mono text-slate-500">{r.priorityScore}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </Card>

          <Card title={`Corrective actions · ${selectedNode.nodeBusinessKey}`}>
            {actions === null ? (
              <div className="h-20 animate-pulse rounded bg-slate-800/40" />
            ) : actions.length === 0 ? (
              <p className="text-sm text-slate-500">No corrective actions. Recompute to generate them from open risks + claims.</p>
            ) : (
              <ul className="space-y-2">
                {actions.map((a) => (
                  <li key={a.id} className="rounded-lg border border-slate-800 bg-slate-950/40 p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Pill tone={a.priority === 'critical' ? 'rose' : a.priority === 'high' ? 'amber' : 'sky'}>{a.priority}</Pill>
                      <span className="font-mono text-[10px] text-slate-500" dir="ltr">{a.sourceLayer}</span>
                      {a.escalationLevel && <Pill tone="rose">{a.escalationLevel}</Pill>}
                      <Pill tone={a.status === 'done' ? 'emerald' : a.status === 'in-progress' ? 'sky' : 'slate'}>{a.status}</Pill>
                    </div>
                    <p className="mt-1 text-sm font-medium text-slate-100">{a.title}</p>
                    <p className="mt-0.5 text-xs text-slate-400">{a.description}</p>
                    {canRun && a.status !== 'done' && (
                      <div className="mt-2 flex gap-1.5">
                        {a.status !== 'in-progress' && <button type="button" onClick={() => advance(a.id, 'in-progress', selectedNode.nodeBusinessKey)} className="rounded bg-slate-800 px-2 py-0.5 text-[11px] text-slate-200 hover:bg-slate-700">Start</button>}
                        <button type="button" onClick={() => advance(a.id, 'done', selectedNode.nodeBusinessKey)} className="rounded bg-emerald-700/60 px-2 py-0.5 text-[11px] text-emerald-100 hover:bg-emerald-700">Mark done</button>
                        <button type="button" onClick={() => advance(a.id, 'dismissed', selectedNode.nodeBusinessKey)} className="rounded bg-slate-800 px-2 py-0.5 text-[11px] text-slate-400 hover:bg-slate-700">Dismiss</button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      )}

      <p className="flex items-center gap-1.5 text-[11px] text-slate-500">
        <IconShield className="h-3.5 w-3.5" /> L8 consolidation is pull-based and idempotent — recompute is safe to run repeatedly.
      </p>
    </div>
  );
}

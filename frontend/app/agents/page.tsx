'use client';

/**
 * /agents — the L0–L8 agent registry. Proves the standardized Agent Contract:
 * every registered agent surfaces here automatically (future agents included),
 * each rendered through the uniform AgentContractCard, with its recent
 * executions and a one-click run against the current project.
 */

import { useCallback, useEffect, useState } from 'react';

import { AgentContractCard, AgentDescriptor } from '../../components/AgentContractCard';
import { AuthGate } from '../../components/AuthGate';
import { GovernanceStatusBadge } from '../../components/GovernanceStatusBadge';
import { IconRefresh, IconSparkles } from '../../components/Icons';
import { useToast } from '../../components/ToastProvider';
import { Button, Card, ErrorBanner, PageHeader, Pill } from '../../components/ui';
import { api } from '../../lib/api';
import { CAPABILITIES } from '../../lib/capabilities';
import { useMe } from '../../lib/me-context';
import { useCurrentProjectKey } from '../../lib/project-context';

interface Execution {
  id: string; agentKey: string; status: string; governanceStatus: string | null;
  confidenceOverall: number | null; finishedAt: string | null;
}

/** Per-agent runtime config the enriched /agents listing now carries. */
interface AgentConfig {
  enabled: boolean;
  modelTier: 'default' | 'claude-haiku' | 'claude-sonnet' | 'claude-opus' | string;
}
/** The enriched descriptor: the standard contract + its config. */
type EnrichedAgent = AgentDescriptor & { config?: AgentConfig };

const TIER_LABEL: Record<string, string> = {
  default: 'Platform default',
  'claude-haiku': 'Claude Haiku',
  'claude-sonnet': 'Claude Sonnet',
  'claude-opus': 'Claude Opus',
};

export default function AgentsRoute() {
  return (
    <AuthGate capability="canEvaluateRules" surface="Agents">
      <AgentsPage />
    </AuthGate>
  );
}

function AgentsPage() {
  const toast = useToast();
  const projectKey = useCurrentProjectKey();
  const { me } = useMe();
  const canRun = !!(me?.user?.role && CAPABILITIES[me.user.role].canEvaluateRules);

  const [agents, setAgents] = useState<EnrichedAgent[] | null>(null);
  const [execs, setExecs] = useState<Execution[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [a, e] = await Promise.all([
        api<EnrichedAgent[]>('/agents'),
        api<Execution[]>(`/agents/executions?nodeBusinessKey=${encodeURIComponent(projectKey)}&limit=30`),
      ]);
      // Order by layer key (l0..l8).
      a.sort((x, y) => x.layer.localeCompare(y.layer));
      setAgents(a); setExecs(e); setError(null);
    } catch (err) { setError((err as Error).message); }
  }, [projectKey]);

  useEffect(() => { void load(); }, [load]);

  const latestFor = (agentKey: string) => execs.find((e) => e.agentKey === agentKey) ?? null;

  const run = async (agentKey: string) => {
    setBusy(agentKey);
    try {
      await api(`/agents/${agentKey}/run`, { method: 'POST', body: JSON.stringify({ projectKey }) });
      toast.success('Agent ran', `${agentKey} completed against ${projectKey}.`);
      await load();
    } catch (e) { toast.error('Run failed', (e as Error).message); }
    finally { setBusy(null); }
  };

  const runPipeline = async () => {
    setBusy('pipeline');
    try {
      const r = await api<unknown[]>('/agents/pipeline/run', { method: 'POST', body: JSON.stringify({ projectKey }) });
      toast.success('Pipeline ran', `${Array.isArray(r) ? r.length : 0} agents L1→L8 against ${projectKey}.`);
      await load();
    } catch (e) { toast.error('Pipeline failed', (e as Error).message); }
    finally { setBusy(null); }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Architecture · Agents"
        title="Agent Registry (L0–L8)"
        description="Every layer is an independent service following the same standardized contract (Objective · Inputs · Processing · Outputs · Confidence · Escalation · Audit). New agents register here automatically — no core change."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="ghost" size="sm" onClick={load}><IconRefresh className="h-3.5 w-3.5" /> Refresh</Button>
            {canRun && <Button variant="primary" size="sm" disabled={busy === 'pipeline'} onClick={runPipeline}><IconSparkles className="h-3.5 w-3.5" /> {busy === 'pipeline' ? 'Running…' : 'Run full pipeline'}</Button>}
          </div>
        }
      />
      <ErrorBanner message={error} />

      {agents === null ? (
        <Card><div className="h-40 animate-pulse rounded bg-slate-800/40" /></Card>
      ) : (
        <div className="space-y-3">
          {agents.map((a) => {
            const last = latestFor(a.agentKey);
            const enabled = a.config?.enabled ?? true;
            const tier = a.config?.modelTier ?? 'default';
            return (
              <AgentContractCard
                key={a.agentKey}
                descriptor={a}
                footer={
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <Pill tone={enabled ? 'emerald' : 'rose'}>{enabled ? 'Enabled' : 'Disabled'}</Pill>
                      <Pill tone="slate">{TIER_LABEL[tier] ?? tier}</Pill>
                      {!enabled && (
                        <span className="text-rose-300/90">
                          Disabled in the Governance Configuration Center — runs are refused (409) until re-enabled.
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      {last ? (
                        <>
                          <span className="text-slate-500">Last run:</span>
                          <Pill tone={last.status === 'completed' ? 'emerald' : 'rose'}>{last.status}</Pill>
                          {last.governanceStatus && <GovernanceStatusBadge status={last.governanceStatus} size="sm" />}
                          {last.confidenceOverall !== null && <span className="text-slate-400">conf {Math.round(last.confidenceOverall * 100)}%</span>}
                          {last.finishedAt && <span className="text-slate-500" dir="ltr">{new Date(last.finishedAt).toLocaleString()}</span>}
                        </>
                      ) : (
                        <span className="text-slate-500">No run yet for {projectKey}.</span>
                      )}
                      {canRun && (
                        <span
                          className="ms-auto"
                          title={enabled ? undefined : 'This agent is disabled in Admin → Governance Config.'}
                        >
                          <Button variant="ghost" size="sm" disabled={busy === a.agentKey || !enabled} onClick={() => run(a.agentKey)}>
                            {busy === a.agentKey ? 'Running…' : `Run ${a.agentKey}`}
                          </Button>
                        </span>
                      )}
                    </div>
                  </div>
                }
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

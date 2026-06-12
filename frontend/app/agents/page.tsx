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
import { useI18n } from '../../lib/i18n';
import { useMe } from '../../lib/me-context';
import { useCurrentProjectKey } from '../../lib/project-context';

interface Execution {
  id: string; agentKey: string; status: string; governanceStatus: string | null;
  confidenceOverall: number | null; finishedAt: string | null;
}

/** GET /agents/health — one row per agent (deterministic, audit-trail derived). */
interface AgentHealth {
  agentKey: string;
  layer: string | null;
  registered: boolean;
  runs: number;
  completed: number;
  failed: number;
  successRate: number;
  avgConfidence: number | null;
  lastStatus: string | null;
  lastGovernanceStatus: string | null;
  lastRunAt: string | null;
  governanceImpactScore: number;
  healthStatus: 'healthy' | 'degraded' | 'failing';
}
interface AgentHealthReport {
  asOfDate: string;
  agents: AgentHealth[];
  totals: { agents: number; healthy: number; degraded: number; failing: number; totalRuns: number };
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
  const { lang } = useI18n();
  const ar = lang === 'ar';
  const canRun = !!(me?.user?.role && CAPABILITIES[me.user.role].canEvaluateRules);

  const [agents, setAgents] = useState<EnrichedAgent[] | null>(null);
  const [execs, setExecs] = useState<Execution[]>([]);
  const [health, setHealth] = useState<AgentHealthReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [a, e, h] = await Promise.all([
        api<EnrichedAgent[]>('/agents'),
        api<Execution[]>(`/agents/executions?nodeBusinessKey=${encodeURIComponent(projectKey)}&limit=30`),
        api<AgentHealthReport>('/agents/health').catch(() => null),
      ]);
      // Order by layer key (l0..l8).
      a.sort((x, y) => x.layer.localeCompare(y.layer));
      setAgents(a); setExecs(e); setHealth(h); setError(null);
    } catch (err) { setError((err as Error).message); }
  }, [projectKey]);

  useEffect(() => { void load(); }, [load]);

  const latestFor = (agentKey: string) => execs.find((e) => e.agentKey === agentKey) ?? null;

  const run = async (agentKey: string) => {
    setBusy(agentKey);
    try {
      await api(`/agents/${agentKey}/run`, { method: 'POST', body: JSON.stringify({ projectKey }) });
      toast.success(ar ? 'تم تشغيل الوكيل' : 'Agent ran', ar ? `اكتمل ${agentKey} على ${projectKey}.` : `${agentKey} completed against ${projectKey}.`);
      await load();
    } catch (e) { toast.error(ar ? 'فشل التشغيل' : 'Run failed', (e as Error).message); }
    finally { setBusy(null); }
  };

  const runPipeline = async () => {
    setBusy('pipeline');
    try {
      const r = await api<unknown[]>('/agents/pipeline/run', { method: 'POST', body: JSON.stringify({ projectKey }) });
      toast.success(ar ? 'تم تشغيل خط الأنابيب' : 'Pipeline ran', ar ? `${Array.isArray(r) ? r.length : 0} وكلاء L1→L8 على ${projectKey}.` : `${Array.isArray(r) ? r.length : 0} agents L1→L8 against ${projectKey}.`);
      await load();
    } catch (e) { toast.error(ar ? 'فشل خط الأنابيب' : 'Pipeline failed', (e as Error).message); }
    finally { setBusy(null); }
  };

  return (
    <div className="space-y-6" dir={ar ? 'rtl' : 'ltr'}>
      <PageHeader
        eyebrow={ar ? 'البنية · الوكلاء' : 'Architecture · Agents'}
        title={ar ? 'سجل الوكلاء (L0–L8)' : 'Agent Registry (L0–L8)'}
        description={
          ar
            ? 'كل طبقة خدمة مستقلة تتبع العقد المعياري ذاته (الهدف · المدخلات · المعالجة · المخرجات · الثقة · التصعيد · سجل التدقيق). تُسجَّل الوكلاء الجديدة هنا تلقائيًا — دون أي تغيير في النواة.'
            : 'Every layer is an independent service following the same standardized contract (Objective · Inputs · Processing · Outputs · Confidence · Escalation · Audit). New agents register here automatically — no core change.'
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="ghost" size="sm" onClick={load}><IconRefresh className="h-3.5 w-3.5" /> {ar ? 'تحديث' : 'Refresh'}</Button>
            {canRun && <Button variant="primary" size="sm" disabled={busy === 'pipeline'} onClick={runPipeline}><IconSparkles className="h-3.5 w-3.5" /> {busy === 'pipeline' ? (ar ? 'جارٍ التشغيل…' : 'Running…') : (ar ? 'تشغيل خط الأنابيب الكامل' : 'Run full pipeline')}</Button>}
          </div>
        }
      />
      <ErrorBanner message={error} />

      {health && <AgentHealthSection report={health} ar={ar} />}

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
                      <Pill tone={enabled ? 'emerald' : 'rose'}>{enabled ? (ar ? 'مُفعّل' : 'Enabled') : (ar ? 'مُعطّل' : 'Disabled')}</Pill>
                      <Pill tone="slate">{TIER_LABEL[tier] ?? tier}</Pill>
                      {!enabled && (
                        <span className="text-rose-300/90">
                          {ar
                            ? 'مُعطّل في مركز إعدادات الحوكمة — تُرفض عمليات التشغيل (409) حتى إعادة التفعيل.'
                            : 'Disabled in the Governance Configuration Center — runs are refused (409) until re-enabled.'}
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      {last ? (
                        <>
                          <span className="text-slate-500">{ar ? 'آخر تشغيل:' : 'Last run:'}</span>
                          <Pill tone={last.status === 'completed' ? 'emerald' : 'rose'}>{last.status}</Pill>
                          {last.governanceStatus && <GovernanceStatusBadge status={last.governanceStatus} size="sm" />}
                          {last.confidenceOverall !== null && <span className="text-slate-400">{ar ? 'ثقة' : 'conf'} {Math.round(last.confidenceOverall * 100)}%</span>}
                          {last.finishedAt && <span className="text-slate-500" dir="ltr">{new Date(last.finishedAt).toLocaleString()}</span>}
                        </>
                      ) : (
                        <span className="text-slate-500">{ar ? `لا يوجد تشغيل بعد لـ ${projectKey}.` : `No run yet for ${projectKey}.`}</span>
                      )}
                      {canRun && (
                        <span
                          className="ms-auto"
                          title={enabled ? undefined : (ar ? 'هذا الوكيل مُعطّل في الإدارة ← إعدادات الحوكمة.' : 'This agent is disabled in Admin → Governance Config.')}
                        >
                          <Button variant="ghost" size="sm" disabled={busy === a.agentKey || !enabled} onClick={() => run(a.agentKey)}>
                            {busy === a.agentKey ? (ar ? 'جارٍ التشغيل…' : 'Running…') : `${ar ? 'تشغيل' : 'Run'} ${a.agentKey}`}
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

// ── Agent health (from the AgentExecution audit trail) ──────────────────────

const HEALTH_TONE: Record<AgentHealth['healthStatus'], 'emerald' | 'amber' | 'rose'> = {
  healthy: 'emerald',
  degraded: 'amber',
  failing: 'rose',
};
const HEALTH_LABEL: Record<AgentHealth['healthStatus'], { en: string; ar: string }> = {
  healthy: { en: 'Healthy', ar: 'سليم' },
  degraded: { en: 'Degraded', ar: 'متدهور' },
  failing: { en: 'Failing', ar: 'متعثّر' },
};

/** Color the governance-impact number: ≥75 emerald, ≥50 amber, else rose. */
function impactClass(score: number): string {
  if (score >= 75) return 'text-emerald-300';
  if (score >= 50) return 'text-amber-300';
  return 'text-rose-300';
}

function AgentHealthSection({ report, ar }: { report: AgentHealthReport; ar: boolean }) {
  const t = report.totals;
  return (
    <Card
      title={ar ? 'صحة الوكلاء' : 'Agent health'}
      hint={
        ar
          ? 'مشتقّة حتميًا من سجل تدقيق تنفيذ الوكلاء (معدل النجاح · متوسط الثقة · أثر الحوكمة المرجّح بالحداثة).'
          : 'Derived deterministically from the agent-execution audit trail (success rate · mean confidence · recency-weighted governance impact).'
      }
    >
      <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
        <Pill tone="emerald">{ar ? 'سليم' : 'Healthy'} {t.healthy}</Pill>
        <Pill tone="amber">{ar ? 'متدهور' : 'Degraded'} {t.degraded}</Pill>
        <Pill tone="rose">{ar ? 'متعثّر' : 'Failing'} {t.failing}</Pill>
        <span className="text-slate-500">
          {ar ? `${t.agents} وكيل · ${t.totalRuns} تشغيل` : `${t.agents} agents · ${t.totalRuns} runs`}
        </span>
      </div>

      {report.agents.length === 0 ? (
        <p className="text-sm text-slate-500">{ar ? 'لا توجد بيانات صحة بعد.' : 'No health data yet.'}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-start text-xs">
            <thead>
              <tr className="border-b border-slate-800 text-[10px] uppercase tracking-wider text-slate-500">
                <th className="py-2 pe-3 text-start font-semibold">{ar ? 'الوكيل' : 'Agent'}</th>
                <th className="py-2 pe-3 text-start font-semibold">{ar ? 'الطبقة' : 'Layer'}</th>
                <th className="py-2 pe-3 text-end font-semibold">{ar ? 'تشغيلات' : 'Runs'}</th>
                <th className="py-2 pe-3 text-end font-semibold">{ar ? 'معدل النجاح' : 'Success'}</th>
                <th className="py-2 pe-3 text-end font-semibold">{ar ? 'متوسط الثقة' : 'Avg conf'}</th>
                <th className="py-2 pe-3 text-end font-semibold">{ar ? 'أثر الحوكمة' : 'Gov impact'}</th>
                <th className="py-2 pe-3 text-start font-semibold">{ar ? 'آخر حالة' : 'Last'}</th>
                <th className="py-2 text-start font-semibold">{ar ? 'الصحة' : 'Health'}</th>
              </tr>
            </thead>
            <tbody>
              {report.agents.map((a) => (
                <tr key={a.agentKey} className="border-b border-slate-800/60 last:border-0">
                  <td className="py-2 pe-3 font-mono text-slate-200" dir="ltr">
                    {a.agentKey}
                    {!a.registered && (
                      <span className="ms-1 text-[10px] text-slate-500">{ar ? '(تاريخي)' : '(historical)'}</span>
                    )}
                  </td>
                  <td className="py-2 pe-3 font-mono text-slate-400" dir="ltr">{a.layer ?? '—'}</td>
                  <td className="py-2 pe-3 text-end tabular-nums text-slate-300">{a.runs}</td>
                  <td className="py-2 pe-3 text-end tabular-nums text-slate-200">
                    {a.runs === 0 ? '—' : `${Math.round(a.successRate * 100)}%`}
                  </td>
                  <td className="py-2 pe-3 text-end tabular-nums text-slate-200">
                    {a.avgConfidence === null ? '—' : `${Math.round(a.avgConfidence * 100)}%`}
                  </td>
                  <td className={`py-2 pe-3 text-end font-semibold tabular-nums ${impactClass(a.governanceImpactScore)}`}>
                    {a.governanceImpactScore}
                  </td>
                  <td className="py-2 pe-3">
                    {a.lastStatus ? (
                      <span className="flex items-center gap-1.5">
                        <Pill tone={a.lastStatus === 'completed' ? 'emerald' : a.lastStatus === 'failed' ? 'rose' : 'slate'}>
                          {a.lastStatus}
                        </Pill>
                        {a.lastGovernanceStatus && <GovernanceStatusBadge status={a.lastGovernanceStatus} size="sm" />}
                      </span>
                    ) : (
                      <span className="text-slate-500">{ar ? 'لا شيء' : 'none'}</span>
                    )}
                  </td>
                  <td className="py-2">
                    <Pill tone={HEALTH_TONE[a.healthStatus]}>
                      {ar ? HEALTH_LABEL[a.healthStatus].ar : HEALTH_LABEL[a.healthStatus].en}
                    </Pill>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

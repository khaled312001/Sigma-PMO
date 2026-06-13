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
import { BarChart, DonutChart } from '../../components/Charts';
import { GovernanceStatusBadge } from '../../components/GovernanceStatusBadge';
import { IconAlertCritical, IconArrowRight, IconClock, IconRefresh, IconShield, IconSparkles } from '../../components/Icons';
import { useToast } from '../../components/ToastProvider';
import { Button, Card, EmptyState, ErrorBanner, PageHeader, Pill } from '../../components/ui';
import { api } from '../../lib/api';
import { CAPABILITIES } from '../../lib/capabilities';
import { useI18n } from '../../lib/i18n';
import { useMe } from '../../lib/me-context';

interface AgentRollup { agentKey: string; layer: string; status: string; governanceStatus: string | null; escalationLevel: string | null; confidence: number | null }
interface ConsolidatedNode {
  nodeType: string; nodeBusinessKey: string; governanceStatus: string | null; score: number | null;
  agents: AgentRollup[]; openCorrectiveActions: number; openRisks: number; criticalRisks: number;
  potentialClaims: number; topRisks: Array<{ title: string; tier: string; priorityScore: number }>;
}
interface Overview { nodes: ConsolidatedNode[]; statusTally: Record<string, number> }
interface CorrectiveAction { id: string; title: string; description: string; sourceLayer: string; priority: string; escalationLevel: string | null; status: string }

// Command-center derived analytics (Agent B)
interface RecommendedAction {
  id: string | null; nodeBusinessKey: string; title: string; rationale: string;
  sourceLayer: string; priority: string; derived: boolean; status: string | null; ageDays: number | null;
}
interface EscalationPathRow {
  decisionId: string; alertCode: string; projectKey: string; escalationLevel: string;
  responsibleParty: string; ageDays: number; path: string[]; currentStep: number; nextStep: string;
}
interface ImpactAnalysis {
  degraded: Array<{ projectKey: string; name: string; bac: number; shareOfPortfolioBacPct: number }>;
  totals: { portfolioBac: number; valueAtRisk: number; valueAtRiskPct: number };
  benefitRealization: {
    perProject: Array<{ projectKey: string; name: string; status: string | null; benefitPct: number }>;
    weightedTargetPct: number; weightedRealizedPct: number; benefitGapPct: number;
  };
}

const STATUS_ACCENT: Record<string, string> = { green: '#10b981', yellow: '#fbbf24', orange: '#f97316', red: '#dc2626', unknown: '#475569' };
const PRIORITY_TONE: Record<string, 'rose' | 'amber' | 'sky' | 'slate'> = { critical: 'rose', high: 'amber', medium: 'sky', low: 'slate' };

/** Arabic display labels for priority / action-status enums (enum values themselves are unchanged). */
const PRIORITY_AR: Record<string, string> = { critical: 'حرجة', high: 'عالية', medium: 'متوسطة', low: 'منخفضة' };
const ACTION_STATUS_AR: Record<string, string> = { open: 'مفتوح', 'in-progress': 'قيد التنفيذ', done: 'منجز', dismissed: 'مُتجاهَل' };
const priorityLabel = (p: string, ar: boolean) => (ar ? PRIORITY_AR[p] ?? p : p);
const actionStatusLabel = (s: string, ar: boolean) => (ar ? ACTION_STATUS_AR[s] ?? s : s);

/** Compact money formatter for value-at-risk bars/tiles. */
function fmtMoney(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toFixed(0);
}

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
  const { lang } = useI18n();
  const ar = lang === 'ar';
  const canRun = !!(me?.user?.role && CAPABILITIES[me.user.role].canEvaluateRules);

  const [overview, setOverview] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [actions, setActions] = useState<CorrectiveAction[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const [recommended, setRecommended] = useState<RecommendedAction[] | null>(null);
  const [escalations, setEscalations] = useState<EscalationPathRow[] | null>(null);
  const [impact, setImpact] = useState<ImpactAnalysis | null>(null);

  const load = useCallback(async () => {
    try {
      const o = await api<Overview>('/governance-command/overview');
      setOverview(o); setError(null);
      if (!selected && o.nodes[0]) setSelected(o.nodes[0].nodeBusinessKey);
    } catch (e) { setError((e as Error).message); }
  }, [selected]);

  const loadCommandCenter = useCallback(async () => {
    const [rec, esc, imp] = await Promise.allSettled([
      api<{ rows: RecommendedAction[] }>('/governance-command/recommended-actions'),
      api<{ rows: EscalationPathRow[] }>('/governance-command/escalation-paths'),
      api<ImpactAnalysis>('/governance-command/impact-analysis'),
    ]);
    setRecommended(rec.status === 'fulfilled' ? rec.value.rows : []);
    setEscalations(esc.status === 'fulfilled' ? esc.value.rows : []);
    setImpact(imp.status === 'fulfilled' ? imp.value : null);
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { void loadCommandCenter(); }, [loadCommandCenter]);

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
      toast.success(
        ar ? 'تم التوحيد' : 'Consolidated',
        ar ? `${key}: أعادت الطبقة 8 احتساب الحالة والإجراءات التصحيحية.` : `${key}: L8 recomputed status + corrective actions.`,
      );
      await load();
      await loadActions(key);
      await loadCommandCenter();
    } catch (e) { toast.error(ar ? 'فشل إعادة الاحتساب' : 'Recompute failed', (e as Error).message); }
    finally { setBusy(null); }
  };

  const advance = async (id: string, status: string, key: string) => {
    try {
      await api(`/governance-command/actions/${id}/status`, { method: 'POST', body: JSON.stringify({ status }) });
      await loadActions(key);
    } catch (e) { toast.error(ar ? 'فشل التحديث' : 'Update failed', (e as Error).message); }
  };

  const tally = overview?.statusTally ?? {};
  const donutData = (['red', 'orange', 'yellow', 'green', 'unknown'] as const)
    .map((k) => ({ label: k, value: tally[k] ?? 0, accent: STATUS_ACCENT[k] }))
    .filter((d) => d.value > 0);
  const totalNodes = overview?.nodes.length ?? 0;
  const selectedNode = overview?.nodes.find((n) => n.nodeBusinessKey === selected) ?? null;

  return (
    <div className="space-y-6" dir={ar ? 'rtl' : 'ltr'}>
      <PageHeader
        eyebrow={ar ? 'الطبقة 8 · حوكمة سيجما بالذكاء الاصطناعي' : 'Layer 8 · Sigma Governance AI'}
        title={ar ? 'مركز قيادة الحوكمة' : 'Governance Command Center'}
        description={
          ar
            ? 'المرجعية النهائية: الحُكم الموحّد رباعي التصنيف لكل عقدة، والوكلاء الذين أنتجوه، وقائمة الإجراءات التصحيحية. تُعيد إعادة الاحتساب تشغيل توحيد الطبقة 8 وإصدار الإجراءات من جديد.'
            : "The final authority: every node's consolidated 4-tier verdict, the agents behind it, and the corrective-action queue. Recompute re-runs the L8 consolidation and re-issues actions."
        }
        actions={<Button variant="ghost" size="sm" onClick={() => { void load(); void loadCommandCenter(); }}><IconRefresh className="h-3.5 w-3.5" /> {ar ? 'تحديث' : 'Refresh'}</Button>}
      />
      <ErrorBanner message={error} />

      {/* Status distribution + headline tiles */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <Card title={ar ? 'توزيع حالة الحوكمة' : 'Governance status distribution'}>
          {donutData.length > 0 ? (
            <DonutChart data={donutData} size={180} centerValue={totalNodes} centerLabel={ar ? 'عقدة' : 'nodes'} />
          ) : <p className="text-sm text-slate-500">{ar ? 'لا توجد عُقد بعد.' : 'No nodes yet.'}</p>}
        </Card>
        <Card title={ar ? 'الإشراف على حوكمة المحفظة' : 'Portfolio governance oversight'}>
          {overview === null ? (
            <div className="h-24 animate-pulse rounded bg-slate-800/40" />
          ) : overview.nodes.length === 0 ? (
            <EmptyState title={ar ? 'لا توجد عُقد' : 'No nodes'} description={ar ? 'لا توجد مشاريع حالية للتوحيد.' : 'No current projects to consolidate.'} />
          ) : (
            <ul className="space-y-1.5" aria-label={ar ? 'العُقد' : 'Nodes'}>
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
                      <span>{ar ? `${n.agents.length} وكيل` : `${n.agents.length} agents`}</span>
                      {n.criticalRisks > 0 && <Pill tone="rose">{ar ? `${n.criticalRisks} خطر حرج` : `${n.criticalRisks} crit risk`}</Pill>}
                      {n.potentialClaims > 0 && <Pill tone="amber">{ar ? `${n.potentialClaims} مطالبة` : `${n.potentialClaims} claim`}</Pill>}
                      {n.openCorrectiveActions > 0 && <Pill tone="violet">{ar ? `${n.openCorrectiveActions} إجراء` : `${n.openCorrectiveActions} action`}</Pill>}
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
            title={`${ar ? 'الحُكم الموحّد' : 'Consolidated verdict'} · ${selectedNode.nodeBusinessKey}`}
            actions={canRun && (
              <Button variant="primary" size="sm" disabled={busy === selectedNode.nodeBusinessKey} onClick={() => recompute(selectedNode.nodeBusinessKey)}>
                <IconSparkles className="h-3.5 w-3.5" /> {busy === selectedNode.nodeBusinessKey ? (ar ? 'جارٍ التوحيد…' : 'Consolidating…') : (ar ? 'إعادة الاحتساب (الطبقة 8)' : 'Recompute (L8)')}
              </Button>
            )}
          >
            <div className="mb-3 flex items-center gap-2">
              <GovernanceStatusBadge status={selectedNode.governanceStatus} />
              {selectedNode.score !== null && <span className="text-xs text-slate-500">{ar ? `درجة المخاطر ${selectedNode.score.toFixed(2)}` : `risk score ${selectedNode.score.toFixed(2)}`}</span>}
            </div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{ar ? 'الوكلاء المُوحَّدون' : 'Agents consolidated'}</p>
            <ul className="mt-1 space-y-1">
              {selectedNode.agents.map((a) => (
                <li key={a.agentKey} className="flex items-center gap-2 text-xs">
                  <span className="font-mono text-slate-300" dir="ltr">{a.agentKey}</span>
                  <span className={a.status === 'completed' ? 'text-emerald-400' : 'text-rose-400'}>{a.status}</span>
                  {a.governanceStatus && <GovernanceStatusBadge status={a.governanceStatus} size="sm" showLabel={false} />}
                  {a.escalationLevel && <Pill tone="rose">{a.escalationLevel}</Pill>}
                  {a.confidence !== null && <span className="ms-auto text-slate-500">{ar ? `الثقة ${Math.round(a.confidence * 100)}%` : `conf ${Math.round(a.confidence * 100)}%`}</span>}
                </li>
              ))}
              {selectedNode.agents.length === 0 && <li className="text-xs text-slate-500">{ar ? 'لم تُشغَّل أي وكلاء بعد — شغّل خط المعالجة أولاً.' : 'No agent runs yet — run the pipeline first.'}</li>}
            </ul>
            {selectedNode.topRisks.length > 0 && (
              <>
                <p className="mt-3 text-[10px] font-semibold uppercase tracking-wider text-slate-500">{ar ? 'أبرز المخاطر' : 'Top risks'}</p>
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

          <Card title={`${ar ? 'الإجراءات التصحيحية' : 'Corrective actions'} · ${selectedNode.nodeBusinessKey}`}>
            {actions === null ? (
              <div className="h-20 animate-pulse rounded bg-slate-800/40" />
            ) : actions.length === 0 ? (
              <p className="text-sm text-slate-500">{ar ? 'لا توجد إجراءات تصحيحية. أعد الاحتساب لتوليدها من المخاطر والمطالبات المفتوحة.' : 'No corrective actions. Recompute to generate them from open risks + claims.'}</p>
            ) : (
              <ul className="space-y-2">
                {actions.map((a) => (
                  <li key={a.id} className="rounded-lg border border-slate-800 bg-slate-950/40 p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Pill tone={a.priority === 'critical' ? 'rose' : a.priority === 'high' ? 'amber' : 'sky'}>{priorityLabel(a.priority, ar)}</Pill>
                      <span className="font-mono text-[10px] text-slate-500" dir="ltr">{a.sourceLayer}</span>
                      {a.escalationLevel && <Pill tone="rose">{a.escalationLevel}</Pill>}
                      <Pill tone={a.status === 'done' ? 'emerald' : a.status === 'in-progress' ? 'sky' : 'slate'}>{actionStatusLabel(a.status, ar)}</Pill>
                    </div>
                    <p className="mt-1 text-sm font-medium text-slate-100">{a.title}</p>
                    <p className="mt-0.5 text-xs text-slate-400">{a.description}</p>
                    {canRun && a.status !== 'done' && (
                      <div className="mt-2 flex gap-1.5">
                        {a.status !== 'in-progress' && <button type="button" onClick={() => advance(a.id, 'in-progress', selectedNode.nodeBusinessKey)} className="rounded bg-slate-800 px-2 py-0.5 text-[11px] text-slate-200 hover:bg-slate-700">{ar ? 'بدء' : 'Start'}</button>}
                        <button type="button" onClick={() => advance(a.id, 'done', selectedNode.nodeBusinessKey)} className="rounded bg-emerald-700/60 px-2 py-0.5 text-[11px] text-emerald-100 hover:bg-emerald-700">{ar ? 'تحديد كمنجز' : 'Mark done'}</button>
                        <button type="button" onClick={() => advance(a.id, 'dismissed', selectedNode.nodeBusinessKey)} className="rounded bg-slate-800 px-2 py-0.5 text-[11px] text-slate-400 hover:bg-slate-700">{ar ? 'تجاهل' : 'Dismiss'}</button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      )}

      {/* Recommended Actions */}
      <RecommendedActionsSection rows={recommended} ar={ar} />

      {/* Escalation Paths */}
      <EscalationPathsSection rows={escalations} ar={ar} />

      {/* Executive Impact + Benefit Realization */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <ImpactAnalysisSection impact={impact} ar={ar} />
        <BenefitRealizationSection impact={impact} ar={ar} />
      </div>

      <p className="flex items-center gap-1.5 text-[11px] text-slate-500">
        <IconShield className="h-3.5 w-3.5" /> {ar
          ? 'توحيد الطبقة 8 يعمل بالسحب وقابل للتكرار دون تغيير النتيجة. تُحتسب الإجراءات المقترحة ومسارات التصعيد وتحليل الأثر بشكل حتمي من حالة الحوكمة الراهنة.'
          : 'L8 consolidation is pull-based and idempotent. Recommended actions, escalation paths and impact analysis are computed deterministically from current governance state.'}
      </p>
    </div>
  );
}

// Recommended Actions

function RecommendedActionsSection({ rows, ar }: { rows: RecommendedAction[] | null; ar: boolean }) {
  return (
    <Card title={ar ? 'الإجراءات المقترحة' : 'Recommended actions'} hint={ar ? 'الإجراءات التصحيحية المفتوحة إضافةً إلى توصيات فورية للعُقد المتدهورة، مرتّبة حسب الأولوية والمدّة.' : 'Open corrective actions plus on-the-fly recommendations for degraded nodes, ranked by priority and age.'}>
      {rows === null ? (
        <div className="h-24 animate-pulse rounded bg-slate-800/40" />
      ) : rows.length === 0 ? (
        <EmptyState title={ar ? 'لا توجد توصيات' : 'Nothing recommended'} description={ar ? 'لا توجد إجراءات تصحيحية مفتوحة ولا عُقد متدهورة.' : 'No open corrective actions and no degraded nodes.'} />
      ) : (
        <ul className="space-y-2">
          {rows.map((r, i) => (
            <li key={r.id ?? `derived-${r.nodeBusinessKey}-${i}`} className="flex items-start gap-3 rounded-lg border border-slate-800 bg-slate-950/40 p-3">
              <Pill tone={PRIORITY_TONE[r.priority] ?? 'slate'}>{priorityLabel(r.priority, ar)}</Pill>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-slate-100">{r.title}</span>
                  <span className="font-mono text-[10px] text-slate-500" dir="ltr">{r.nodeBusinessKey}</span>
                  {r.derived ? (
                    <Pill tone="violet">{ar ? 'مُستنتَج' : 'derived'}</Pill>
                  ) : (
                    <span className="font-mono text-[10px] text-slate-500" dir="ltr">{r.sourceLayer}</span>
                  )}
                  {r.ageDays !== null && r.ageDays > 0 && (
                    <span className="flex items-center gap-1 text-[10px] text-slate-500"><IconClock className="h-3 w-3" />{ar ? `${r.ageDays} يوم` : `${r.ageDays}d`}</span>
                  )}
                </div>
                <p className="mt-0.5 text-xs text-slate-400">{r.rationale}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

// Escalation Paths

function LevelStepper({ currentStep, ar }: { currentStep: number; ar: boolean }) {
  // Always show the full L1 -> L2 -> L3 ladder; highlight up to the current level.
  const full = ar
    ? ['المستوى 1 · المشروع', 'المستوى 2 · البرنامج/مكتب الإدارة', 'المستوى 3 · التنفيذي']
    : ['L1 Project', 'L2 Program/PMO', 'L3 Executive'];
  return (
    <ol className="flex flex-wrap items-center gap-1.5" aria-label={ar ? 'سُلّم التصعيد' : 'Escalation ladder'}>
      {full.map((label, i) => {
        const stepNo = i + 1;
        const reached = stepNo <= currentStep;
        const isCurrent = stepNo === currentStep;
        return (
          <li key={label} className="flex items-center gap-1.5">
            <span
              className={`rounded px-2 py-0.5 text-[10px] font-medium ${
                isCurrent
                  ? 'bg-rose-500/20 text-rose-200 ring-1 ring-rose-500/40'
                  : reached
                    ? 'bg-amber-500/15 text-amber-200'
                    : 'bg-slate-800/60 text-slate-500'
              }`}
            >
              {label}
            </span>
            {i < full.length - 1 && <IconArrowRight className={`h-3 w-3 ${reached && currentStep > stepNo ? 'text-amber-400' : 'text-slate-600'}`} />}
          </li>
        );
      })}
    </ol>
  );
}

function EscalationPathsSection({ rows, ar }: { rows: EscalationPathRow[] | null; ar: boolean }) {
  return (
    <Card title={ar ? 'مسارات التصعيد' : 'Escalation paths'} hint={ar ? 'تصعيدات الحوكمة المفتوحة دون مراجعة معتمِدة، كلٌّ في موضعه على سُلّم المستوى 1 ← 2 ← 3.' : 'Open governance escalations without an approving review, each at its position on the L1 -> L2 -> L3 ladder.'}>
      {rows === null ? (
        <div className="h-24 animate-pulse rounded bg-slate-800/40" />
      ) : rows.length === 0 ? (
        <EmptyState title={ar ? 'لا توجد تصعيدات مفتوحة' : 'No open escalations'} description={ar ? 'تمّت الموافقة على كل قرار مُصعَّد، أو لم يُرفع أي تصعيد بعد.' : 'Every escalated decision has been approved, or none has been raised.'} />
      ) : (
        <ul className="space-y-3">
          {rows.map((r) => (
            <li key={r.decisionId} className="rounded-lg border border-slate-800 bg-slate-950/40 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <IconAlertCritical className="h-3.5 w-3.5 text-rose-400" />
                <span className="font-mono text-xs text-slate-200" dir="ltr">{r.alertCode}</span>
                <span className="font-mono text-[10px] text-slate-500" dir="ltr">{r.projectKey}</span>
                <Pill tone="slate">{r.responsibleParty}</Pill>
                <span className="ms-auto flex items-center gap-1 text-[10px] text-slate-500"><IconClock className="h-3 w-3" />{ar ? `${r.ageDays} يوم` : `${r.ageDays}d`}</span>
              </div>
              <div className="mt-2">
                <LevelStepper currentStep={r.currentStep} ar={ar} />
              </div>
              <p className="mt-2 text-xs text-slate-400"><span className="text-slate-500">{ar ? 'التالي:' : 'Next:'}</span> {r.nextStep}</p>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

// Executive Impact Analysis

function ImpactAnalysisSection({ impact, ar }: { impact: ImpactAnalysis | null; ar: boolean }) {
  if (impact === null) {
    return <Card title={ar ? 'تحليل الأثر التنفيذي' : 'Executive impact analysis'}><div className="h-40 animate-pulse rounded bg-slate-800/40" /></Card>;
  }
  const { totals, degraded } = impact;
  const bars = degraded.map((d) => ({
    label: `${d.projectKey} (${d.shareOfPortfolioBacPct}%)`,
    value: Math.round(d.bac),
    accent: STATUS_ACCENT.red,
  }));
  return (
    <Card title={ar ? 'تحليل الأثر التنفيذي' : 'Executive impact analysis'} hint={ar ? 'موازنة الإنجاز (BAC) المعرّضة للخطر من المشاريع المتدهورة (برتقالي/أحمر)، مقابل إجمالي BAC للمحفظة.' : 'Budget-at-Completion at risk from degraded (orange/red) projects, against total portfolio BAC.'}>
      <div className="mb-3 grid grid-cols-3 gap-2">
        <Tile label={ar ? 'القيمة المعرّضة للخطر' : 'Value at risk'} value={fmtMoney(totals.valueAtRisk)} tone="rose" />
        <Tile label={ar ? 'من المحفظة' : 'of portfolio'} value={`${totals.valueAtRiskPct}%`} tone="amber" />
        <Tile label={ar ? 'BAC المحفظة' : 'Portfolio BAC'} value={fmtMoney(totals.portfolioBac)} tone="slate" />
      </div>
      {degraded.length === 0 ? (
        <p className="text-sm text-slate-500">{ar ? 'لا توجد مشاريع متدهورة. لا قيمة معرّضة للخطر.' : 'No degraded projects. Zero value at risk.'}</p>
      ) : (
        <BarChart
          data={bars}
          caption={ar ? 'BAC المعرّض للخطر حسب المشروع' : 'BAC at risk by project'}
          labelWidth={150}
          emptyLabel={ar ? 'لا مشاريع متدهورة' : 'no degraded projects'}
        />
      )}
    </Card>
  );
}

// Benefit Realization Impact

function BenefitRealizationSection({ impact, ar }: { impact: ImpactAnalysis | null; ar: boolean }) {
  if (impact === null) {
    return <Card title={ar ? 'أثر تحقيق المنافع' : 'Benefit realization impact'}><div className="h-40 animate-pulse rounded bg-slate-800/40" /></Card>;
  }
  const { benefitRealization: br } = impact;
  const bars = br.perProject
    .slice()
    .sort((a, b) => a.benefitPct - b.benefitPct)
    .map((p) => ({
      label: p.projectKey,
      value: p.benefitPct,
      accent: STATUS_ACCENT[p.status ?? 'unknown'] ?? STATUS_ACCENT.unknown,
    }));
  return (
    <Card title={ar ? 'أثر تحقيق المنافع' : 'Benefit realization impact'} hint={ar ? 'المنفعة المُحقَّقة = (EV/BAC) × مُضاعِف الحالة (أخضر 1 / أصفر 0.85 / برتقالي 0.6 / أحمر 0.4).' : 'Realized benefit = (EV/BAC) x status multiplier (green 1 / yellow .85 / orange .6 / red .4).'}>
      <div className="mb-3 grid grid-cols-3 gap-2">
        <Tile label={ar ? 'المستهدف المرجّح' : 'Weighted target'} value={`${br.weightedTargetPct}%`} tone="sky" />
        <Tile label={ar ? 'المُحقَّق المرجّح' : 'Weighted realized'} value={`${br.weightedRealizedPct}%`} tone="emerald" />
        <Tile label={ar ? 'فجوة المنفعة' : 'Benefit gap'} value={`${br.benefitGapPct}%`} tone={br.benefitGapPct > 10 ? 'rose' : 'amber'} />
      </div>
      {bars.length === 0 ? (
        <p className="text-sm text-slate-500">{ar ? 'لا توجد مشاريع للتقييم.' : 'No projects to assess.'}</p>
      ) : (
        <BarChart data={bars} caption={ar ? 'نسبة المنفعة المُحقَّقة' : 'realized benefit %'} max={100} labelWidth={110} emptyLabel={ar ? 'لا مشاريع' : 'no projects'} />
      )}
    </Card>
  );
}

const TILE_TONE: Record<string, string> = {
  rose: 'text-rose-300', amber: 'text-amber-300', emerald: 'text-emerald-300',
  sky: 'text-sky-300', slate: 'text-slate-200',
};

function Tile({ label, value, tone }: { label: string; value: string; tone: keyof typeof TILE_TONE }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2">
      <p className="text-[10px] uppercase tracking-wider text-slate-500">{label}</p>
      <p className={`mt-0.5 font-mono text-lg font-semibold tabular-nums ${TILE_TONE[tone]}`} dir="ltr">{value}</p>
    </div>
  );
}

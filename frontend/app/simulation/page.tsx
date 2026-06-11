'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import { AuthGate } from '../../components/AuthGate';
import { useConfirm } from '../../components/ConfirmDialog';
import { useToast } from '../../components/ToastProvider';
import { api, ScenarioRecord } from '../../lib/api';
import { CAPABILITIES } from '../../lib/capabilities';
import { useI18n } from '../../lib/i18n';
import { useMe } from '../../lib/me-context';
import { useProject } from '../../lib/project-context';
import { Button, Card, EmptyState, ErrorBanner, PageHeader, Pill } from '../../components/ui';
import { IconClock, IconFolder, IconSparkles, IconX } from '../../components/Icons';

/**
 * /simulation — sandbox what-if surface (ADR-0010 §5, post-meeting plan §3.4).
 *
 * The page lists every Scenario forked from the current project (newest fork
 * first), surfaces a Fork dialog that hits POST /simulation/scenarios, and
 * lets the user discard a scenario or expand a JSON diff of the
 * `baselineSnapshot` against the current ProjectSummary.
 *
 * Capability is `canSimulate` (Wave 7 grants this to EVERY role including
 * contractor + subcontractor — sandbox writes never touch canonical truth).
 * "Promote to canonical" is LIVE since Wave 7: gated on `canEditPolicy`,
 * stamps the promoter on the audit trail, and pushes
 * `simulation.scenario.promoted` onto the cross-layer Outbox. Clash-impact
 * scenarios are refused server-side and promote through /clashes instead
 * (atomic schedule revision + FIDIC claim letter).
 */
export default function SimulationPageRoute() {
  return (
    <AuthGate capability="canSimulate" surface="Simulation">
      <SimulationPage />
    </AuthGate>
  );
}

function SimulationPage() {
  const { t } = useI18n();
  const toast = useToast();
  const confirm = useConfirm();
  const { current } = useProject();
  const { me } = useMe();
  const canPromote = !!me?.user && CAPABILITIES[me.user.role].canEditPolicy;

  const [scenarios, setScenarios] = useState<ScenarioRecord[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [acting, setActing] = useState<string | null>(null);
  const [forkOpen, setForkOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  // Stable "now" frozen at mount so expiration checks during child render
  // are pure. Refreshing the scenario list (or remounting) recomputes this.
  const [nowMs, setNowMs] = useState<number>(() => Date.now());

  const refresh = useCallback(async () => {
    if (!current) { setScenarios([]); return; }
    setLoadError(null);
    setNowMs(Date.now());
    try {
      const list = await api<ScenarioRecord[]>(
        `/simulation/scenarios?projectKey=${encodeURIComponent(current.businessKey)}`,
      );
      // Backend sorts by forkedFromAt DESC; re-sort by createdAt DESC to be
      // resilient to either index of "newest fork" the API might return.
      list.sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
      setScenarios(list);
    } catch (e) {
      setLoadError((e as Error).message);
      setScenarios([]);
    }
  }, [current]);

  useEffect(() => { void refresh(); }, [refresh]);

  const onDiscard = async (id: string) => {
    const ok = await confirm({
      title: t('simulation.discardConfirmTitle'),
      description: t('simulation.discardConfirmBody'),
      confirmLabel: t('simulation.discardConfirm'),
      destructive: true,
    });
    if (!ok) return;
    setActing(id);
    try {
      await api(`/simulation/scenarios/${id}/discard`, { method: 'POST' });
      toast.success(t('simulation.discarded'));
      await refresh();
    } catch (e) {
      toast.error(t('simulation.discardFailed'), (e as Error).message);
    } finally {
      setActing(null);
    }
  };

  /** Promote-to-canonical (Wave 7 — live). Confirm → POST → refresh. */
  const onPromote = async (id: string) => {
    const ok = await confirm({
      title: 'Promote this scenario to canonical?',
      description:
        'The scenario is marked committed, the promotion is stamped on its audit trail, and a ' +
        'simulation.scenario.promoted event notifies the downstream layers. Clash-impact scenarios ' +
        'are refused here — apply those from /clashes so the schedule revision + claim letter issue atomically.',
      confirmLabel: 'Promote',
    });
    if (!ok) return;
    setActing(id);
    try {
      const r = await api<{ status: string; outboxEventId: string | null }>(
        `/simulation/scenarios/${id}/promote`,
        { method: 'POST', body: JSON.stringify({ promotedBy: me?.user?.displayName ?? 'unknown' }) },
      );
      toast.success(
        'Scenario promoted',
        r.outboxEventId ? `Outbox event ${r.outboxEventId.slice(0, 8)} dispatched.` : 'Committed.',
      );
      await refresh();
    } catch (e) {
      toast.error('Promote failed', (e as Error).message);
    } finally {
      setActing(null);
    }
  };

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow={t('simulation.eyebrow')}
        title={t('simulation.title')}
        description={t('simulation.description')}
        actions={
          <Button
            variant="primary"
            onClick={() => setForkOpen(true)}
            disabled={!current}
          >
            <IconSparkles className="h-4 w-4" /> {t('simulation.fork')}
          </Button>
        }
      />

      {!current && (
        <ErrorBanner message={t('simulation.noProject')} />
      )}
      {loadError && <ErrorBanner message={loadError} />}

      {scenarios === null ? (
        <Card><p className="text-sm text-slate-400">{t('common.loading')}</p></Card>
      ) : scenarios.length === 0 ? (
        <EmptyState
          icon={<IconSparkles className="h-6 w-6" />}
          title={t('simulation.listEmpty')}
          description={t('simulation.listEmptyHint')}
          action={
            <Button onClick={() => setForkOpen(true)} disabled={!current}>
              <IconSparkles className="h-4 w-4" /> {t('simulation.fork')}
            </Button>
          }
        />
      ) : (
        <div className="space-y-3">
          {scenarios.map((s) => (
            <ScenarioCard
              key={s.id}
              scenario={s}
              expanded={expandedId === s.id}
              onToggleExpand={() => setExpandedId((cur) => (cur === s.id ? null : s.id))}
              currentProject={current}
              nowMs={nowMs}
              acting={acting === s.id}
              canPromote={canPromote}
              onPromote={() => onPromote(s.id)}
              onDiscard={() => onDiscard(s.id)}
            />
          ))}
        </div>
      )}

      <PortfolioScenarioPlanning />

      {forkOpen && current && (
        <ForkDialog
          projectBusinessKey={current.businessKey}
          projectName={current.name}
          onClose={() => setForkOpen(false)}
          onCreated={async () => {
            setForkOpen(false);
            await refresh();
          }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Portfolio scenario planning — open scenarios across ALL projects + a
// deterministic what-if (inject a delay, see the shifted finish + cost-of-delay).
// Surfaced here so a PMO can plan across the portfolio without per-project drills.
// ---------------------------------------------------------------------------

interface ScenarioImpactRow {
  id: string;
  name: string;
  projectBusinessKey: string;
  projectName: string | null;
  status: string;
  forkedFromAt: string;
  summary: string;
  kind: string | null;
  impact: {
    scheduleDeltaDays: number | null;
    costDelta: number | null;
    isPlaceholder: boolean;
    baseline: { activityCount: number | null; criticalAlerts: number | null; plannedFinish: string | null };
  };
}
interface PortfolioImpactResponse {
  scenarios: ScenarioImpactRow[];
  totals: { openScenarios: number; projectsWithScenarios: number };
  allImpactsArePlaceholders: boolean;
}
interface WhatIfProjectRow {
  projectBusinessKey: string;
  projectName: string | null;
  currentForecastFinish: string | null;
  delayDays: number;
  adjustedForecastFinish: string | null;
  budgetAtCompletion: number | null;
  plannedDurationDays: number | null;
  costOfDelay: number | null;
  note: string | null;
}
interface PortfolioWhatIfResponse {
  basis: { overheadFactor: number; formula: string };
  projects: WhatIfProjectRow[];
  totals: { projectsAnalyzed: number; totalDelayDays: number; totalCostOfDelay: number };
}

function PortfolioScenarioPlanning() {
  const toast = useToast();
  const { projects } = useProject();
  const [impact, setImpact] = useState<PortfolioImpactResponse | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setErr(null);
    try {
      const r = await api<PortfolioImpactResponse>('/simulation/portfolio-impact');
      setImpact(r);
    } catch (e) {
      setErr((e as Error).message);
      setImpact({ scenarios: [], totals: { openScenarios: 0, projectsWithScenarios: 0 }, allImpactsArePlaceholders: false });
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  // What-if mini-form state.
  const [projectKey, setProjectKey] = useState('');
  const [delayDays, setDelayDays] = useState<number>(14);
  const [whatIf, setWhatIf] = useState<PortfolioWhatIfResponse | null>(null);
  const [running, setRunning] = useState(false);

  // Default the picker to the first project once the list arrives.
  useEffect(() => {
    if (!projectKey && projects.length) setProjectKey(projects[0].businessKey);
  }, [projects, projectKey]);

  const runWhatIf = async () => {
    if (!projectKey) { toast.error('Pick a project first'); return; }
    setRunning(true);
    try {
      const r = await api<PortfolioWhatIfResponse>('/simulation/portfolio-whatif', {
        method: 'POST',
        body: JSON.stringify({ delayDaysPerProject: { [projectKey]: delayDays } }),
      });
      setWhatIf(r);
    } catch (e) {
      toast.error('What-if failed', (e as Error).message);
    } finally {
      setRunning(false);
    }
  };

  const money = (n: number | null) =>
    n === null ? '—' : n.toLocaleString(undefined, { maximumFractionDigits: 0 });

  return (
    <div className="space-y-4 border-t border-slate-800 pt-7">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-sky-300/80">
            Portfolio scenario planning
          </p>
          <h2 className="mt-1 text-lg font-semibold text-slate-100">
            Open scenarios across the portfolio
          </h2>
          <p className="mt-1 max-w-2xl text-xs text-slate-400">
            Every OPEN scenario across all projects, plus a deterministic what-if to price an
            injected delay. Nothing here mutates canonical truth.
          </p>
        </div>
        <Button variant="ghost" onClick={() => void load()}>Refresh</Button>
      </div>

      {err && <ErrorBanner message={err} />}

      {impact === null ? (
        <Card><p className="text-sm text-slate-400">Loading…</p></Card>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <StatTile label="Open scenarios" value={impact.totals.openScenarios} />
            <StatTile label="Projects with scenarios" value={impact.totals.projectsWithScenarios} />
            <StatTile
              label="Impact data"
              value={impact.allImpactsArePlaceholders ? 'Placeholder' : impact.scenarios.length ? 'Partial' : '—'}
              tone={impact.allImpactsArePlaceholders ? 'amber' : 'slate'}
            />
          </div>

          {impact.allImpactsArePlaceholders && impact.scenarios.length > 0 && (
            <p className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-200">
              Scenario snapshots currently freeze a baseline only — no before/after delta is stored,
              so the schedule/cost impact columns below are placeholders. Baseline counters are real.
            </p>
          )}

          {impact.scenarios.length === 0 ? (
            <Card><p className="text-sm text-slate-400">No open scenarios across the portfolio.</p></Card>
          ) : (
            <Card padded={false}>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-900/70 text-[10px] uppercase tracking-wider text-slate-400">
                    <tr>
                      <th className="px-3 py-2 text-start">Scenario</th>
                      <th className="px-3 py-2 text-start">Project</th>
                      <th className="px-3 py-2 text-end">Schedule Δ (d)</th>
                      <th className="px-3 py-2 text-end">Cost Δ</th>
                      <th className="px-3 py-2 text-end">Activities</th>
                      <th className="px-3 py-2 text-end">Critical</th>
                      <th className="px-3 py-2 text-end">Forked</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/80">
                    {impact.scenarios.map((s) => (
                      <tr key={s.id}>
                        <td className="px-3 py-2.5">
                          <span className="block text-slate-100" dir="auto">{s.name}</span>
                          {s.kind && <Pill tone="violet">{s.kind}</Pill>}
                        </td>
                        <td className="px-3 py-2.5">
                          <span className="block text-slate-200" dir="auto">{s.projectName ?? '—'}</span>
                          <span className="font-mono text-[10px] text-slate-500" dir="ltr">{s.projectBusinessKey}</span>
                        </td>
                        <td className="px-3 py-2.5 text-end tabular-nums" dir="ltr">
                          {s.impact.scheduleDeltaDays !== null
                            ? s.impact.scheduleDeltaDays
                            : <PlaceholderCell />}
                        </td>
                        <td className="px-3 py-2.5 text-end tabular-nums" dir="ltr">
                          {s.impact.costDelta !== null ? money(s.impact.costDelta) : <PlaceholderCell />}
                        </td>
                        <td className="px-3 py-2.5 text-end tabular-nums text-slate-300" dir="ltr">
                          {s.impact.baseline.activityCount ?? '—'}
                        </td>
                        <td className="px-3 py-2.5 text-end tabular-nums text-slate-300" dir="ltr">
                          {s.impact.baseline.criticalAlerts ?? '—'}
                        </td>
                        <td className="px-3 py-2.5 text-end text-xs text-slate-400" dir="ltr">
                          {new Date(s.forkedFromAt).toLocaleDateString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </>
      )}

      {/* What-if mini-form */}
      <Card
        title="Delay what-if"
        hint="Deterministic arithmetic only — projects a shifted finish and a naive cost-of-delay. Persists nothing."
      >
        <div className="flex flex-wrap items-end gap-3">
          <label className="block">
            <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">Project</span>
            <select
              value={projectKey}
              onChange={(e) => setProjectKey(e.target.value)}
              className="mt-1 block min-w-56 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-sky-500/60"
              dir="ltr"
            >
              {projects.length === 0 && <option value="">No projects</option>}
              {projects.map((p) => (
                <option key={p.businessKey} value={p.businessKey}>
                  {p.businessKey} · {p.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">Delay (days)</span>
            <input
              type="number"
              min={0}
              max={3650}
              value={delayDays}
              onChange={(e) => setDelayDays(Math.max(0, Number(e.target.value) || 0))}
              className="mt-1 block w-32 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 tabular-nums outline-none focus:border-sky-500/60"
              dir="ltr"
            />
          </label>
          <Button variant="primary" onClick={runWhatIf} disabled={running || !projectKey}>
            <IconSparkles className="h-4 w-4" /> {running ? 'Computing…' : 'Run what-if'}
          </Button>
        </div>

        {whatIf && (
          <div className="mt-4 space-y-3">
            <p className="text-[11px] text-slate-500" dir="ltr">
              Basis: {whatIf.basis.formula} · overhead {Math.round(whatIf.basis.overheadFactor * 100)}%
            </p>
            <div className="overflow-x-auto rounded-lg border border-slate-800">
              <table className="w-full text-sm">
                <thead className="bg-slate-900/70 text-[10px] uppercase tracking-wider text-slate-400">
                  <tr>
                    <th className="px-3 py-2 text-start">Project</th>
                    <th className="px-3 py-2 text-end">Current finish</th>
                    <th className="px-3 py-2 text-end">Delay (d)</th>
                    <th className="px-3 py-2 text-end">Adjusted finish</th>
                    <th className="px-3 py-2 text-end">Cost of delay</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/80">
                  {whatIf.projects.map((p) => (
                    <tr key={p.projectBusinessKey}>
                      <td className="px-3 py-2.5">
                        <span className="block text-slate-200" dir="auto">{p.projectName ?? '—'}</span>
                        <span className="font-mono text-[10px] text-slate-500" dir="ltr">{p.projectBusinessKey}</span>
                        {p.note && <span className="mt-0.5 block text-[10px] text-amber-300/80">{p.note}</span>}
                      </td>
                      <td className="px-3 py-2.5 text-end tabular-nums text-slate-300" dir="ltr">{p.currentForecastFinish ?? '—'}</td>
                      <td className="px-3 py-2.5 text-end tabular-nums text-slate-300" dir="ltr">{p.delayDays}</td>
                      <td className="px-3 py-2.5 text-end tabular-nums text-sky-200" dir="ltr">{p.adjustedForecastFinish ?? '—'}</td>
                      <td className="px-3 py-2.5 text-end tabular-nums text-amber-200" dir="ltr">{money(p.costOfDelay)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t border-slate-700 bg-slate-900/60">
                  <tr className="text-xs">
                    <td className="px-3 py-2 font-semibold text-slate-300">
                      Totals · {whatIf.totals.projectsAnalyzed} project(s)
                    </td>
                    <td />
                    <td className="px-3 py-2 text-end tabular-nums text-slate-300" dir="ltr">{whatIf.totals.totalDelayDays}</td>
                    <td />
                    <td className="px-3 py-2 text-end tabular-nums font-semibold text-amber-200" dir="ltr">{money(whatIf.totals.totalCostOfDelay)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}

function StatTile({ label, value, tone = 'slate' }: { label: string; value: number | string; tone?: 'slate' | 'amber' }) {
  const cls = tone === 'amber' ? 'border-amber-500/40 text-amber-200' : 'border-slate-700 text-slate-100';
  return (
    <div className={`rounded-lg border bg-slate-900/50 px-3 py-2.5 ${cls}`}>
      <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-slate-400">{label}</p>
      <p className="mt-0.5 text-lg font-semibold tabular-nums" dir="ltr">{value}</p>
    </div>
  );
}

function PlaceholderCell() {
  return <span className="text-[10px] uppercase tracking-wide text-slate-500">placeholder</span>;
}

// ---------------------------------------------------------------------------
// Scenario card
// ---------------------------------------------------------------------------

function ScenarioCard({
  scenario, expanded, onToggleExpand, currentProject, nowMs, acting, canPromote, onPromote, onDiscard,
}: {
  scenario: ScenarioRecord;
  expanded: boolean;
  onToggleExpand: () => void;
  currentProject: { businessKey: string; name: string; status: string | null; clientName: string | null; dataDate: string | null } | null;
  /** Frozen "now" passed from the parent — keeps expiration checks pure. */
  nowMs: number;
  acting: boolean;
  canPromote: boolean;
  onPromote: () => void;
  onDiscard: () => void;
}) {
  const { t } = useI18n();
  const status = scenario.status as 'open' | 'committed' | 'discarded';
  const isMutable = status === 'open';
  const expiresAt = scenario.expiresAt ? new Date(scenario.expiresAt) : null;
  const hasExpired = expiresAt ? expiresAt.getTime() < nowMs : false;

  const baselineSnapshot = useMemo(
    () => scenario.baselineSnapshot ?? {},
    [scenario.baselineSnapshot],
  );
  const baselineIsEmpty = useMemo(
    () => Object.keys(baselineSnapshot).length === 0,
    [baselineSnapshot],
  );

  return (
    <Card padded={false}>
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-800/70 px-5 py-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-base font-semibold text-slate-100">{scenario.name}</h3>
            <StatusPill status={status} />
            <Pill tone="violet">{t('simulation.sandboxBadge')}</Pill>
            {hasExpired && status === 'open' && <Pill tone="rose">{t('simulation.expired')}</Pill>}
          </div>
          {scenario.summary && (
            <p className="mt-1.5 line-clamp-3 text-sm text-slate-400">{scenario.summary}</p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="ghost" size="sm" onClick={onToggleExpand}>
            {expanded ? t('simulation.hideDiff') : t('simulation.viewDiff')}
          </Button>
          {/*
            Promote-to-canonical — LIVE since Wave 7 (the C5 gate). Requires
            canEditPolicy; clash-impact scenarios are refused server-side with
            a pointer to the /clashes apply gate (atomic revision + letter).
          */}
          <span
            title={
              !canPromote
                ? 'Promoting requires canEditPolicy (PD / Client / Admin).'
                : !isMutable
                  ? 'Only open scenarios can be promoted.'
                  : 'Mark committed + notify downstream layers via the Outbox.'
            }
          >
            <Button
              variant="primary"
              size="sm"
              disabled={!canPromote || !isMutable || acting}
              onClick={onPromote}
            >
              {t('simulation.commit')}
            </Button>
          </span>
          <Button
            variant="danger"
            size="sm"
            disabled={!isMutable || acting}
            onClick={onDiscard}
          >
            <IconX className="h-3.5 w-3.5" /> {t('simulation.discard')}
          </Button>
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-x-6 gap-y-2 px-5 py-3 text-xs sm:grid-cols-4">
        <Field
          label={t('simulation.forkedAt')}
          icon={<IconClock className="h-3.5 w-3.5" />}
          value={new Date(scenario.forkedFromAt).toLocaleString()}
        />
        <Field
          label={t('simulation.expiresAt')}
          icon={<IconClock className="h-3.5 w-3.5" />}
          value={expiresAt ? expiresAt.toLocaleDateString() : '—'}
          tone={hasExpired ? 'rose' : undefined}
        />
        <Field
          label={t('simulation.author')}
          value={scenario.authorDisplay ?? '—'}
        />
        <Field
          label={t('nav.project')}
          icon={<IconFolder className="h-3.5 w-3.5" />}
          value={scenario.projectBusinessKey}
          mono
        />
      </dl>

      {expanded && (
        <div className="border-t border-slate-800/70 bg-slate-950/40 px-5 py-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h4 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
              {t('simulation.diffTitle')}
            </h4>
          </div>

          {baselineIsEmpty ? (
            <p className="mb-3 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-200">
              {t('simulation.diffEmpty')}
            </p>
          ) : (
            <SnapshotStructuredView
              snapshot={baselineSnapshot as FrozenSnapshot}
              currentProject={currentProject}
            />
          )}
        </div>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Structured snapshot view — replaces the old raw-JSON diff blocks.
// Renders the frozen state as human-readable cards + an activities table;
// the current-project column sits beside the frozen values so deviations
// read at a glance without anyone parsing JSON.
// ---------------------------------------------------------------------------

interface FrozenSnapshot {
  frozenAt?: string;
  project?: {
    businessKey?: string;
    name?: string;
    status?: string | null;
    dataDate?: string | null;
    plannedStart?: string | null;
    plannedFinish?: string | null;
  };
  schedule?: { activityCount?: number; completed?: number; inProgress?: number; notStarted?: number };
  alerts?: { total?: number; critical?: number; warning?: number };
  activities?: Array<{
    businessKey: string;
    name: string;
    wbsCode: string | null;
    plannedStart: string | null;
    plannedFinish: string | null;
    plannedDurationDays: number | null;
    actualPctComplete: number | null;
    status: string | null;
  }>;
  /** Compression / clash-impact scenarios carry their own shapes. */
  kind?: string;
  note?: string;
}

function SnapshotStructuredView({
  snapshot,
  currentProject,
}: {
  snapshot: FrozenSnapshot;
  currentProject: { businessKey: string; name: string; status: string | null; clientName: string | null; dataDate: string | null } | null;
}) {
  // Engine-generated scenarios (clash-impact / compression) carry a `kind` —
  // their summary line already narrates the what-if, so show the note only.
  if (snapshot.kind) {
    return (
      <p className="rounded-lg border border-violet-500/40 bg-violet-500/10 px-3 py-2.5 text-xs text-violet-100">
        {snapshot.kind === 'clash-impact'
          ? 'لقطة تأثير تضارب — الأرقام الكاملة (قبل/بعد) ظهرت في نافذة المحاكاة وقت إنشائها، وملخّصها مدوَّن أعلى البطاقة.'
          : 'لقطة اقتراح ضغط الجدول — تفاصيل الأساليب والوفورات معروضة في صفحة خطط بريمافيرا.'}
      </p>
    );
  }

  if (snapshot.note && !snapshot.project) {
    return (
      <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2.5 text-xs text-amber-100">
        {snapshot.note}
      </p>
    );
  }

  const p = snapshot.project ?? {};
  const sched = snapshot.schedule ?? {};
  const al = snapshot.alerts ?? {};
  const acts = snapshot.activities ?? [];

  return (
    <div className="space-y-4">
      {/* Project header — frozen vs current side by side */}
      <div className="overflow-x-auto rounded-lg border border-slate-700/70">
        <table className="w-full text-xs">
          <thead className="bg-slate-900/70 text-[10px] uppercase tracking-wider text-slate-400">
            <tr>
              <th className="px-3 py-2 text-start">البند</th>
              <th className="px-3 py-2 text-start">لقطة المرجع (المجمَّدة)</th>
              <th className="px-3 py-2 text-start">المشروع الحالي</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/80">
            {([
              ['الاسم', p.name ?? '—', currentProject?.name ?? '—'],
              ['الحالة', p.status ?? '—', currentProject?.status ?? '—'],
              ['تاريخ البيانات', p.dataDate ?? '—', currentProject?.dataDate ?? '—'],
              ['بداية الجدول', p.plannedStart ?? '—', '—'],
              ['نهاية الجدول', p.plannedFinish ?? '—', '—'],
            ] as Array<[string, string, string]>).map(([label, frozen, cur]) => (
              <tr key={label} className={frozen !== cur && cur !== '—' ? 'bg-amber-500/10' : ''}>
                <td className="px-3 py-1.5 font-semibold text-slate-200">{label}</td>
                <td className="px-3 py-1.5 font-mono tabular-nums text-slate-100" dir="ltr">{frozen}</td>
                <td className="px-3 py-1.5 font-mono tabular-nums text-slate-300" dir="ltr">{cur}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Schedule + alert counters */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
        <CounterTile label="الأنشطة" value={sched.activityCount ?? 0} tone="sky" />
        <CounterTile label="مكتملة" value={sched.completed ?? 0} tone="emerald" />
        <CounterTile label="جارية" value={sched.inProgress ?? 0} tone="amber" />
        <CounterTile label="لم تبدأ" value={sched.notStarted ?? 0} tone="slate" />
        <CounterTile label="التنبيهات" value={al.total ?? 0} tone="sky" />
        <CounterTile label="حرجة" value={al.critical ?? 0} tone="rose" />
        <CounterTile label="تحذير" value={al.warning ?? 0} tone="amber" />
      </div>

      {/* Frozen activities table */}
      {acts.length > 0 && (
        <div>
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">
            الأنشطة المجمَّدة وقت النسخ ({acts.length})
          </p>
          <div className="max-h-72 overflow-y-auto rounded-lg border border-slate-700/70">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-slate-900 text-[10px] uppercase tracking-wider text-slate-400">
                <tr>
                  <th className="px-3 py-2 text-start">المعرّف</th>
                  <th className="px-3 py-2 text-start">النشاط</th>
                  <th className="px-3 py-2 text-end">البداية</th>
                  <th className="px-3 py-2 text-end">النهاية</th>
                  <th className="px-3 py-2 text-end">المدة</th>
                  <th className="px-3 py-2 text-end">الإنجاز</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80">
                {acts.map((a) => (
                  <tr key={a.businessKey}>
                    <td className="px-3 py-1.5 font-mono text-[10px] text-slate-400" dir="ltr">{a.businessKey}</td>
                    <td className="px-3 py-1.5 text-slate-100" dir="auto">{a.name}</td>
                    <td className="px-3 py-1.5 text-end font-mono tabular-nums text-slate-300" dir="ltr">{a.plannedStart ?? '—'}</td>
                    <td className="px-3 py-1.5 text-end font-mono tabular-nums text-slate-300" dir="ltr">{a.plannedFinish ?? '—'}</td>
                    <td className="px-3 py-1.5 text-end tabular-nums text-slate-300">{a.plannedDurationDays ?? '—'}</td>
                    <td className="px-3 py-1.5 text-end tabular-nums text-slate-200">
                      {a.actualPctComplete !== null && a.actualPctComplete !== undefined
                        ? `${Math.round(a.actualPctComplete * 100)}%`
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {snapshot.frozenAt && (
        <p className="text-[10px] text-slate-500" dir="ltr">
          Frozen at {new Date(snapshot.frozenAt).toLocaleString()}
        </p>
      )}
    </div>
  );
}

function CounterTile({ label, value, tone }: { label: string; value: number; tone: 'sky' | 'emerald' | 'amber' | 'rose' | 'slate' }) {
  const tones: Record<string, string> = {
    sky: 'text-sky-200 border-sky-500/40',
    emerald: 'text-emerald-200 border-emerald-500/40',
    amber: 'text-amber-200 border-amber-500/40',
    rose: 'text-rose-200 border-rose-500/40',
    slate: 'text-slate-200 border-slate-600',
  };
  return (
    <div className={`rounded-lg border bg-slate-900/50 px-3 py-2 ${tones[tone]}`}>
      <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-slate-400">{label}</p>
      <p className="mt-0.5 text-lg font-semibold tabular-nums" dir="ltr">{value}</p>
    </div>
  );
}

function StatusPill({ status }: { status: 'open' | 'committed' | 'discarded' | string }) {
  const { t } = useI18n();
  const tone: 'emerald' | 'sky' | 'slate' =
    status === 'open' ? 'emerald' : status === 'committed' ? 'sky' : 'slate';
  const label =
    status === 'open' ? t('simulation.statuses.open')
    : status === 'committed' ? t('simulation.statuses.committed')
    : status === 'discarded' ? t('simulation.statuses.discarded')
    : status;
  return <Pill tone={tone}>{label}</Pill>;
}

function Field({
  label, value, icon, mono, tone,
}: {
  label: string;
  value: string;
  icon?: React.ReactNode;
  mono?: boolean;
  tone?: 'rose';
}) {
  const valueClass = tone === 'rose' ? 'text-rose-300' : 'text-slate-200';
  return (
    <div className="min-w-0">
      <dt className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
        {icon}
        <span>{label}</span>
      </dt>
      <dd className={`mt-0.5 truncate ${valueClass} ${mono ? 'font-mono text-[11px]' : 'text-xs'}`}>
        {value}
      </dd>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Fork dialog
// ---------------------------------------------------------------------------

function ForkDialog({
  projectBusinessKey, projectName, onClose, onCreated,
}: {
  projectBusinessKey: string;
  projectName: string;
  onClose: () => void;
  onCreated: () => void | Promise<void>;
}) {
  const { t } = useI18n();
  const toast = useToast();
  const [name, setName] = useState('');
  const [summary, setSummary] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !submitting) onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, submitting]);

  const submit = async () => {
    const trimmed = name.trim();
    if (!trimmed) { setError(t('simulation.nameRequired')); return; }
    setError(null);
    setSubmitting(true);
    try {
      await api<ScenarioRecord>('/simulation/scenarios', {
        method: 'POST',
        body: JSON.stringify({
          projectBusinessKey,
          name: trimmed,
          summary: summary.trim(),
        }),
      });
      toast.success(t('simulation.forkCreated'));
      await onCreated();
    } catch (e) {
      toast.error(t('simulation.forkFailed'), (e as Error).message);
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="fork-title"
    >
      <div className="absolute inset-0 bg-black/70" onClick={() => !submitting && onClose()} aria-hidden />
      <div className="relative w-full max-w-lg rounded-xl border border-slate-800 bg-slate-950 p-5 shadow-2xl">
        <button
          onClick={() => !submitting && onClose()}
          aria-label={t('common.cancel')}
          className="absolute end-3 top-3 rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-white"
        >
          <IconX className="h-4 w-4" />
        </button>

        <h2 id="fork-title" className="pe-8 text-base font-semibold text-slate-50">
          {t('simulation.forkDialogTitle')}
        </h2>
        <p className="mt-1 text-xs text-slate-400">{t('simulation.forkDialogBody')}</p>

        <div className="mt-4 rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2 text-xs">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
            {t('nav.project')}
          </p>
          <p className="mt-0.5 flex items-center gap-1.5 text-slate-200">
            <span className="font-mono text-[11px] text-sky-300" dir="ltr">{projectBusinessKey}</span>
            <span className="text-slate-500">·</span>
            <span className="truncate">{projectName}</span>
          </p>
        </div>

        <div className="mt-4 space-y-3">
          <label className="block">
            <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
              {t('simulation.nameLabel')}
            </span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('simulation.forkPlaceholder')}
              autoFocus
              disabled={submitting}
              className="mt-1 block w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-sky-500/60 focus:ring-2 focus:ring-sky-500/30 disabled:opacity-60"
            />
          </label>

          <label className="block">
            <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
              {t('simulation.summaryLabel')}
            </span>
            <textarea
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder={t('simulation.summaryPlaceholder')}
              rows={3}
              disabled={submitting}
              className="mt-1 block w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-sky-500/60 focus:ring-2 focus:ring-sky-500/30 disabled:opacity-60"
            />
          </label>

          {error && <ErrorBanner message={error} />}
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={submitting}>
            {t('common.cancel')}
          </Button>
          <Button variant="primary" onClick={submit} disabled={submitting}>
            <IconSparkles className="h-4 w-4" />
            {submitting ? t('simulation.forking') : t('simulation.forkDialogCreate')}
          </Button>
        </div>
      </div>
    </div>
  );
}

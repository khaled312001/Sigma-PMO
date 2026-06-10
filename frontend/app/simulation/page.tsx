'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import { AuthGate } from '../../components/AuthGate';
import { useConfirm } from '../../components/ConfirmDialog';
import { JsonView } from '../../components/JsonView';
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

          {baselineIsEmpty && (
            <p className="mb-3 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-200">
              {t('simulation.diffEmpty')}
            </p>
          )}

          <div className="grid gap-3 lg:grid-cols-2">
            <JsonView
              data={baselineSnapshot}
              title={t('simulation.snapshotLabel')}
              defaultDepth={3}
              maxHeight="20rem"
            />
            <JsonView
              data={currentProject ?? {}}
              title={t('simulation.currentLabel')}
              defaultDepth={3}
              maxHeight="20rem"
            />
          </div>
        </div>
      )}
    </Card>
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

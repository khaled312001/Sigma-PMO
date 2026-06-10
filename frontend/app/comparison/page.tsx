'use client';

/**
 * /comparison — AI-vs-Human output comparison (correction-plan §2.10,
 * transcript 00:46:14: «رح نشوف كيف بتطلع نتائج من الـ human being وكيف
 * تطلع نتائج من AI، وكيف من الأقرب للصحة»).
 *
 * Surface anatomy:
 *  1. PageHeader + "Register comparison" CTA (canEvaluateRules).
 *  2. Inline create form (no modal — same pattern as /letters).
 *  3. Pair list (left) + side-by-side detail (right): AI pane vs Human pane.
 *  4. Verdict bar with the three §2.10 buttons — Mark AI correct / Mark
 *     human correct / Both have merit — plus a reconciliation-notes field.
 *     Verdicts require `canEditPolicy` (project-director tier); they are
 *     the labelled training signal for persona refinement.
 *
 * Deliberately NO AI on this page: the verdict is a human judgement and
 * automating it would defeat the measurement.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';

import { AuthGate } from '../../components/AuthGate';
import {
  IconCheck,
  IconRefresh,
  IconSparkles,
  IconUsers,
  IconX,
} from '../../components/Icons';
import { useToast } from '../../components/ToastProvider';
import { Button, Card, EmptyState, ErrorBanner, PageHeader, Pill } from '../../components/ui';
import { api } from '../../lib/api';
import { CAPABILITIES } from '../../lib/capabilities';
import { useMe } from '../../lib/me-context';
import { useCurrentProjectKey } from '../../lib/project-context';

// ──────────────────────────── types ────────────────────────────

/** Mirror of backend `output-comparison.entity.ts`. */
interface ComparisonRecord {
  id: string;
  createdAt: string;
  projectBusinessKey: string;
  taskKind: 'baseline' | 'clash-resolution' | 'letter-draft' | 'monthly-report' | string;
  title: string;
  aiOutputId: string;
  aiSummary: string;
  humanOutputId: string | null;
  humanSummary: string;
  reconciliation: string | null;
  verdict: 'pending' | 'ai-correct' | 'human-correct' | 'both-merit' | string;
  decidedBy: string | null;
  decidedAt: string | null;
}

const TASK_KINDS = [
  { value: 'baseline', label: 'Baseline schedule' },
  { value: 'clash-resolution', label: 'Clash resolution' },
  { value: 'letter-draft', label: 'Letter draft' },
  { value: 'monthly-report', label: 'Monthly report' },
] as const;

// ──────────────────────────── route wrapper ────────────────────────────

export default function ComparisonPageRoute() {
  return (
    <AuthGate surface="AI vs Human">
      <ComparisonPage />
    </AuthGate>
  );
}

// ──────────────────────────── page body ────────────────────────────

function ComparisonPage() {
  const toast = useToast();
  const { me } = useMe();
  const projectKey = useCurrentProjectKey();

  const role = me?.user?.role;
  const caps = role ? CAPABILITIES[role] : null;
  const canRegister = !!caps?.canEvaluateRules;
  const canDecide = !!caps?.canEditPolicy;

  const [rows, setRows] = useState<ComparisonRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!projectKey) return;
    try {
      const data = await api<ComparisonRecord[]>(
        `/comparison?projectKey=${encodeURIComponent(projectKey)}`,
      );
      setRows(data);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
      setRows([]);
    }
  }, [projectKey]);

  useEffect(() => { void refresh(); }, [refresh]);

  const selected = useMemo(
    () => rows?.find((r) => r.id === selectedId) ?? null,
    [rows, selectedId],
  );

  const create = async (input: {
    taskKind: string;
    title: string;
    aiOutputId: string;
    aiSummary: string;
    humanOutputId: string;
    humanSummary: string;
  }) => {
    setBusy('create');
    try {
      const created = await api<ComparisonRecord>('/comparison', {
        method: 'POST',
        body: JSON.stringify({
          projectKey,
          taskKind: input.taskKind,
          title: input.title,
          aiOutputId: input.aiOutputId,
          aiSummary: input.aiSummary,
          humanOutputId: input.humanOutputId || null,
          humanSummary: input.humanSummary,
        }),
      });
      toast.success('Comparison registered', 'Both outputs are now side-by-side for a verdict.');
      setFormOpen(false);
      await refresh();
      setSelectedId(created.id);
    } catch (e) {
      toast.error('Registration failed', (e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const decide = async (id: string, verdict: string, reconciliation: string) => {
    if (!me?.user?.displayName) return;
    setBusy(id);
    try {
      await api<ComparisonRecord>(`/comparison/${id}/verdict`, {
        method: 'POST',
        body: JSON.stringify({
          verdict,
          decidedBy: me.user.displayName,
          reconciliation: reconciliation.trim() || null,
        }),
      });
      toast.success('Verdict recorded', 'This pair now feeds persona refinement as a labelled example.');
      await refresh();
    } catch (e) {
      toast.error('Verdict failed', (e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Insights · Quality"
        title="AI vs Human"
        description={
          'Side-by-side comparison of AI output and the human planner’s output for the same task. ' +
          'A project director reads both and records which was closer to correct — every verdict is a ' +
          'labelled training example for persona refinement (correction-plan §2.10).'
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="ghost" size="sm" onClick={refresh}>
              <IconRefresh className="h-3.5 w-3.5" /> Refresh
            </Button>
            {canRegister && (
              <Button variant="primary" size="sm" onClick={() => setFormOpen((v) => !v)}>
                <IconSparkles className="h-3.5 w-3.5" /> Register comparison
              </Button>
            )}
          </div>
        }
      />

      <ErrorBanner message={error} />

      {formOpen && canRegister && (
        <CreateForm
          projectKey={projectKey}
          busy={busy === 'create'}
          onCancel={() => setFormOpen(false)}
          onSubmit={create}
        />
      )}

      {rows === null ? (
        <Card padded={false}>
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="border-b border-slate-800/70 px-5 py-4 last:border-b-0">
              <div className="h-4 w-2/3 animate-pulse rounded bg-slate-800/60" />
              <div className="mt-2 h-3 w-1/2 animate-pulse rounded bg-slate-800/40" />
            </div>
          ))}
        </Card>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<IconUsers className="h-8 w-8" />}
          title="No comparisons registered yet"
          description={
            canRegister
              ? 'Register a pair: the AI artefact id (a baseline job, letter, or report) and the human planner’s equivalent.'
              : 'Once a reviewer registers an AI-vs-human pair for this project it will appear here.'
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
          <ul className="space-y-2" aria-label="Comparison list">
            {rows.map((r) => (
              <li key={r.id}>
                <RowCard row={r} selected={r.id === selectedId} onSelect={() => setSelectedId(r.id)} />
              </li>
            ))}
          </ul>
          <div className="space-y-3">
            {selected ? (
              <DetailCard
                row={selected}
                canDecide={canDecide}
                busy={busy === selected.id}
                onDecide={(verdict, notes) => decide(selected.id, verdict, notes)}
              />
            ) : (
              <EmptyState
                title="Select a comparison"
                description="Pick a pair on the left to read both outputs side-by-side and record a verdict."
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ──────────────────────────── verdict pill ────────────────────────────

function VerdictPill({ verdict }: { verdict: string }) {
  if (verdict === 'ai-correct') return <Pill tone="sky">AI correct</Pill>;
  if (verdict === 'human-correct') return <Pill tone="emerald">Human correct</Pill>;
  if (verdict === 'both-merit') return <Pill tone="amber">Both have merit</Pill>;
  return <Pill tone="slate">Pending verdict</Pill>;
}

function taskKindLabel(kind: string): string {
  return TASK_KINDS.find((t) => t.value === kind)?.label ?? kind;
}

// ──────────────────────────── row card ────────────────────────────

function RowCard({
  row,
  selected,
  onSelect,
}: {
  row: ComparisonRecord;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`block w-full rounded-xl border bg-slate-900/40 px-4 py-3 text-start transition ${
        selected
          ? 'border-sky-500/60 bg-sky-500/5 ring-1 ring-sky-500/30'
          : 'border-slate-800 hover:border-slate-600 hover:bg-slate-900/60'
      }`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <VerdictPill verdict={row.verdict} />
        <Pill tone="slate">{taskKindLabel(row.taskKind)}</Pill>
      </div>
      <h3 className="mt-2 text-sm font-medium text-slate-100">{row.title}</h3>
      <p className="mt-1 text-[11px] text-slate-500" dir="ltr">
        {new Date(row.createdAt).toLocaleString()}
        {row.decidedBy ? ` · decided by ${row.decidedBy}` : ''}
      </p>
    </button>
  );
}

// ──────────────────────────── detail card ────────────────────────────

function DetailCard({
  row,
  canDecide,
  busy,
  onDecide,
}: {
  row: ComparisonRecord;
  canDecide: boolean;
  busy: boolean;
  onDecide: (verdict: string, reconciliation: string) => void;
}) {
  const [notes, setNotes] = useState(row.reconciliation ?? '');
  // Re-seed the notes box when the user switches rows.
  useEffect(() => setNotes(row.reconciliation ?? ''), [row.id, row.reconciliation]);

  return (
    <Card padded={false}>
      <div className="px-5 py-4">
        <div className="flex flex-wrap items-center gap-2">
          <VerdictPill verdict={row.verdict} />
          <Pill tone="slate">{taskKindLabel(row.taskKind)}</Pill>
        </div>
        <h2 className="mt-2 text-base font-semibold text-slate-100">{row.title}</h2>
        <p className="mt-1 text-[11px] text-slate-500" dir="ltr">
          Registered {new Date(row.createdAt).toLocaleString()} · project {row.projectBusinessKey}
          {row.decidedAt ? ` · verdict ${new Date(row.decidedAt).toLocaleString()} by ${row.decidedBy}` : ''}
        </p>
      </div>

      {/* The side-by-side core: AI pane vs Human pane. */}
      <div className="grid grid-cols-1 gap-0 border-t border-slate-800/70 md:grid-cols-2">
        <section className="border-b border-slate-800/70 px-5 py-4 md:border-b-0 md:border-e">
          <div className="flex items-center gap-1.5">
            <IconSparkles className="h-3.5 w-3.5 text-sky-300" />
            <h3 className="text-[10px] font-semibold uppercase tracking-wider text-sky-300">
              AI output
            </h3>
          </div>
          <p className="mt-1 font-mono text-[10px] text-slate-500" dir="ltr">ref: {row.aiOutputId}</p>
          <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-slate-100">
            {row.aiSummary}
          </p>
        </section>
        <section className="px-5 py-4">
          <div className="flex items-center gap-1.5">
            <IconUsers className="h-3.5 w-3.5 text-emerald-300" />
            <h3 className="text-[10px] font-semibold uppercase tracking-wider text-emerald-300">
              Human output
            </h3>
          </div>
          <p className="mt-1 font-mono text-[10px] text-slate-500" dir="ltr">
            ref: {row.humanOutputId ?? '(outside the platform)'}
          </p>
          <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-slate-100">
            {row.humanSummary}
          </p>
        </section>
      </div>

      {/* Reconciliation + verdict bar. */}
      <div className="border-t border-slate-800/70 px-5 py-4">
        <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-500">
          Reconciliation notes
        </label>
        {canDecide ? (
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder="What differed? Which durations / clauses / quantities were closer to reality, and why?"
            className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-sky-500 focus:outline-none"
          />
        ) : (
          <p className="mt-2 whitespace-pre-line text-sm text-slate-300">
            {row.reconciliation || '—'}
          </p>
        )}

        {canDecide && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button variant="primary" size="sm" disabled={busy} onClick={() => onDecide('ai-correct', notes)}>
              <IconSparkles className="h-3.5 w-3.5" /> Mark AI as correct
            </Button>
            <Button variant="success" size="sm" disabled={busy} onClick={() => onDecide('human-correct', notes)}>
              <IconUsers className="h-3.5 w-3.5" /> Mark human as correct
            </Button>
            <Button variant="ghost" size="sm" disabled={busy} onClick={() => onDecide('both-merit', notes)}>
              <IconCheck className="h-3.5 w-3.5" /> Both have merit
            </Button>
          </div>
        )}
        {!canDecide && row.verdict === 'pending' && (
          <p className="mt-2 text-[11px] text-slate-500">
            Verdicts are recorded by the project-director tier (policy editors).
          </p>
        )}
      </div>
    </Card>
  );
}

// ──────────────────────────── create form ────────────────────────────

function CreateForm({
  projectKey,
  busy,
  onCancel,
  onSubmit,
}: {
  projectKey: string;
  busy: boolean;
  onCancel: () => void;
  onSubmit: (input: {
    taskKind: string;
    title: string;
    aiOutputId: string;
    aiSummary: string;
    humanOutputId: string;
    humanSummary: string;
  }) => void;
}) {
  const [taskKind, setTaskKind] = useState<string>('baseline');
  const [title, setTitle] = useState('');
  const [aiOutputId, setAiOutputId] = useState('');
  const [aiSummary, setAiSummary] = useState('');
  const [humanOutputId, setHumanOutputId] = useState('');
  const [humanSummary, setHumanSummary] = useState('');
  const valid =
    title.trim().length > 0 &&
    aiOutputId.trim().length > 0 &&
    aiSummary.trim().length > 0 &&
    humanSummary.trim().length > 0;

  const inputCls =
    'mt-1 w-full rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-sky-500 focus:outline-none';
  const labelCls = 'block text-[11px] font-semibold uppercase tracking-wider text-slate-400';

  return (
    <Card title="Register an AI-vs-Human pair" hint={`Project: ${projectKey}`}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!valid || busy) return;
          onSubmit({ taskKind, title, aiOutputId, aiSummary, humanOutputId, humanSummary });
        }}
        className="space-y-3"
      >
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div>
            <label className={labelCls}>Task kind</label>
            <select value={taskKind} onChange={(e) => setTaskKind(e.target.value)} className={inputCls}>
              {TASK_KINDS.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder='e.g. "Baseline B-1 — tower A superstructure"'
              className={inputCls}
              required
            />
          </div>
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div>
            <label className={labelCls}>AI output id</label>
            <input
              type="text"
              value={aiOutputId}
              onChange={(e) => setAiOutputId(e.target.value)}
              placeholder="Baseline job / letter / report uuid"
              className={`${inputCls} font-mono`}
              dir="ltr"
              spellCheck={false}
              required
            />
          </div>
          <div>
            <label className={labelCls}>Human output id (optional)</label>
            <input
              type="text"
              value={humanOutputId}
              onChange={(e) => setHumanOutputId(e.target.value)}
              placeholder="SourceFile uuid of the planner's artefact, if uploaded"
              className={`${inputCls} font-mono`}
              dir="ltr"
              spellCheck={false}
            />
          </div>
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div>
            <label className={labelCls}>AI output summary</label>
            <textarea
              value={aiSummary}
              onChange={(e) => setAiSummary(e.target.value)}
              rows={4}
              placeholder="What did the AI produce? Key durations, clauses, quantities…"
              className={inputCls}
              required
            />
          </div>
          <div>
            <label className={labelCls}>Human output summary</label>
            <textarea
              value={humanSummary}
              onChange={(e) => setHumanSummary(e.target.value)}
              rows={4}
              placeholder="What did the human planner produce for the same task?"
              className={inputCls}
              required
            />
          </div>
        </div>
        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onCancel}>
            <IconX className="h-3.5 w-3.5" /> Cancel
          </Button>
          <Button variant="primary" size="sm" type="submit" disabled={!valid || busy}>
            {busy ? 'Registering…' : 'Register pair'}
          </Button>
        </div>
      </form>
    </Card>
  );
}

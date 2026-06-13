'use client';

/**
 * Primavera P6 Baseline Author — Wave 4 UI (ADR-0017 Author Path).
 *
 * Page composition:
 *  1. Hero card           — project name, contract window, persona, "what AI builds" promise
 *  2. Planning explainer  — three-step "how it works" panel
 *  3. Generate form       — Author name + optional baseline name + Generate
 *  4. Jobs list           — each row expandable to show schedule preview
 *  5. Empty state         — when no jobs, points the user to the reference programmes
 */

import { useCallback, useEffect, useMemo, useState } from 'react';

import { API_BASE, api, getApiKey } from '../../lib/api';
import { AuthGate } from '../../components/AuthGate';
import {
  BarChart,
  DonutChart,
  CHART_PALETTE,
} from '../../components/Charts';
import { PersonaActiveBadge } from '../../components/PersonaActiveBadge';
import { PolicyAddonInline } from '../../components/PolicyAddonInline';
import { useToast } from '../../components/ToastProvider';
import { useI18n } from '../../lib/i18n';
import { useMe } from '../../lib/me-context';
import { useCurrentProjectKey } from '../../lib/project-context';
import { CAPABILITIES } from '../../lib/capabilities';
import { SkeletonRow } from '../../components/Skeleton';
import { Button, Card, ErrorBanner, PageHeader, Pill } from '../../components/ui';
import {
  IconActivity,
  IconCheck,
  IconChevronRight,
  IconClock,
  IconDatabase,
  IconRefresh,
  IconShield,
  IconSparkles,
} from '../../components/Icons';

// ────────────────────────── Types ──────────────────────────

interface BaselineJobRow {
  id: string;
  projectBusinessKey: string;
  personaSlug: string;
  status:
    | 'pending' | 'running' | 'awaiting-approval' | 'awaiting-second-approval'
    | 'awaiting-enablement' | 'committed' | 'failed' | 'rejected' | string;
  /** First of the two §3.1 signatures, when present. */
  firstApprovedBy?: string | null;
  progressPercent: number;
  startedAt: string | null;
  completedAt: string | null;
  outputXerSourceFileId: string | null;
  operatorNotes: string | null;
  failureReason: string | null;
  drawingsSourceFileIds: string[];
  createdAt: string;
}

interface ScheduleSummary {
  activityCount: number;
  milestoneCount: number;
  criticalCount: number;
  dependencyCount: number;
  durationDays: number | null;
  wbsBreakdown: Array<{ code: string; count: number }>;
  sample: Array<{
    businessKey: string;
    name: string;
    wbsCode: string;
    plannedStart: string;
    plannedFinish: string;
    durationDays: number;
    isCritical: boolean;
    isMilestone: boolean;
    totalFloatDays: number;
  }>;
}

interface ProjectInfo {
  businessKey: string;
  name: string;
  plannedStart: string | null;
  plannedFinish: string | null;
  status: string | null;
  dataDate: string | null;
}

/** Mirrors `CompressionProposal` from schedule-compression.service.ts. */
interface CompressionProposalView {
  projectKey: string;
  scenarioId: string;
  originalDurationDays: number;
  compressedDurationDays: number;
  compressionDays: number;
  compressionPercent: number;
  techniques: Array<{
    type: 'crashing' | 'fast-tracking' | 'resequencing';
    title: string;
    affectedActivities: string[];
    estimatedSavingDays: number;
    assumptions: string[];
    tradeoffs: string;
  }>;
  risks: string[];
  source: 'deterministic' | 'llm';
  personaSlug: string | null;
  citations: string[];
}

// ────────────────────────── Route ──────────────────────────

export default function BaselinesRoute() {
  return (
    <AuthGate surface="Baselines">
      <BaselinesPage />
    </AuthGate>
  );
}

// ────────────────────────── Main page ──────────────────────────

function BaselinesPage() {
  const { me } = useMe();
  const projectKey = useCurrentProjectKey();
  const toast = useToast();
  const { lang } = useI18n();

  const canAuthor = !!me?.user && CAPABILITIES[me.user.role].canSimulate;
  const canApprove = !!me?.user && CAPABILITIES[me.user.role].canApproveBaseline;

  const [rows, setRows] = useState<BaselineJobRow[] | null>(null);
  const [project, setProject] = useState<ProjectInfo | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const [authoredBy, setAuthoredBy] = useState<string>('');
  const [baselineName, setBaselineName] = useState<string>('');
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    if (me?.user?.displayName && !authoredBy) {
      setAuthoredBy(me.user.displayName);
    }
  }, [me?.user?.displayName, authoredBy]);

  const refresh = useCallback(async () => {
    if (!projectKey) return;
    setLoadError(null);
    try {
      const [list, projects] = await Promise.all([
        api<BaselineJobRow[]>(
          `/baselines/jobs?projectKey=${encodeURIComponent(projectKey)}`,
        ),
        api<ProjectInfo[]>(`/projects`),
      ]);
      setRows(list);
      const p = projects.find((q) => q.businessKey === projectKey) ?? null;
      setProject(p);
    } catch (e) {
      setRows([]);
      setLoadError((e as Error).message);
    }
  }, [projectKey]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Auto-poll while any job is in flight so the progress bar feels live.
  useEffect(() => {
    if (!rows) return;
    const running = rows.some(
      (r) => r.status === 'running' || (r.progressPercent > 0 && r.progressPercent < 100),
    );
    if (!running) return;
    const id = setInterval(() => void refresh(), 700);
    return () => clearInterval(id);
  }, [rows, refresh]);

  const onAuthor = useCallback(async () => {
    if (!projectKey) return;
    if (!authoredBy.trim()) {
      toast.error(
        lang === 'ar' ? 'اسم المُخطِّط مطلوب' : 'Author required',
        lang === 'ar' ? 'أدخل اسم المُخطِّط (authoredBy).' : 'Enter the planner name (authoredBy).',
      );
      return;
    }
    setBusy('author');
    try {
      const created = await api<BaselineJobRow>('/baselines/jobs/author', {
        method: 'POST',
        body: JSON.stringify({
          projectKey,
          authoredBy: authoredBy.trim(),
          baselineName: baselineName.trim() || undefined,
        }),
      });
      toast.success(
        lang === 'ar' ? 'بدأ التخطيط' : 'Planning started',
        lang === 'ar'
          ? `المهمّة ${created.id.slice(0, 8)} تبني الآن هيكل تجزئة العمل (WBS)…`
          : `Job ${created.id.slice(0, 8)} is now building the WBS…`,
      );
      setOpenId(created.id);
      await refresh();
    } catch (e) {
      toast.error(lang === 'ar' ? 'فشل التوليد' : 'Generation failed', (e as Error).message);
    } finally {
      setBusy(null);
    }
  }, [projectKey, authoredBy, baselineName, refresh, toast]);

  const onApprove = useCallback(
    async (jobId: string) => {
      if (!me?.user?.displayName) return;
      setBusy(jobId);
      try {
        const updated = await api<BaselineJobRow>(
          `/baselines/jobs/${jobId}/approve`,
          {
            method: 'POST',
            body: JSON.stringify({ approvedBy: me.user.displayName }),
          },
        );
        toast.success(
          updated.status === 'committed'
            ? lang === 'ar' ? 'تم الاعتماد (توقيعان من 2)' : 'Committed (2/2 signatures)'
            : lang === 'ar' ? 'سُجِّل التوقيع الأول (1 من 2)' : 'First signature recorded (1/2)',
          updated.status === 'committed'
            ? lang === 'ar'
              ? `المهمّة ${updated.id.slice(0, 8)} أصبحت خط الأساس المعتمَد الآن.`
              : `Job ${updated.id.slice(0, 8)} is now the approved baseline.`
            : lang === 'ar'
              ? 'يجب أن يوقّع معتمِد ثانٍ مختلف لإتمام الاعتماد.'
              : 'A second, different approver must sign to commit.',
        );
        await refresh();
      } catch (e) {
        toast.error(lang === 'ar' ? 'فشل الاعتماد' : 'Approval failed', (e as Error).message);
      } finally {
        setBusy(null);
      }
    },
    [me?.user?.displayName, refresh, toast],
  );

  /** Rejection gate (plan §3.1) — whole-build, with a mandatory reason. */
  const onReject = useCallback(
    async (jobId: string) => {
      if (!me?.user?.displayName) return;
      const reason = window.prompt(
        lang === 'ar'
          ? 'سبب الرفض (إلزامي) — يصل للمُخطِّط كتوجيه لإعادة المحاولة:'
          : 'Rejection reason (required) — reaches the planner as guidance for the re-run:',
      );
      if (!reason?.trim()) return;
      setBusy(jobId);
      try {
        await api<BaselineJobRow>(`/baselines/jobs/${jobId}/reject`, {
          method: 'POST',
          body: JSON.stringify({ rejectedBy: me.user.displayName, reason: reason.trim() }),
        });
        toast.success(
          lang === 'ar' ? 'تم الرفض' : 'Rejected',
          lang === 'ar'
            ? 'سُجِّل مع السبب — أعد تشغيل مسار التأليف بعد التعديلات.'
            : 'Recorded with the reason — re-run the author path with adjustments.',
        );
        await refresh();
      } catch (e) {
        toast.error(lang === 'ar' ? 'فشل الرفض' : 'Rejection failed', (e as Error).message);
      } finally {
        setBusy(null);
      }
    },
    [me?.user?.displayName, refresh, toast],
  );

  const counts = useMemo(() => {
    const r = rows ?? [];
    return {
      total: r.length,
      committed: r.filter((j) => j.status === 'committed').length,
      awaiting: r.filter((j) => j.status === 'awaiting-approval').length,
      running: r.filter((j) => j.status === 'running').length,
    };
  }, [rows]);

  return (
    <div className="space-y-6 animate-[fade-in-up_240ms_ease-out]">
      <PageHeader
        eyebrow={lang === 'ar' ? 'Primavera P6 · مسار التأليف · ADR-0017' : 'Primavera P6 · Author Path · ADR-0017'}
        title={lang === 'ar' ? 'مُنشئ خط أساس البرنامج الزمني' : 'Programme Baseline Builder'}
        description={
          lang === 'ar'
            ? 'يبني خبير تخطيط بالذكاء الاصطناعي خط أساس فعلياً بأسلوب Primavera انطلاقاً من نافذة مدّة مشروعك — هيكل تجزئة العمل (WBS) والأنشطة والعلاقات والمسار الحرج — ثم يحجزه لمراجعة بشرية قبل الإصدار.'
            : 'An AI planner persona builds a real Primavera-style baseline from your project window — WBS, activities, dependencies, and critical path — and parks it for human review before release.'
        }
        actions={
          <span className="flex items-center gap-2">
            <PersonaActiveBadge
              personaSlug="planner-p6-25yr"
              expertise="Primavera P6 planner — 25-30 years. Builds WBS + baseline + critical path from the contract window; vets compression candidates downward only."
              surface="planning"
            />
            <button
              onClick={() => void refresh()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-600 px-2.5 py-1.5 text-xs text-slate-100 transition-all duration-200 hover:scale-105 hover:border-sky-400/60 hover:bg-sky-500/10 hover:text-sky-100"
            >
              <IconRefresh className="h-3.5 w-3.5" />
              <span>Refresh</span>
            </button>
          </span>
        }
      />

      <ErrorBanner message={loadError} />

      <PolicyAddonInline projectKey={projectKey} surface="planning" />

      <ProjectHeroCard project={project} counts={counts} />

      <CompressionCard projectKey={projectKey} canSimulate={canAuthor} requestedBy={authoredBy} />

      <HowItWorksPanel />

      {canAuthor ? (
        <GenerateCard
          projectKey={projectKey}
          authoredBy={authoredBy}
          baselineName={baselineName}
          busy={busy === 'author'}
          onAuthorChange={setAuthoredBy}
          onBaselineNameChange={setBaselineName}
          onSubmit={onAuthor}
        />
      ) : (
        <Card>
          <p className="text-xs text-slate-300">
            Your role does not include <span className="font-mono">canSimulate</span>; contact a Sigma admin to author baselines.
          </p>
        </Card>
      )}

      <JobsList
        rows={rows}
        busy={busy}
        openId={openId}
        canApprove={canApprove}
        onApprove={onApprove}
        onReject={onReject}
        onToggleOpen={(id) => setOpenId((cur) => (cur === id ? null : id))}
      />
    </div>
  );
}

// ────────────────────────── Hero card ──────────────────────────

function ProjectHeroCard({
  project,
  counts,
}: {
  project: ProjectInfo | null;
  counts: { total: number; committed: number; awaiting: number; running: number };
}) {
  const duration = useMemo(() => {
    if (!project?.plannedStart || !project?.plannedFinish) return null;
    const s = new Date(project.plannedStart);
    const f = new Date(project.plannedFinish);
    return Math.round((f.getTime() - s.getTime()) / 86_400_000) + 1;
  }, [project?.plannedStart, project?.plannedFinish]);

  return (
    <section className="relative overflow-hidden rounded-xl border border-slate-700 bg-gradient-to-br from-slate-900/95 via-slate-900/90 to-slate-800/80 p-5 shadow-md">
      {/* Ambient crimson glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute -right-12 -top-12 h-44 w-44 rounded-full bg-gradient-to-br from-sky-500/20 to-emerald-500/10 blur-2xl"
      />
      <div className="relative flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-sky-300">Project under management</p>
          <h2 className="mt-1 text-xl font-semibold tracking-tight text-slate-50">
            {project?.name ?? '—'}
          </h2>
          <p className="mt-0.5 text-xs text-slate-300" dir="ltr">
            <span className="font-mono">{project?.businessKey ?? '—'}</span>
            {project?.status && (
              <>
                <span className="mx-2 text-slate-500">·</span>
                <span className="capitalize">{project.status}</span>
              </>
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {counts.total > 0 && (
            <Pill tone="slate">
              {counts.total} job{counts.total === 1 ? '' : 's'}
            </Pill>
          )}
          {counts.running > 0 && <Pill tone="sky">{counts.running} running</Pill>}
          {counts.awaiting > 0 && <Pill tone="amber">{counts.awaiting} pending</Pill>}
          {counts.committed > 0 && <Pill tone="emerald">{counts.committed} committed</Pill>}
        </div>
      </div>

      <div className="relative mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <HeroMetric label="Commencement" value={project?.plannedStart ?? '—'} mono accent="sky" />
        <HeroMetric label="Completion" value={project?.plannedFinish ?? '—'} mono accent="emerald" />
        <HeroMetric
          label="Contract duration"
          value={duration !== null ? `${duration} days` : '—'}
          accent="amber"
        />
        <HeroMetric label="Data date" value={project?.dataDate ?? '—'} mono accent="rose" />
      </div>
    </section>
  );
}

function HeroMetric({
  label,
  value,
  mono = false,
  accent,
}: {
  label: string;
  value: string;
  mono?: boolean;
  accent: 'sky' | 'emerald' | 'amber' | 'rose';
}) {
  const accents: Record<string, string> = {
    sky: 'before:bg-sky-400',
    emerald: 'before:bg-emerald-400',
    amber: 'before:bg-amber-400',
    rose: 'before:bg-rose-400',
  };
  return (
    <div
      className={`relative rounded-lg border border-slate-700 bg-slate-900/70 px-3 py-2.5 shadow-sm before:absolute before:start-0 before:top-2 before:bottom-2 before:w-[3px] before:rounded-e-full ${accents[accent]}`}
    >
      <p className="ms-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">{label}</p>
      <p
        className={`ms-2 mt-1 text-sm font-semibold text-slate-50 ${mono ? 'font-mono tabular-nums' : ''}`}
        dir="ltr"
      >
        {value}
      </p>
    </div>
  );
}

// ────────────────────────── Compression card ──────────────────────────

/**
 * Day-zero schedule-compression proposal (correction-plan §2.5). The AI
 * planner reviews the submitted programme and answers Al Ayham's 00:16:28
 * question: "هاد الجدول الزمني قادر انه ينضغط؟" — with techniques, savings,
 * assumptions, and risks. Read-only analysis; applying the techniques is
 * the planner-review cycle that follows.
 */
function CompressionCard({
  projectKey,
  canSimulate,
  requestedBy,
}: {
  projectKey: string;
  canSimulate: boolean;
  requestedBy: string;
}) {
  const toast = useToast();
  const [proposal, setProposal] = useState<CompressionProposalView | null>(null);
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const onAnalyse = useCallback(async () => {
    if (!projectKey) return;
    setBusy(true);
    try {
      const p = await api<CompressionProposalView>('/baselines/compression/propose', {
        method: 'POST',
        body: JSON.stringify({ projectKey, requestedBy }),
      });
      setProposal(p);
      setExpanded(true);
      toast.success(
        'Analysis ready',
        `The schedule can compress by ${p.compressionDays} day(s) (${p.compressionPercent}%).`,
      );
    } catch (e) {
      toast.error('Compression analysis failed', (e as Error).message);
    } finally {
      setBusy(false);
    }
  }, [projectKey, requestedBy, toast]);

  return (
    <Card
      title="Schedule compression analysis"
      hint="Day-zero review: can the submitted programme be compressed? Crashing + fast-tracking candidates with savings, assumptions, and risks."
      actions={
        <Button variant="primary" size="sm" onClick={() => void onAnalyse()} disabled={!canSimulate || busy || !projectKey}>
          <IconSparkles className="h-3.5 w-3.5" />
          {busy ? 'Analysing…' : proposal ? 'Re-analyse' : 'Analyse schedule'}
        </Button>
      }
    >
      {!proposal ? (
        <p className="text-xs text-slate-300">
          No analysis yet for this project. The engine detects compression candidates
          deterministically (critical-band crashing + same-WBS fast-tracking), then the
          25-year planner persona vets them when Claude is enabled. The claimed saving
          is capped at 30% of the original duration — the over-compression guard.
        </p>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="rounded-lg border border-slate-700 bg-slate-900/70 px-4 py-2.5">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">Original</p>
              <p className="text-lg font-semibold tabular-nums text-slate-50" dir="ltr">{proposal.originalDurationDays} d</p>
            </div>
            <span aria-hidden className="text-slate-500">→</span>
            <div className="rounded-lg border border-emerald-500/50 bg-emerald-500/15 px-4 py-2.5">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-200">Compressed</p>
              <p className="text-lg font-semibold tabular-nums text-emerald-100" dir="ltr">{proposal.compressedDurationDays} d</p>
            </div>
            <Pill tone="emerald">−{proposal.compressionDays} d ({proposal.compressionPercent}%)</Pill>
            <Pill tone={proposal.source === 'llm' ? 'violet' : 'slate'}>
              {proposal.source === 'llm' ? `Vetted by ${proposal.personaSlug}` : 'Deterministic heuristics'}
            </Pill>
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="ms-auto text-xs text-sky-300 underline-offset-2 hover:underline"
            >
              {expanded ? 'Hide details' : 'View details'}
            </button>
          </div>

          {expanded && (
            <div className="space-y-2 animate-[fade-in-up_200ms_ease-out]">
              {proposal.techniques.map((t, i) => (
                <div key={i} className="rounded-lg border border-slate-700/70 bg-slate-900/50 px-4 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Pill tone={t.type === 'crashing' ? 'rose' : t.type === 'fast-tracking' ? 'amber' : 'sky'}>
                      {t.type}
                    </Pill>
                    <span className="text-sm font-medium text-slate-100" dir="auto">{t.title}</span>
                    <Pill tone="emerald">−{t.estimatedSavingDays} d</Pill>
                  </div>
                  <p className="mt-1.5 text-[11px] text-slate-300">
                    <span className="font-semibold text-slate-200">Activities:</span>{' '}
                    <span className="font-mono" dir="ltr">{t.affectedActivities.join(', ')}</span>
                  </p>
                  {t.assumptions.length > 0 && (
                    <ul className="mt-1 list-inside list-disc text-[11px] text-slate-400">
                      {t.assumptions.map((a, j) => <li key={j}>{a}</li>)}
                    </ul>
                  )}
                  <p className="mt-1 text-[11px] text-amber-200">{t.tradeoffs}</p>
                </div>
              ))}
              {proposal.risks.length > 0 && (
                <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-100">Risks</p>
                  <ul className="mt-1 list-inside list-disc space-y-0.5 text-[11px] text-amber-100">
                    {proposal.risks.map((r, i) => <li key={i}>{r}</li>)}
                  </ul>
                </div>
              )}
              <p className="text-[10px] text-slate-500">
                Scenario {proposal.scenarioId.slice(0, 8)} persisted for audit. Applying the techniques
                is a planner-review step — the analysis never mutates the canonical schedule by itself.
              </p>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

// ────────────────────────── How it works ──────────────────────────

function HowItWorksPanel() {
  const steps: Array<{ no: string; title: string; body: string }> = [
    {
      no: '01',
      title: 'Synthesise the WBS',
      body:
        'The planner persona builds a typical UAE building Work-Breakdown Structure: Milestones · Permits · Contract Deliverables · Engineering · Substructure · Superstructure · MEP · Finishing · Testing · Hand-over. ~90 activities, deterministic.',
    },
    {
      no: '02',
      title: 'Schedule + critical path',
      body:
        'Activity dates lay onto your project window. Intra-phase serial + inter-phase hand-offs build the relationship graph. A forward-pass + backward-pass computes total float; activities with float = 0 are flagged Critical Path.',
    },
    {
      no: '03',
      title: 'Two artefacts ready for hand-off',
      body:
        'A real Primavera-importable `.xer` file (TASK + TASKPRED) and a Primavera-style schedule PDF (Activity ID / Name / Duration / Start / Finish / Float, with WBS hierarchy + CP page + dependencies + sign-off block).',
    },
  ];
  return (
    <Card title="How the AI planner works" hint="Deterministic-first · no hallucinations · output is always reproducible">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {steps.map((s) => (
          <div
            key={s.no}
            className="group relative overflow-hidden rounded-lg border border-slate-700 bg-slate-900/60 p-4 transition-all duration-200 hover:border-sky-400/60 hover:shadow-sm"
          >
            <span
              aria-hidden
              className="pointer-events-none absolute -right-6 -top-6 h-16 w-16 rounded-full bg-sky-500/10 transition-transform duration-500 group-hover:scale-150 group-hover:bg-sky-500/20"
            />
            <p className="relative font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-sky-300">
              Step {s.no}
            </p>
            <h3 className="relative mt-1 text-sm font-semibold text-slate-50">{s.title}</h3>
            <p className="relative mt-2 text-xs leading-relaxed text-slate-300">{s.body}</p>
          </div>
        ))}
      </div>
    </Card>
  );
}

// ────────────────────────── Generate card ──────────────────────────

function GenerateCard({
  projectKey,
  authoredBy,
  baselineName,
  busy,
  onAuthorChange,
  onBaselineNameChange,
  onSubmit,
}: {
  projectKey: string;
  authoredBy: string;
  baselineName: string;
  busy: boolean;
  onAuthorChange: (v: string) => void;
  onBaselineNameChange: (v: string) => void;
  onSubmit: () => void;
}) {
  return (
    <Card
      title="Generate a new baseline"
      hint={`Project ${projectKey || '—'} · Persona: planner-p6-25yr · Output lands in awaiting-approval`}
    >
      <form
        className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_1fr_auto]"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit();
        }}
      >
        <label className="flex flex-col gap-1 text-xs">
          <span className="font-semibold uppercase tracking-[0.14em] text-slate-300">
            Authored by
          </span>
          <input
            type="text"
            value={authoredBy}
            onChange={(e) => onAuthorChange(e.target.value)}
            required
            placeholder="Planner full name"
            className="rounded-lg border border-slate-600 bg-slate-900/70 px-3 py-2 text-sm text-slate-50 outline-none transition focus:border-sky-400/80 focus:shadow-[0_0_0_3px_rgba(56,189,248,0.15)]"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs">
          <span className="font-semibold uppercase tracking-[0.14em] text-slate-300">
            Baseline name (optional)
          </span>
          <input
            type="text"
            value={baselineName}
            onChange={(e) => onBaselineNameChange(e.target.value)}
            placeholder="e.g. Original-2026-Q2"
            className="rounded-lg border border-slate-600 bg-slate-900/70 px-3 py-2 text-sm text-slate-50 outline-none transition focus:border-sky-400/80 focus:shadow-[0_0_0_3px_rgba(56,189,248,0.15)]"
          />
        </label>
        <div className="flex items-end">
          <Button
            type="submit"
            variant="primary"
            disabled={busy || !projectKey}
            className="w-full md:w-auto"
          >
            <IconSparkles className="h-3.5 w-3.5" />
            {busy ? 'Planning…' : 'Generate baseline'}
          </Button>
        </div>
      </form>
      <p className="mt-3 flex items-start gap-2 text-[11px] text-slate-300">
        <IconShield className="mt-0.5 h-3 w-3 text-emerald-400" />
        <span>
          The output runs <code className="font-mono">XerWriterService</code> against the current canonical activities (no MPXJ / Java required) and stays gated in <code className="font-mono">awaiting-approval</code> until a human approves.
        </span>
      </p>
    </Card>
  );
}

// ────────────────────────── Jobs list ──────────────────────────

function JobsList({
  rows,
  busy,
  openId,
  canApprove,
  onApprove,
  onReject,
  onToggleOpen,
}: {
  rows: BaselineJobRow[] | null;
  busy: string | null;
  openId: string | null;
  canApprove: boolean;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  onToggleOpen: (id: string) => void;
}) {
  if (rows === null) {
    return (
      <Card padded={false}>
        {Array.from({ length: 3 }).map((_, i) => (
          <SkeletonRow key={i} cols={5} />
        ))}
      </Card>
    );
  }
  if (rows.length === 0) {
    return <BaselinesEmptyState />;
  }

  return (
    <Card padded={false} title={`Baseline jobs (newest first · ${rows.length})`}>
      <ul role="list" className="divide-y divide-slate-700/70">
        {rows.map((row) => (
          <JobRow
            key={row.id}
            row={row}
            busy={busy === row.id}
            expanded={openId === row.id}
            canApprove={canApprove}
            onApprove={onApprove}
            onReject={onReject}
            onToggleOpen={onToggleOpen}
          />
        ))}
      </ul>
    </Card>
  );
}

function BaselinesEmptyState() {
  return (
    <div className="relative overflow-hidden rounded-xl border border-dashed border-slate-600 bg-gradient-to-br from-slate-900/80 to-slate-900/40 px-8 py-14 text-center">
      <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full bg-gradient-to-br from-sky-500/30 to-emerald-500/20 ring-1 ring-sky-400/30">
        <IconDatabase className="h-5 w-5 text-sky-100" />
      </div>
      <h3 className="text-sm font-semibold text-slate-50">No baseline jobs yet</h3>
      <p className="mx-auto mt-1 max-w-md text-xs leading-relaxed text-slate-300">
        Generate your first baseline using the form above. The planner persona will build the WBS,
        schedule ~90 activities, compute the critical path, and produce both a Primavera-importable
        <span className="font-mono"> .xer</span> file and a senior-planner schedule PDF — usually in
        6–10 seconds.
      </p>
    </div>
  );
}

// ────────────────────────── Job row + preview ──────────────────────────

function JobRow({
  row,
  busy,
  expanded,
  canApprove,
  onApprove,
  onReject,
  onToggleOpen,
}: {
  row: BaselineJobRow;
  busy: boolean;
  expanded: boolean;
  canApprove: boolean;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  onToggleOpen: (id: string) => void;
}) {
  const isAwaitingApproval = row.status === 'awaiting-approval' || row.status === 'awaiting-second-approval';
  const isCommitted = row.status === 'committed';
  const hasXer = !!row.outputXerSourceFileId;
  const isRunning = row.status === 'running' || (row.progressPercent > 0 && row.progressPercent < 100);

  return (
    <li className={`relative transition-colors duration-200 ${expanded ? 'bg-slate-900/40' : 'hover:bg-slate-900/30'}`}>
      <button
        type="button"
        onClick={() => onToggleOpen(row.id)}
        className="flex w-full items-start gap-3 px-5 py-3 text-start"
        aria-expanded={expanded}
      >
        <IconChevronRight
          className={`mt-1 h-4 w-4 shrink-0 text-slate-400 transition-transform duration-200 ${expanded ? 'rotate-90' : ''}`}
        />
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill status={row.status} />
            <span className="font-mono text-sm font-semibold text-slate-50 tabular-nums" dir="ltr">
              {row.id.slice(0, 8)}
            </span>
            <Pill tone="slate">{row.personaSlug}</Pill>
            {isRunning && <Pill tone="amber">{row.progressPercent}%</Pill>}
          </div>
          {row.operatorNotes && (
            <p className="text-xs text-slate-300" dir="auto">
              {row.operatorNotes}
            </p>
          )}
          {row.failureReason && (
            <p className="text-xs font-medium text-rose-200" dir="auto">
              Failure: {row.failureReason}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
            <IconClock className="h-3 w-3" />
            <span dir="ltr">Created {new Date(row.createdAt).toLocaleString()}</span>
            {row.completedAt && (
              <>
                <span aria-hidden>·</span>
                <span dir="ltr">Completed {new Date(row.completedAt).toLocaleString()}</span>
              </>
            )}
            {isCommitted && (
              <>
                <span aria-hidden>·</span>
                <Pill tone="emerald">
                  <IconShield className="me-1 h-3 w-3" /> Committed
                </Pill>
              </>
            )}
          </div>
        </div>
        <span className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
          {hasXer && row.outputXerSourceFileId && (
            <>
              <XerDownloadButton sourceFileId={row.outputXerSourceFileId} jobId={row.id} />
              <SchedulePdfButton jobId={row.id} />
            </>
          )}
          {isAwaitingApproval && canApprove && (
            <>
              <Button
                variant="success"
                size="sm"
                onClick={() => onApprove(row.id)}
                disabled={busy}
              >
                <IconCheck className="h-3.5 w-3.5" />
                {busy
                  ? 'Approving…'
                  : row.status === 'awaiting-second-approval'
                    ? 'Sign 2/2 & commit'
                    : 'Sign 1/2'}
              </Button>
              <Button
                variant="danger"
                size="sm"
                onClick={() => onReject(row.id)}
                disabled={busy}
              >
                Reject
              </Button>
            </>
          )}
        </span>
      </button>
      {isRunning && (
        <div className="px-5 pb-3">
          <div className="h-1.5 overflow-hidden rounded-full bg-slate-800/60">
            <div
              className="h-full bg-gradient-to-r from-sky-500 via-sky-400 to-emerald-400 transition-all duration-700"
              style={{ width: `${row.progressPercent}%` }}
            />
          </div>
        </div>
      )}
      {expanded && hasXer && <SchedulePreview jobId={row.id} />}
    </li>
  );
}

function SchedulePreview({ jobId }: { jobId: string }) {
  const [summary, setSummary] = useState<ScheduleSummary | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api<ScheduleSummary>(`/baselines/jobs/${jobId}/schedule.summary`)
      .then((s) => {
        if (cancelled) return;
        setSummary(s);
        setErr(null);
      })
      .catch((e) => {
        if (cancelled) return;
        setErr((e as Error).message);
      });
    return () => {
      cancelled = true;
    };
  }, [jobId]);

  if (err) {
    return (
      <div className="border-t border-slate-700/70 px-5 py-4 text-xs text-rose-200">
        {err}
      </div>
    );
  }
  if (!summary) {
    return (
      <div className="border-t border-slate-700/70 px-5 py-4 text-xs text-slate-300">
        Loading schedule preview…
      </div>
    );
  }
  if (summary.activityCount === 0) {
    return (
      <div className="border-t border-slate-700/70 px-5 py-4 text-xs text-slate-300">
        No synthesised schedule available for this job.
      </div>
    );
  }

  const wbsBars = summary.wbsBreakdown.map((w) => ({
    label: prettyWbs(w.code),
    value: w.count,
    accent: CHART_PALETTE.crimson,
  }));
  const taskCount = summary.activityCount - summary.milestoneCount;
  const donut = [
    { label: 'Tasks', value: taskCount, accent: CHART_PALETTE.sky },
    { label: 'Milestones', value: summary.milestoneCount, accent: CHART_PALETTE.emerald },
    { label: 'Critical', value: summary.criticalCount, accent: CHART_PALETTE.rose },
  ].filter((d) => d.value > 0);

  return (
    <div className="border-t border-slate-700/70 bg-slate-950/40 px-5 py-4 animate-[fade-in-up_220ms_ease-out]">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        <PreviewMetric label="Activities" value={summary.activityCount} accent="sky" />
        <PreviewMetric label="Tasks" value={taskCount} accent="sky" />
        <PreviewMetric label="Milestones" value={summary.milestoneCount} accent="emerald" />
        <PreviewMetric label="Critical path" value={summary.criticalCount} accent="rose" />
        <PreviewMetric label="Dependencies" value={summary.dependencyCount} accent="amber" />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
        <DonutChart
          title="Composition"
          data={donut}
          size={150}
          thickness={18}
          centerValue={summary.activityCount}
          centerLabel="TOTAL"
        />
        <BarChart
          title="Activities by WBS branch"
          caption="11 branches"
          data={wbsBars}
          labelWidth={160}
          rowHeight={22}
        />
      </div>

      <div className="mt-4">
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-300">
          First 8 activities
        </p>
        <div className="overflow-x-auto rounded-lg border border-slate-700/70">
          <table className="w-full text-xs">
            <thead className="bg-slate-900/70 text-[10px] uppercase tracking-[0.14em] text-slate-400">
              <tr>
                <th className="px-3 py-2 text-start">ID</th>
                <th className="px-3 py-2 text-start">Name</th>
                <th className="px-3 py-2 text-end">Dur</th>
                <th className="px-3 py-2 text-end">Start</th>
                <th className="px-3 py-2 text-end">Finish</th>
                <th className="px-3 py-2 text-end">Float</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80">
              {summary.sample.map((a) => (
                <tr
                  key={a.businessKey}
                  className={a.isCritical ? 'bg-rose-500/10' : a.isMilestone ? 'bg-sky-500/10' : ''}
                >
                  <td className="px-3 py-1.5 font-mono text-slate-100" dir="ltr">
                    {a.businessKey}
                  </td>
                  <td className="px-3 py-1.5 text-slate-100" dir="auto">
                    {a.name}
                  </td>
                  <td className="px-3 py-1.5 text-end tabular-nums text-slate-200">
                    {a.isMilestone ? '0' : a.durationDays}
                  </td>
                  <td className="px-3 py-1.5 text-end font-mono tabular-nums text-slate-300" dir="ltr">
                    {a.plannedStart}
                  </td>
                  <td className="px-3 py-1.5 text-end font-mono tabular-nums text-slate-300" dir="ltr">
                    {a.plannedFinish}
                  </td>
                  <td
                    className={`px-3 py-1.5 text-end tabular-nums ${
                      a.isCritical ? 'font-bold text-rose-200' : 'text-slate-200'
                    }`}
                  >
                    {a.totalFloatDays}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-1.5 text-[10px] text-slate-400">
          Showing 8 of {summary.activityCount}. Download the schedule PDF for the full activity table + dependencies + sign-off block.
        </p>
      </div>
    </div>
  );
}

function PreviewMetric({
  label,
  value,
  accent,
}: {
  label: string;
  value: number | string;
  accent: 'sky' | 'emerald' | 'rose' | 'amber';
}) {
  const accents: Record<string, string> = {
    sky: 'text-sky-200',
    emerald: 'text-emerald-200',
    rose: 'text-rose-200',
    amber: 'text-amber-200',
  };
  return (
    <div className="rounded-lg border border-slate-700/70 bg-slate-900/50 px-3 py-2">
      <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-slate-400">{label}</p>
      <p className={`mt-0.5 text-lg font-semibold tabular-nums ${accents[accent]}`} dir="ltr">
        {value}
      </p>
    </div>
  );
}

function prettyWbs(code: string): string {
  const NAME: Record<string, string> = {
    'WBS.1': 'Milestones',
    'WBS.2': 'Site Mobilisation',
    'WBS.3': 'Building Permit',
    'WBS.4': 'Contract Deliverables',
    'WBS.5': 'Engineering Works',
    'WBS.6': 'Civil Works',
    'WBS.7': 'MEP Works',
    'WBS.8': 'Finishing Works',
    'WBS.9': 'External Works',
    'WBS.10': 'Testing & Commissioning',
    'WBS.11': 'Hand-over',
  };
  return NAME[code] ?? code;
}

// ────────────────────────── Status pill ──────────────────────────

function StatusPill({ status }: { status: string }) {
  const map: Record<string, { tone: 'slate' | 'sky' | 'emerald' | 'amber' | 'rose'; label: string }> = {
    pending: { tone: 'slate', label: 'Pending' },
    running: { tone: 'sky', label: 'Running' },
    'awaiting-approval': { tone: 'amber', label: 'Awaiting approval (0/2)' },
    'awaiting-second-approval': { tone: 'amber', label: 'Awaiting 2nd signature (1/2)' },
    'awaiting-enablement': { tone: 'slate', label: 'Gated' },
    rejected: { tone: 'rose', label: 'Rejected' },
    committed: { tone: 'emerald', label: 'Committed' },
    failed: { tone: 'rose', label: 'Failed' },
  };
  const spec = map[status] ?? { tone: 'slate' as const, label: status };
  return <Pill tone={spec.tone}>{spec.label}</Pill>;
}

// ────────────────────────── Download buttons ──────────────────────────

function SchedulePdfButton({ jobId }: { jobId: string }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  const doDownload = useCallback(async () => {
    setBusy(true);
    try {
      const key = getApiKey();
      const res = await fetch(`${API_BASE}/baselines/jobs/${jobId}/schedule.pdf`, {
        headers: key ? { 'x-api-key': key } : undefined,
        cache: 'no-store',
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`PDF ${res.status}: ${text.slice(0, 180)}`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `baseline-${jobId.slice(0, 8)}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      toast.error('Schedule PDF failed', (err as Error).message);
    } finally {
      setBusy(false);
    }
  }, [jobId, toast]);

  return (
    <Button variant="primary" size="sm" onClick={() => void doDownload()} disabled={busy}>
      <IconActivity className="h-3.5 w-3.5" />
      {busy ? 'Building…' : 'Schedule PDF'}
    </Button>
  );
}

function XerDownloadButton({ sourceFileId, jobId }: { sourceFileId: string; jobId: string }) {
  void sourceFileId;
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  const doDownload = useCallback(async () => {
    setBusy(true);
    try {
      const key = getApiKey();
      const res = await fetch(`${API_BASE}/baselines/jobs/${jobId}/xer`, {
        headers: key ? { 'x-api-key': key } : undefined,
        cache: 'no-store',
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Download ${res.status}: ${text.slice(0, 180)}`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `baseline-${jobId.slice(0, 8)}.xer`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      toast.error('XER download failed', (err as Error).message);
    } finally {
      setBusy(false);
    }
  }, [jobId, toast]);

  return (
    <Button variant="ghost" size="sm" onClick={() => void doDownload()} disabled={busy}>
      <IconActivity className="h-3.5 w-3.5" />
      {busy ? 'Downloading…' : 'Download .xer'}
    </Button>
  );
}

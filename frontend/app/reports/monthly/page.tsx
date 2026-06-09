'use client';

/**
 * Monthly narrative report surface (post-meeting plan §3.6, Wave 2).
 *
 * - Generate button: month (YYYY-MM) + audience (owner / pd / contractor).
 * - List of generated reports for the current project, newest first.
 * - Inline detail with `SummaryView` rendering the narrative cards and
 *   linked `[SOURCE: id]` chips that resolve under `/sources/:id`.
 * - PDF link streams `/reports/monthly/:id/pdf` with the API key attached.
 *
 * AuthGate stays at "any authenticated" because the backend already
 * enforces `canRead` / `canGenerateSummary` per route — the page would
 * just hide the Generate form for roles that lack the capability rather
 * than locking the entire surface (Contractor still needs to read their
 * own slice once Wave 3 ships `canViewOwnMonthlyReport`).
 */

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { API_BASE, api, getApiKey } from '../../../lib/api';
import { AuthGate } from '../../../components/AuthGate';
import { SkeletonRow } from '../../../components/Skeleton';
import { SummaryView } from '../../../components/SummaryView';
import { useToast } from '../../../components/ToastProvider';
import { useI18n } from '../../../lib/i18n';
import { useMe } from '../../../lib/me-context';
import { useCurrentProjectKey } from '../../../lib/project-context';
import { CAPABILITIES } from '../../../lib/capabilities';
import {
  Button,
  Card,
  EmptyState,
  ErrorBanner,
  PageHeader,
  Pill,
} from '../../../components/ui';
import {
  IconActivity,
  IconCheck,
  IconChevronRight,
  IconClock,
  IconDatabase,
  IconRefresh,
} from '../../../components/Icons';

// ---------------------------------------------------------------------------
//  Types — local mirrors of the MonthlyReport row served by the backend.
// ---------------------------------------------------------------------------

type Audience = 'owner' | 'pd' | 'contractor';

interface MonthlyReportRow {
  id: string;
  projectBusinessKey: string;
  month: string;
  audience: Audience | string;
  personaSlug: string;
  personaVersion: number;
  narrativeSource: 'deterministic' | 'llm' | string;
  llmModel: string | null;
  narrative: string;
  metrics: Record<string, unknown>;
  citations: string[];
  pdfStoredPath: string | null;
  status: string;
  createdAt: string;
  updatedAt?: string;
}

// ---------------------------------------------------------------------------
//  Route entry — gated to any authenticated user.
// ---------------------------------------------------------------------------

export default function MonthlyReportsRoute() {
  return (
    <AuthGate surface="Monthly reports">
      <MonthlyReportsPage />
    </AuthGate>
  );
}

// ---------------------------------------------------------------------------
//  Page
// ---------------------------------------------------------------------------

function MonthlyReportsPage() {
  const { t } = useI18n();
  const toast = useToast();
  const { me } = useMe();
  const projectKey = useCurrentProjectKey();

  const [rows, setRows] = useState<MonthlyReportRow[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [month, setMonth] = useState<string>(defaultMonth());
  const [audience, setAudience] = useState<Audience>('owner');
  const [openId, setOpenId] = useState<string | null>(null);

  const canGenerate = !!me?.user && CAPABILITIES[me.user.role].canGenerateSummary;

  // Load reports any time the project key changes. We resolve the API call
  // and pipe the sorted list into setRows directly — this matches the rest of
  // the codebase (e.g. `audit/page.tsx`, `decisions/page.tsx`) and keeps the
  // effect free of cascading renders.
  useEffect(() => {
    if (!projectKey) return;
    let cancelled = false;
    api<MonthlyReportRow[]>(
      `/reports/monthly?projectKey=${encodeURIComponent(projectKey)}`,
    )
      .then((list) => {
        if (cancelled) return;
        list.sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
        );
        setRows(list);
        setLoadError(null);
        if (list.length > 0) setOpenId((cur) => cur ?? list[0].id);
      })
      .catch((e) => {
        if (cancelled) return;
        setRows([]);
        setLoadError((e as Error).message);
      });
    return () => {
      cancelled = true;
    };
  }, [projectKey]);

  /** Manual refresh — used by the toolbar button and after generation. */
  const refresh = useCallback(async (): Promise<void> => {
    if (!projectKey) return;
    setLoadError(null);
    try {
      const list = await api<MonthlyReportRow[]>(
        `/reports/monthly?projectKey=${encodeURIComponent(projectKey)}`,
      );
      list.sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
      setRows(list);
    } catch (e) {
      setRows([]);
      setLoadError((e as Error).message);
    }
  }, [projectKey]);

  const authoredBy = me?.user?.displayName ?? null;
  const onGenerate = useCallback(async (): Promise<void> => {
    if (!projectKey) return;
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
      toast.error(
        t('reportsMonthly.toast.invalidMonthTitle'),
        t('reportsMonthly.toast.invalidMonthBody'),
      );
      return;
    }
    setGenerating(true);
    try {
      const created = await api<MonthlyReportRow>('/reports/monthly/generate', {
        method: 'POST',
        body: JSON.stringify({
          projectKey,
          monthIso: month,
          audience,
          authoredBy,
        }),
      });
      toast.success(
        t('reportsMonthly.toast.generatedTitle'),
        t('reportsMonthly.toast.generatedBody', {
          month: created.month,
          audience: audienceLabel(t, created.audience as Audience),
        }),
      );
      setOpenId(created.id);
      await refresh();
    } catch (e) {
      toast.error(
        t('reportsMonthly.toast.generateFailedTitle'),
        (e as Error).message,
      );
    } finally {
      setGenerating(false);
    }
  }, [projectKey, month, audience, authoredBy, t, toast, refresh]);

  const openRow = useMemo(
    () => (openId ? rows?.find((r) => r.id === openId) ?? null : null),
    [openId, rows],
  );

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t('reportsMonthly.eyebrow')}
        title={t('reportsMonthly.title')}
        description={t('reportsMonthly.description')}
        actions={
          <button
            onClick={() => void refresh()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 px-2.5 py-1 text-xs text-slate-200 transition hover:border-slate-500"
          >
            <IconRefresh className="h-3.5 w-3.5" />
            <span>{t('common.refresh')}</span>
          </button>
        }
      />

      <ErrorBanner message={loadError} />

      {canGenerate ? (
        <GenerateForm
          month={month}
          audience={audience}
          generating={generating}
          projectKey={projectKey}
          onMonthChange={setMonth}
          onAudienceChange={setAudience}
          onSubmit={onGenerate}
        />
      ) : (
        <Card>
          <p className="text-xs text-slate-400">
            {t('reportsMonthly.cannotGenerate')}
          </p>
        </Card>
      )}

      <ReportsList
        rows={rows}
        openId={openId}
        onSelect={(id) => setOpenId((cur) => (cur === id ? null : id))}
      />

      {openRow && <ReportDetail row={openRow} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
//  Generate form
// ---------------------------------------------------------------------------

function GenerateForm({
  month,
  audience,
  generating,
  projectKey,
  onMonthChange,
  onAudienceChange,
  onSubmit,
}: {
  month: string;
  audience: Audience;
  generating: boolean;
  projectKey: string;
  onMonthChange: (v: string) => void;
  onAudienceChange: (v: Audience) => void;
  onSubmit: () => void;
}) {
  const { t } = useI18n();
  return (
    <Card
      title={t('reportsMonthly.form.title')}
      hint={t('reportsMonthly.form.hint', { projectKey })}
    >
      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit();
        }}
      >
        <label className="flex flex-col gap-1 text-xs">
          <span className="font-semibold uppercase tracking-[0.14em] text-slate-400">
            {t('reportsMonthly.form.monthLabel')}
          </span>
          <input
            type="month"
            value={month}
            onChange={(e) => onMonthChange(e.target.value)}
            required
            className="rounded-lg border border-slate-700 bg-slate-900/70 px-3 py-2 text-sm text-slate-100 outline-none focus:border-sky-500/60"
            dir="ltr"
          />
        </label>

        <fieldset className="flex flex-col gap-1 text-xs">
          <legend className="font-semibold uppercase tracking-[0.14em] text-slate-400">
            {t('reportsMonthly.form.audienceLabel')}
          </legend>
          <div className="flex flex-wrap gap-1.5">
            {(['owner', 'pd', 'contractor'] as const).map((a) => (
              <button
                key={a}
                type="button"
                aria-pressed={audience === a}
                onClick={() => onAudienceChange(a)}
                className={`inline-flex items-center rounded-full border px-3 py-1.5 text-xs transition ${
                  audience === a
                    ? 'border-sky-500/50 bg-sky-500/15 text-sky-100'
                    : 'border-slate-700 bg-slate-900/40 text-slate-300 hover:border-slate-500'
                }`}
              >
                {audienceLabel(t, a)}
              </button>
            ))}
          </div>
        </fieldset>

        <div className="ms-auto">
          <Button
            type="submit"
            variant="primary"
            disabled={generating || !projectKey}
          >
            {generating
              ? t('reportsMonthly.form.generating')
              : t('reportsMonthly.form.generate')}
          </Button>
        </div>
      </form>
    </Card>
  );
}

// ---------------------------------------------------------------------------
//  Reports list
// ---------------------------------------------------------------------------

function ReportsList({
  rows,
  openId,
  onSelect,
}: {
  rows: MonthlyReportRow[] | null;
  openId: string | null;
  onSelect: (id: string) => void;
}) {
  const { t } = useI18n();

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
    return (
      <EmptyState
        icon={<IconDatabase className="h-6 w-6" />}
        title={t('reportsMonthly.empty.title')}
        description={t('reportsMonthly.empty.description')}
      />
    );
  }

  return (
    <Card padded={false} title={t('reportsMonthly.list.title')}>
      <ul role="list" className="divide-y divide-slate-800/70">
        {rows.map((row) => {
          const expanded = openId === row.id;
          return (
            <li key={row.id}>
              <button
                type="button"
                onClick={() => onSelect(row.id)}
                aria-expanded={expanded}
                className={`flex w-full items-start gap-3 px-5 py-3 text-start transition hover:bg-slate-900/40 ${
                  expanded ? 'bg-slate-900/30' : ''
                }`}
              >
                <IconChevronRight
                  className={`mt-0.5 h-4 w-4 shrink-0 text-slate-500 transition ${
                    expanded ? 'rotate-90' : ''
                  }`}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className="font-mono text-sm font-semibold text-slate-100 tabular-nums"
                      dir="ltr"
                    >
                      {row.month}
                    </span>
                    <AudiencePill audience={row.audience as Audience} />
                    <SourceBadge source={row.narrativeSource} />
                    <Pill tone="slate">
                      {t('reportsMonthly.list.citationsCount', {
                        n: row.citations.length,
                      })}
                    </Pill>
                  </div>
                  <p
                    className="mt-1 line-clamp-2 text-xs text-slate-400"
                    dir="auto"
                  >
                    {excerpt(row.narrative)}
                  </p>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                    <IconClock className="h-3 w-3" />
                    <span dir="ltr">
                      {new Date(row.createdAt).toLocaleString()}
                    </span>
                    {row.llmModel && (
                      <>
                        <span aria-hidden>·</span>
                        <span className="font-mono" dir="ltr">
                          {row.llmModel}
                        </span>
                      </>
                    )}
                    <span aria-hidden>·</span>
                    <span className="font-mono" dir="ltr">
                      {row.personaSlug} v{row.personaVersion}
                    </span>
                  </div>
                </div>
                <PdfLink rowId={row.id} />
              </button>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

// ---------------------------------------------------------------------------
//  Detail
// ---------------------------------------------------------------------------

function ReportDetail({ row }: { row: MonthlyReportRow }) {
  const { t } = useI18n();
  const confidence = readNumber(row.metrics?.confidenceAverage);
  const narrative = useMemo(() => stripCitationMarkers(row.narrative), [row.narrative]);

  return (
    <Card
      title={t('reportsMonthly.detail.title', {
        month: row.month,
        audience: audienceLabel(t, row.audience as Audience),
      })}
      hint={t('reportsMonthly.detail.hint', {
        persona: `${row.personaSlug} v${row.personaVersion}`,
      })}
      actions={<PdfLink rowId={row.id} variant="button" />}
    >
      <div className="space-y-5">
        <MetricsStrip metrics={row.metrics} />

        <section>
          <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">
            {t('reportsMonthly.detail.narrativeHeading')}
          </h3>
          {looksLikeStructured(narrative) ? (
            <SummaryView text={narrative} confidence={confidence} />
          ) : (
            <article
              className="prose prose-invert prose-sm max-w-none whitespace-pre-wrap rounded-xl border border-slate-800 bg-slate-950/40 p-5 text-sm leading-7 text-slate-100"
              dir="auto"
            >
              {narrative}
            </article>
          )}
        </section>

        <CitationsBlock citations={row.citations} />
      </div>
    </Card>
  );
}

function MetricsStrip({ metrics }: { metrics: Record<string, unknown> }) {
  const { t } = useI18n();
  const activityCount = readNumber(metrics?.activityCount);
  const alertCount = readNumber(metrics?.alertCount);
  const critical = readNumber(metrics?.criticalAlertCount);
  const decisionCount = readNumber(metrics?.decisionCount);
  const deltaPp = readNumber(metrics?.scheduleDeltaPp);

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
      <MetricTile
        icon={<IconActivity className="h-3.5 w-3.5" />}
        label={t('reportsMonthly.metrics.activities')}
        value={activityCount ?? '—'}
      />
      <MetricTile
        icon={<IconDatabase className="h-3.5 w-3.5" />}
        label={t('reportsMonthly.metrics.alerts')}
        value={alertCount ?? '—'}
      />
      <MetricTile
        label={t('reportsMonthly.metrics.critical')}
        value={critical ?? '—'}
        tone={(critical ?? 0) > 0 ? 'rose' : 'slate'}
      />
      <MetricTile
        label={t('reportsMonthly.metrics.decisions')}
        value={decisionCount ?? '—'}
      />
      <MetricTile
        label={t('reportsMonthly.metrics.delta')}
        value={deltaPp === null ? '—' : `${deltaPp.toFixed(1)}pp`}
        tone={
          deltaPp === null
            ? 'slate'
            : deltaPp >= 0
            ? 'emerald'
            : 'rose'
        }
      />
    </div>
  );
}

function MetricTile({
  icon,
  label,
  value,
  tone = 'slate',
}: {
  icon?: React.ReactNode;
  label: string;
  value: number | string;
  tone?: 'slate' | 'emerald' | 'rose' | 'sky';
}) {
  const valueTone: Record<string, string> = {
    slate: 'text-slate-100',
    emerald: 'text-emerald-300',
    rose: 'text-rose-300',
    sky: 'text-sky-300',
  };
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/40 px-3 py-2">
      <p className="flex items-center gap-1 text-[9px] font-semibold uppercase tracking-[0.14em] text-slate-500">
        {icon}
        {label}
      </p>
      <p
        className={`mt-0.5 text-lg font-semibold tabular-nums ${valueTone[tone]}`}
        dir="ltr"
      >
        {value}
      </p>
    </div>
  );
}

function CitationsBlock({ citations }: { citations: string[] }) {
  const { t } = useI18n();
  if (citations.length === 0) {
    return (
      <section>
        <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">
          {t('reportsMonthly.detail.citationsHeading')}
        </h3>
        <p className="rounded-lg border border-dashed border-slate-800 bg-slate-900/30 px-4 py-3 text-xs text-slate-500">
          {t('reportsMonthly.detail.noCitations')}
        </p>
      </section>
    );
  }
  return (
    <section>
      <h3 className="mb-2 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">
        <IconCheck className="h-3 w-3 text-emerald-300" />
        {t('reportsMonthly.detail.citationsHeading')}
        <span className="font-mono text-slate-500 normal-case tracking-normal">
          ({citations.length})
        </span>
      </h3>
      <ul className="flex flex-wrap gap-1.5">
        {citations.map((id) => (
          <li key={id}>
            <Link
              href={`/sources/${encodeURIComponent(id)}`}
              className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 font-mono text-[11px] text-emerald-100 transition hover:border-emerald-400/60 hover:bg-emerald-500/20"
              dir="ltr"
            >
              <span aria-hidden>[SOURCE: </span>
              <span>{id}</span>
              <span aria-hidden>]</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ---------------------------------------------------------------------------
//  PDF download — must carry the API key in the same query (Authorization
//  headers are not available on a plain `<a download>`), so we click through
//  a fetch + blob → anchor. Falls back to a direct link in environments
//  where no key is set (bootstrap mode local).
// ---------------------------------------------------------------------------

function PdfLink({
  rowId,
  variant = 'icon',
}: {
  rowId: string;
  variant?: 'icon' | 'button';
}) {
  const { t } = useI18n();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  const doDownload = useCallback(async () => {
    setBusy(true);
    try {
      const key = getApiKey();
      const res = await fetch(`${API_BASE}/reports/monthly/${rowId}/pdf`, {
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
      a.download = `monthly-${rowId}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      // Revoke after a short tick so the click handler can flush.
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      toast.error(
        t('reportsMonthly.toast.pdfFailedTitle'),
        (err as Error).message,
      );
    } finally {
      setBusy(false);
    }
  }, [rowId, toast, t]);

  if (variant === 'button') {
    return (
      <Button
        variant="ghost"
        size="sm"
        onClick={() => void doDownload()}
        disabled={busy}
      >
        {busy
          ? t('reportsMonthly.pdf.downloading')
          : t('reportsMonthly.pdf.download')}
      </Button>
    );
  }
  return (
    <span
      role="button"
      tabIndex={0}
      aria-label={t('reportsMonthly.pdf.download')}
      onClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
        void doDownload();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          e.stopPropagation();
          void doDownload();
        }
      }}
      className={`ms-2 inline-flex shrink-0 items-center gap-1 rounded-md border border-slate-700 bg-slate-900/60 px-2 py-1 text-[11px] font-medium text-slate-200 transition hover:border-sky-500/50 hover:text-sky-200 ${
        busy ? 'opacity-60' : ''
      }`}
    >
      {busy
        ? t('reportsMonthly.pdf.downloading')
        : t('reportsMonthly.pdf.label')}
    </span>
  );
}

// ---------------------------------------------------------------------------
//  Small UI helpers
// ---------------------------------------------------------------------------

function AudiencePill({ audience }: { audience: Audience }) {
  const { t } = useI18n();
  const tone: Record<Audience, 'sky' | 'violet' | 'emerald'> = {
    owner: 'sky',
    pd: 'violet',
    contractor: 'emerald',
  };
  return <Pill tone={tone[audience] ?? 'slate'}>{audienceLabel(t, audience)}</Pill>;
}

function SourceBadge({ source }: { source: string }) {
  const { t } = useI18n();
  const isLlm = source === 'llm';
  return (
    <Pill tone={isLlm ? 'amber' : 'emerald'}>
      {isLlm
        ? t('reportsMonthly.source.llm')
        : t('reportsMonthly.source.deterministic')}
    </Pill>
  );
}

function audienceLabel(
  t: (k: string, vars?: Record<string, string | number>) => string,
  audience: Audience,
): string {
  switch (audience) {
    case 'owner':
      return t('reportsMonthly.audiences.owner');
    case 'pd':
      return t('reportsMonthly.audiences.pd');
    case 'contractor':
      return t('reportsMonthly.audiences.contractor');
    default:
      return audience;
  }
}

// ---------------------------------------------------------------------------
//  Pure helpers
// ---------------------------------------------------------------------------

/** Current month in `YYYY-MM` form for the picker default. */
function defaultMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** Used for the list-row excerpt. Strips heading + citation markers + collapses. */
function excerpt(narrative: string): string {
  const noHeadings = narrative.replace(/^#+\s.*$/gm, ' ');
  const noCites = noHeadings.replace(/\[SOURCE:\s*[^\]]+\]/g, '');
  const collapsed = noCites.replace(/\s+/g, ' ').trim();
  return collapsed.length > 240 ? `${collapsed.slice(0, 240)}…` : collapsed;
}

/**
 * Strip the inline `[SOURCE: id]` markers from the narrative before rendering
 * — they live in their own block below, and leaving them inline visually
 * fights with both `SummaryView` (which uses bullets) and the prose article.
 */
function stripCitationMarkers(narrative: string): string {
  return narrative.replace(/\s*\[SOURCE:\s*[^\]]+\]/g, '').trim();
}

/**
 * Heuristic: the deterministic facts block always opens with `## Deterministic
 * facts` + nested `### Schedule` headers + `- bullet` lines, which is exactly
 * what `SummaryView` was built to parse. The LLM-authored prose, by
 * contrast, is paragraphs — render that as plain article text.
 */
function looksLikeStructured(narrative: string): boolean {
  if (/^##\s/m.test(narrative) && /^###\s/m.test(narrative)) return true;
  // Fallback: count bullet-prefixed lines. Deterministic block has many.
  const bullets = (narrative.match(/^\s*-\s+/gm) ?? []).length;
  const lines = narrative.split('\n').length;
  return bullets >= 4 && bullets * 4 >= lines;
}

function readNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

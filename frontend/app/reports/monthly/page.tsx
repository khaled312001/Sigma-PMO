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
import {
  BarChart,
  DonutChart,
  GaugeChart,
  StackedBar,
  CHART_PALETTE,
  SEVERITY_ACCENT,
} from '../../../components/Charts';
import { PersonaActiveBadge } from '../../../components/PersonaActiveBadge';
import { PolicyAddonInline } from '../../../components/PolicyAddonInline';
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

type Cadence = 'day' | 'week' | 'month';

interface MonthlyReportRow {
  id: string;
  projectBusinessKey: string;
  month: string;
  cadence: Cadence | null;
  periodKey: string | null;
  audience: Audience | string;
  personaSlug: string;
  personaVersion: number;
  narrativeSource: 'deterministic' | 'llm' | string;
  llmModel: string | null;
  narrative: string;
  /** Arabic edition (Wave 7). NULL on legacy rows — `narrative` carries it. */
  narrativeAr: string | null;
  /** English edition — NULL when Claude was off or the EN call failed. */
  narrativeEn: string | null;
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
  const [cadence, setCadence] = useState<Cadence>('month');
  const [month, setMonth] = useState<string>(defaultMonth());
  const [day, setDay] = useState<string>(defaultDay());
  const [week, setWeek] = useState<string>(defaultIsoWeek());
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
    // Pick the periodKey from the cadence-matching input.
    const periodKey = cadence === 'month' ? month : cadence === 'week' ? week : day;
    const re =
      cadence === 'month'
        ? /^\d{4}-(0[1-9]|1[0-2])$/
        : cadence === 'week'
          ? /^\d{4}-W(0[1-9]|[1-4]\d|5[0-3])$/
          : /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
    if (!re.test(periodKey)) {
      toast.error(
        t('reportsMonthly.toast.invalidMonthTitle'),
        `Period key "${periodKey}" does not match the ${cadence} format.`,
      );
      return;
    }
    setGenerating(true);
    try {
      const path =
        cadence === 'month'
          ? '/reports/monthly/generate'
          : '/reports/monthly/periodic/generate';
      const body =
        cadence === 'month'
          ? { projectKey, monthIso: month, audience, authoredBy }
          : { projectKey, cadence, periodKey, audience, authoredBy };
      const created = await api<MonthlyReportRow>(path, {
        method: 'POST',
        body: JSON.stringify(body),
      });
      toast.success(
        t('reportsMonthly.toast.generatedTitle'),
        `${cadence.toUpperCase()} ${periodKey} · ${audienceLabel(t, created.audience as Audience)}`,
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
  }, [projectKey, cadence, month, week, day, audience, authoredBy, t, toast, refresh]);

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
          <span className="flex items-center gap-2">
            <PersonaActiveBadge
              personaSlug="report-narrator-arabic"
              expertise="Senior PMO report narrator — connected prose, executive verdict first, every professional claim cited from the curated source registry."
              surface="reports"
            />
            <button
              onClick={() => void refresh()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 px-2.5 py-1 text-xs text-slate-200 transition hover:border-slate-500"
            >
              <IconRefresh className="h-3.5 w-3.5" />
              <span>{t('common.refresh')}</span>
            </button>
          </span>
        }
      />

      <ErrorBanner message={loadError} />

      <PolicyAddonInline projectKey={projectKey} surface="reports" />

      {canGenerate ? (
        <GenerateForm
          cadence={cadence}
          month={month}
          week={week}
          day={day}
          audience={audience}
          generating={generating}
          projectKey={projectKey}
          onCadenceChange={setCadence}
          onMonthChange={setMonth}
          onWeekChange={setWeek}
          onDayChange={setDay}
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
  cadence,
  month,
  week,
  day,
  audience,
  generating,
  projectKey,
  onCadenceChange,
  onMonthChange,
  onWeekChange,
  onDayChange,
  onAudienceChange,
  onSubmit,
}: {
  cadence: Cadence;
  month: string;
  week: string;
  day: string;
  audience: Audience;
  generating: boolean;
  projectKey: string;
  onCadenceChange: (v: Cadence) => void;
  onMonthChange: (v: string) => void;
  onWeekChange: (v: string) => void;
  onDayChange: (v: string) => void;
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
        <fieldset className="flex flex-col gap-1 text-xs">
          <legend className="font-semibold uppercase tracking-[0.14em] text-slate-300">
            Cadence
          </legend>
          <div className="flex flex-wrap gap-1.5">
            {(['day', 'week', 'month'] as const).map((c) => {
              const labels: Record<Cadence, string> = { day: 'Daily', week: 'Weekly', month: 'Monthly' };
              return (
                <button
                  key={c}
                  type="button"
                  aria-pressed={cadence === c}
                  onClick={() => onCadenceChange(c)}
                  className={`inline-flex items-center rounded-full border px-3 py-1.5 text-xs font-medium transition-all duration-200 ${
                    cadence === c
                      ? 'border-sky-400 bg-sky-500/30 text-sky-50 shadow-sm scale-105'
                      : 'border-slate-600 bg-slate-900/60 text-slate-200 hover:border-slate-400 hover:scale-105'
                  }`}
                >
                  {labels[c]}
                </button>
              );
            })}
          </div>
        </fieldset>

        {cadence === 'month' && (
          <label className="flex flex-col gap-1 text-xs">
            <span className="font-semibold uppercase tracking-[0.14em] text-slate-300">
              Month (YYYY-MM)
            </span>
            <input
              type="month"
              value={month}
              onChange={(e) => onMonthChange(e.target.value)}
              required
              className="rounded-lg border border-slate-600 bg-slate-900/70 px-3 py-2 text-sm text-slate-50 outline-none transition focus:border-sky-400/80 focus:shadow-[0_0_0_3px_rgba(56,189,248,0.15)]"
              dir="ltr"
            />
          </label>
        )}
        {cadence === 'week' && (
          <label className="flex flex-col gap-1 text-xs">
            <span className="font-semibold uppercase tracking-[0.14em] text-slate-300">
              ISO Week (YYYY-Www)
            </span>
            <input
              type="week"
              value={week}
              onChange={(e) => onWeekChange(e.target.value)}
              required
              className="rounded-lg border border-slate-600 bg-slate-900/70 px-3 py-2 text-sm text-slate-50 outline-none transition focus:border-sky-400/80 focus:shadow-[0_0_0_3px_rgba(56,189,248,0.15)]"
              dir="ltr"
            />
          </label>
        )}
        {cadence === 'day' && (
          <label className="flex flex-col gap-1 text-xs">
            <span className="font-semibold uppercase tracking-[0.14em] text-slate-300">
              Day (YYYY-MM-DD)
            </span>
            <input
              type="date"
              value={day}
              onChange={(e) => onDayChange(e.target.value)}
              required
              className="rounded-lg border border-slate-600 bg-slate-900/70 px-3 py-2 text-sm text-slate-50 outline-none transition focus:border-sky-400/80 focus:shadow-[0_0_0_3px_rgba(56,189,248,0.15)]"
              dir="ltr"
            />
          </label>
        )}

        <fieldset className="flex flex-col gap-1 text-xs">
          <legend className="font-semibold uppercase tracking-[0.14em] text-slate-300">
            {t('reportsMonthly.form.audienceLabel')}
          </legend>
          <div className="flex flex-wrap gap-1.5">
            {(['owner', 'pd', 'contractor'] as const).map((a) => (
              <button
                key={a}
                type="button"
                aria-pressed={audience === a}
                onClick={() => onAudienceChange(a)}
                className={`inline-flex items-center rounded-full border px-3 py-1.5 text-xs font-medium transition-all duration-200 ${
                  audience === a
                    ? 'border-sky-400 bg-sky-500/30 text-sky-50 shadow-sm scale-105'
                    : 'border-slate-600 bg-slate-900/60 text-slate-200 hover:border-slate-400 hover:scale-105'
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
      actions={
        <span className="flex items-center gap-2">
          <PrintButton />
          <PdfLink rowId={row.id} variant="button" hasEnglish={!!row.narrativeEn} />
        </span>
      }
      className="print:!border-0 print:!bg-white print:!shadow-none print:!p-0"
    >
      <ChartsStrip metrics={row.metrics} />
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
  hasEnglish = false,
}: {
  rowId: string;
  variant?: 'icon' | 'button';
  /** When true, the button-variant shows the AR/EN edition picker. */
  hasEnglish?: boolean;
}) {
  const { t } = useI18n();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  const doDownload = useCallback(async (lang: 'ar' | 'en' = 'ar') => {
    setBusy(true);
    try {
      const key = getApiKey();
      const res = await fetch(`${API_BASE}/reports/monthly/${rowId}/pdf?lang=${lang}`, {
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
      a.download = `monthly-${rowId}-${lang}.pdf`;
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
      <span className="flex items-center gap-1.5">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => void doDownload('ar')}
          disabled={busy}
        >
          {busy ? t('reportsMonthly.pdf.downloading') : '📄 العربية (PDF)'}
        </Button>
        {hasEnglish && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void doDownload('en')}
            disabled={busy}
          >
            {busy ? t('reportsMonthly.pdf.downloading') : '📄 English (PDF)'}
          </Button>
        )}
      </span>
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
        void doDownload('ar');
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          e.stopPropagation();
          void doDownload('ar');
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

function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-600 bg-slate-900/60 px-2.5 py-1.5 text-xs font-medium text-slate-100 transition-all duration-200 hover:scale-105 hover:border-sky-400/60 hover:text-sky-100 print:hidden"
      title="Print / Save as PDF (Ctrl+P)"
    >
      Print
    </button>
  );
}

function ChartsStrip({ metrics }: { metrics: Record<string, unknown> }) {
  const activityCount = readNumber(metrics?.activityCount) ?? 0;
  const critical = readNumber(metrics?.criticalAlertCount) ?? 0;
  const warning = readNumber(metrics?.warningAlertCount) ?? 0;
  const alertCount = readNumber(metrics?.alertCount) ?? 0;
  const info = Math.max(0, alertCount - critical - warning);
  const confidence = readNumber(metrics?.confidenceAverage) ?? 0;
  const planned = readNumber(metrics?.plannedAverage);
  const actual = readNumber(metrics?.actualAverage);
  const byCode = (metrics?.alertsByCode ?? {}) as Record<string, number>;

  const severityDonut = [
    { label: 'Critical', value: critical, accent: SEVERITY_ACCENT.critical },
    { label: 'Warning', value: warning, accent: SEVERITY_ACCENT.warning },
    { label: 'Info', value: info, accent: SEVERITY_ACCENT.info },
  ].filter((d) => d.value > 0);

  const byCodeBars = Object.entries(byCode)
    .map(([label, value]) => ({ label, value: Number(value) }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 6);

  return (
    <div className="mb-5 grid grid-cols-1 gap-3 md:grid-cols-3">
      <GaugeChart
        title="Data confidence"
        value={confidence}
        max={1}
        label={`${(confidence * 100).toFixed(0)}%`}
        hint={confidence >= 0.85 ? 'HIGH' : confidence >= 0.65 ? 'MED' : 'LOW'}
      />
      {planned !== null && actual !== null && (
        <StackedBar
          title="Planned vs Actual"
          caption={`${activityCount} activities`}
          data={[
            { label: `Planned ${(planned * 100).toFixed(0)}%`, value: planned * 100, accent: CHART_PALETTE.crimson },
            { label: `Actual ${(actual * 100).toFixed(0)}%`, value: actual * 100, accent: actual >= planned ? CHART_PALETTE.emerald : CHART_PALETTE.amber },
          ]}
        />
      )}
      {severityDonut.length > 0 ? (
        <DonutChart
          title="Alerts by severity"
          data={severityDonut}
          size={150}
          thickness={20}
          centerValue={alertCount}
          centerLabel="open"
        />
      ) : (
        <DonutChart
          title="Alerts by severity"
          data={[{ label: 'No open alerts', value: 1, accent: CHART_PALETTE.emerald }]}
          size={150}
          thickness={20}
          centerValue={0}
          centerLabel="clear"
        />
      )}
      {byCodeBars.length > 0 && (
        <div className="md:col-span-3">
          <BarChart
            title="Alerts by rule code"
            caption="top six"
            data={byCodeBars}
            labelWidth={180}
            rowHeight={26}
          />
        </div>
      )}
    </div>
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

/** Current day in `YYYY-MM-DD` form for the picker default. */
function defaultDay(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Current ISO week in `YYYY-Www` form for the picker default. */
function defaultIsoWeek(): string {
  const d = new Date();
  // Thursday of the current week determines the ISO year.
  const target = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = target.getUTCDay() || 7;
  target.setUTCDate(target.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
  const weekNum = Math.ceil(((target.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${target.getUTCFullYear()}-W${String(weekNum).padStart(2, '0')}`;
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

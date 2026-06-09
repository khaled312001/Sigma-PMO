'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { AlertRecord, api, ExecutiveSummary, IngestionRun } from '../lib/api';
import { AuthGate } from '../components/AuthGate';
import {
  BarChart,
  DonutChart,
  GaugeChart,
  LineChart,
  StackedBar,
  CHART_PALETTE,
  SEVERITY_ACCENT,
} from '../components/Charts';
import { SummaryView } from '../components/SummaryView';
import { useI18n } from '../lib/i18n';
import {
  IconAlertCritical,
  IconAlertWarning,
  IconDatabase,
  IconReview,
  IconSparkles,
} from '../components/Icons';
import { Card, ConfidenceBar, ErrorBanner, PageHeader, Pill } from '../components/ui';

interface Counts {
  runs: number;
  alerts: number;
  critical: number;
  warning: number;
}

export default function OverviewPage() {
  return <AuthGate surface="the dashboard"><Overview /></AuthGate>;
}

function Overview() {
  const { t } = useI18n();
  const [counts, setCounts] = useState<Counts | null>(null);
  const [latestRun, setLatestRun] = useState<IngestionRun | null>(null);
  const [summary, setSummary] = useState<ExecutiveSummary | null>(null);
  const [runs, setRuns] = useState<IngestionRun[]>([]);
  const [alerts, setAlerts] = useState<AlertRecord[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [runsList, alertsList, summaries] = await Promise.all([
          api<IngestionRun[]>('/ingestion/runs?limit=50'),
          api<AlertRecord[]>('/rules/alerts?limit=300'),
          api<ExecutiveSummary[]>('/summary?limit=1'),
        ]);
        setCounts({
          runs: runsList.length,
          alerts: alertsList.length,
          critical: alertsList.filter((a) => a.severity === 'critical').length,
          warning: alertsList.filter((a) => a.severity === 'warning').length,
        });
        setLatestRun(runsList[0] ?? null);
        setSummary(summaries[0] ?? null);
        setRuns(runsList);
        setAlerts(alertsList);
      } catch (e) {
        setError((e as Error).message);
      }
    })();
  }, []);

  const latestConfidence = (latestRun?.summary?.confidence as { overall?: number } | undefined)?.overall;

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow={t('overview.eyebrow')}
        title={t('overview.title')}
        description={t('overview.description')}
      />

      <ErrorBanner message={error} />

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label={t('overview.cards.ingestionRuns')} value={counts?.runs}    icon={<IconDatabase className="h-5 w-5" />}       tone="sky"     href="/input" />
        <StatCard label={t('overview.cards.totalAlerts')}   value={counts?.alerts}  icon={<IconReview className="h-5 w-5" />}         tone="emerald" href="/review" />
        <StatCard label={t('overview.cards.critical')}      value={counts?.critical} icon={<IconAlertCritical className="h-5 w-5" />} tone="rose"    href="/approval" />
        <StatCard label={t('overview.cards.warnings')}      value={counts?.warning}  icon={<IconAlertWarning className="h-5 w-5" />}  tone="amber"   href="/evidence" />
      </section>

      <OverviewAnalytics runs={runs} alerts={alerts} latestConfidence={(latestRun?.summary?.confidence as { overall?: number } | undefined)?.overall} />

      {latestRun && (
        <Card title={t('overview.latestIngestion')} hint={t('overview.latestIngestionHint')}>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <Pill tone="sky">{latestRun.parser}</Pill>
            <Pill tone="emerald">{latestRun.status}</Pill>
            <span className="text-xs text-slate-400">{new Date(latestRun.createdAt).toLocaleString()}</span>
            <span className="text-xs text-slate-300">
              {Object.entries(latestRun.rowCounts ?? {}).map(([k, v]) => `${k}:${v}`).join(' · ')}
            </span>
            <div className="ms-auto"><ConfidenceBar value={latestConfidence ?? null} /></div>
          </div>
        </Card>
      )}

      {summary ? (
        <Card
          title={t('overview.latestSummary')}
          hint={`${summary.periodStart} → ${summary.periodEnd}`}
          actions={
            <>
              <Pill tone={summary.source === 'llm' ? 'violet' : 'slate'}>
                <IconSparkles className="me-1 h-3 w-3" /> {summary.source === 'deterministic' ? t('common.deterministic') : summary.source}
              </Pill>
              <Pill tone="emerald">{t('common.confidence', { value: (summary.confidenceAverage * 100).toFixed(1) })}</Pill>
            </>
          }
        >
          <SummaryView text={summary.narrative} confidence={summary.confidenceAverage} />
        </Card>
      ) : (
        <Card title={t('overview.latestSummary')}>
          <p className="text-sm text-slate-400">
            {t('overview.noSummary')} <Link href="/review" className="text-sky-400 hover:text-sky-300">{t('overview.goToReview')}</Link>.
          </p>
        </Card>
      )}
    </div>
  );
}

function OverviewAnalytics({
  runs,
  alerts,
  latestConfidence,
}: {
  runs: IngestionRun[];
  alerts: AlertRecord[];
  latestConfidence: number | undefined;
}) {
  // Donut: alerts by severity.
  const critical = alerts.filter((a) => a.severity === 'critical').length;
  const warning = alerts.filter((a) => a.severity === 'warning').length;
  const info = alerts.filter((a) => a.severity === 'info').length;
  const severityDonut = [
    { label: 'Critical', value: critical, accent: SEVERITY_ACCENT.critical },
    { label: 'Warning', value: warning, accent: SEVERITY_ACCENT.warning },
    { label: 'Info', value: info, accent: SEVERITY_ACCENT.info },
  ].filter((d) => d.value > 0);

  // BarChart: alerts by rule code (top 8).
  const byCode = new Map<string, number>();
  for (const a of alerts) byCode.set(a.code, (byCode.get(a.code) ?? 0) + 1);
  const byCodeBars = [...byCode.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([label, value]) => ({ label, value }));

  // LineChart: ingestion runs per day for the last 14 days.
  const byDay = new Map<string, number>();
  const today = new Date();
  for (let i = 13; i >= 0; i -= 1) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    byDay.set(d.toISOString().slice(0, 10), 0);
  }
  for (const r of runs) {
    const key = new Date(r.createdAt).toISOString().slice(0, 10);
    if (byDay.has(key)) byDay.set(key, (byDay.get(key) ?? 0) + 1);
  }
  const linePoints = [...byDay.entries()].map(([x, y]) => ({ x: x.slice(5), y }));

  // StackedBar: parsers by run.
  const byParser = new Map<string, number>();
  for (const r of runs) byParser.set(r.parser, (byParser.get(r.parser) ?? 0) + 1);
  const parserSeg = [...byParser.entries()].map(([label, value], i) => {
    const accents = [
      CHART_PALETTE.crimson,
      CHART_PALETTE.sky,
      CHART_PALETTE.emerald,
      CHART_PALETTE.amber,
      CHART_PALETTE.rose,
    ];
    return { label, value, accent: accents[i % accents.length] };
  });

  return (
    <section className="grid grid-cols-1 gap-3 md:grid-cols-3">
      <GaugeChart
        title="Latest ingestion confidence"
        value={latestConfidence ?? 0}
        max={1}
        label={`${((latestConfidence ?? 0) * 100).toFixed(0)}%`}
        hint={
          latestConfidence === undefined
            ? 'NO DATA'
            : latestConfidence >= 0.85
              ? 'HIGH'
              : latestConfidence >= 0.65
                ? 'MED'
                : 'LOW'
        }
      />
      {severityDonut.length > 0 ? (
        <DonutChart
          title="Alerts by severity"
          data={severityDonut}
          size={170}
          thickness={22}
          centerValue={alerts.length}
          centerLabel="OPEN"
        />
      ) : (
        <DonutChart
          title="Alerts by severity"
          data={[{ label: 'No open alerts', value: 1, accent: CHART_PALETTE.emerald }]}
          size={170}
          thickness={22}
          centerValue={0}
          centerLabel="CLEAR"
        />
      )}
      <LineChart
        title="Ingestion runs"
        caption="last 14 days"
        series={[{ label: 'runs', points: linePoints, accent: CHART_PALETTE.crimson }]}
        height={170}
        yMin={0}
      />
      {parserSeg.length > 0 && (
        <div className="md:col-span-3">
          <StackedBar title="Parser distribution" caption="across ingested runs" data={parserSeg} />
        </div>
      )}
      {byCodeBars.length > 0 && (
        <div className="md:col-span-3">
          <BarChart
            title="Alerts by rule code"
            caption="top eight"
            data={byCodeBars}
            labelWidth={200}
            rowHeight={26}
          />
        </div>
      )}
    </section>
  );
}

function StatCard({
  label, value, icon, tone, href,
}: { label: string; value: number | undefined; icon: React.ReactNode; tone: 'sky' | 'emerald' | 'rose' | 'amber'; href: string }) {
  // Punchier tint + ring on both light and dark — the previous /10 fill
  // washed out completely on the warm-paper light theme.
  const grad: Record<string, string> = {
    sky:     'from-sky-500/25 ring-sky-500/60 text-sky-200',
    emerald: 'from-emerald-500/25 ring-emerald-500/60 text-emerald-200',
    rose:    'from-rose-500/25 ring-rose-500/60 text-rose-200',
    amber:   'from-amber-400/25 ring-amber-400/60 text-amber-200',
  };
  return (
    <Link href={href} className={`group relative overflow-hidden rounded-xl border border-slate-700 bg-gradient-to-br ${grad[tone]} to-transparent p-4 transition hover:border-slate-500 hover:shadow-sm`}>
      <div className="flex items-start justify-between">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-300">{label}</p>
        <div className={`grid h-8 w-8 place-items-center rounded-lg bg-slate-900/70 ring-1 ${grad[tone].split(' ')[1]} ${grad[tone].split(' ')[2]}`}>{icon}</div>
      </div>
      <p className="mt-3 text-3xl font-semibold tabular-nums text-slate-50">{value ?? '—'}</p>
    </Link>
  );
}


'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { AlertRecord, api, ExecutiveSummary, IngestionRun } from '../lib/api';
import { AuthGate } from '../components/AuthGate';
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
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [runs, alerts, summaries] = await Promise.all([
          api<IngestionRun[]>('/ingestion/runs?limit=50'),
          api<AlertRecord[]>('/rules/alerts?limit=300'),
          api<ExecutiveSummary[]>('/summary?limit=1'),
        ]);
        setCounts({
          runs: runs.length,
          alerts: alerts.length,
          critical: alerts.filter((a) => a.severity === 'critical').length,
          warning: alerts.filter((a) => a.severity === 'warning').length,
        });
        setLatestRun(runs[0] ?? null);
        setSummary(summaries[0] ?? null);
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
          <SummaryNarrative text={summary.narrative} />
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

function StatCard({
  label, value, icon, tone, href,
}: { label: string; value: number | undefined; icon: React.ReactNode; tone: 'sky' | 'emerald' | 'rose' | 'amber'; href: string }) {
  const grad: Record<string, string> = {
    sky:     'from-sky-500/10 ring-sky-500/30 text-sky-300',
    emerald: 'from-emerald-500/10 ring-emerald-500/30 text-emerald-300',
    rose:    'from-rose-500/10 ring-rose-500/30 text-rose-300',
    amber:   'from-amber-400/10 ring-amber-400/30 text-amber-300',
  };
  return (
    <Link href={href} className={`group relative overflow-hidden rounded-xl border border-slate-800 bg-gradient-to-br ${grad[tone]} to-transparent p-4 transition hover:border-slate-600`}>
      <div className="flex items-start justify-between">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">{label}</p>
        <div className={`grid h-8 w-8 place-items-center rounded-lg bg-slate-900/70 ring-1 ${grad[tone].split(' ')[1]} ${grad[tone].split(' ')[2]}`}>{icon}</div>
      </div>
      <p className="mt-3 text-3xl font-semibold tabular-nums text-slate-50">{value ?? '—'}</p>
    </Link>
  );
}

function SummaryNarrative({ text }: { text: string }) {
  const lines = text.split('\n');
  return (
    <div className="space-y-1.5 text-sm leading-relaxed text-slate-200">
      {lines.map((raw, i) => {
        const line = raw;
        if (line.trim() === '') return <div key={i} className="h-1.5" />;
        if (line.startsWith('  -')) {
          return <div key={i} className="ml-3 flex gap-2 text-slate-300"><span className="text-slate-500">·</span><span>{line.replace(/^\s*-\s?/, '')}</span></div>;
        }
        if (/^[A-Z][^:]*:\s*$/.test(line.trim())) {
          return <p key={i} className="mt-3 text-[10px] font-semibold uppercase tracking-wider text-slate-400">{line.trim().slice(0, -1)}</p>;
        }
        if (/^[^-\s].*:\s*.+$/.test(line)) {
          const idx = line.indexOf(':');
          return <p key={i}><span className="text-slate-400">{line.slice(0, idx)}:</span><span className="ml-1">{line.slice(idx + 1).trim()}</span></p>;
        }
        return <p key={i}>{line}</p>;
      })}
    </div>
  );
}

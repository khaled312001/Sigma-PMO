'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { AlertRecord, api, ExecutiveSummary, IngestionRun } from '../lib/api';

interface Counts {
  runs: number;
  alerts: number;
  critical: number;
  warning: number;
}

export default function Overview() {
  const [counts, setCounts] = useState<Counts | null>(null);
  const [summary, setSummary] = useState<ExecutiveSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [runs, alerts, summaries] = await Promise.all([
          api<IngestionRun[]>('/ingestion/runs?limit=50'),
          api<AlertRecord[]>('/rules/alerts?limit=200'),
          api<ExecutiveSummary[]>('/summary?limit=1'),
        ]);
        setCounts({
          runs: runs.length,
          alerts: alerts.length,
          critical: alerts.filter((a) => a.severity === 'critical').length,
          warning: alerts.filter((a) => a.severity === 'warning').length,
        });
        setSummary(summaries[0] ?? null);
      } catch (e) {
        setError((e as Error).message);
      }
    })();
  }, []);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-xl font-semibold">Overview</h1>
        <p className="text-xs text-slate-400">Snapshot of the platform across all four standard surfaces.</p>
      </header>

      {error && <div className="rounded border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</div>}

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Ingestion runs" value={counts?.runs ?? '—'} surface="input"    href="/input" />
        <Stat label="Alerts"         value={counts?.alerts ?? '—'} surface="review"   href="/review" />
        <Stat label="Critical"       value={counts?.critical ?? '—'} surface="approval" href="/approval" />
        <Stat label="Warnings"       value={counts?.warning ?? '—'} surface="evidence" href="/evidence" />
      </section>

      <section>
        <header className="mb-2 flex items-baseline justify-between">
          <h2 className="text-base font-semibold">Latest executive summary</h2>
          {summary && <span className="text-xs text-slate-500">{summary.periodStart} → {summary.periodEnd}</span>}
        </header>
        {summary ? (
          <article className="rounded border border-slate-800 bg-slate-900/40 p-5">
            <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-slate-400">
              <span>source: <strong className="text-slate-200">{summary.source}</strong>{summary.llmProvider ? ` (${summary.llmProvider}/${summary.llmModel})` : ''}</span>
              <span>·</span>
              <span>data confidence {(summary.confidenceAverage * 100).toFixed(1)}%</span>
            </div>
            <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-slate-200">{summary.narrative}</pre>
          </article>
        ) : (
          <p className="text-xs text-slate-500">No summary yet. <Link href="/review" className="text-sky-400 hover:text-sky-300">Go to Review</Link> to generate one.</p>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value, surface, href }: { label: string; value: number | string; surface: string; href: string }) {
  return (
    <Link href={href} className="rounded border border-slate-800 bg-slate-900/40 px-4 py-3 transition hover:border-slate-600">
      <p className="text-[10px] uppercase tracking-wider text-slate-400">{surface}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
      <p className="text-xs text-slate-300">{label}</p>
    </Link>
  );
}

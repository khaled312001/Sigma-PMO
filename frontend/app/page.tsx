'use client';

import { useCallback, useEffect, useState } from 'react';

import { AlertRecord, api, EvidencePackage, ExecutiveSummary, IngestionRun } from '../lib/api';

const PROJECT_KEY = 'P-1000';

function severityClass(severity: AlertRecord['severity']): string {
  switch (severity) {
    case 'critical': return 'bg-red-500/10 text-red-300 border-red-500/30';
    case 'warning':  return 'bg-amber-500/10 text-amber-200 border-amber-500/30';
    default:         return 'bg-sky-500/10 text-sky-200 border-sky-500/30';
  }
}

function confidenceColor(value: number | undefined): string {
  if (value === undefined) return 'bg-slate-700';
  if (value >= 0.9) return 'bg-emerald-500';
  if (value >= 0.75) return 'bg-amber-400';
  return 'bg-red-500';
}

export default function Page() {
  const [runs, setRuns] = useState<IngestionRun[]>([]);
  const [alerts, setAlerts] = useState<AlertRecord[]>([]);
  const [evaluating, setEvaluating] = useState(false);
  const [generatingSummary, setGeneratingSummary] = useState(false);
  const [summary, setSummary] = useState<ExecutiveSummary | null>(null);
  const [selectedAlertId, setSelectedAlertId] = useState<string | null>(null);
  const [evidence, setEvidence] = useState<EvidencePackage | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setError(null);
      const [r, a, s] = await Promise.all([
        api<IngestionRun[]>('/ingestion/runs?limit=8'),
        api<AlertRecord[]>('/rules/alerts?limit=20'),
        api<ExecutiveSummary[]>('/summary?limit=1'),
      ]);
      setRuns(r); setAlerts(a); setSummary(s[0] ?? null);
    } catch (e) { setError((e as Error).message); }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const evaluate = async () => {
    setEvaluating(true);
    try {
      await api('/rules/evaluate', { method: 'POST', body: JSON.stringify({ projectKey: PROJECT_KEY }) });
      await refresh();
    } catch (e) { setError((e as Error).message); }
    finally { setEvaluating(false); }
  };

  const generateSummary = async () => {
    setGeneratingSummary(true);
    try {
      const next = await api<ExecutiveSummary>('/summary/generate', {
        method: 'POST',
        body: JSON.stringify({ projectKey: PROJECT_KEY, periodDays: 7 }),
      });
      setSummary(next);
    } catch (e) { setError((e as Error).message); }
    finally { setGeneratingSummary(false); }
  };

  const openEvidence = async (id: string) => {
    setSelectedAlertId(id); setEvidence(null);
    try {
      const ev = await api<EvidencePackage>(`/governance/alerts/${id}/evidence`);
      setEvidence(ev);
    } catch (e) { setError((e as Error).message); }
  };

  return (
    <div className="space-y-8">
      {error && (
        <div className="rounded border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</div>
      )}

      <section>
        <div>
          <h2 className="text-base font-semibold">Ingestion runs</h2>
          <p className="text-xs text-slate-400">Latest source files ingested, with row counts and data confidence.</p>
        </div>
        <div className="mt-3 overflow-hidden rounded border border-slate-800">
          <table className="w-full text-sm">
            <thead className="bg-slate-900/60 text-left text-xs uppercase text-slate-400">
              <tr><th className="px-3 py-2">When</th><th>Parser</th><th>Status</th><th>Counts</th><th>Confidence</th></tr>
            </thead>
            <tbody>
              {runs.map((r) => {
                const conf = (r.summary?.confidence as { overall?: number } | undefined)?.overall;
                return (
                  <tr key={r.id} className="border-t border-slate-800/70">
                    <td className="px-3 py-2 text-slate-400">{new Date(r.createdAt).toLocaleString()}</td>
                    <td className="px-3 py-2">{r.parser}</td>
                    <td className="px-3 py-2"><span className="rounded bg-slate-800 px-2 py-0.5 text-xs">{r.status}</span></td>
                    <td className="px-3 py-2 text-xs text-slate-300">{Object.entries(r.rowCounts ?? {}).map(([k, v]) => `${k}:${v}`).join(' · ')}</td>
                    <td className="px-3 py-2 text-xs">
                      {conf === undefined ? <span className="text-slate-500">—</span> : (
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-24 overflow-hidden rounded bg-slate-800"><div className={`h-full ${confidenceColor(conf)}`} style={{ width: `${conf * 100}%` }} /></div>
                          <span className="tabular-nums">{(conf * 100).toFixed(1)}%</span>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
              {runs.length === 0 && <tr><td colSpan={5} className="px-3 py-6 text-center text-sm text-slate-500">No ingestion runs yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold">Alerts</h2>
            <p className="text-xs text-slate-400">Rule-engine deviations on the current canonical snapshot. Click an alert to inspect its evidence chain.</p>
          </div>
          <button onClick={evaluate} disabled={evaluating} className="rounded bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-500 disabled:opacity-50">
            {evaluating ? 'Evaluating…' : `Evaluate ${PROJECT_KEY}`}
          </button>
        </div>
        <div className="mt-3 grid gap-2">
          {alerts.map((a) => (
            <button key={a.id} onClick={() => openEvidence(a.id)} className={`rounded border px-3 py-2 text-left text-sm transition ${severityClass(a.severity)} hover:brightness-125`}>
              <div className="flex items-center gap-3">
                <span className="rounded bg-black/30 px-2 py-0.5 text-[10px] uppercase tracking-wider">{a.severity}</span>
                <span className="font-mono text-xs text-slate-300">{a.code}</span>
              </div>
              <div className="mt-1">{a.summary}</div>
            </button>
          ))}
          {alerts.length === 0 && <div className="rounded border border-slate-800 px-4 py-6 text-center text-sm text-slate-500">No alerts. Click <em>Evaluate</em> above to run the rule engine.</div>}
        </div>

        {selectedAlertId && (
          <div className="mt-4 rounded border border-slate-800 bg-slate-900/40 p-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">Evidence</h3>
              <button onClick={() => { setSelectedAlertId(null); setEvidence(null); }} className="text-xs text-slate-400 hover:text-white">close</button>
            </div>
            {!evidence ? <p className="mt-2 text-xs text-slate-400">Loading…</p> : (
              <div className="mt-3 grid gap-3 text-sm">
                <div><span className="text-xs uppercase tracking-wider text-slate-400">Rationale</span><p className="mt-1">{evidence.rationale}</p></div>
                {evidence.sourceFile && (
                  <div className="text-xs text-slate-300">
                    Source file: <span className="font-mono">{evidence.sourceFile.filename}</span> · SHA-256 <span className="font-mono">{evidence.sourceFile.contentSha256.slice(0, 12)}…</span>
                  </div>
                )}
                {evidence.confidence && (
                  <div className="text-xs text-slate-300">
                    Confidence overall {(evidence.confidence.overall * 100).toFixed(1)}% (completeness {(evidence.confidence.completeness * 100).toFixed(0)}% · consistency {(evidence.confidence.consistency * 100).toFixed(0)}% · source {(evidence.confidence.sourceReliability * 100).toFixed(0)}%)
                  </div>
                )}
                <div>
                  <span className="text-xs uppercase tracking-wider text-slate-400">Raw source snippets</span>
                  <pre className="mt-1 max-h-64 overflow-auto rounded bg-black/40 p-3 text-[11px] leading-snug text-slate-300">{JSON.stringify(evidence.rawSourceSnippets, null, 2)}</pre>
                </div>
              </div>
            )}
          </div>
        )}
      </section>

      <section>
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold">Weekly executive summary</h2>
            <p className="text-xs text-slate-400">Deterministic-first narrative grounded in canonical data. LLM rewrites the same facts when <code>LLM_API_KEY</code> is set.</p>
          </div>
          <button onClick={generateSummary} disabled={generatingSummary} className="rounded bg-sky-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-500 disabled:opacity-50">
            {generatingSummary ? 'Generating…' : 'Generate summary'}
          </button>
        </div>
        {summary ? (
          <article className="mt-3 rounded border border-slate-800 bg-slate-900/40 p-5">
            <div className="mb-2 flex items-center gap-2 text-xs text-slate-400">
              <span>{summary.periodStart} → {summary.periodEnd}</span>
              <span>·</span>
              <span>source: <strong className="text-slate-200">{summary.source}</strong>{summary.llmProvider ? ` (${summary.llmProvider}/${summary.llmModel})` : ''}</span>
              <span>·</span>
              <span>data confidence {(summary.confidenceAverage * 100).toFixed(1)}%</span>
            </div>
            <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-slate-200">{summary.narrative}</pre>
          </article>
        ) : (
          <p className="mt-3 text-xs text-slate-500">No summary yet. Click <em>Generate summary</em> to produce one for {PROJECT_KEY}.</p>
        )}
      </section>
    </div>
  );
}

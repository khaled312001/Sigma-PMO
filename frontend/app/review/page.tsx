'use client';

import { useCallback, useEffect, useState } from 'react';

import { AlertRecord, api, ExecutiveSummary, GovernanceDecision } from '../../lib/api';

const PROJECT_KEY = 'P-1000';

function severityClass(severity: AlertRecord['severity']): string {
  switch (severity) {
    case 'critical': return 'bg-red-500/10 text-red-300 border-red-500/30';
    case 'warning':  return 'bg-amber-500/10 text-amber-200 border-amber-500/30';
    default:         return 'bg-sky-500/10 text-sky-200 border-sky-500/30';
  }
}

export default function ReviewPage() {
  const [alerts, setAlerts] = useState<AlertRecord[]>([]);
  const [decisionsByAlert, setDecisionsByAlert] = useState<Record<string, GovernanceDecision[]>>({});
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState<ExecutiveSummary | null>(null);
  const [generatingSummary, setGeneratingSummary] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [a, decs, s] = await Promise.all([
        api<AlertRecord[]>('/rules/alerts?limit=50'),
        api<GovernanceDecision[]>('/governance/decisions?limit=200'),
        api<ExecutiveSummary[]>('/summary?limit=1'),
      ]);
      setAlerts(a);
      const map: Record<string, GovernanceDecision[]> = {};
      for (const d of decs) (map[d.alertId] ??= []).push(d);
      setDecisionsByAlert(map);
      setSummary(s[0] ?? null);
    } catch (e) { setError((e as Error).message); }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const evaluate = async () => {
    setBusy(true); setError(null);
    try {
      const evalResult = await api<{ evaluationId: string }>('/rules/evaluate', {
        method: 'POST', body: JSON.stringify({ projectKey: PROJECT_KEY }),
      });
      await api('/governance/decide', {
        method: 'POST', body: JSON.stringify({ ruleEvaluationId: evalResult.evaluationId, projectKey: PROJECT_KEY }),
      });
      await refresh();
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };

  const generateSummary = async () => {
    setGeneratingSummary(true);
    try {
      const next = await api<ExecutiveSummary>('/summary/generate', {
        method: 'POST', body: JSON.stringify({ projectKey: PROJECT_KEY, periodDays: 7 }),
      });
      setSummary(next);
    } catch (e) { setError((e as Error).message); }
    finally { setGeneratingSummary(false); }
  };

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Review</h1>
          <p className="text-xs text-slate-400">Rule-engine deviations on the current canonical snapshot, paired with their governance decisions.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={evaluate} disabled={busy} className="rounded bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-500 disabled:opacity-50">
            {busy ? 'Working…' : `Evaluate + Decide ${PROJECT_KEY}`}
          </button>
          <button onClick={generateSummary} disabled={generatingSummary} className="rounded bg-sky-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-500 disabled:opacity-50">
            {generatingSummary ? 'Generating…' : 'Weekly summary'}
          </button>
        </div>
      </header>

      {error && <div className="rounded border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</div>}

      <section className="space-y-2">
        {alerts.map((a) => {
          const decs = decisionsByAlert[a.id] ?? [];
          const latest = decs[0];
          return (
            <div key={a.id} className={`rounded border px-3 py-3 text-sm ${severityClass(a.severity)}`}>
              <div className="flex items-center gap-3">
                <span className="rounded bg-black/30 px-2 py-0.5 text-[10px] uppercase tracking-wider">{a.severity}</span>
                <span className="font-mono text-xs text-slate-300">{a.code}</span>
                {latest && <span className="ml-auto rounded bg-slate-900/60 px-2 py-0.5 text-[10px] uppercase tracking-wider text-slate-200">{latest.escalationLevel} · {latest.responsibleParty}</span>}
              </div>
              <div className="mt-1">{a.summary}</div>
              {latest && (
                <div className="mt-2 grid gap-1 border-t border-black/20 pt-2 text-xs text-slate-300">
                  {latest.fidicClause && <div><span className="text-slate-500">FIDIC:</span> {latest.fidicClause}{latest.fidicNotice ? ` — ${latest.fidicNotice}` : ''}</div>}
                  {latest.notifyParties.length > 0 && <div><span className="text-slate-500">Notify:</span> {latest.notifyParties.join(', ')}</div>}
                  {latest.interventions.length > 0 && (
                    <div>
                      <span className="text-slate-500">Interventions:</span>
                      <ul className="ml-4 list-disc">{latest.interventions.map((i, idx) => <li key={idx}>{i}</li>)}</ul>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {alerts.length === 0 && (
          <div className="rounded border border-slate-800 px-4 py-6 text-center text-sm text-slate-500">No alerts yet. Click <em>Evaluate + Decide</em> above.</div>
        )}
      </section>

      {summary && (
        <section>
          <h2 className="text-base font-semibold">Weekly executive summary</h2>
          <article className="mt-2 rounded border border-slate-800 bg-slate-900/40 p-4">
            <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-slate-400">
              <span>{summary.periodStart} → {summary.periodEnd}</span>
              <span>·</span>
              <span>source <strong className="text-slate-200">{summary.source}</strong></span>
              <span>·</span>
              <span>confidence {(summary.confidenceAverage * 100).toFixed(1)}%</span>
            </div>
            <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-slate-200">{summary.narrative}</pre>
          </article>
        </section>
      )}
    </div>
  );
}

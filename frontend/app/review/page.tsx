'use client';

import { useCallback, useEffect, useState } from 'react';

import { AlertRecord, api, ExecutiveSummary, GovernanceDecision } from '../../lib/api';
import { IconSparkles } from '../../components/Icons';
import {
  Button,
  Card,
  EmptyState,
  ErrorBanner,
  PageHeader,
  Pill,
  SeverityBadge,
} from '../../components/ui';

const PROJECT_KEY = 'P-1000';

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
        api<AlertRecord[]>('/rules/alerts?limit=80'),
        api<GovernanceDecision[]>('/governance/decisions?limit=500'),
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
    <div className="space-y-7">
      <PageHeader
        eyebrow="Review"
        title="Deviations & governance decisions"
        description="Rule-engine findings on the current snapshot, paired with their FIDIC mapping, escalation, and intervention library."
        actions={
          <>
            <Button variant="success" size="sm" disabled={busy} onClick={evaluate}>
              {busy ? 'Working…' : `Evaluate + Decide ${PROJECT_KEY}`}
            </Button>
            <Button variant="primary" size="sm" disabled={generatingSummary} onClick={generateSummary}>
              <IconSparkles className="h-3.5 w-3.5" /> {generatingSummary ? 'Generating…' : 'Weekly summary'}
            </Button>
          </>
        }
      />

      <ErrorBanner message={error} />

      {alerts.length === 0 ? (
        <EmptyState
          title="No alerts on this project"
          description="Click Evaluate + Decide to run the rule engine on the current snapshot."
          action={<Button variant="success" disabled={busy} onClick={evaluate}>{busy ? 'Working…' : 'Evaluate + Decide'}</Button>}
        />
      ) : (
        <section className="space-y-2">
          {alerts.map((a) => {
            const decs = decisionsByAlert[a.id] ?? [];
            const latest = decs[0];
            return (
              <article key={a.id} className="rounded-xl border border-slate-800 bg-slate-900/40 transition hover:border-slate-700">
                <header className="flex flex-wrap items-center gap-2 px-4 py-3">
                  <SeverityBadge severity={a.severity} />
                  <span className="font-mono text-xs text-slate-400">{a.code}</span>
                  {latest && (
                    <span className="ml-auto flex items-center gap-1.5">
                      <Pill tone={latest.escalationLevel === 'L3' ? 'rose' : latest.escalationLevel === 'L2' ? 'amber' : 'slate'}>{latest.escalationLevel}</Pill>
                      <Pill tone="slate">→ {latest.responsibleParty}</Pill>
                    </span>
                  )}
                </header>
                <div className="px-4 pb-3 text-sm text-slate-100">{a.summary}</div>
                {latest && (
                  <div className="grid gap-1.5 border-t border-slate-800/70 bg-slate-950/40 px-4 py-3 text-xs">
                    {latest.fidicClause && (
                      <p className="text-slate-300"><span className="text-slate-500">FIDIC:</span> <strong className="text-slate-200">{latest.fidicClause}</strong>{latest.fidicNotice ? ` — ${latest.fidicNotice}` : ''}</p>
                    )}
                    {latest.notifyParties.length > 0 && (
                      <p className="text-slate-300"><span className="text-slate-500">Notify:</span> {latest.notifyParties.join(', ')}</p>
                    )}
                    {latest.interventions.length > 0 && (
                      <div className="text-slate-300">
                        <p className="text-slate-500">Suggested interventions:</p>
                        <ul className="ml-4 mt-1 list-disc space-y-0.5 text-slate-300">{latest.interventions.map((i, idx) => <li key={idx}>{i}</li>)}</ul>
                      </div>
                    )}
                  </div>
                )}
              </article>
            );
          })}
        </section>
      )}

      {summary && (
        <Card
          title="Weekly executive summary"
          hint={`${summary.periodStart} → ${summary.periodEnd}`}
          actions={
            <>
              <Pill tone={summary.source === 'llm' ? 'violet' : 'slate'}>{summary.source}</Pill>
              <Pill tone="emerald">{(summary.confidenceAverage * 100).toFixed(1)}% confidence</Pill>
            </>
          }
        >
          <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-slate-200">{summary.narrative}</pre>
        </Card>
      )}
    </div>
  );
}

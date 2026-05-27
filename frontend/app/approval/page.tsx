'use client';

import { useCallback, useEffect, useState } from 'react';

import { AlertRecord, api, DecisionReview, GovernanceDecision } from '../../lib/api';

interface Row {
  alert: AlertRecord;
  decision: GovernanceDecision;
  latestReview: DecisionReview | null;
}

export default function ApprovalPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [acting, setActing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [alerts, decisions] = await Promise.all([
        api<AlertRecord[]>('/rules/alerts?limit=200'),
        api<GovernanceDecision[]>('/governance/decisions?limit=500'),
      ]);
      const decByAlert = new Map<string, GovernanceDecision>();
      for (const d of decisions) if (!decByAlert.has(d.alertId)) decByAlert.set(d.alertId, d);

      const pairs: Row[] = [];
      for (const a of alerts) {
        const d = decByAlert.get(a.id);
        if (!d) continue;
        const reviews = await api<DecisionReview[]>(`/governance/decisions/${d.id}/reviews`);
        pairs.push({ alert: a, decision: d, latestReview: reviews[0] ?? null });
      }
      setRows(pairs);
    } catch (e) { setError((e as Error).message); }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const act = async (decisionId: string, action: 'approve' | 'reject' | 'acknowledge') => {
    setActing(decisionId); setError(null);
    try {
      await api(`/governance/decisions/${decisionId}/review`, {
        method: 'POST', body: JSON.stringify({ action }),
      });
      await refresh();
    } catch (e) { setError((e as Error).message); }
    finally { setActing(null); }
  };

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-xl font-semibold">Approval</h1>
        <p className="text-xs text-slate-400">Approve, reject, or acknowledge governance decisions. Every action is appended to the audit trail.</p>
      </header>

      {error && <div className="rounded border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</div>}

      <div className="space-y-2">
        {rows.map(({ alert, decision, latestReview }) => (
          <div key={decision.id} className="rounded border border-slate-800 bg-slate-900/40 p-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded bg-black/30 px-2 py-0.5 text-[10px] uppercase tracking-wider text-slate-200">{alert.severity}</span>
              <span className="font-mono text-xs text-slate-400">{alert.code}</span>
              <span className="rounded bg-slate-800 px-2 py-0.5 text-[10px] uppercase tracking-wider text-slate-200">{decision.escalationLevel}</span>
              <span className="text-xs text-slate-500">→ {decision.responsibleParty}</span>
              {latestReview && (
                <span className="ml-auto rounded bg-slate-800 px-2 py-0.5 text-[10px] uppercase tracking-wider text-slate-200">
                  {latestReview.action} · {latestReview.performedByDisplay ?? 'system'} · {new Date(latestReview.createdAt).toLocaleString()}
                </span>
              )}
            </div>
            <div className="mt-1 text-slate-200">{alert.summary}</div>
            {decision.fidicClause && <div className="mt-1 text-xs text-slate-400">FIDIC: {decision.fidicClause}</div>}
            <div className="mt-3 flex gap-2">
              <button onClick={() => act(decision.id, 'approve')} disabled={acting === decision.id} className="rounded bg-emerald-600 px-3 py-1 text-xs text-white hover:bg-emerald-500 disabled:opacity-50">Approve</button>
              <button onClick={() => act(decision.id, 'reject')} disabled={acting === decision.id} className="rounded bg-red-600 px-3 py-1 text-xs text-white hover:bg-red-500 disabled:opacity-50">Reject</button>
              <button onClick={() => act(decision.id, 'acknowledge')} disabled={acting === decision.id} className="rounded border border-slate-700 px-3 py-1 text-xs text-slate-200 hover:border-slate-500">Acknowledge</button>
            </div>
          </div>
        ))}
        {rows.length === 0 && <div className="rounded border border-slate-800 px-4 py-6 text-center text-sm text-slate-500">No decisions yet. Run <em>Evaluate + Decide</em> from the Review page.</div>}
      </div>
    </div>
  );
}

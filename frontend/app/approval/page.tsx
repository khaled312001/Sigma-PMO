'use client';

import { useCallback, useEffect, useState } from 'react';

import { AlertRecord, api, DecisionReview, GovernanceDecision } from '../../lib/api';
import { IconCheck, IconX } from '../../components/Icons';
import { Button, Card, EmptyState, ErrorBanner, PageHeader, Pill, SeverityBadge } from '../../components/ui';

interface Row {
  alert: AlertRecord;
  decision: GovernanceDecision;
  latestReview: DecisionReview | null;
}

export default function ApprovalPage() {
  const [rows, setRows] = useState<Row[] | null>(null);
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

  const actionTone = (a: string) => (a === 'approve' ? 'emerald' : a === 'reject' ? 'rose' : 'slate') as 'emerald' | 'rose' | 'slate';

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="Approval"
        title="Approve · Reject · Acknowledge"
        description="Take action on governance decisions. Every action is appended to the audit trail with actor + timestamp."
      />

      <ErrorBanner message={error} />

      {!rows ? (
        <Card><p className="text-sm text-slate-400">Loading…</p></Card>
      ) : rows.length === 0 ? (
        <EmptyState title="No decisions yet" description="Run Evaluate + Decide on the Review page first." />
      ) : (
        <div className="space-y-2">
          {rows.map(({ alert, decision, latestReview }) => (
            <article key={decision.id} className="rounded-xl border border-slate-800 bg-slate-900/40 transition hover:border-slate-700">
              <header className="flex flex-wrap items-center gap-2 px-4 py-3">
                <SeverityBadge severity={alert.severity} />
                <span className="font-mono text-xs text-slate-400">{alert.code}</span>
                <Pill tone={decision.escalationLevel === 'L3' ? 'rose' : decision.escalationLevel === 'L2' ? 'amber' : 'slate'}>{decision.escalationLevel}</Pill>
                <Pill tone="slate">→ {decision.responsibleParty}</Pill>
                {latestReview && (
                  <span className="ml-auto flex items-center gap-2 text-[11px] text-slate-400">
                    <Pill tone={actionTone(latestReview.action)}>{latestReview.action}</Pill>
                    by {latestReview.performedByDisplay ?? 'system'}
                    · {new Date(latestReview.createdAt).toLocaleString()}
                  </span>
                )}
              </header>
              <div className="px-4 pb-3 text-sm text-slate-100">{alert.summary}</div>
              {decision.fidicClause && (
                <p className="border-t border-slate-800/70 bg-slate-950/40 px-4 py-2 text-xs text-slate-300">
                  <span className="text-slate-500">FIDIC:</span> <strong className="text-slate-200">{decision.fidicClause}</strong>
                </p>
              )}
              <div className="flex gap-2 border-t border-slate-800/70 px-4 py-3">
                <Button variant="success" size="sm" disabled={acting === decision.id} onClick={() => act(decision.id, 'approve')}>
                  <IconCheck className="h-3.5 w-3.5" /> Approve
                </Button>
                <Button variant="danger" size="sm" disabled={acting === decision.id} onClick={() => act(decision.id, 'reject')}>
                  <IconX className="h-3.5 w-3.5" /> Reject
                </Button>
                <Button variant="ghost" size="sm" disabled={acting === decision.id} onClick={() => act(decision.id, 'acknowledge')}>
                  Acknowledge
                </Button>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

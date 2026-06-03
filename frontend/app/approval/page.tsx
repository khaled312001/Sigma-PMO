'use client';

import { useCallback, useEffect, useState } from 'react';

import { useConfirm } from '../../components/ConfirmDialog';
import { useToast } from '../../components/ToastProvider';
import { AlertRecord, api, DecisionReview, GovernanceDecision } from '../../lib/api';
import { AuthGate } from '../../components/AuthGate';
import { useI18n } from '../../lib/i18n';
import { IconCheck, IconX } from '../../components/Icons';
import { Button, Card, EmptyState, PageHeader, Pill, SeverityBadge } from '../../components/ui';

interface Row {
  alert: AlertRecord;
  decision: GovernanceDecision;
  latestReview: DecisionReview | null;
}

export default function ApprovalPageRoute() {
  return <AuthGate capability="canEvaluateRules" surface="Approval"><ApprovalPage /></AuthGate>;
}

function ApprovalPage() {
  const { t } = useI18n();
  const toast = useToast();
  const confirm = useConfirm();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [acting, setActing] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [alerts, decisions] = await Promise.all([
        api<AlertRecord[]>('/rules/alerts?limit=200'),
        api<GovernanceDecision[]>('/governance/decisions?limit=500'),
      ]);
      const decByAlert = new Map<string, GovernanceDecision>();
      for (const d of decisions) if (!decByAlert.has(d.alertId)) decByAlert.set(d.alertId, d);

      const inFlight = alerts
        .map((a) => ({ a, d: decByAlert.get(a.id) }))
        .filter((p): p is { a: AlertRecord; d: GovernanceDecision } => p.d !== undefined);

      // One round-trip for all reviews (was N+1 — blew the 100/min throttler).
      const ids = inFlight.map(({ d }) => d.id);
      const reviewMap = ids.length === 0
        ? {}
        : await api<Record<string, DecisionReview[]>>(`/governance/reviews?decisionIds=${ids.join(',')}`);

      const pairs: Row[] = inFlight.map(({ a, d }) => ({
        alert: a,
        decision: d,
        latestReview: reviewMap[d.id]?.[0] ?? null,
      }));
      setRows(pairs);
    } catch (e) { toast.error('Failed to load decisions', (e as Error).message); }
  }, [toast]);

  useEffect(() => { void refresh(); }, [refresh]);

  const act = async (decisionId: string, action: 'approve' | 'reject' | 'acknowledge') => {
    if (action === 'reject') {
      const ok = await confirm({
        title: t('approval.rejectConfirmTitle'),
        description: t('approval.rejectConfirmBody'),
        confirmLabel: t('approval.reject'),
        destructive: true,
      });
      if (!ok) return;
    }
    setActing(decisionId);
    try {
      await api(`/governance/decisions/${decisionId}/review`, {
        method: 'POST', body: JSON.stringify({ action }),
      });
      toast.success(t('approval.actionDone', { action: t(`approval.${action}`) }));
      await refresh();
    } catch (e) { toast.error(t('approval.actionFailed'), (e as Error).message); }
    finally { setActing(null); }
  };

  const actionTone = (a: string) => (a === 'approve' ? 'emerald' : a === 'reject' ? 'rose' : 'slate') as 'emerald' | 'rose' | 'slate';

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow={t('approval.eyebrow')}
        title={t('approval.title')}
        description={t('approval.description')}
      />

      {!rows ? (
        <Card><p className="text-sm text-slate-400">{t('common.loading')}</p></Card>
      ) : rows.length === 0 ? (
        <EmptyState title={t('approval.noDecisions')} description={t('approval.noDecisionsHint')} />
      ) : (
        <div className="space-y-2">
          {rows.map(({ alert, decision, latestReview }) => (
            <article key={decision.id} className="rounded-xl border border-slate-800 bg-slate-900/40 transition hover:border-slate-700">
              <header className="flex flex-wrap items-center gap-2 px-4 py-3">
                <SeverityBadge severity={alert.severity} />
                <span className="font-mono text-xs text-slate-400" dir="ltr">{alert.code}</span>
                <Pill tone={decision.escalationLevel === 'L3' ? 'rose' : decision.escalationLevel === 'L2' ? 'amber' : 'slate'}>{decision.escalationLevel}</Pill>
                <Pill tone="slate">→ {decision.responsibleParty}</Pill>
                {latestReview && (
                  <span className="ms-auto flex items-center gap-2 text-[11px] text-slate-400">
                    <Pill tone={actionTone(latestReview.action)}>{t(`approval.${latestReview.action as 'approve'|'reject'|'acknowledge'}`)}</Pill>
                    {t('approval.by')} {latestReview.performedByDisplay ?? 'system'}
                    · {new Date(latestReview.createdAt).toLocaleString()}
                  </span>
                )}
              </header>
              <div className="px-4 pb-3 text-sm text-slate-100">{alert.summary}</div>
              {decision.fidicClause && (
                <p className="border-t border-slate-800/70 bg-slate-950/40 px-4 py-2 text-xs text-slate-300">
                  <span className="text-slate-400">FIDIC:</span> <strong className="text-slate-200" dir="ltr">{decision.fidicClause}</strong>
                </p>
              )}
              <div className="flex gap-2 border-t border-slate-800/70 px-4 py-3">
                <Button variant="success" size="sm" disabled={acting === decision.id} onClick={() => act(decision.id, 'approve')}>
                  <IconCheck className="h-3.5 w-3.5" /> {t('approval.approve')}
                </Button>
                <Button variant="danger" size="sm" disabled={acting === decision.id} onClick={() => act(decision.id, 'reject')}>
                  <IconX className="h-3.5 w-3.5" /> {t('approval.reject')}
                </Button>
                <Button variant="ghost" size="sm" disabled={acting === decision.id} onClick={() => act(decision.id, 'acknowledge')}>
                  {t('approval.acknowledge')}
                </Button>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

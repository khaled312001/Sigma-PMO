'use client';

import { useCallback, useEffect, useState } from 'react';

import { useConfirm } from '../../components/ConfirmDialog';
import { useToast } from '../../components/ToastProvider';
import { AlertRecord, api, DecisionReview, GovernanceDecision } from '../../lib/api';
import { useCurrentProjectKey } from '../../lib/project-context';
import { AuthGate } from '../../components/AuthGate';
import { DecisionCard } from '../../components/DecisionCard';
import { useI18n } from '../../lib/i18n';
import { IconCheck, IconX } from '../../components/Icons';
import { Button, Card, EmptyState, PageHeader, Pill } from '../../components/ui';

/**
 * GovernanceDecision enriched by GET /governance/decisions with the
 * approval-chain + escalation fields (defined locally — lib/api is shared).
 */
type ChainState = 'approved' | 'awaiting-second-approval' | 'rejected' | 'acknowledged' | 'pending';
interface ChainApproval { performedByDisplay: string | null; createdAt: string }
type EnrichedDecision = GovernanceDecision & {
  chainState?: ChainState;
  approvals?: ChainApproval[];
  requiresDualApproval?: boolean;
  approvalsRemaining?: number;
  pendingAgeDays?: number | null;
  escalateAfterDays?: number;
  escalated?: boolean;
};

interface Row {
  alert: AlertRecord;
  decision: EnrichedDecision;
  latestReview: DecisionReview | null;
}

export default function ApprovalPageRoute() {
  return <AuthGate capability="canEvaluateRules" surface="Approval"><ApprovalPage /></AuthGate>;
}

function ApprovalPage() {
  const { t } = useI18n();
  const projectKey = useCurrentProjectKey();
  const toast = useToast();
  const confirm = useConfirm();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [acting, setActing] = useState<string | null>(null);

  // Scoped to the selected project via the alerts side of the join; the
  // decisions list narrows to alerts in scope automatically (inFlight pairs).
  const refresh = useCallback(async () => {
    try {
      const [alerts, decisions] = await Promise.all([
        api<AlertRecord[]>(`/rules/alerts?limit=200&projectKey=${encodeURIComponent(projectKey)}`),
        api<EnrichedDecision[]>('/governance/decisions?limit=500'),
      ]);
      const decByAlert = new Map<string, EnrichedDecision>();
      for (const d of decisions) if (!decByAlert.has(d.alertId)) decByAlert.set(d.alertId, d);

      const inFlight = alerts
        .map((a) => ({ a, d: decByAlert.get(a.id) }))
        .filter((p): p is { a: AlertRecord; d: EnrichedDecision } => p.d !== undefined);

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
  }, [toast, projectKey]);

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
      const result = await api<{ chainState?: ChainState; approvalsRemaining?: number }>(
        `/governance/decisions/${decisionId}/review`,
        { method: 'POST', body: JSON.stringify({ action }) },
      );
      if (result.chainState === 'awaiting-second-approval') {
        toast.success('First approval recorded', 'A second, distinct approver is required for this critical decision.');
      } else {
        toast.success(t('approval.actionDone', { action: t(`approval.${action}`) }));
      }
      await refresh();
    } catch (e) {
      const msg = (e as Error).message;
      // 409: same actor cannot supply both approvals on a critical decision.
      if (/already carries your approval|second.*approver/i.test(msg)) {
        toast.error('Second approver required', 'You already approved this critical decision — a different approver must confirm it.');
      } else {
        toast.error(t('approval.actionFailed'), msg);
      }
    }
    finally { setActing(null); }
  };

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
        <div className="space-y-3">
          {rows.map(({ alert, decision, latestReview }) => (
            <DecisionCard
              key={decision.id}
              alert={alert}
              decision={decision}
              latestReview={latestReview}
              actions={<div className="flex w-full flex-col gap-3">
                <ChainBar decision={decision} />
                <div className="flex flex-wrap gap-2">
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
              </div>}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Approval-chain status strip. For critical decisions it shows an "N/2
 * approvals" progress + a second-approver hint; non-critical decisions show a
 * single-approval state. Escalated (overdue + still pending) decisions get a
 * red "ESCALATED · Nd" pill.
 */
function ChainBar({ decision }: { decision: EnrichedDecision }) {
  const dual = decision.requiresDualApproval ?? false;
  const required = dual ? 2 : 1;
  const remaining = decision.approvalsRemaining ?? required;
  const have = Math.max(0, required - remaining);
  const state = decision.chainState ?? 'pending';

  const stateTone =
    state === 'approved' ? 'emerald'
    : state === 'rejected' ? 'rose'
    : state === 'awaiting-second-approval' ? 'amber'
    : 'slate';
  const stateLabel =
    state === 'awaiting-second-approval' ? 'Awaiting 2nd approval'
    : state === 'approved' ? 'Approved'
    : state === 'rejected' ? 'Rejected'
    : state === 'acknowledged' ? 'Acknowledged'
    : 'Pending';

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Pill tone={stateTone}>{stateLabel}</Pill>
      {dual && (
        <span className="inline-flex items-center gap-1 text-[11px] text-slate-300">
          <span className="font-mono tabular-nums">{have}/{required} approvals</span>
          <span className="flex items-center gap-0.5">
            {Array.from({ length: required }).map((_, i) => (
              <span
                key={i}
                className={`h-1.5 w-5 rounded-full ${i < have ? 'bg-emerald-400' : 'bg-slate-700'}`}
              />
            ))}
          </span>
        </span>
      )}
      {dual && state === 'awaiting-second-approval' && (
        <span className="text-[11px] text-amber-300">Needs a second, distinct approver</span>
      )}
      {(decision.approvals?.length ?? 0) > 0 && (
        <span className="text-[11px] text-slate-400" dir="auto">
          by {decision.approvals!.map((a) => a.performedByDisplay ?? '—').join(', ')}
        </span>
      )}
      {decision.escalated && (
        <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/15 px-2 py-0.5 text-[11px] font-semibold text-rose-200 ring-1 ring-rose-500/50">
          ESCALATED · {decision.pendingAgeDays ?? '?'}d
        </span>
      )}
    </div>
  );
}

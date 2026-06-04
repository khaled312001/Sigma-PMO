'use client';

import { AlertRecord, DecisionReview, GovernanceDecision } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { IconCheck, IconList } from './Icons';
import { Pill, SeverityBadge } from './ui';

/**
 * Shared visual for "alert + governance decision" pairs. Used on Review
 * (read-only context) and on Approval (with action footer). Replaces the
 * inline render that previously concatenated the FIDIC clause + notice +
 * intervention list into the same paragraph block.
 *
 * Visual structure:
 *  - Header: severity badge | mono rule code | escalation level | party chip
 *            | latest-review chip (right-aligned)
 *  - Body: alert summary as the primary text
 *  - FIDIC block: clause + deadline as a chip row, notice text as the body
 *  - Interventions: numbered emerald check-marked list
 *  - Optional action footer (Approve / Reject / Acknowledge)
 *  - Optional latest-review timeline footer
 */
export function DecisionCard({
  alert,
  decision,
  latestReview = null,
  actions = null,
}: {
  alert: AlertRecord;
  decision?: GovernanceDecision | null;
  latestReview?: DecisionReview | null;
  actions?: React.ReactNode;
}) {
  const { t } = useI18n();
  const severityAccent = alert.severity === 'critical'
    ? 'border-s-rose-500/70'
    : alert.severity === 'warning'
      ? 'border-s-amber-500/70'
      : 'border-s-sky-500/70';
  const reviewTone = latestReview?.action === 'approve' ? 'emerald'
                   : latestReview?.action === 'reject' ? 'rose'
                   : latestReview?.action === 'acknowledge' ? 'slate'
                   : 'slate';

  return (
    <article className={`overflow-hidden rounded-xl border border-slate-800 border-s-4 ${severityAccent} bg-slate-950/40 transition hover:border-slate-700`}>
      {/* Header */}
      <header className="flex flex-wrap items-center gap-2 border-b border-slate-800/70 bg-slate-900/40 px-4 py-2.5">
        <SeverityBadge severity={alert.severity} />
        <code className="font-mono text-[11px] text-slate-300" dir="ltr">{alert.code}</code>
        {decision && (
          <>
            <Pill tone={decision.escalationLevel === 'L3' ? 'rose' : decision.escalationLevel === 'L2' ? 'amber' : 'slate'}>{decision.escalationLevel}</Pill>
            <Pill tone="slate">→ {decision.responsibleParty}</Pill>
          </>
        )}
        {latestReview && (
          <span className="ms-auto inline-flex items-center gap-1.5 text-[11px] text-slate-400">
            <Pill tone={reviewTone}>{t(`decisions.statuses.${latestReview.action as 'approve' | 'reject' | 'acknowledge'}`)}</Pill>
            <span dir="auto">
              {t('approval.by')} {latestReview.performedByDisplay ?? '—'} · {new Date(latestReview.createdAt).toLocaleString()}
            </span>
          </span>
        )}
      </header>

      {/* Summary */}
      <div className="px-4 py-3">
        <p className="text-[15px] leading-relaxed text-slate-100" dir="auto">{alert.summary}</p>
      </div>

      {/* FIDIC block */}
      {decision?.fidicClause && (
        <div className="space-y-2 border-t border-slate-800/70 bg-slate-950/30 px-4 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">FIDIC</span>
            <strong className="text-sm font-semibold text-slate-100" dir="ltr">{decision.fidicClause}</strong>
            {decision.fidicDeadlineDays != null && (
              <Pill tone="amber">{decision.fidicDeadlineDays}d</Pill>
            )}
          </div>
          {decision.fidicNotice && (
            <p className="text-xs leading-relaxed text-slate-300" dir="auto">{decision.fidicNotice}</p>
          )}
          {decision.notifyParties.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Notify</span>
              {decision.notifyParties.map((p) => <Pill key={p} tone="slate">{p}</Pill>)}
            </div>
          )}
        </div>
      )}

      {/* Interventions */}
      {decision && decision.interventions.length > 0 && (
        <div className="border-t border-slate-800/70 px-4 py-3">
          <div className="mb-1.5 flex items-center gap-1.5">
            <IconList className="h-3 w-3 text-emerald-400" />
            <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-300">
              {t('admin.policy.sections.intervention')}
            </span>
          </div>
          <ul className="space-y-1.5">
            {decision.interventions.map((i, idx) => (
              <li key={idx} className="flex items-start gap-2 text-sm text-slate-200">
                <div className="mt-1 grid h-4 w-4 shrink-0 place-items-center rounded-sm bg-emerald-500/15 ring-1 ring-emerald-500/40">
                  <IconCheck className="h-2.5 w-2.5 text-emerald-300" />
                </div>
                <span dir="auto">{i}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Action footer (Approval) */}
      {actions && (
        <footer className="flex flex-wrap gap-2 border-t border-slate-800/70 bg-slate-900/30 px-4 py-3">
          {actions}
        </footer>
      )}
    </article>
  );
}

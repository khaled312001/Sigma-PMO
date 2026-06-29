'use client';

import { useEffect, useState } from 'react';

import { api } from '../../lib/api';
import { useI18n } from '../../lib/i18n';
import { Button, ConfidenceBar, Pill } from '../../components/ui';

/**
 * Decision-envelope shape from GET /governance/decisions/:id/envelope (Req R7).
 * Defined locally — lib/api is shared and this is a governance-only surface.
 */
export interface DecisionEnvelope {
  decisionId: string;
  alertId: string;
  category: DecisionCategory;
  recommendation: { summary: string; interventions: string[] };
  confidence: { overall: number | null; breakdown?: Record<string, unknown> | null; source: 'agent-execution' | 'confidence-score' | null };
  sourceEvidence: { alertId: string; alertCode: string | null; ingestionRunId: string | null; sourceFileId: string | null; evidenceRefs: string[] };
  reason: string;
  alternatives: string[];
  responsibleParty: string;
  fidicClause: string | null;
  escalationLevel: string;
  requiresHumanApproval: true;
  autoApprovalBlocked: boolean;
  approval: { status: string; approvals: { by: string | null; at: string; action: string }[]; awaitingSecondApprover: boolean };
}

export type DecisionCategory =
  | 'financial' | 'contractual' | 'safety' | 'schedule' | 'quality' | 'operational' | 'general';

const BLOCKED: ReadonlySet<DecisionCategory> = new Set(['financial', 'contractual', 'safety']);

/** Bilingual label + pill tone per category. */
const CATEGORY_META: Record<DecisionCategory, { en: string; ar: string; tone: 'rose' | 'amber' | 'violet' | 'sky' | 'slate' | 'emerald' }> = {
  financial:   { en: 'Financial',   ar: 'مالي',      tone: 'rose' },
  contractual: { en: 'Contractual', ar: 'تعاقدي',     tone: 'amber' },
  safety:      { en: 'Safety',      ar: 'سلامة',      tone: 'rose' },
  schedule:    { en: 'Schedule',    ar: 'جدول زمني',  tone: 'sky' },
  quality:     { en: 'Quality',     ar: 'جودة',       tone: 'violet' },
  operational: { en: 'Operational', ar: 'تشغيلي',     tone: 'slate' },
  general:     { en: 'General',     ar: 'عام',         tone: 'slate' },
};

/** Category badge — usable inline on a card header without fetching the envelope. */
export function CategoryBadge({ category, ar }: { category: DecisionCategory | string | null | undefined; ar: boolean }) {
  if (!category) return null;
  const meta = CATEGORY_META[category as DecisionCategory] ?? CATEGORY_META.general;
  return <Pill tone={meta.tone}>{ar ? meta.ar : meta.en}</Pill>;
}

/** Compact, always-visible "requires human approval / no auto-approval" status. */
export function HumanApprovalNotice({
  category,
  autoApprovalBlocked,
  ar,
}: {
  category?: DecisionCategory | string | null;
  autoApprovalBlocked?: boolean;
  ar: boolean;
}) {
  const blocked = autoApprovalBlocked ?? (category != null && BLOCKED.has(category as DecisionCategory));
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-semibold text-amber-100 ring-1 ring-amber-400/60">
        {ar ? 'يتطلب موافقة بشرية' : 'Requires human approval'}
      </span>
      {blocked && (
        <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/15 px-2 py-0.5 text-[11px] font-semibold text-rose-100 ring-1 ring-rose-400/60">
          {ar ? 'لا اعتماد آلي' : 'No auto-approval'}
        </span>
      )}
    </div>
  );
}

/**
 * Expandable recommendation envelope (Req R7). A "Why / Details" toggle fetches
 * GET /governance/decisions/:id/envelope and renders, in Mr. Ayham's required
 * format: category, confidence (bar + source), source evidence (alert code +
 * file/run), reason (rationale), alternatives (interventions), and the explicit
 * "requires human approval / no auto-approval" status with the approval audit.
 */
export function RecommendationEnvelope({ decisionId, ar, defaultOpen = false }: { decisionId: string; ar: boolean; defaultOpen?: boolean }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(defaultOpen);
  const [env, setEnv] = useState<DecisionEnvelope | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    if (env || loading) return;
    setLoading(true); setError(null);
    try {
      const result = await api<DecisionEnvelope>(`/governance/decisions/${decisionId}/envelope`);
      setEnv(result);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  // Eager-load when rendered already-open (decisions detail card).
  useEffect(() => { if (open) void load(); /* eslint-disable-line react-hooks/exhaustive-deps */ }, [open]);

  const toggle = async () => {
    if (open) { setOpen(false); return; }
    setOpen(true);
    await load();
  };

  return (
    <div className="w-full">
      {!defaultOpen && (
        <Button variant="ghost" size="sm" onClick={() => void toggle()}>
          {open ? (ar ? 'إخفاء التفاصيل' : 'Hide details') : (ar ? 'لماذا؟ التفاصيل' : 'Why? Details')}
        </Button>
      )}

      {open && (
        <div className="mt-2 rounded-lg border border-slate-800 bg-slate-950/40 p-3 text-sm">
          {loading ? (
            <p className="text-xs text-slate-400">{t('common.loading')}</p>
          ) : error ? (
            <p className="text-xs text-rose-300">{error}</p>
          ) : env ? (
            <EnvelopeBody env={env} ar={ar} />
          ) : null}
        </div>
      )}
    </div>
  );
}

function EnvelopeBody({ env, ar }: { env: DecisionEnvelope; ar: boolean }) {
  return (
    <div className="space-y-3" dir={ar ? 'rtl' : 'ltr'}>
      {/* Category + recommend-vs-decide banner */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
          {ar ? 'توصية (المنصّة لا تقرّر)' : 'Recommendation (the platform does not decide)'}
        </span>
        <CategoryBadge category={env.category} ar={ar} />
        <HumanApprovalNotice category={env.category} autoApprovalBlocked={env.autoApprovalBlocked} ar={ar} />
      </div>

      {/* Confidence */}
      <Field label={ar ? 'درجة الثقة' : 'Confidence'}>
        <div className="flex flex-wrap items-center gap-2">
          <ConfidenceBar value={env.confidence.overall} />
          <span className="text-[10px] text-slate-500" dir="ltr">
            {env.confidence.source ?? (ar ? 'غير متوفّرة' : 'unavailable')}
          </span>
        </div>
      </Field>

      {/* Source evidence */}
      <Field label={ar ? 'مصدر الإثبات' : 'Source evidence'}>
        <div className="flex flex-wrap items-center gap-1.5">
          {env.sourceEvidence.alertCode && (
            <code className="rounded bg-slate-900 px-1.5 py-0.5 font-mono text-[10px] text-slate-200" dir="ltr">{env.sourceEvidence.alertCode}</code>
          )}
          {env.sourceEvidence.evidenceRefs.length > 0
            ? env.sourceEvidence.evidenceRefs.map((r) => (
                <code key={r} className="rounded bg-slate-900 px-1.5 py-0.5 font-mono text-[10px] text-slate-400" dir="ltr">{r}</code>
              ))
            : <span className="text-[11px] text-slate-500">—</span>}
        </div>
      </Field>

      {/* Reason (rationale) */}
      <Field label={ar ? 'السبب' : 'Reason'}>
        <p className="text-xs leading-relaxed text-slate-300" dir="auto">{env.reason}</p>
      </Field>

      {/* Alternatives (interventions) */}
      <Field label={ar ? 'البدائل' : 'Alternatives'}>
        {env.alternatives.length > 0 ? (
          <ul className="list-inside list-disc space-y-0.5">
            {env.alternatives.map((a, i) => (
              <li key={i} className="text-xs text-slate-300" dir="auto">{a}</li>
            ))}
          </ul>
        ) : <span className="text-[11px] text-slate-500">—</span>}
      </Field>

      {/* Approval audit (who / when / action) */}
      <Field label={ar ? 'سجلّ الموافقة' : 'Approval record'}>
        {env.approval.approvals.length > 0 ? (
          <ul className="space-y-0.5">
            {env.approval.approvals.map((a, i) => (
              <li key={i} className="text-[11px] text-slate-300" dir="auto">
                <span className="text-emerald-300">{ar ? 'موافقة' : 'approve'}</span>
                {' · '}{a.by ?? '—'}{' · '}<span dir="ltr">{new Date(a.at).toLocaleString()}</span>
              </li>
            ))}
          </ul>
        ) : (
          <span className="text-[11px] text-slate-400">
            {ar ? 'بانتظار موافقة بشرية — لم يُعتمَد بعد.' : 'Awaiting human approval — not approved yet.'}
          </span>
        )}
        {env.approval.awaitingSecondApprover && (
          <p className="mt-1 text-[11px] text-amber-300">{ar ? 'يلزم معتمِد ثانٍ مختلف.' : 'A second, distinct approver is required.'}</p>
        )}
      </Field>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">{label}</div>
      {children}
    </div>
  );
}

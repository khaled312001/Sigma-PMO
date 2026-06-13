'use client';

import { useEffect, useMemo, useState } from 'react';

import { useToast } from '../../components/ToastProvider';
import { AlertRecord, api, DecisionReview, GovernanceDecision } from '../../lib/api';
import { useCurrentProjectKey } from '../../lib/project-context';
import { AuthGate } from '../../components/AuthGate';
import { DataTable } from '../../components/DataTable';
import { SkeletonRow } from '../../components/Skeleton';
import { useI18n } from '../../lib/i18n';
import { Button, Card, EmptyState, PageHeader, Pill, SeverityBadge } from '../../components/ui';

export default function DecisionsPageRoute() {
  return <AuthGate surface="Decisions"><DecisionsPage /></AuthGate>;
}

type StatusKey = 'pending' | 'approve' | 'reject' | 'acknowledge';

/**
 * Decision-template families (mirror of the backend catalog). Matched by
 * longest-prefix so a sub-code inherits its family chip. Title + clause only —
 * the authoritative source is GET /governance/decision-templates.
 */
const TEMPLATE_FAMILIES: { codePrefix: string; title: string; titleAr: string; fidicClause: string | null }[] = [
  { codePrefix: 'SCHEDULE_FINISH_SLIPPED', title: 'Schedule slip', titleAr: 'انزلاق الجدول', fidicClause: 'Sub-Clause 8.5 / 20.1' },
  { codePrefix: 'SCHEDULE_BEHIND_PLAN', title: 'Behind plan', titleAr: 'تأخر عن الخطة', fidicClause: 'Sub-Clause 8.6' },
  { codePrefix: 'COST_OVERRUN', title: 'Cost overrun', titleAr: 'تجاوز التكلفة', fidicClause: 'Sub-Clause 13 / 14' },
  { codePrefix: 'DURATION_OVERRUN', title: 'Duration overrun', titleAr: 'تجاوز المدة', fidicClause: 'Sub-Clause 8.4 / 8.5' },
  { codePrefix: 'RESOURCE_UNDERUSE', title: 'Resource under-use', titleAr: 'نقص استغلال الموارد', fidicClause: 'Sub-Clause 8.3 / 8.6' },
  { codePrefix: 'BASELINE_DURATION_OUTLIER', title: 'Baseline outlier', titleAr: 'شذوذ في خط الأساس', fidicClause: 'Sub-Clause 8.3' },
  { codePrefix: 'STALE_REPORTING', title: 'Stale reporting', titleAr: 'تقارير متقادمة', fidicClause: 'Sub-Clause 4.21' },
  { codePrefix: 'REPORTED_VS_SCHEDULE_MISMATCH', title: 'Reported vs schedule', titleAr: 'تعارض المُبلّغ مع الجدول', fidicClause: 'Sub-Clause 4.21 / 14.3' },
  { codePrefix: 'MISSING_WEEKLY_REPORT', title: 'Missing weekly', titleAr: 'غياب التقرير الأسبوعي', fidicClause: 'Sub-Clause 4.21' },
  { codePrefix: 'DATA_COMPLETENESS', title: 'Data completeness', titleAr: 'اكتمال البيانات', fidicClause: 'Sub-Clause 4.21' },
];

function templateForCode(code: string): { title: string; titleAr: string; fidicClause: string | null } | null {
  let best: { codePrefix: string; title: string; titleAr: string; fidicClause: string | null } | null = null;
  for (const t of TEMPLATE_FAMILIES) {
    if (code.startsWith(t.codePrefix) && (!best || t.codePrefix.length > best.codePrefix.length)) best = t;
  }
  return best;
}

/** Trace chain shape from GET /governance/decisions/:id/trace (local — lib/api is shared). */
interface DecisionTrace {
  decision: { id: string; responsibleParty: string; escalationLevel: string; fidicClause: string | null; rationale: string; createdAt: string };
  alert: { id: string; code: string; severity: string; summary: string; createdAt: string } | null;
  ruleEvaluation: { id: string; status: string; startedAt: string; finishedAt: string | null; alertCount: number } | null;
  ingestionRun: { id: string; parser: string; status: string; finishedAt: string | null } | null;
  sourceFile: { id: string; filename: string; contentSha256: string; byteSize: number } | null;
  confidence: { overall: number; completeness: number; consistency: number; sourceReliability: number } | null;
}

interface DecisionRow {
  id: string;
  createdAt: Date;
  severity: 'critical' | 'warning' | 'info';
  code: string;
  party: string;
  clause: string | null;
  level: string;
  status: StatusKey;
  alertId: string;
  alertSummary: string;
  template: { title: string; titleAr: string; fidicClause: string | null } | null;
}

function DecisionsPage() {
  const { t, lang } = useI18n();
  const ar = lang === 'ar';
  const projectKey = useCurrentProjectKey();
  const toast = useToast();
  const [decisions, setDecisions] = useState<GovernanceDecision[] | null>(null);
  const [alerts, setAlerts] = useState<AlertRecord[] | null>(null);
  const [reviewsByDecision, setReviewsByDecision] = useState<Record<string, DecisionReview[]>>({});
  const [filter, setFilter] = useState<'all' | StatusKey | 'critical'>('all');
  const [traceFor, setTraceFor] = useState<string | null>(null);
  const [trace, setTrace] = useState<DecisionTrace | null>(null);
  const [traceLoading, setTraceLoading] = useState(false);

  const openTrace = async (decisionId: string) => {
    if (traceFor === decisionId) { setTraceFor(null); setTrace(null); return; }
    setTraceFor(decisionId); setTrace(null); setTraceLoading(true);
    try {
      const result = await api<DecisionTrace>(`/governance/decisions/${decisionId}/trace`);
      setTrace(result);
    } catch (e) { toast.error(ar ? 'تعذّر تحميل مسار الإثبات' : 'Failed to load trace', (e as Error).message); }
    finally { setTraceLoading(false); }
  };

  // Alerts are fetched project-scoped; decisions are then narrowed to the
  // ones whose alert belongs to the selected project (the decisions API has
  // no project filter — the alert is the project anchor).
  useEffect(() => {
    Promise.all([
      api<GovernanceDecision[]>('/governance/decisions?limit=500'),
      api<AlertRecord[]>(`/rules/alerts?limit=500&projectKey=${encodeURIComponent(projectKey)}`),
    ]).then(async ([d, a]) => {
      const inScope = new Set(a.map((x) => x.id));
      const scoped = d.filter((x) => inScope.has(x.alertId));
      setDecisions(scoped); setAlerts(a);
      const ids = scoped.map((x) => x.id);
      if (ids.length > 0) {
        try {
          const map = await api<Record<string, DecisionReview[]>>(`/governance/reviews?decisionIds=${ids.join(',')}`);
          setReviewsByDecision(map);
        } catch { setReviewsByDecision({}); }
      } else {
        setReviewsByDecision({});
      }
    }).catch(() => { setDecisions([]); setAlerts([]); });
  }, [projectKey]);

  const alertById = useMemo(() => {
    const m = new Map<string, AlertRecord>();
    for (const a of alerts ?? []) m.set(a.id, a);
    return m;
  }, [alerts]);

  const rows: DecisionRow[] = useMemo(() => {
    if (!decisions) return [];
    return decisions.map((d) => {
      const al = alertById.get(d.alertId);
      const rev = reviewsByDecision[d.id]?.[0];
      const status: StatusKey = (rev?.action as StatusKey | undefined) ?? 'pending';
      return {
        id: d.id,
        createdAt: new Date(d.createdAt),
        severity: (al?.severity ?? 'info') as DecisionRow['severity'],
        code: al?.code ?? '—',
        party: d.responsibleParty,
        clause: d.fidicClause,
        level: d.escalationLevel,
        status,
        alertId: d.alertId,
        alertSummary: al?.summary ?? '',
        template: al?.code ? templateForCode(al.code) : null,
      };
    });
  }, [decisions, alertById, reviewsByDecision]);

  const filtered = useMemo(() => {
    if (filter === 'all') return rows;
    if (filter === 'critical') return rows.filter((r) => r.severity === 'critical');
    return rows.filter((r) => r.status === filter);
  }, [rows, filter]);

  const counts = useMemo(() => ({
    all: rows.length,
    pending: rows.filter((r) => r.status === 'pending').length,
    approve: rows.filter((r) => r.status === 'approve').length,
    reject: rows.filter((r) => r.status === 'reject').length,
    acknowledge: rows.filter((r) => r.status === 'acknowledge').length,
    critical: rows.filter((r) => r.severity === 'critical').length,
  }), [rows]);

  const ready = decisions !== null && alerts !== null;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t('decisions.eyebrow')}
        title={t('decisions.title')}
        description={t('decisions.description')}
      />

      {/* Filter chip row */}
      <div className="flex flex-wrap items-center gap-1.5">
        {(['all', 'pending', 'critical', 'approve', 'reject', 'acknowledge'] as const).map((k) => {
          const label = k === 'all' ? t('review.filter.all')
                      : k === 'critical' ? t('decisions.headers.severity') + ': ' + t('common.severity.critical')
                      : t(`decisions.statuses.${k}`);
          return (
            <button
              key={k}
              onClick={() => setFilter(k)}
              aria-pressed={filter === k}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition ${
                filter === k
                  ? 'border-sky-500/50 bg-sky-500/15 text-sky-200'
                  : 'border-slate-800 bg-slate-900/40 text-slate-300 hover:border-slate-600'
              }`}
            >
              <span>{label}</span>
              <span className="rounded bg-slate-800/80 px-1 py-0.5 font-mono text-[9px] text-slate-400">{counts[k]}</span>
            </button>
          );
        })}
      </div>

      {ready ? (
        <DataTable
          rows={filtered}
          rowKey={(r) => r.id}
          searchable
          searchPlaceholder={t('decisions.search')}
          searchAccessor={(r) => `${r.code} ${r.party} ${r.clause ?? ''} ${r.alertSummary}`}
          initialSort={{ key: 'createdAt', dir: 'desc' }}
          emptyTitle={t('decisions.empty.title')}
          emptyDescription={t('decisions.empty.description')}
          columns={[
            {
              key: 'createdAt', label: t('decisions.headers.when'), width: '12rem',
              render: (r) => <span className="text-xs text-slate-300" dir="ltr">{r.createdAt.toLocaleString()}</span>,
              accessor: (r) => r.createdAt.getTime(),
            },
            {
              key: 'severity', label: t('decisions.headers.severity'), width: '6rem',
              render: (r) => <SeverityBadge severity={r.severity} />,
              accessor: (r) => ({ critical: 3, warning: 2, info: 1 } as const)[r.severity],
            },
            {
              key: 'code', label: t('decisions.headers.code'),
              render: (r) => <span className="font-mono text-[11px] text-slate-200" dir="ltr">{r.code}</span>,
              hideOnMobile: true,
            },
            {
              key: 'template', label: ar ? 'النموذج' : 'Template', width: '10rem', sortable: false,
              render: (r) => r.template
                ? <Pill tone="violet">{ar ? r.template.titleAr : r.template.title}</Pill>
                : <span className="text-slate-500">—</span>,
              hideOnMobile: true,
            },
            {
              key: 'party', label: t('decisions.headers.party'), width: '8rem',
              render: (r) => <Pill tone="slate">{r.party}</Pill>,
            },
            {
              key: 'clause', label: t('decisions.headers.clause'), width: '11rem',
              render: (r) => r.clause ? <span className="text-xs text-slate-200" dir="ltr">{r.clause}</span> : <span className="text-slate-500">—</span>,
              hideOnMobile: true,
            },
            {
              key: 'level', label: t('decisions.headers.escalation'), width: '5rem', align: 'center',
              render: (r) => <Pill tone={r.level === 'L3' ? 'rose' : r.level === 'L2' ? 'amber' : 'slate'}>{r.level}</Pill>,
              hideOnMobile: true,
            },
            {
              key: 'status', label: t('decisions.headers.status'), width: '8rem',
              render: (r) => <Pill tone={r.status === 'approve' ? 'emerald' : r.status === 'reject' ? 'rose' : r.status === 'acknowledge' ? 'slate' : 'amber'}>{t(`decisions.statuses.${r.status}`)}</Pill>,
              accessor: (r) => r.status,
            },
            {
              key: 'trace', label: ar ? 'الإثبات' : 'Trace', width: '6rem', align: 'center', sortable: false,
              render: (r) => (
                <Button variant="ghost" size="sm" onClick={() => void openTrace(r.id)}>
                  {traceFor === r.id ? (ar ? 'إخفاء' : 'Hide') : (ar ? 'الإثبات' : 'Trace')}
                </Button>
              ),
            },
          ]}
        />
      ) : (
        <Card padded={false}>
          {Array.from({ length: 6 }).map((_, i) => <SkeletonRow key={i} cols={5} />)}
        </Card>
      )}

      {traceFor && (
        <Card
          title={ar ? 'مسار الإثبات' : 'Evidence path'}
          hint={ar ? 'القرار ← الإنذار ← التقييم ← الاستيراد ← المصدر · درجة الثقة' : 'decision → alert → evaluation → ingestion → source · confidence'}
        >
          {traceLoading ? (
            <p className="text-sm text-slate-400">{t('common.loading')}</p>
          ) : trace ? (
            <TracePath trace={trace} ar={ar} />
          ) : (
            <EmptyState
              title={ar ? 'لا يوجد مسار إثبات' : 'No trace'}
              description={ar ? 'تعذّر تجميع سلسلة إثبات لهذا القرار.' : 'No evidence chain could be assembled for this decision.'}
            />
          )}
        </Card>
      )}
    </div>
  );
}

/** Vertical evidence path rendering of a decision trace. */
function TracePath({ trace, ar }: { trace: DecisionTrace; ar: boolean }) {
  const steps: { label: string; tone: 'violet' | 'rose' | 'amber' | 'sky' | 'emerald' | 'slate'; body: React.ReactNode }[] = [
    {
      label: ar ? 'القرار' : 'Decision', tone: 'violet',
      body: <>
        <span className="text-slate-200">{trace.decision.responsibleParty}</span>
        {' · '}<Pill tone={trace.decision.escalationLevel === 'L3' ? 'rose' : trace.decision.escalationLevel === 'L2' ? 'amber' : 'slate'}>{trace.decision.escalationLevel}</Pill>
        {trace.decision.fidicClause ? <span className="ml-2 text-xs text-slate-400" dir="ltr">{trace.decision.fidicClause}</span> : null}
        <p className="mt-1 text-xs text-slate-400">{trace.decision.rationale}</p>
      </>,
    },
    {
      label: ar ? 'الإنذار' : 'Alert', tone: 'rose',
      body: trace.alert
        ? <><span className="font-mono text-[11px] text-slate-200" dir="ltr">{trace.alert.code}</span> · <span className="text-xs text-slate-300">{trace.alert.severity}</span><p className="mt-1 text-xs text-slate-400">{trace.alert.summary}</p></>
        : <span className="text-slate-500">—</span>,
    },
    {
      label: ar ? 'تقييم القاعدة' : 'Rule evaluation', tone: 'amber',
      body: trace.ruleEvaluation
        ? <span className="text-xs text-slate-300" dir="ltr">{trace.ruleEvaluation.status} · {trace.ruleEvaluation.alertCount} {ar ? 'إنذار' : 'alert(s)'} · {new Date(trace.ruleEvaluation.startedAt).toLocaleString()}</span>
        : <span className="text-slate-500">—</span>,
    },
    {
      label: ar ? 'عملية الاستيراد' : 'Ingestion run', tone: 'sky',
      body: trace.ingestionRun
        ? <span className="text-xs text-slate-300" dir="ltr">{trace.ingestionRun.parser} · {trace.ingestionRun.status}</span>
        : <span className="text-slate-500">—</span>,
    },
    {
      label: ar ? 'الملف المصدر' : 'Source file', tone: 'slate',
      body: trace.sourceFile
        ? <><span className="text-xs text-slate-200" dir="ltr">{trace.sourceFile.filename}</span><p className="mt-0.5 font-mono text-[10px] text-slate-500" dir="ltr">sha256 {trace.sourceFile.contentSha256.slice(0, 16)}… · {trace.sourceFile.byteSize} B</p></>
        : <span className="text-slate-500">—</span>,
    },
    {
      label: ar ? 'درجة الثقة' : 'Confidence', tone: 'emerald',
      body: trace.confidence
        ? <span className="text-xs text-slate-300" dir={ar ? 'rtl' : 'ltr'}>{ar ? 'الإجمالية' : 'overall'} {(trace.confidence.overall * 100).toFixed(0)}% · {ar ? 'الاكتمال' : 'completeness'} {(trace.confidence.completeness * 100).toFixed(0)}% · {ar ? 'الاتساق' : 'consistency'} {(trace.confidence.consistency * 100).toFixed(0)}%</span>
        : <span className="text-slate-500">—</span>,
    },
  ];
  return (
    <ol className="space-y-3">
      {steps.map((s, i) => (
        <li key={s.label} className="flex gap-3">
          <div className="flex flex-col items-center">
            <span className={`mt-1 h-2.5 w-2.5 rounded-full ${dotClass(s.tone)}`} />
            {i < steps.length - 1 && <span className="mt-1 w-px flex-1 bg-slate-700" />}
          </div>
          <div className="min-w-0 flex-1 pb-1">
            <div className="mb-0.5 text-[11px] uppercase tracking-wide text-slate-400">{s.label}</div>
            <div className="text-sm text-slate-200">{s.body}</div>
          </div>
        </li>
      ))}
    </ol>
  );
}

function dotClass(tone: string): string {
  switch (tone) {
    case 'violet': return 'bg-violet-400';
    case 'rose': return 'bg-rose-400';
    case 'amber': return 'bg-amber-400';
    case 'sky': return 'bg-sky-400';
    case 'emerald': return 'bg-emerald-400';
    default: return 'bg-slate-400';
  }
}

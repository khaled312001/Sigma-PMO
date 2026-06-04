'use client';

import { useEffect, useMemo, useState } from 'react';

import { AlertRecord, api, DecisionReview, GovernanceDecision } from '../../lib/api';
import { AuthGate } from '../../components/AuthGate';
import { DataTable } from '../../components/DataTable';
import { SkeletonRow } from '../../components/Skeleton';
import { useI18n } from '../../lib/i18n';
import { Card, PageHeader, Pill, SeverityBadge } from '../../components/ui';

export default function DecisionsPageRoute() {
  return <AuthGate surface="Decisions"><DecisionsPage /></AuthGate>;
}

type StatusKey = 'pending' | 'approve' | 'reject' | 'acknowledge';

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
}

function DecisionsPage() {
  const { t } = useI18n();
  const [decisions, setDecisions] = useState<GovernanceDecision[] | null>(null);
  const [alerts, setAlerts] = useState<AlertRecord[] | null>(null);
  const [reviewsByDecision, setReviewsByDecision] = useState<Record<string, DecisionReview[]>>({});
  const [filter, setFilter] = useState<'all' | StatusKey | 'critical'>('all');

  useEffect(() => {
    Promise.all([
      api<GovernanceDecision[]>('/governance/decisions?limit=500'),
      api<AlertRecord[]>('/rules/alerts?limit=500'),
    ]).then(async ([d, a]) => {
      setDecisions(d); setAlerts(a);
      const ids = d.map((x) => x.id);
      if (ids.length > 0) {
        try {
          const map = await api<Record<string, DecisionReview[]>>(`/governance/reviews?decisionIds=${ids.join(',')}`);
          setReviewsByDecision(map);
        } catch { setReviewsByDecision({}); }
      }
    }).catch(() => { setDecisions([]); setAlerts([]); });
  }, []);

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
          ]}
        />
      ) : (
        <Card padded={false}>
          {Array.from({ length: 6 }).map((_, i) => <SkeletonRow key={i} cols={5} />)}
        </Card>
      )}
    </div>
  );
}

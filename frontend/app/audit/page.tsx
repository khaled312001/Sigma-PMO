'use client';

import { useEffect, useState } from 'react';

import { api } from '../../lib/api';
import { AuthGate } from '../../components/AuthGate';
import { DataTable } from '../../components/DataTable';
import { SkeletonRow } from '../../components/Skeleton';
import { useI18n } from '../../lib/i18n';
import { Card, PageHeader, Pill, SeverityBadge } from '../../components/ui';

interface AuditRow {
  reviewId: string;
  createdAt: string;
  action: string;
  comment: string | null;
  actorUserId: string | null;
  actorDisplay: string | null;
  decisionId: string;
  responsibleParty: string;
  fidicClause: string | null;
  escalationLevel: string;
  alertId: string;
  alertCode: string;
  severity: 'critical' | 'warning' | 'info';
  alertSummary: string;
}

export default function AuditPageRoute() {
  return <AuthGate capability="canReadAll" surface="Audit"><AuditPage /></AuthGate>;
}

function AuditPage() {
  const { t } = useI18n();
  const [rows, setRows] = useState<AuditRow[] | null>(null);

  useEffect(() => {
    api<AuditRow[]>('/governance/audit?limit=300').then(setRows).catch(() => setRows([]));
  }, []);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t('audit.eyebrow')}
        title={t('audit.title')}
        description={t('audit.description')}
      />

      {rows === null ? (
        <Card padded={false}>
          {Array.from({ length: 8 }).map((_, i) => <SkeletonRow key={i} cols={5} />)}
        </Card>
      ) : (
        <DataTable
          rows={rows}
          rowKey={(r) => r.reviewId}
          searchable
          searchPlaceholder={t('audit.search')}
          searchAccessor={(r) => `${r.actorDisplay ?? ''} ${r.action} ${r.alertCode} ${r.responsibleParty} ${r.fidicClause ?? ''} ${r.alertSummary} ${r.comment ?? ''}`}
          initialSort={{ key: 'createdAt', dir: 'desc' }}
          emptyTitle={t('audit.empty.title')}
          emptyDescription={t('audit.empty.description')}
          columns={[
            {
              key: 'createdAt', label: t('audit.headers.when'), width: '12rem',
              render: (r) => <span className="text-xs text-slate-300" dir="ltr">{new Date(r.createdAt).toLocaleString()}</span>,
              accessor: (r) => new Date(r.createdAt).getTime(),
            },
            {
              key: 'actor', label: t('audit.headers.actor'),
              render: (r) => (
                <div className="min-w-0">
                  <div className="truncate text-slate-100">{r.actorDisplay ?? t('audit.systemActor')}</div>
                  {r.comment && <div className="mt-0.5 truncate text-[11px] text-slate-400" title={r.comment}>{r.comment}</div>}
                </div>
              ),
              accessor: (r) => r.actorDisplay ?? '',
            },
            {
              key: 'action', label: t('audit.headers.action'), width: '8rem',
              render: (r) => <Pill tone={r.action === 'approve' ? 'emerald' : r.action === 'reject' ? 'rose' : 'slate'}>{t(`decisions.statuses.${r.action as 'approve' | 'reject' | 'acknowledge'}`)}</Pill>,
              accessor: (r) => r.action,
            },
            {
              key: 'severity', label: t('audit.headers.severity'), width: '6rem',
              render: (r) => <SeverityBadge severity={r.severity} />,
              accessor: (r) => ({ critical: 3, warning: 2, info: 1 } as const)[r.severity] ?? 0,
              hideOnMobile: true,
            },
            {
              key: 'alertCode', label: t('audit.headers.code'),
              render: (r) => <span className="font-mono text-[11px] text-slate-200" dir="ltr">{r.alertCode}</span>,
              hideOnMobile: true,
            },
            {
              key: 'party', label: t('audit.headers.party'), width: '8rem',
              render: (r) => <Pill tone="slate">{r.responsibleParty}</Pill>,
              accessor: (r) => r.responsibleParty,
              hideOnMobile: true,
            },
            {
              key: 'clause', label: t('audit.headers.clause'), width: '11rem',
              render: (r) => r.fidicClause ? <span className="text-xs text-slate-200" dir="ltr">{r.fidicClause}</span> : <span className="text-slate-500">—</span>,
              accessor: (r) => r.fidicClause ?? '',
              hideOnMobile: true,
            },
          ]}
        />
      )}
    </div>
  );
}

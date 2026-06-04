'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

import { AlertRecord, api, IngestionRun } from '../../lib/api';
import { AuthGate } from '../../components/AuthGate';
import { DataTable } from '../../components/DataTable';
import { SkeletonStat, SkeletonRow } from '../../components/Skeleton';
import { useI18n } from '../../lib/i18n';
import { useProject, ProjectSummary } from '../../lib/project-context';
import { IconAlertCritical, IconAlertWarning, IconDatabase, IconFolder } from '../../components/Icons';
import { Card, PageHeader, Pill, SeverityBadge, ConfidenceBar } from '../../components/ui';

export default function ProjectsPageRoute() {
  return <AuthGate surface="Projects"><ProjectsPage /></AuthGate>;
}

interface ProjectRow extends ProjectSummary {
  alerts: number;
  criticals: number;
  runs: number;
  lastIngested: Date | null;
  confidence: number | null;
}

function ProjectsPage() {
  const { t } = useI18n();
  const { projects, loading } = useProject();
  const [alerts, setAlerts] = useState<AlertRecord[] | null>(null);
  const [runs, setRuns] = useState<IngestionRun[] | null>(null);

  useEffect(() => {
    Promise.all([
      api<AlertRecord[]>('/rules/alerts?limit=500'),
      api<IngestionRun[]>('/ingestion/runs?limit=200'),
    ]).then(([a, r]) => { setAlerts(a); setRuns(r); }).catch(() => { setAlerts([]); setRuns([]); });
  }, []);

  const rows: ProjectRow[] = useMemo(() => {
    if (!alerts || !runs) return [];
    return projects.map((p) => {
      // CRITICAL: group by businessKey, NOT id. alert.projectId pins to the
      // versioned project row that was current when the alert fired, so a
      // newer ingestion run rolls the project forward and the old alerts
      // are no longer reachable via the current-version id. Confirmed by
      // workflow D1: filtering by id under-counted P-1000 alerts 7 vs 50.
      const pa = alerts.filter((a) => a.projectBusinessKey === p.businessKey);
      const runsForKey = runs.filter((r) => ((r.summary as Record<string, unknown>)?.projectKey as string | undefined) === p.businessKey);
      const last = runsForKey.length > 0 ? new Date(runsForKey[0].createdAt) : null;
      const conf = runsForKey[0]?.summary?.confidence?.overall ?? null;
      return {
        ...p,
        alerts: pa.length,
        criticals: pa.filter((a) => a.severity === 'critical').length,
        runs: runsForKey.length,
        lastIngested: last,
        confidence: conf,
      };
    });
  }, [projects, alerts, runs]);

  const totalAlerts = rows.reduce((s, r) => s + r.alerts, 0);
  const totalCriticals = rows.reduce((s, r) => s + r.criticals, 0);
  const totalRuns = rows.reduce((s, r) => s + r.runs, 0);

  const ready = !loading && alerts !== null && runs !== null;

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow={t('projects.eyebrow')}
        title={t('projects.title')}
        description={t('projects.description')}
      />

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {ready ? (
          <>
            <StatTile label={t('projects.title')} value={rows.length} tone="sky" icon={<IconFolder className="h-5 w-5" />} />
            <StatTile label={t('overview.cards.totalAlerts')} value={totalAlerts} tone="emerald" icon={<IconDatabase className="h-5 w-5" />} />
            <StatTile label={t('overview.cards.critical')} value={totalCriticals} tone="rose" icon={<IconAlertCritical className="h-5 w-5" />} />
            <StatTile label={t('projects.runs')} value={totalRuns} tone="amber" icon={<IconAlertWarning className="h-5 w-5" />} />
          </>
        ) : (
          <>
            <SkeletonStat /><SkeletonStat /><SkeletonStat /><SkeletonStat />
          </>
        )}
      </section>

      {ready ? (
        <DataTable
          rows={rows}
          rowKey={(r) => r.id}
          searchable
          searchPlaceholder={t('common2.search')}
          searchAccessor={(r) => `${r.name} ${r.businessKey} ${r.clientName ?? ''} ${r.status ?? ''}`}
          initialSort={{ key: 'alerts', dir: 'desc' }}
          emptyTitle={t('projects.empty.title')}
          emptyDescription={t('projects.empty.description')}
          columns={[
            {
              key: 'name',
              label: t('projects.headers.name'),
              render: (r) => (
                <div className="min-w-0">
                  <div className="truncate font-medium text-slate-100">{r.name}</div>
                  <div className="mt-0.5 truncate text-[11px] text-slate-400">{r.clientName ?? '—'}</div>
                </div>
              ),
              accessor: (r) => r.name.toLowerCase(),
            },
            {
              key: 'businessKey',
              label: t('projects.headers.key'),
              width: '9rem',
              render: (r) => <span className="font-mono text-xs text-slate-300" dir="ltr">{r.businessKey}</span>,
              hideOnMobile: true,
            },
            {
              key: 'status',
              label: t('projects.headers.status'),
              width: '8rem',
              render: (r) => r.status ? <Pill tone="slate">{r.status}</Pill> : <span className="text-slate-500">—</span>,
              hideOnMobile: true,
            },
            {
              key: 'alerts',
              label: t('projects.headers.alerts'),
              width: '7rem',
              align: 'end',
              render: (r) => (
                <div className="flex items-center justify-end gap-1.5 tabular-nums">
                  {r.criticals > 0 && <SeverityBadge severity="critical" />}
                  <span className="font-semibold text-slate-200">{r.alerts}</span>
                </div>
              ),
              accessor: (r) => r.alerts,
            },
            {
              key: 'runs',
              label: t('projects.headers.runs'),
              width: '5rem',
              align: 'end',
              render: (r) => <span className="tabular-nums text-slate-300">{r.runs}</span>,
              accessor: (r) => r.runs,
              hideOnMobile: true,
            },
            {
              key: 'confidence',
              label: t('projects.headers.confidence'),
              width: '10rem',
              render: (r) => <ConfidenceBar value={r.confidence ?? null} width={80} />,
              accessor: (r) => r.confidence ?? -1,
              hideOnMobile: true,
            },
            {
              key: 'lastIngested',
              label: t('projects.headers.lastIngested'),
              width: '11rem',
              render: (r) => r.lastIngested
                ? <span className="text-xs text-slate-300">{r.lastIngested.toLocaleString()}</span>
                : <span className="text-xs text-slate-500">{t('projects.never')}</span>,
              accessor: (r) => r.lastIngested?.getTime() ?? 0,
              hideOnMobile: true,
            },
          ]}
        />
      ) : (
        <Card padded={false}>
          {Array.from({ length: 4 }).map((_, i) => <SkeletonRow key={i} cols={5} />)}
        </Card>
      )}

      <p className="text-center text-[11px] text-slate-500">
        <Link href="/review" className="hover:text-slate-300">{t('common2.viewAll')} →</Link>
      </p>
    </div>
  );
}

function StatTile({
  label, value, tone, icon,
}: { label: string; value: number; tone: 'sky' | 'emerald' | 'rose' | 'amber'; icon: React.ReactNode }) {
  const grad: Record<string, string> = {
    sky:     'from-sky-500/10 ring-sky-500/30 text-sky-300',
    emerald: 'from-emerald-500/10 ring-emerald-500/30 text-emerald-300',
    rose:    'from-rose-500/10 ring-rose-500/30 text-rose-300',
    amber:   'from-amber-400/10 ring-amber-400/30 text-amber-300',
  };
  return (
    <div className={`relative overflow-hidden rounded-xl border border-slate-800 bg-gradient-to-br ${grad[tone]} to-transparent p-4`}>
      <div className="flex items-start justify-between">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">{label}</p>
        <div className={`grid h-8 w-8 place-items-center rounded-lg bg-slate-900/70 ring-1 ${grad[tone].split(' ')[1]} ${grad[tone].split(' ')[2]}`}>{icon}</div>
      </div>
      <p className="mt-3 text-3xl font-semibold tabular-nums text-slate-50">{value}</p>
    </div>
  );
}

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

/**
 * The additive deterministic score bundle the `/projects` endpoint now returns
 * (Agent A). Typed locally so we needn't widen the shared project-context type.
 */
interface ProjectScores {
  governanceScore: number;
  riskScore: number;
  healthScore: number;
  investmentScore: number | null;
  compositeScore: number;
  projectRanking: number;
  portfolioRanking: number;
}
type ScoredProject = ProjectSummary & Partial<ProjectScores>;

interface ProjectRow extends ScoredProject {
  alerts: number;
  criticals: number;
  runs: number;
  lastIngested: Date | null;
  confidence: number | null;
}

function ProjectsPage() {
  const { t, lang } = useI18n();
  const isAr = lang === 'ar';
  const { projects, loading } = useProject();
  const [scored, setScored] = useState<ScoredProject[] | null>(null);
  const [alerts, setAlerts] = useState<AlertRecord[] | null>(null);
  const [runs, setRuns] = useState<IngestionRun[] | null>(null);

  useEffect(() => {
    Promise.all([
      api<AlertRecord[]>('/rules/alerts?limit=500'),
      api<IngestionRun[]>('/ingestion/runs?limit=200'),
      api<ScoredProject[]>('/projects'),
    ]).then(([a, r, s]) => { setAlerts(a); setRuns(r); setScored(s); })
      .catch(() => { setAlerts([]); setRuns([]); setScored([]); });
  }, []);

  // Prefer the score-decorated list from /projects; fall back to the context
  // list (no scores) so the table still renders if the scored fetch failed.
  const baseProjects: ScoredProject[] = scored && scored.length > 0 ? scored : projects;

  const rows: ProjectRow[] = useMemo(() => {
    if (!alerts || !runs) return [];
    return baseProjects.map((p) => {
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
  }, [baseProjects, alerts, runs]);

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
          initialSort={{ key: 'composite', dir: 'desc' }}
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
              key: 'composite',
              label: isAr ? 'الدرجة المركّبة' : 'Composite',
              width: '11rem',
              render: (r) => (
                <div className="flex flex-col items-start gap-1">
                  <ScorePill value={r.compositeScore} higherBetter />
                  <div className="flex items-center gap-1">
                    {typeof r.projectRanking === 'number' && r.projectRanking > 0 && (
                      <Pill tone="violet">{isAr ? `الترتيب #${r.projectRanking}` : `Rank #${r.projectRanking}`}</Pill>
                    )}
                    {typeof r.portfolioRanking === 'number' && r.portfolioRanking > 0 && (
                      <Pill tone="sky">{isAr ? `المحفظة #${r.portfolioRanking}` : `Portfolio #${r.portfolioRanking}`}</Pill>
                    )}
                  </div>
                </div>
              ),
              accessor: (r) => r.compositeScore ?? -1,
            },
            {
              key: 'governance',
              label: isAr ? 'الحوكمة' : 'Governance',
              width: '7rem',
              align: 'end',
              render: (r) => <ScorePill value={r.governanceScore} higherBetter />,
              accessor: (r) => r.governanceScore ?? -1,
              hideOnMobile: true,
            },
            {
              key: 'risk',
              label: isAr ? 'المخاطر' : 'Risk',
              width: '6rem',
              align: 'end',
              render: (r) => <ScorePill value={r.riskScore} higherBetter={false} />,
              accessor: (r) => r.riskScore ?? -1,
              hideOnMobile: true,
            },
            {
              key: 'investment',
              label: isAr ? 'الاستثمار' : 'Investment',
              width: '7rem',
              align: 'end',
              render: (r) => r.investmentScore === null || r.investmentScore === undefined
                ? <span className="text-slate-500">—</span>
                : <ScorePill value={r.investmentScore} higherBetter />,
              accessor: (r) => r.investmentScore ?? -1,
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

/**
 * A 0–100 score chip. `higherBetter` flips the tone scale so the Risk score
 * (where 100 = worst) reads red at the top while Governance/Composite read
 * green at the top.
 */
function ScorePill({ value, higherBetter }: { value: number | undefined; higherBetter: boolean }) {
  if (value === null || value === undefined) return <span className="text-slate-500">—</span>;
  const good = higherBetter ? value >= 75 : value <= 25;
  const mid = higherBetter ? value >= 50 : value <= 50;
  const tone: 'emerald' | 'amber' | 'rose' = good ? 'emerald' : mid ? 'amber' : 'rose';
  return <Pill tone={tone}>{Math.round(value)}</Pill>;
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

'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import { useToast } from '../../components/ToastProvider';
import { AlertRecord, api, ExecutiveSummary, GovernanceDecision } from '../../lib/api';
import { useCurrentProjectKey } from '../../lib/project-context';
import { AuthGate } from '../../components/AuthGate';
import { DecisionCard } from '../../components/DecisionCard';
import { SummaryView } from '../../components/SummaryView';
import { useI18n } from '../../lib/i18n';
import { IconSparkles } from '../../components/Icons';
import {
  Button,
  Card,
  EmptyState,
  PageHeader,
  Pill,
} from '../../components/ui';

type Filter = 'all' | 'critical' | 'warning' | 'info';

export default function ReviewPageRoute() {
  return <AuthGate capability="canEvaluateRules" surface="Review"><ReviewPage /></AuthGate>;
}

function ReviewPage() {
  const { t, lang } = useI18n();
  const projectKey = useCurrentProjectKey();
  const toast = useToast();
  const [alerts, setAlerts] = useState<AlertRecord[]>([]);
  const [decisionsByAlert, setDecisionsByAlert] = useState<Record<string, GovernanceDecision[]>>({});
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState<ExecutiveSummary | null>(null);
  const [generatingSummary, setGeneratingSummary] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');

  const refresh = useCallback(async () => {
    try {
      const [a, decs, s] = await Promise.all([
        api<AlertRecord[]>('/rules/alerts?limit=80'),
        api<GovernanceDecision[]>('/governance/decisions?limit=500'),
        api<ExecutiveSummary[]>('/summary?limit=1'),
      ]);
      setAlerts(a);
      const map: Record<string, GovernanceDecision[]> = {};
      for (const d of decs) (map[d.alertId] ??= []).push(d);
      setDecisionsByAlert(map);
      setSummary(s[0] ?? null);
    } catch (e) { toast.error('Failed to load alerts', (e as Error).message); }
  }, [toast]);

  useEffect(() => { void refresh(); }, [refresh]);

  const counts = useMemo(() => ({
    all:      alerts.length,
    critical: alerts.filter((a) => a.severity === 'critical').length,
    warning:  alerts.filter((a) => a.severity === 'warning').length,
    info:     alerts.filter((a) => a.severity === 'info').length,
  }), [alerts]);

  const filtered = useMemo(() => filter === 'all' ? alerts : alerts.filter((a) => a.severity === filter), [alerts, filter]);

  const evaluate = async () => {
    setBusy(true);
    try {
      const evalResult = await api<{ evaluationId: string; alertCount: number }>('/rules/evaluate', {
        method: 'POST', body: JSON.stringify({ projectKey }),
      });
      const dec = await api<{ decisionCount: number }>('/governance/decide', {
        method: 'POST', body: JSON.stringify({ ruleEvaluationId: evalResult.evaluationId, projectKey }),
      });
      await refresh();
      toast.success('Evaluation complete', `${evalResult.alertCount} alerts · ${dec.decisionCount} decisions`);
    } catch (e) { toast.error('Evaluation failed', (e as Error).message); }
    finally { setBusy(false); }
  };

  const generateSummary = async () => {
    setGeneratingSummary(true);
    try {
      const next = await api<ExecutiveSummary>('/summary/generate', {
        method: 'POST', body: JSON.stringify({ projectKey, periodDays: 7, locale: lang }),
      });
      setSummary(next);
      toast.success('Summary generated', `Source: ${next.source}`);
    } catch (e) { toast.error('Summary failed', (e as Error).message); }
    finally { setGeneratingSummary(false); }
  };

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow={t('review.eyebrow')}
        title={t('review.title')}
        description={t('review.description')}
        actions={
          <>
            <Button variant="success" size="sm" disabled={busy} onClick={evaluate}>
              {busy ? t('common.loading') : `${t('review.evaluate')} · ${projectKey}`}
            </Button>
            <Button variant="primary" size="sm" disabled={generatingSummary} onClick={generateSummary}>
              <IconSparkles className="h-3.5 w-3.5" /> {generatingSummary ? t('common.loading') : t('review.weeklySummary')}
            </Button>
          </>
        }
      />

      {alerts.length > 0 && (
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filter alerts by severity">
          <FilterChip label={t('review.filter.all')}      value="all"      active={filter === 'all'}      count={counts.all}      onClick={setFilter} />
          <FilterChip label={t('review.filter.critical')} value="critical" active={filter === 'critical'} count={counts.critical} onClick={setFilter} tone="rose" />
          <FilterChip label={t('review.filter.warning')}  value="warning"  active={filter === 'warning'}  count={counts.warning}  onClick={setFilter} tone="amber" />
          <FilterChip label={t('review.filter.info')}     value="info"     active={filter === 'info'}     count={counts.info}     onClick={setFilter} tone="sky" />
        </div>
      )}

      {filtered.length === 0 ? (
        alerts.length === 0 ? (
          <EmptyState
            title={t('approval.noDecisions')}
            description={t('review.description')}
            action={<Button variant="success" disabled={busy} onClick={evaluate}>{busy ? t('common.loading') : t('review.evaluate')}</Button>}
          />
        ) : (
          <EmptyState title={`No ${filter} alerts`} description="Try a different filter." />
        )
      ) : (
        <section className="space-y-3">
          {filtered.map((a) => {
            const decs = decisionsByAlert[a.id] ?? [];
            return <DecisionCard key={a.id} alert={a} decision={decs[0] ?? null} />;
          })}
        </section>
      )}

      {summary && (
        <Card
          title="Weekly executive summary"
          hint={`${summary.periodStart} → ${summary.periodEnd}`}
          actions={
            <>
              <Pill tone={summary.source === 'llm' ? 'violet' : 'slate'}>{summary.source}</Pill>
              <Pill tone="emerald">{(summary.confidenceAverage * 100).toFixed(1)}% confidence</Pill>
            </>
          }
        >
          <SummaryView text={summary.narrative} confidence={summary.confidenceAverage} />
        </Card>
      )}
    </div>
  );
}

function FilterChip({ label, value, active, count, onClick, tone = 'slate' }: { label: string; value: Filter; active: boolean; count: number; onClick: (v: Filter) => void; tone?: 'slate' | 'rose' | 'amber' | 'sky' }) {
  const accents: Record<string, string> = {
    slate: 'data-[active=true]:border-slate-400/40 data-[active=true]:bg-slate-700/40 data-[active=true]:text-white',
    rose:  'data-[active=true]:border-rose-500/60 data-[active=true]:bg-rose-500/15 data-[active=true]:text-rose-100',
    amber: 'data-[active=true]:border-amber-400/60 data-[active=true]:bg-amber-400/10 data-[active=true]:text-amber-100',
    sky:   'data-[active=true]:border-sky-500/60 data-[active=true]:bg-sky-500/10 data-[active=true]:text-sky-100',
  };
  return (
    <button
      data-active={active}
      aria-pressed={active}
      onClick={() => onClick(value)}
      className={`inline-flex items-center gap-1.5 rounded-full border border-slate-700 px-3 py-1 text-xs text-slate-300 transition hover:border-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/60 ${accents[tone]}`}
    >
      {label}
      <span className="rounded-full bg-slate-800 px-1.5 py-px text-[10px] tabular-nums text-slate-200">{count}</span>
    </button>
  );
}

'use client';

import { useCallback, useEffect, useState } from 'react';

import { AiAnalysisPanel } from '../../components/AiAnalysisPanel';
import { AuthGate } from '../../components/AuthGate';
import { GovernanceStatusBadge } from '../../components/GovernanceStatusBadge';
import { IconSparkles } from '../../components/Icons';
import { useToast } from '../../components/ToastProvider';
import { useI18n } from '../../lib/i18n';
import { useCurrentProjectKey } from '../../lib/project-context';
import { api } from '../../lib/api';
import { Button, Card, EmptyState, PageHeader, Pill } from '../../components/ui';

// ── Local response types (mirror backend PredictionService; no shared edits) ──
type ForecastSeverity = 'low' | 'medium' | 'high' | 'critical';
type ForecastUnit = 'pct' | 'days' | 'score';

interface ForecastDto {
  metric: string;
  label: string;
  value: number | null;
  unit: ForecastUnit;
  severity: ForecastSeverity;
  basis: string;
  recommendedAction: string;
  evidenceRefs: Array<Record<string, unknown>>;
}

interface PredictionDto {
  projectKey: string;
  asOfDate: string;
  forecasts: ForecastDto[];
  predictiveGovernanceStatus: 'green' | 'yellow' | 'orange' | 'red';
  headline: string;
}

export default function PredictiveRoute() {
  return (
    <AuthGate capability="canRunPredictive" surface="Predictive Governance">
      <PredictivePage />
    </AuthGate>
  );
}

// Domain-correct Arabic labels per metric (not literal translations).
const METRIC_AR: Record<string, string> = {
  forecastCostOverrunPct: 'تجاوز التكلفة المتوقع',
  forecastScheduleDelayDays: 'التأخير الزمني المتوقع',
  forecastRevenueGap: 'فجوة الإيراد المتوقعة',
  forecastProcurementRisk: 'مخاطر التوريد المتوقعة',
  forecastFundingRisk: 'مخاطر التمويل المتوقعة',
};

const SEVERITY_AR: Record<ForecastSeverity, string> = {
  low: 'منخفضة',
  medium: 'متوسطة',
  high: 'مرتفعة',
  critical: 'حرجة',
};

const SEVERITY_TONE: Record<ForecastSeverity, 'emerald' | 'amber' | 'rose'> = {
  low: 'emerald',
  medium: 'amber',
  high: 'rose',
  critical: 'rose',
};

// Card accent border/background by severity (slate tokens only otherwise).
const SEVERITY_FRAME: Record<ForecastSeverity, string> = {
  low: 'border-emerald-500/40 bg-emerald-500/5',
  medium: 'border-amber-500/40 bg-amber-500/5',
  high: 'border-rose-500/40 bg-rose-500/5',
  critical: 'border-rose-500/60 bg-rose-500/10',
};

const VALUE_TEXT: Record<ForecastSeverity, string> = {
  low: 'text-emerald-300',
  medium: 'text-amber-300',
  high: 'text-rose-300',
  critical: 'text-rose-200',
};

function PredictivePage() {
  const { lang } = useI18n();
  const ar = lang === 'ar';
  const projectKey = useCurrentProjectKey();
  const toast = useToast();
  const [data, setData] = useState<PredictionDto | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setData(await api<PredictionDto>(`/predictive/forecast?projectKey=${encodeURIComponent(projectKey)}`));
    } catch (e) {
      toast.error(ar ? 'تعذّر تحميل التوقعات' : 'Failed to load forecasts', (e as Error).message);
    }
  }, [projectKey, toast, ar]);

  useEffect(() => { void refresh(); }, [refresh]);

  const run = async () => {
    setBusy('run');
    try {
      const res = await api<{ forecast: PredictionDto }>('/predictive/run', {
        method: 'POST',
        body: JSON.stringify({ projectKey }),
      });
      setData(res.forecast);
      toast.success(ar ? 'اكتمل تشغيل الحوكمة التنبؤية' : 'Predictive governance complete');
    } catch (e) {
      toast.error(ar ? 'فشل التشغيل' : 'Run failed', (e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const formatValue = (f: ForecastDto): string => {
    if (f.value === null) return '—';
    if (f.unit === 'pct') return `${f.value}%`;
    if (f.unit === 'days') return ar ? `${f.value} يوم` : `${f.value}d`;
    return `${f.value}/100`;
  };

  const labelFor = (f: ForecastDto): string => (ar ? METRIC_AR[f.metric] ?? f.label : f.label);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={`Predictive Governance · ext.predictive · ${projectKey}`}
        title={ar ? 'الحوكمة التنبؤية' : 'Predictive Governance'}
        description={ar
          ? 'توقعات حتمية واستباقية: تجاوز التكلفة، والتأخير الزمني، وفجوة الإيراد، ومخاطر التوريد والتمويل — مجمّعة في حالة حوكمة تنبؤية واحدة كإنذار مبكر. كل رقم مشتق من صيغة محددة (مؤشرات القيمة المكتسبة، DSCR، سجل التتبّع).'
          : 'Deterministic, forward-looking forecasts: cost overrun, schedule delay, revenue gap, procurement and funding risk — consolidated into one predictive governance status as an early warning. Every number derives from a named formula (EVM indices, DSCR, the traceability ledger).'}
        actions={(
          <Button variant="success" size="sm" disabled={busy === 'run'} onClick={run}>
            {busy === 'run' ? (ar ? 'جارٍ…' : 'Running…') : (ar ? 'تشغيل التوقعات' : 'Run forecasts')}
          </Button>
        )}
      />

      {/* Overall predictive governance status */}
      <Card
        title={ar ? 'حالة الحوكمة التنبؤية' : 'Predictive governance status'}
        hint={data ? (ar ? `حتى تاريخ ${data.asOfDate} · الأسوأ من بين التوقعات الخمسة` : `as of ${data.asOfDate} · worst-of the five forecasts`) : undefined}
      >
        {!data ? (
          <p className="text-sm text-slate-400">…</p>
        ) : (
          <div className="flex flex-wrap items-center gap-4">
            <GovernanceStatusBadge status={data.predictiveGovernanceStatus} size="md" />
            <p className="flex-1 text-sm text-slate-300">{data.headline}</p>
          </div>
        )}
      </Card>

      {/* Five forecast cards */}
      {!data ? (
        <EmptyState title={ar ? 'لا توجد توقعات بعد' : 'No forecasts yet'} description={ar ? 'شغّل التوقعات لهذا المشروع.' : 'Run forecasts for this project.'} />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {data.forecasts.map((f) => (
            <div key={f.metric} className={`rounded-xl border p-4 ${SEVERITY_FRAME[f.severity]}`}>
              <div className="flex items-start justify-between gap-3">
                <h3 className="text-sm font-semibold text-slate-100">{labelFor(f)}</h3>
                <Pill tone={f.value === null ? 'slate' : SEVERITY_TONE[f.severity]}>
                  {f.value === null ? (ar ? 'لا بيانات' : 'no data') : (ar ? SEVERITY_AR[f.severity] : f.severity)}
                </Pill>
              </div>
              <p className={`mt-2 text-3xl font-bold tabular-nums ${f.value === null ? 'text-slate-500' : VALUE_TEXT[f.severity]}`} dir="ltr">
                {formatValue(f)}
              </p>
              <p className="mt-2 text-[11px] leading-relaxed text-slate-400">
                <span className="font-semibold text-slate-300">{ar ? 'الأساس: ' : 'Basis: '}</span>
                {f.basis}
              </p>
              <div className="mt-3 rounded-lg border border-sky-500/30 bg-sky-500/5 px-3 py-2 text-[11px] leading-relaxed text-sky-100">
                <IconSparkles className="me-1 inline h-3 w-3" />
                <span className="font-semibold">{ar ? 'الإجراء الموصى به: ' : 'Recommended action: '}</span>
                {f.recommendedAction}
              </div>
            </div>
          ))}
        </div>
      )}

      <AiAnalysisPanel endpoint="/predictive/ai-analysis" body={{ projectKey }} />
    </div>
  );
}

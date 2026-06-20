'use client';

import { useCallback, useEffect, useState } from 'react';

import { AuthGate } from '../../components/AuthGate';
import { useToast } from '../../components/ToastProvider';
import { useI18n } from '../../lib/i18n';
import { useCurrentProjectKey } from '../../lib/project-context';
import { api } from '../../lib/api';
import { Button, Card, EmptyState, PageHeader, Pill } from '../../components/ui';

interface ActivityDelayRow {
  key: string; name: string; plannedFinish: string | null; forecastFinish: string | null;
  finishVarianceDays: number; completionFloatDays: number; drivingConsumptionDays: number; isCriticalDriver: boolean;
}
interface DelayWindow { index: number; from: string; to: string; label: string; drivingKeys: string[]; windowSlipDays: number }
interface ForensicReport {
  projectKey: string; projectName: string; method: string; methodologyVersion: string; dataDate: string | null;
  activitiesAnalysed: number; completedActivities: number;
  asPlannedCompletion: string | null; asBuiltOrForecastCompletion: string | null; projectDelayDays: number;
  criticalDrivers: ActivityDelayRow[]; windows: DelayWindow[];
  concurrency: { concurrentDays: number; pairs: Array<{ aKey: string; bKey: string; overlapDays: number }> };
  classification: { netCriticalDelayDays: number; concurrentNonCompensableDays: number; compensableCandidateDays: number; note: string };
  entitlement: { supportedEotDays: number; strength: 'strong' | 'moderate' | 'weak'; drivers: number; reasons: string[] };
  caveats: string[]; narrative: string;
}

export default function ForensicDelayRoute() {
  return (
    <AuthGate capability="canRead" surface="Forensic Delay Analysis">
      <ForensicDelayPage />
    </AuthGate>
  );
}

function ForensicDelayPage() {
  const { lang } = useI18n();
  const ar = lang === 'ar';
  const projectKey = useCurrentProjectKey();
  const toast = useToast();
  const [report, setReport] = useState<ForensicReport | null>(null);
  const [busy, setBusy] = useState(false);

  const run = useCallback(async () => {
    setBusy(true);
    try {
      setReport(await api<ForensicReport>(`/claims/forensic-delay?projectKey=${encodeURIComponent(projectKey)}`));
    } catch (e) {
      toast.error(ar ? 'تعذّر تحليل التأخير' : 'Forensic delay failed', (e as Error).message);
    } finally { setBusy(false); }
  }, [projectKey, toast, ar]);

  useEffect(() => { void run(); }, [run]);

  const strengthTone = (s: string) => (s === 'strong' ? 'emerald' : s === 'moderate' ? 'amber' : 'rose');
  const strengthLabel = (s: string) => (ar ? (s === 'strong' ? 'قوية' : s === 'moderate' ? 'متوسطة' : 'ضعيفة') : s);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={`Forensic Delay Analysis · ${projectKey}`}
        title={ar ? 'تحليل التأخير الجنائي (Forensic)' : 'Forensic Delay Analysis'}
        description={ar
          ? 'مقارنة المخطط المعتمد بالمنفَّذ، عزل الأنشطة الدافعة للتأخير عبر العوم حتى الإنجاز، تقسيم التأخير على نوافذ زمنية، مقاصة التأخير المتزامن، ثم تمديد مدة مدعوم زمنياً مع قوة الاستحقاق وتفسير لماذا المطالبة قوية أو ضعيفة.'
          : 'As-planned vs as-built overlay, float-to-completion driving-path isolation, windowing, concurrency netting, and a net time-supported EOT with an entitlement strength + an explanation of why the claim is strong or weak.'}
        actions={<Button variant="success" size="sm" disabled={busy} onClick={run}>{busy ? (ar ? 'جارٍ…' : 'Analysing…') : (ar ? 'إعادة التحليل' : 'Re-analyse')}</Button>}
      />

      {!report ? (
        <Card title={ar ? 'التحليل' : 'Analysis'}><p className="text-sm text-slate-400">…</p></Card>
      ) : report.activitiesAnalysed === 0 ? (
        <EmptyState title={ar ? 'لا توجد أنشطة بتواريخ' : 'No dated activities'} description={ar ? 'ارفع جدولاً زمنياً للمشروع لتشغيل تحليل التأخير.' : 'Ingest a project schedule to run the forensic delay analysis.'} />
      ) : (
        <>
          {/* Verdict band */}
          <Card title={ar ? 'الحُكم على الاستحقاق' : 'Entitlement verdict'} hint={report.method}>
            <div className="grid gap-3 sm:grid-cols-4">
              <Kpi label={ar ? 'الإنجاز المخطط' : 'As-planned finish'} value={report.asPlannedCompletion ?? '—'} />
              <Kpi label={ar ? 'الإنجاز المنفَّذ/المتوقع' : 'As-built/forecast'} value={report.asBuiltOrForecastCompletion ?? '—'} tone="amber" />
              <Kpi label={ar ? 'صافي التأخير' : 'Net delay'} value={`${report.projectDelayDays}d`} tone={report.projectDelayDays > 0 ? 'rose' : 'emerald'} />
              <Kpi label={ar ? 'تمديد مدعوم' : 'Supported EOT'} value={`${report.entitlement.supportedEotDays}d`} tone="sky" />
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="text-xs uppercase tracking-wider text-slate-400">{ar ? 'قوة المطالبة:' : 'Claim strength:'}</span>
              <Pill tone={strengthTone(report.entitlement.strength)}>{strengthLabel(report.entitlement.strength)}</Pill>
              <span className="text-xs text-slate-400">{report.entitlement.drivers} {ar ? 'نشاط دافع' : 'driver(s)'} · {report.concurrency.concurrentDays}d {ar ? 'متزامن' : 'concurrent'}</span>
            </div>
            <p className="mt-3 rounded-lg border border-slate-700/70 bg-slate-900/60 p-3 text-sm text-slate-200">{report.narrative}</p>
            <ul className="mt-2 space-y-1 text-xs text-slate-300">
              {report.entitlement.reasons.map((r, i) => <li key={i} className="flex gap-2"><span className="text-sky-300">•</span><span>{r}</span></li>)}
            </ul>
          </Card>

          {/* Classification */}
          <Card title={ar ? 'تصنيف التأخير' : 'Delay classification'} hint={report.classification.note}>
            <div className="grid gap-3 sm:grid-cols-3">
              <Kpi label={ar ? 'صافي التأخير الحرج' : 'Net critical delay'} value={`${report.classification.netCriticalDelayDays}d`} />
              <Kpi label={ar ? 'متزامن (غير قابل للتعويض)' : 'Concurrent (non-compensable)'} value={`${report.classification.concurrentNonCompensableDays}d`} tone="amber" />
              <Kpi label={ar ? 'مرشّح للتعويض' : 'Compensable candidate'} value={`${report.classification.compensableCandidateDays}d`} tone="emerald" />
            </div>
          </Card>

          {/* Critical drivers */}
          <Card title={ar ? 'الأنشطة الدافعة للمسار الحرج' : 'Critical-path driving activities'} hint={ar ? 'انزلاق يتجاوز العوم حتى الإنجاز' : 'Slip exceeding float-to-completion'}>
            {report.criticalDrivers.length === 0 ? (
              <p className="text-sm text-slate-400">{ar ? 'لا توجد أنشطة دافعة — الانزلاقات استوعبها العوم.' : 'No driving activities — slips were absorbed by float.'}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-sm">
                  <thead><tr className="border-b border-slate-800 text-[11px] uppercase tracking-wider text-slate-400">
                    <th className="px-2 py-2 text-start">{ar ? 'النشاط' : 'Activity'}</th>
                    <th className="px-2 py-2 text-end">{ar ? 'انزلاق الإنجاز' : 'Finish var'}</th>
                    <th className="px-2 py-2 text-end">{ar ? 'العوم' : 'Float'}</th>
                    <th className="px-2 py-2 text-end">{ar ? 'دفع الإنجاز' : 'Drives'}</th>
                  </tr></thead>
                  <tbody>
                    {report.criticalDrivers.map((d) => (
                      <tr key={d.key} className="border-b border-slate-800/60 hover:bg-slate-900/50">
                        <td className="px-2 py-2"><span className="font-medium text-slate-100">{d.name}</span></td>
                        <td className="px-2 py-2 text-end font-mono tabular-nums text-rose-300" dir="ltr">+{d.finishVarianceDays}d</td>
                        <td className="px-2 py-2 text-end font-mono tabular-nums text-slate-300" dir="ltr">{d.completionFloatDays}d</td>
                        <td className="px-2 py-2 text-end font-mono tabular-nums text-amber-300" dir="ltr">+{d.drivingConsumptionDays}d</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          {/* Windows + concurrency */}
          <div className="grid gap-6 lg:grid-cols-2">
            <Card title={ar ? 'نوافذ التأخير' : 'Delay windows'}>
              {report.windows.length === 0 ? <p className="text-sm text-slate-400">—</p> : (
                <div className="space-y-2">
                  {report.windows.map((w) => (
                    <div key={w.index} className="flex items-center justify-between rounded-lg border border-slate-700/70 bg-slate-900/60 px-3 py-2 text-sm">
                      <span className="text-slate-300" dir="ltr">{w.from} → {w.to}</span>
                      <Pill tone={w.windowSlipDays > 0 ? 'amber' : 'slate'}>{w.windowSlipDays}d</Pill>
                    </div>
                  ))}
                </div>
              )}
            </Card>
            <Card title={ar ? 'التأخير المتزامن' : 'Concurrent delay'} hint={`${report.concurrency.concurrentDays}d`}>
              {report.concurrency.pairs.length === 0 ? <p className="text-sm text-slate-400">{ar ? 'لا يوجد تأخير متزامن.' : 'No concurrent delay detected.'}</p> : (
                <div className="space-y-2">
                  {report.concurrency.pairs.map((p, i) => (
                    <div key={i} className="flex items-center justify-between rounded-lg border border-slate-700/70 bg-slate-900/60 px-3 py-2 text-xs">
                      <span className="text-slate-300" dir="ltr">{p.aKey} ∥ {p.bKey}</span>
                      <Pill tone="amber">{p.overlapDays}d</Pill>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>

          {/* Caveats */}
          <Card title={ar ? 'حدود المنهجية' : 'Methodology caveats'} hint={report.methodologyVersion}>
            <ul className="space-y-1 text-xs text-slate-400">
              {report.caveats.map((c, i) => <li key={i} className="flex gap-2"><span className="text-amber-300">⚠</span><span>{c}</span></li>)}
            </ul>
          </Card>
        </>
      )}
    </div>
  );
}

function Kpi({ label, value, tone = 'slate' }: { label: string; value: string; tone?: 'slate' | 'emerald' | 'amber' | 'rose' | 'sky' }) {
  const color = tone === 'emerald' ? 'text-emerald-300' : tone === 'amber' ? 'text-amber-300' : tone === 'rose' ? 'text-rose-300' : tone === 'sky' ? 'text-sky-300' : 'text-slate-100';
  return (
    <div className="rounded-xl border border-slate-700/70 bg-slate-900/60 p-3">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{label}</p>
      <p className={`mt-1 text-lg font-bold tabular-nums ${color}`} dir="ltr">{value}</p>
    </div>
  );
}

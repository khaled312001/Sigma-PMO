'use client';

import { useCallback, useEffect, useState } from 'react';

import { AiAnalysisPanel } from '../../components/AiAnalysisPanel';
import { AuthGate } from '../../components/AuthGate';
import { GaugeChart } from '../../components/Charts';
import { GovernanceStatusBadge } from '../../components/GovernanceStatusBadge';
import { IconSparkles } from '../../components/Icons';
import { useToast } from '../../components/ToastProvider';
import { useI18n } from '../../lib/i18n';
import { useCurrentProjectKey } from '../../lib/project-context';
import { api } from '../../lib/api';
import { Button, Card, EmptyState, PageHeader, Pill, SeverityBadge } from '../../components/ui';

// ── Local API response types (the utility surface owns these shapes) ──

interface UtilityConnectionRecord {
  id: string;
  businessKey: string;
  title: string;
  utilityType: string;
  status: string;
  applicationDate: string | null;
  forecastConnectionDate: string | null;
  requiredByDate: string | null;
}

interface ForecastDate {
  businessKey: string;
  title: string;
  utilityType: string;
  status: string;
  forecastConnectionDate: string | null;
  requiredByDate: string | null;
  delayExposureDays: number;
}

interface UtilityScore {
  projectKey: string;
  asOfDate: string;
  score: number;
  status: 'green' | 'yellow' | 'orange' | 'red';
  connections: number;
  totals: {
    connected: number;
    inFlight: number;
    notStarted: number;
    atRisk: number;
    maxDelayExposureDays: number;
    totalDelayExposureDays: number;
  };
  forecasts: ForecastDate[];
  narrative: string;
}

interface UtilityFinding {
  type: 'delay-exposure' | 'required-by-breach' | 'stuck-not-started' | 'forecast-missing' | 'connection-ready';
  severity: 'critical' | 'warning' | 'info';
  title: string;
  description: string;
  recommendation: string;
  refs: Record<string, unknown>;
}

const UTILITY_TYPES = ['power', 'water', 'telecom', 'gas', 'sewerage', 'district_cooling'] as const;
const UTILITY_STATUSES = ['not_started', 'applied', 'in_progress', 'testing', 'energized', 'connected'] as const;

export default function UtilityRoute() {
  return (
    <AuthGate capability="canRunUtility" surface="Utility Governance">
      <UtilityPage />
    </AuthGate>
  );
}

function UtilityPage() {
  const { lang } = useI18n();
  const ar = lang === 'ar';
  const projectKey = useCurrentProjectKey();
  const toast = useToast();
  const [connections, setConnections] = useState<UtilityConnectionRecord[]>([]);
  const [score, setScore] = useState<UtilityScore | null>(null);
  const [findings, setFindings] = useState<UtilityFinding[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [conns, scr, finds] = await Promise.all([
        api<UtilityConnectionRecord[]>(`/utility/connections?projectKey=${encodeURIComponent(projectKey)}`),
        api<UtilityScore>(`/utility/score?projectKey=${encodeURIComponent(projectKey)}`),
        api<UtilityFinding[]>(`/utility/findings?projectKey=${encodeURIComponent(projectKey)}`),
      ]);
      setConnections(conns); setScore(scr); setFindings(finds);
    } catch (e) {
      toast.error(ar ? 'تعذّر تحميل بيانات المرافق' : 'Failed to load utility data', (e as Error).message);
    }
  }, [projectKey, toast, ar]);

  useEffect(() => { void refresh(); }, [refresh]);

  const run = async () => {
    setBusy('gov');
    try {
      await api('/utility/governance/run', { method: 'POST', body: JSON.stringify({ projectKey }) });
      toast.success(ar ? 'تم تشغيل حوكمة المرافق' : 'Utility governance complete');
      await refresh();
    } catch (e) {
      toast.error(ar ? 'فشل التشغيل' : 'Run failed', (e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={`Utility Governance · ext.utility · ${projectKey}`}
        title={ar ? 'حوكمة المرافق' : 'Utility Governance'}
        description={ar
          ? 'حوكمة جاهزية المرافق وحالة التوصيل — الكهرباء والمياه والاتصالات والغاز والصرف والتبريد المركزي — مع تواريخ التوصيل المتوقعة ومدى التأخير مقابل التاريخ المطلوب.'
          : 'Govern utility readiness & connection status — power, water, telecom, gas, sewerage, district cooling — with forecast connection dates and delay exposure against the required-by date.'}
        actions={(
          <Button variant="success" size="sm" disabled={busy === 'gov'} onClick={run}>
            {busy === 'gov' ? (ar ? 'جارٍ…' : 'Running…') : (ar ? 'تشغيل حوكمة المرافق' : 'Run utility governance')}
          </Button>
        )}
      />

      {/* Utility readiness + position */}
      <div className="grid gap-6 lg:grid-cols-[auto,1fr]">
        <Card title={ar ? 'جاهزية المرافق' : 'Utility Readiness'} hint={score ? `${ar ? 'حتى' : 'as of'} ${score.asOfDate}` : undefined}>
          {!score ? (
            <p className="text-sm text-slate-400">…</p>
          ) : (
            <div className="flex flex-col items-center gap-3">
              <GaugeChart
                value={score.score}
                max={100}
                width={220}
                label={`${score.score}`}
                hint={ar ? 'من 100' : 'of 100'}
              />
              <GovernanceStatusBadge status={score.status} />
            </div>
          )}
        </Card>

        <Card title={ar ? 'مركز المرافق' : 'Utility position'} hint={score?.narrative}>
          {!score ? (
            <p className="text-sm text-slate-400">…</p>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <Stat label={ar ? 'موصول' : 'Connected'} value={`${score.totals.connected}/${score.connections}`} tone="emerald" />
                <Stat label={ar ? 'قيد التنفيذ' : 'In flight'} value={String(score.totals.inFlight)} />
                <Stat label={ar ? 'لم يبدأ' : 'Not started'} value={String(score.totals.notStarted)} />
                <Stat label={ar ? 'معرّض للتأخير' : 'At risk'} value={String(score.totals.atRisk)} tone="amber" />
                <Stat label={ar ? 'أقصى تأخير (يوم)' : 'Max delay (d)'} value={String(score.totals.maxDelayExposureDays)} tone="amber" />
                <Stat label={ar ? 'إجمالي التأخير (يوم)' : 'Total delay (d)'} value={String(score.totals.totalDelayExposureDays)} />
              </div>
            </div>
          )}
        </Card>
      </div>

      {/* Connections table */}
      <Card
        title={ar ? 'توصيلات المرافق' : 'Utility connections'}
        hint={ar ? 'النوع، الحالة، تاريخ التوصيل المتوقع مقابل المطلوب، مدى التأخير' : 'Type, status, forecast vs required-by, delay exposure'}
      >
        {connections.length === 0 ? (
          <EmptyState
            title={ar ? 'لا توجد توصيلات بعد' : 'No connections yet'}
            description={ar ? 'أضف أول توصيلة مرفق لبدء مراقبة الجاهزية ومدى التأخير.' : 'Add the first utility connection to begin readiness and delay-exposure monitoring.'}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b border-slate-800 text-start text-[11px] uppercase tracking-wider text-slate-400">
                  <th className="px-2 py-2 text-start">{ar ? 'التوصيلة' : 'Connection'}</th>
                  <th className="px-2 py-2 text-start">{ar ? 'النوع' : 'Type'}</th>
                  <th className="px-2 py-2 text-center">{ar ? 'الحالة' : 'Status'}</th>
                  <th className="px-2 py-2 text-end">{ar ? 'متوقع' : 'Forecast'}</th>
                  <th className="px-2 py-2 text-end">{ar ? 'مطلوب بحلول' : 'Required by'}</th>
                  <th className="px-2 py-2 text-end">{ar ? 'التأخير (يوم)' : 'Delay (d)'}</th>
                </tr>
              </thead>
              <tbody>
                {connections.map((c) => {
                  const fc = score?.forecasts.find((f) => f.businessKey === c.businessKey);
                  const delay = fc?.delayExposureDays ?? 0;
                  return (
                    <tr key={c.id} className="border-b border-slate-800/60 hover:bg-slate-900/50">
                      <td className="px-2 py-2">
                        <span className="font-mono text-[11px] text-sky-300" dir="ltr">{c.businessKey}</span>{' '}
                        <span className="font-medium text-slate-100">{c.title}</span>
                      </td>
                      <td className="px-2 py-2"><Pill tone="violet">{utilityTypeLabel(c.utilityType, ar)}</Pill></td>
                      <td className="px-2 py-2 text-center"><StatusPill status={c.status} ar={ar} /></td>
                      <td className="px-2 py-2 text-end font-mono tabular-nums text-slate-300" dir="ltr">{c.forecastConnectionDate ?? '—'}</td>
                      <td className="px-2 py-2 text-end font-mono tabular-nums text-slate-300" dir="ltr">{c.requiredByDate ?? '—'}</td>
                      <td className="px-2 py-2 text-end font-mono tabular-nums" dir="ltr">
                        <span className={delay > 0 ? 'text-rose-300' : 'text-slate-500'}>{delay}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <div className="mt-3">
          <AddConnectionForm projectKey={projectKey} ar={ar} onDone={refresh} />
        </div>
      </Card>

      {/* Findings */}
      {findings.length > 0 && (
        <Card title={ar ? 'نتائج حوكمة المرافق' : 'Utility governance findings'} hint={ar ? 'تُحسَب حتمياً من حالة التوصيلات (غير مُخزَّنة)' : 'Computed deterministically from connection state (not persisted)'}>
          <div className="space-y-2">
            {findings.map((f, i) => (
              <div key={`${f.type}-${i}`} className="rounded-lg border border-slate-700/70 bg-slate-900/60 px-3 py-2">
                <div className="flex flex-wrap items-center gap-2">
                  <SeverityBadge severity={f.severity} />
                  <GovernanceStatusBadge status={f.severity === 'critical' ? 'orange' : f.severity === 'warning' ? 'yellow' : 'green'} size="sm" showLabel={false} />
                  <Pill tone="slate">{findingTypeLabel(f.type, ar)}</Pill>
                  <span className="flex-1 text-sm font-semibold text-slate-100">{f.title}</span>
                </div>
                <p className="mt-1 text-xs text-slate-300">{f.description}</p>
                <p className="mt-1 text-xs text-sky-200"><IconSparkles className="me-1 inline h-3 w-3" />{f.recommendation}</p>
              </div>
            ))}
          </div>
        </Card>
      )}

      <AiAnalysisPanel endpoint="/utility/ai-analysis" body={{ projectKey }} />
    </div>
  );
}

// ── small presentational pieces ──

function Stat({ label, value, tone = 'slate' }: { label: string; value: string; tone?: 'slate' | 'emerald' | 'amber' }) {
  const color = tone === 'emerald' ? 'text-emerald-300' : tone === 'amber' ? 'text-amber-300' : 'text-slate-100';
  return (
    <div className="rounded-xl border border-slate-700/70 bg-slate-900/60 p-3">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{label}</p>
      <p className={`mt-1 text-base font-bold tabular-nums ${color}`} dir="ltr">{value}</p>
    </div>
  );
}

function StatusPill({ status, ar }: { status: string; ar: boolean }) {
  const map: Record<string, { tone: 'emerald' | 'rose' | 'sky' | 'amber' | 'slate'; en: string; ar: string }> = {
    not_started: { tone: 'slate', en: 'not started', ar: 'لم يبدأ' },
    applied: { tone: 'sky', en: 'applied', ar: 'تم التقديم' },
    in_progress: { tone: 'amber', en: 'in progress', ar: 'قيد التنفيذ' },
    testing: { tone: 'amber', en: 'testing', ar: 'اختبار' },
    energized: { tone: 'emerald', en: 'energized', ar: 'تم التغذية كهربائياً' },
    connected: { tone: 'emerald', en: 'connected', ar: 'موصول' },
  };
  const s = map[status] ?? { tone: 'slate' as const, en: status, ar: status };
  return <Pill tone={s.tone}>{ar ? s.ar : s.en}</Pill>;
}

function AddConnectionForm({ projectKey, ar, onDone }: { projectKey: string; ar: boolean; onDone: () => Promise<void> }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [utilityType, setUtilityType] = useState<(typeof UTILITY_TYPES)[number]>('power');
  const [status, setStatus] = useState<(typeof UTILITY_STATUSES)[number]>('not_started');
  const [applicationDate, setApplicationDate] = useState('');
  const [forecastConnectionDate, setForecastConnectionDate] = useState('');
  const [requiredByDate, setRequiredByDate] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api('/utility/connections', {
        method: 'POST',
        body: JSON.stringify({
          projectKey,
          title,
          utilityType,
          status,
          applicationDate: applicationDate || null,
          forecastConnectionDate: forecastConnectionDate || null,
          requiredByDate: requiredByDate || null,
        }),
      });
      toast.success(ar ? 'تمت إضافة التوصيلة' : 'Connection added');
      setTitle(''); setApplicationDate(''); setForecastConnectionDate(''); setRequiredByDate('');
      setOpen(false);
      await onDone();
    } catch (err) {
      toast.error(ar ? 'فشلت الإضافة' : 'Add failed', (err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const field = 'mt-1 block rounded-lg border border-slate-700 bg-slate-900/70 px-3 py-2 text-sm text-slate-100';

  if (!open) {
    return <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>{ar ? '+ إضافة توصيلة مرفق' : '+ Add connection'}</Button>;
  }
  return (
    <form onSubmit={submit} className="grid grid-cols-1 gap-3 rounded-lg border border-slate-700/70 bg-slate-900/40 p-4 sm:grid-cols-2 lg:grid-cols-3">
      <label className="text-xs text-slate-400">{ar ? 'العنوان' : 'Title'}
        <input required className={field} value={title} onChange={(e) => setTitle(e.target.value)} placeholder={ar ? 'مثال: التغذية الكهربائية الرئيسية' : 'e.g. Primary power supply'} />
      </label>
      <label className="text-xs text-slate-400">{ar ? 'النوع' : 'Type'}
        <select className={field} value={utilityType} onChange={(e) => setUtilityType(e.target.value as (typeof UTILITY_TYPES)[number])}>
          {UTILITY_TYPES.map((t) => <option key={t} value={t}>{utilityTypeLabel(t, ar)}</option>)}
        </select>
      </label>
      <label className="text-xs text-slate-400">{ar ? 'الحالة' : 'Status'}
        <select className={field} value={status} onChange={(e) => setStatus(e.target.value as (typeof UTILITY_STATUSES)[number])}>
          {UTILITY_STATUSES.map((s) => <option key={s} value={s}>{statusLabel(s, ar)}</option>)}
        </select>
      </label>
      <label className="text-xs text-slate-400">{ar ? 'تاريخ التقديم' : 'Application date'}
        <input type="date" className={field} value={applicationDate} onChange={(e) => setApplicationDate(e.target.value)} dir="ltr" />
      </label>
      <label className="text-xs text-slate-400">{ar ? 'تاريخ التوصيل المتوقع' : 'Forecast connection date'}
        <input type="date" className={field} value={forecastConnectionDate} onChange={(e) => setForecastConnectionDate(e.target.value)} dir="ltr" />
      </label>
      <label className="text-xs text-slate-400">{ar ? 'مطلوب بحلول' : 'Required by date'}
        <input type="date" className={field} value={requiredByDate} onChange={(e) => setRequiredByDate(e.target.value)} dir="ltr" />
      </label>
      <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-1">
        <Button type="submit" variant="primary" disabled={busy}>{busy ? '…' : (ar ? 'إضافة' : 'Add connection')}</Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>{ar ? 'إلغاء' : 'Cancel'}</Button>
      </div>
    </form>
  );
}

// ── label maps ──

function utilityTypeLabel(t: string, ar: boolean): string {
  const map: Record<string, { en: string; ar: string }> = {
    power: { en: 'Power', ar: 'كهرباء' },
    water: { en: 'Water', ar: 'مياه' },
    telecom: { en: 'Telecom', ar: 'اتصالات' },
    gas: { en: 'Gas', ar: 'غاز' },
    sewerage: { en: 'Sewerage', ar: 'صرف صحي' },
    district_cooling: { en: 'District cooling', ar: 'تبريد مركزي' },
  };
  const e = map[t];
  return e ? (ar ? e.ar : e.en) : t;
}

function statusLabel(s: string, ar: boolean): string {
  const map: Record<string, { en: string; ar: string }> = {
    not_started: { en: 'Not started', ar: 'لم يبدأ' },
    applied: { en: 'Applied', ar: 'تم التقديم' },
    in_progress: { en: 'In progress', ar: 'قيد التنفيذ' },
    testing: { en: 'Testing', ar: 'اختبار' },
    energized: { en: 'Energized', ar: 'تم التغذية كهربائياً' },
    connected: { en: 'Connected', ar: 'موصول' },
  };
  const e = map[s];
  return e ? (ar ? e.ar : e.en) : s;
}

function findingTypeLabel(t: UtilityFinding['type'], ar: boolean): string {
  const map: Record<UtilityFinding['type'], { en: string; ar: string }> = {
    'delay-exposure': { en: 'Delay', ar: 'تأخير' },
    'required-by-breach': { en: 'Late', ar: 'تأخّر' },
    'stuck-not-started': { en: 'Stuck', ar: 'متعثّر' },
    'forecast-missing': { en: 'Forecast', ar: 'توقّع' },
    'connection-ready': { en: 'Ready', ar: 'جاهز' },
  };
  return ar ? map[t].ar : map[t].en;
}

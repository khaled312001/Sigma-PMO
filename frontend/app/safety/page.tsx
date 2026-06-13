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

// ── Local API response types (the safety surface owns these shapes) ──

interface SafetyRecordRow {
  id: string;
  businessKey: string;
  title: string;
  recordType: string;
  severity: string | null;
  status: string;
  recordDate: string | null;
  stopWork: boolean;
  affectedActivityKeys: string[] | null;
  eotDays: number | null;
}

interface SafetyHealth {
  projectKey: string;
  asOfDate: string;
  complianceScore: number;
  hsePerformanceIndex: number;
  status: 'green' | 'yellow' | 'orange' | 'red';
  trend: 'improving' | 'stable' | 'worsening';
  records: number;
  counts: {
    open: number;
    inProgress: number;
    closed: number;
    openIncidents: number;
    openHighOrCritical: number;
    nearMisses: number;
    correctiveActionsClosed: number;
    inspections: number;
    toolboxTalks: number;
    stopWorkActive: number;
  };
  openBySeverity: Record<string, number>;
  narrative: string;
}

interface SafetyFinding {
  type: 'open-incident' | 'open-corrective-action' | 'overdue-inspection' | 'stop-work' | 'missing-hse-plan' | 'near-miss-signal';
  severity: 'critical' | 'warning' | 'info';
  title: string;
  description: string;
  recommendation: string;
  refs: Record<string, unknown>;
}

interface StopWorkClaimChain {
  recordKey: string;
  title: string;
  recordDate: string | null;
  affectedActivityKeys: string[];
  criticalActivityKeys: string[];
  criticalPathImpact: boolean;
  eotDays: number;
  eotIndicator: boolean;
  claimReady: boolean;
}

interface FindingsResponse {
  findings: SafetyFinding[];
  claimChains: StopWorkClaimChain[];
}

const RECORD_TYPES = [
  'hse_plan', 'daily_report', 'weekly_report', 'monthly_report', 'inspection',
  'permit_to_work', 'incident', 'near_miss', 'corrective_action', 'toolbox_talk', 'audit',
] as const;
const SEVERITIES = ['info', 'low', 'medium', 'high', 'critical'] as const;
const STATUSES = ['open', 'in_progress', 'closed'] as const;

export default function SafetyRoute() {
  return (
    <AuthGate capability="canRunSafety" surface="Safety Governance">
      <SafetyPage />
    </AuthGate>
  );
}

function SafetyPage() {
  const { lang } = useI18n();
  const ar = lang === 'ar';
  const projectKey = useCurrentProjectKey();
  const toast = useToast();
  const [records, setRecords] = useState<SafetyRecordRow[]>([]);
  const [health, setHealth] = useState<SafetyHealth | null>(null);
  const [findings, setFindings] = useState<SafetyFinding[]>([]);
  const [claimChains, setClaimChains] = useState<StopWorkClaimChain[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [recs, hlth, finds] = await Promise.all([
        api<SafetyRecordRow[]>(`/safety/records?projectKey=${encodeURIComponent(projectKey)}`),
        api<SafetyHealth>(`/safety/score?projectKey=${encodeURIComponent(projectKey)}`),
        api<FindingsResponse>(`/safety/findings?projectKey=${encodeURIComponent(projectKey)}`),
      ]);
      setRecords(recs); setHealth(hlth); setFindings(finds.findings); setClaimChains(finds.claimChains);
    } catch (e) {
      toast.error(ar ? 'تعذّر تحميل بيانات السلامة' : 'Failed to load safety data', (e as Error).message);
    }
  }, [projectKey, toast, ar]);

  useEffect(() => { void refresh(); }, [refresh]);

  const run = async () => {
    setBusy('gov');
    try {
      await api('/safety/governance/run', { method: 'POST', body: JSON.stringify({ projectKey }) });
      toast.success(ar ? 'تم تشغيل حوكمة السلامة' : 'Safety governance complete');
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
        eyebrow={`Safety Governance · ext.safety · ${projectKey}`}
        title={ar ? 'حوكمة السلامة' : 'Safety Governance'}
        description={ar
          ? 'حوكمة تنفيذ خطط السلامة والصحة المهنية المعتمدة أثناء التنفيذ — الحوادث والحوادث الوشيكة وأعمال التفتيش وتصاريح العمل والإجراءات التصحيحية وأوامر إيقاف العمل. كل أمر إيقاف عمل يربط: حدث سلامة ← إيقاف العمل ← تأخير ← المسار الحرج ← تمديد المدة ← جاهزية المطالبة.'
          : 'Govern implementation of approved HSE plans during execution — incidents, near-misses, inspections, permits, corrective actions and stop-work orders. Every stop-work links Safety Event → Stop Work → Delay → Critical Path → EOT → Claim readiness.'}
        actions={(
          <Button variant="success" size="sm" disabled={busy === 'gov'} onClick={run}>
            {busy === 'gov' ? (ar ? 'جارٍ…' : 'Running…') : (ar ? 'تشغيل حوكمة السلامة' : 'Run safety governance')}
          </Button>
        )}
      />

      {/* Safety scores + position */}
      <div className="grid gap-6 lg:grid-cols-[auto,1fr]">
        <Card title={ar ? 'درجات السلامة' : 'Safety Scores'} hint={health ? `${ar ? 'حتى' : 'as of'} ${health.asOfDate}` : undefined}>
          {!health ? (
            <p className="text-sm text-slate-400">…</p>
          ) : (
            <div className="flex flex-col items-center gap-3">
              <GaugeChart
                value={health.complianceScore}
                max={100}
                width={220}
                label={`${health.complianceScore}`}
                hint={ar ? 'الامتثال للسلامة' : 'Compliance'}
              />
              <GovernanceStatusBadge status={health.status} />
              <div className="grid w-full grid-cols-2 gap-2">
                <Component label={ar ? 'مؤشر أداء السلامة' : 'HSE index'} value={health.hsePerformanceIndex / 100} ar={ar} />
                <TrendPill trend={health.trend} ar={ar} />
              </div>
            </div>
          )}
        </Card>

        <Card title={ar ? 'الموقف العام للسلامة' : 'Safety position'} hint={health?.narrative}>
          {!health ? (
            <p className="text-sm text-slate-400">…</p>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <Stat label={ar ? 'مفتوح' : 'Open'} value={String(health.counts.open)} tone="amber" />
                <Stat label={ar ? 'قيد التنفيذ' : 'In progress'} value={String(health.counts.inProgress)} />
                <Stat label={ar ? 'مُغلق' : 'Closed'} value={String(health.counts.closed)} tone="emerald" />
                <Stat label={ar ? 'حوادث مفتوحة' : 'Open incidents'} value={String(health.counts.openIncidents)} tone="amber" />
                <Stat label={ar ? 'إيقاف عمل نشط' : 'Active stop-work'} value={String(health.counts.stopWorkActive)} tone="amber" />
                <Stat label={ar ? 'الحوادث الوشيكة' : 'Near-misses'} value={String(health.counts.nearMisses)} tone="emerald" />
              </div>
            </div>
          )}
        </Card>
      </div>

      {/* Stop-work claim chains */}
      {claimChains.length > 0 && (
        <Card
          title={ar ? 'سلسلة مطالبات إيقاف العمل' : 'Stop-work claim chains'}
          hint={ar ? 'حدث سلامة ← إيقاف العمل ← تأخير ← المسار الحرج ← تمديد المدة ← جاهزية المطالبة' : 'Safety Event → Stop Work → Delay → Critical Path → EOT → Claim readiness'}
        >
          <div className="space-y-2">
            {claimChains.map((c) => (
              <div key={c.recordKey} className="rounded-lg border border-slate-700/70 bg-slate-900/60 px-3 py-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-[11px] text-sky-300" dir="ltr">{c.recordKey}</span>
                  <span className="flex-1 text-sm font-semibold text-slate-100">{c.title}</span>
                  <Pill tone={c.claimReady ? 'emerald' : 'slate'}>{c.claimReady ? (ar ? 'المطالبة جاهزة' : 'claim ready') : (ar ? 'غير جاهزة' : 'not ready')}</Pill>
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px]">
                  <ChainStep label={ar ? 'حدث سلامة' : 'Safety event'} tone="rose" />
                  <ChainStep label={ar ? 'إيقاف العمل' : 'Stop work'} tone="rose" />
                  <ChainStep label={`${ar ? 'تأخير' : 'Delay'} ${c.eotDays}d`} tone={c.eotDays > 0 ? 'amber' : 'slate'} />
                  <ChainStep label={c.criticalPathImpact ? (ar ? 'تأثير على المسار الحرج' : 'critical-path impact') : (ar ? 'لا تأثير حرج' : 'no critical impact')} tone={c.criticalPathImpact ? 'rose' : 'slate'} />
                  <ChainStep label={c.eotIndicator ? (ar ? 'تمديد مدة' : 'EOT') : (ar ? 'لا تمديد' : 'no EOT')} tone={c.eotIndicator ? 'amber' : 'slate'} />
                  <ChainStep label={c.claimReady ? (ar ? 'جاهزة' : 'ready') : (ar ? 'قيد التقييم' : 'pending')} tone={c.claimReady ? 'emerald' : 'slate'} />
                </div>
                {c.affectedActivityKeys.length > 0 && (
                  <p className="mt-1 text-[11px] text-slate-400" dir="ltr">
                    {(ar ? 'الأنشطة المتأثرة: ' : 'Affected: ')}{c.affectedActivityKeys.join(', ')}
                    {c.criticalActivityKeys.length > 0 && (
                      <span className="text-rose-300"> · {(ar ? 'حرجة: ' : 'critical: ')}{c.criticalActivityKeys.join(', ')}</span>
                    )}
                  </p>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Records table */}
      <Card
        title={ar ? 'سجلات السلامة' : 'Safety records'}
        hint={ar ? 'النوع، الخطورة، الحالة، التاريخ، إيقاف العمل، الأنشطة المتأثرة، تمديد المدة' : 'Type, severity, status, date, stop-work, affected activities, EOT'}
      >
        {records.length === 0 ? (
          <EmptyState
            title={ar ? 'لا توجد سجلات بعد' : 'No records yet'}
            description={ar ? 'أضف أول سجل سلامة (ابدأ بخطة السلامة المعتمدة) لبدء حوكمة الامتثال والمؤشرات.' : 'Add the first safety record (start with the approved HSE plan) to begin compliance + index governance.'}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b border-slate-800 text-start text-[11px] uppercase tracking-wider text-slate-400">
                  <th className="px-2 py-2 text-start">{ar ? 'السجل' : 'Record'}</th>
                  <th className="px-2 py-2 text-start">{ar ? 'النوع' : 'Type'}</th>
                  <th className="px-2 py-2 text-center">{ar ? 'الخطورة' : 'Severity'}</th>
                  <th className="px-2 py-2 text-center">{ar ? 'الحالة' : 'Status'}</th>
                  <th className="px-2 py-2 text-end">{ar ? 'التاريخ' : 'Date'}</th>
                  <th className="px-2 py-2 text-center">{ar ? 'إيقاف العمل' : 'Stop-work'}</th>
                </tr>
              </thead>
              <tbody>
                {records.map((r) => (
                  <tr key={r.id} className="border-b border-slate-800/60 hover:bg-slate-900/50">
                    <td className="px-2 py-2">
                      <span className="font-mono text-[11px] text-sky-300" dir="ltr">{r.businessKey}</span>{' '}
                      <span className="font-medium text-slate-100">{r.title}</span>
                    </td>
                    <td className="px-2 py-2"><Pill tone="violet">{recordTypeLabel(r.recordType, ar)}</Pill></td>
                    <td className="px-2 py-2 text-center">{r.severity ? <SeverityBadge severity={severityToBadge(r.severity)} /> : <span className="text-xs text-slate-500">—</span>}</td>
                    <td className="px-2 py-2 text-center"><StatusPill status={r.status} ar={ar} /></td>
                    <td className="px-2 py-2 text-end font-mono tabular-nums text-slate-300" dir="ltr">{r.recordDate ?? '—'}</td>
                    <td className="px-2 py-2 text-center">
                      {r.stopWork
                        ? <Pill tone="rose">{ar ? `إيقاف · ${r.eotDays ?? 0}d` : `stop · ${r.eotDays ?? 0}d`}</Pill>
                        : <span className="text-xs text-slate-500">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="mt-3">
          <AddRecordForm projectKey={projectKey} ar={ar} onDone={refresh} />
        </div>
      </Card>

      {/* Findings (Safety Risk Register) */}
      {findings.length > 0 && (
        <Card title={ar ? 'سجل مخاطر السلامة' : 'Safety risk register'} hint={ar ? 'يُحسَب حتمياً من حالة السجلات (غير مُخزَّن)' : 'Computed deterministically from record state (not persisted)'}>
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

      <AiAnalysisPanel endpoint="/safety/ai-analysis" body={{ projectKey }} />
    </div>
  );
}

// ── small presentational pieces ──

function Component({ label, value, ar }: { label: string; value: number; ar: boolean }) {
  const tone = value >= 0.75 ? 'text-emerald-300' : value >= 0.5 ? 'text-amber-300' : 'text-rose-300';
  return (
    <div className="rounded-lg border border-slate-700/70 bg-slate-900/60 px-2 py-1.5 text-center">
      <p className="text-[9px] uppercase tracking-wider text-slate-400">{label}</p>
      <p className={`text-sm font-bold tabular-nums ${tone}`} dir="ltr">{(value * 100).toFixed(0)}</p>
    </div>
  );
}

function TrendPill({ trend, ar }: { trend: 'improving' | 'stable' | 'worsening'; ar: boolean }) {
  const map: Record<string, { tone: 'emerald' | 'amber' | 'rose'; en: string; ar: string }> = {
    improving: { tone: 'emerald', en: 'improving', ar: 'يتحسّن' },
    stable: { tone: 'amber', en: 'stable', ar: 'مستقر' },
    worsening: { tone: 'rose', en: 'worsening', ar: 'يتدهور' },
  };
  const t = map[trend];
  return (
    <div className="rounded-lg border border-slate-700/70 bg-slate-900/60 px-2 py-1.5 text-center">
      <p className="text-[9px] uppercase tracking-wider text-slate-400">{ar ? 'الاتجاه' : 'Trend'}</p>
      <div className="mt-0.5"><Pill tone={t.tone}>{ar ? t.ar : t.en}</Pill></div>
    </div>
  );
}

function ChainStep({ label, tone }: { label: string; tone: 'rose' | 'amber' | 'emerald' | 'slate' }) {
  return <Pill tone={tone}>{label}</Pill>;
}

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
  const map: Record<string, { tone: 'emerald' | 'amber' | 'sky' | 'slate'; en: string; ar: string }> = {
    open: { tone: 'amber', en: 'open', ar: 'مفتوح' },
    in_progress: { tone: 'sky', en: 'in progress', ar: 'قيد التنفيذ' },
    closed: { tone: 'emerald', en: 'closed', ar: 'مُغلق' },
  };
  const s = map[status] ?? { tone: 'slate' as const, en: status, ar: status };
  return <Pill tone={s.tone}>{ar ? s.ar : s.en}</Pill>;
}

function AddRecordForm({ projectKey, ar, onDone }: { projectKey: string; ar: boolean; onDone: () => Promise<void> }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [recordType, setRecordType] = useState<(typeof RECORD_TYPES)[number]>('inspection');
  const [severity, setSeverity] = useState<(typeof SEVERITIES)[number] | ''>('');
  const [status, setStatus] = useState<(typeof STATUSES)[number]>('open');
  const [recordDate, setRecordDate] = useState('');
  const [stopWork, setStopWork] = useState(false);
  const [affected, setAffected] = useState('');
  const [eotDays, setEotDays] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api('/safety/records', {
        method: 'POST',
        body: JSON.stringify({
          projectKey,
          title,
          recordType,
          severity: severity || null,
          status,
          recordDate: recordDate || null,
          stopWork,
          affectedActivityKeys: affected.trim() ? affected.split(',').map((s) => s.trim()).filter(Boolean) : null,
          eotDays: eotDays ? Number(eotDays) : null,
        }),
      });
      toast.success(ar ? 'تمت إضافة السجل' : 'Record added');
      setTitle(''); setSeverity(''); setRecordDate(''); setStopWork(false); setAffected(''); setEotDays('');
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
    return <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>{ar ? '+ إضافة سجل سلامة' : '+ Add safety record'}</Button>;
  }
  return (
    <form onSubmit={submit} className="grid grid-cols-1 gap-3 rounded-lg border border-slate-700/70 bg-slate-900/40 p-4 sm:grid-cols-2 lg:grid-cols-3">
      <label className="text-xs text-slate-400">{ar ? 'العنوان' : 'Title'}
        <input required className={field} value={title} onChange={(e) => setTitle(e.target.value)} placeholder={ar ? 'مثال: تفتيش السقالات' : 'e.g. Scaffold inspection'} />
      </label>
      <label className="text-xs text-slate-400">{ar ? 'النوع' : 'Type'}
        <select className={field} value={recordType} onChange={(e) => setRecordType(e.target.value as (typeof RECORD_TYPES)[number])}>
          {RECORD_TYPES.map((t) => <option key={t} value={t}>{recordTypeLabel(t, ar)}</option>)}
        </select>
      </label>
      <label className="text-xs text-slate-400">{ar ? 'الخطورة' : 'Severity'}
        <select className={field} value={severity} onChange={(e) => setSeverity(e.target.value as (typeof SEVERITIES)[number] | '')}>
          <option value="">{ar ? '— لا يوجد' : '— none'}</option>
          {SEVERITIES.map((s) => <option key={s} value={s}>{severityLabel(s, ar)}</option>)}
        </select>
      </label>
      <label className="text-xs text-slate-400">{ar ? 'الحالة' : 'Status'}
        <select className={field} value={status} onChange={(e) => setStatus(e.target.value as (typeof STATUSES)[number])}>
          {STATUSES.map((s) => <option key={s} value={s}>{statusLabel(s, ar)}</option>)}
        </select>
      </label>
      <label className="text-xs text-slate-400">{ar ? 'التاريخ' : 'Date'}
        <input type="date" className={field} value={recordDate} onChange={(e) => setRecordDate(e.target.value)} dir="ltr" />
      </label>
      <label className="text-xs text-slate-400">{ar ? 'تمديد المدة (أيام)' : 'EOT (days)'}
        <input type="number" min="0" step="1" className={field} value={eotDays} onChange={(e) => setEotDays(e.target.value)} />
      </label>
      <label className="text-xs text-slate-400 sm:col-span-2">{ar ? 'الأنشطة المتأثرة (مفصولة بفواصل)' : 'Affected activities (comma-separated)'}
        <input className={field} value={affected} onChange={(e) => setAffected(e.target.value)} placeholder="WBS-1.2, WBS-3.4" dir="ltr" />
      </label>
      <label className="flex items-center gap-2 text-xs text-slate-400">
        <input type="checkbox" checked={stopWork} onChange={(e) => setStopWork(e.target.checked)} className="h-4 w-4 rounded border-slate-700 bg-slate-900" />
        {ar ? 'أمر إيقاف عمل' : 'Stop-work order'}
      </label>
      <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-1">
        <Button type="submit" variant="primary" disabled={busy}>{busy ? '…' : (ar ? 'إضافة' : 'Add record')}</Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>{ar ? 'إلغاء' : 'Cancel'}</Button>
      </div>
    </form>
  );
}

// ── label maps + formatters ──

function recordTypeLabel(t: string, ar: boolean): string {
  const map: Record<string, { en: string; ar: string }> = {
    hse_plan: { en: 'HSE plan', ar: 'خطة السلامة' },
    daily_report: { en: 'Daily report', ar: 'تقرير يومي' },
    weekly_report: { en: 'Weekly report', ar: 'تقرير أسبوعي' },
    monthly_report: { en: 'Monthly report', ar: 'تقرير شهري' },
    inspection: { en: 'Inspection', ar: 'تفتيش' },
    permit_to_work: { en: 'Permit to work', ar: 'تصريح عمل' },
    incident: { en: 'Incident', ar: 'حادث' },
    near_miss: { en: 'Near-miss', ar: 'الحادث الوشيك' },
    corrective_action: { en: 'Corrective action', ar: 'إجراء تصحيحي' },
    toolbox_talk: { en: 'Toolbox talk', ar: 'محادثة السلامة التمهيدية' },
    audit: { en: 'Audit', ar: 'تدقيق' },
  };
  const e = map[t];
  return e ? (ar ? e.ar : e.en) : t;
}

function severityLabel(s: string, ar: boolean): string {
  const map: Record<string, { en: string; ar: string }> = {
    info: { en: 'Info', ar: 'معلومة' },
    low: { en: 'Low', ar: 'منخفضة' },
    medium: { en: 'Medium', ar: 'متوسطة' },
    high: { en: 'High', ar: 'عالية' },
    critical: { en: 'Critical', ar: 'حرجة' },
  };
  const e = map[s];
  return e ? (ar ? e.ar : e.en) : s;
}

function statusLabel(s: string, ar: boolean): string {
  const map: Record<string, { en: string; ar: string }> = {
    open: { en: 'Open', ar: 'مفتوح' },
    in_progress: { en: 'In progress', ar: 'قيد التنفيذ' },
    closed: { en: 'Closed', ar: 'مُغلق' },
  };
  const e = map[s];
  return e ? (ar ? e.ar : e.en) : s;
}

/** Map the record's 5-band severity onto the SeverityBadge's 3-band scale. */
function severityToBadge(s: string): 'critical' | 'warning' | 'info' {
  if (s === 'critical' || s === 'high') return 'critical';
  if (s === 'medium' || s === 'low') return 'warning';
  return 'info';
}

function findingTypeLabel(t: SafetyFinding['type'], ar: boolean): string {
  const map: Record<SafetyFinding['type'], { en: string; ar: string }> = {
    'open-incident': { en: 'Incident', ar: 'حادث' },
    'open-corrective-action': { en: 'Corrective', ar: 'إجراء تصحيحي' },
    'overdue-inspection': { en: 'Inspection', ar: 'تفتيش' },
    'stop-work': { en: 'Stop-work', ar: 'إيقاف عمل' },
    'missing-hse-plan': { en: 'HSE plan', ar: 'خطة السلامة' },
    'near-miss-signal': { en: 'Near-miss', ar: 'الحادث الوشيك' },
  };
  return ar ? map[t].ar : map[t].en;
}

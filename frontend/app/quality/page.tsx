'use client';

import { useCallback, useEffect, useState } from 'react';

import { AiAnalysisPanel } from '../../components/AiAnalysisPanel';
import { AuthGate } from '../../components/AuthGate';
import { RecordActions } from '../../components/RecordActions';
import { useToast } from '../../components/ToastProvider';
import { useI18n } from '../../lib/i18n';
import { useCurrentProjectKey } from '../../lib/project-context';
import { api } from '../../lib/api';
import { Button, Card, EmptyState, PageHeader, Pill, SeverityBadge } from '../../components/ui';

interface QualityRow {
  id: string; businessKey: string; title: string; recordType: string; severity: string | null;
  status: string; recordDate: string | null; disposition: string | null; inspectionResult: string | null;
  holdPoint: boolean; blocksProgress: boolean; eotDays: number | null; costImpact: string | null;
}
interface QualityHealth {
  complianceScore: number; firstPassRate: number; status: 'green' | 'yellow' | 'orange' | 'red'; trend: string; records: number;
  counts: { openNcrs: number; openHighOrCritical: number; failedInspections: number; inspections: number; itps: number; blockingNcrs: number };
  narrative: string;
}
interface QualityFinding { type: string; severity: 'critical' | 'warning' | 'info'; title: string; description: string; recommendation: string }
interface NcrClaimChain { recordKey: string; title: string; eotDays: number; costImpact: number; criticalPathImpact: boolean; claimReady: boolean; affectedActivityKeys: string[] }

const RECORD_TYPES = ['inspection_request', 'material_inspection', 'method_statement', 'itp', 'ncr', 'corrective_action', 'test_report'] as const;
const SEVERITIES = ['info', 'low', 'medium', 'high', 'critical'] as const;
const RESULTS = ['', 'pass', 'fail', 'conditional'] as const;

export default function QualityRoute() {
  return (
    <AuthGate capability="canRunQuality" surface="QA/QC Governance">
      <QualityPage />
    </AuthGate>
  );
}

function QualityPage() {
  const { lang } = useI18n();
  const ar = lang === 'ar';
  const projectKey = useCurrentProjectKey();
  const toast = useToast();
  const [records, setRecords] = useState<QualityRow[]>([]);
  const [health, setHealth] = useState<QualityHealth | null>(null);
  const [findings, setFindings] = useState<QualityFinding[]>([]);
  const [chains, setChains] = useState<NcrClaimChain[]>([]);

  const refresh = useCallback(async () => {
    try {
      const [recs, hlth, finds] = await Promise.all([
        api<QualityRow[]>(`/quality/records?projectKey=${encodeURIComponent(projectKey)}`),
        api<QualityHealth>(`/quality/score?projectKey=${encodeURIComponent(projectKey)}`),
        api<{ findings: QualityFinding[]; claimChains: NcrClaimChain[] }>(`/quality/findings?projectKey=${encodeURIComponent(projectKey)}`),
      ]);
      setRecords(recs); setHealth(hlth); setFindings(finds.findings); setChains(finds.claimChains);
    } catch (e) { toast.error(ar ? 'تعذّر تحميل بيانات الجودة' : 'Failed to load quality data', (e as Error).message); }
  }, [projectKey, toast, ar]);

  useEffect(() => { void refresh(); }, [refresh]);

  const statusTone = (s?: string) => (s === 'green' ? 'emerald' : s === 'yellow' ? 'amber' : s === 'orange' ? 'amber' : 'rose');

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={`QA/QC Governance · ${projectKey}`}
        title={ar ? 'حوكمة الجودة (QA/QC)' : 'QA/QC Governance'}
        description={ar
          ? 'دورة الجودة الكاملة: طلبات التفتيش (WIR) وفحص المواد (MIR) وبيانات الطريقة وخطط التفتيش والاختبار (ITP) بنقاط التوقّف والمعاينة وتقارير عدم المطابقة (NCR). كل NCR مُعيق يربط: عدم مطابقة ← إعادة عمل ← تأخير + تكلفة ← المسار الحرج ← تمديد/تكلفة ← جاهزية المطالبة.'
          : 'The full quality lifecycle: WIR/MIR inspections, method statements, ITPs with hold & witness points, and NCRs. Every blocking NCR links NCR → Rework → Delay + Cost → Critical Path → EOT/Cost → Claim readiness.'}
      />

      {health && (
        <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-6">
          <Stat label={ar ? 'الامتثال' : 'Compliance'} value={`${health.complianceScore}`} tone={statusTone(health.status)} />
          <Stat label={ar ? 'القبول من أول مرة' : 'First-pass'} value={`${health.firstPassRate}%`} />
          <Stat label={ar ? 'NCR مفتوحة' : 'Open NCRs'} value={`${health.counts.openNcrs}`} tone="amber" />
          <Stat label={ar ? 'NCR مُعيقة' : 'Blocking NCRs'} value={`${health.counts.blockingNcrs}`} tone="rose" />
          <Stat label={ar ? 'فحوص راسبة' : 'Failed insp.'} value={`${health.counts.failedInspections}`} tone="rose" />
          <Stat label={ar ? 'خطط ITP' : 'ITPs'} value={`${health.counts.itps}`} tone="emerald" />
        </div>
      )}

      {chains.length > 0 && (
        <Card title={ar ? 'سلسلة مطالبات عدم المطابقة' : 'NCR claim chains'} hint={ar ? 'عدم مطابقة ← إعادة عمل ← تأخير + تكلفة ← المسار الحرج ← المطالبة' : 'NCR → Rework → Delay + Cost → Critical Path → Claim'}>
          <div className="space-y-2">
            {chains.map((c) => (
              <div key={c.recordKey} className="rounded-lg border border-slate-700/70 bg-slate-900/60 px-3 py-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-[11px] text-sky-300" dir="ltr">{c.recordKey}</span>
                  <span className="flex-1 text-sm font-semibold text-slate-100">{c.title}</span>
                  <Pill tone={c.claimReady ? 'emerald' : 'slate'}>{c.claimReady ? (ar ? 'المطالبة جاهزة' : 'claim ready') : (ar ? 'غير جاهزة' : 'not ready')}</Pill>
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px]">
                  <Pill tone="rose">{ar ? 'عدم مطابقة' : 'NCR'}</Pill>
                  <Pill tone={c.eotDays > 0 ? 'amber' : 'slate'}>{ar ? 'تأخير' : 'Delay'} {c.eotDays}d</Pill>
                  <Pill tone={c.costImpact > 0 ? 'amber' : 'slate'}>{ar ? 'تكلفة' : 'Cost'} {c.costImpact}</Pill>
                  <Pill tone={c.criticalPathImpact ? 'rose' : 'slate'}>{c.criticalPathImpact ? (ar ? 'مسار حرج' : 'critical path') : (ar ? 'لا تأثير حرج' : 'no critical')}</Pill>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card title={ar ? 'سجلات الجودة' : 'Quality records'} hint={health?.narrative}>
        {records.length === 0 ? (
          <EmptyState title={ar ? 'لا توجد سجلات بعد' : 'No records yet'} description={ar ? 'أضف خطة تفتيش واختبار (ITP) أو طلب تفتيش (WIR) أو تقرير عدم مطابقة (NCR) لبدء حوكمة الجودة.' : 'Add an ITP, an inspection request (WIR) or an NCR to begin quality governance.'} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead><tr className="border-b border-slate-800 text-[11px] uppercase tracking-wider text-slate-400">
                <th className="px-2 py-2 text-start">{ar ? 'السجل' : 'Record'}</th>
                <th className="px-2 py-2 text-start">{ar ? 'النوع' : 'Type'}</th>
                <th className="px-2 py-2 text-center">{ar ? 'الخطورة' : 'Severity'}</th>
                <th className="px-2 py-2 text-center">{ar ? 'النتيجة' : 'Result'}</th>
                <th className="px-2 py-2 text-center">{ar ? 'الحالة' : 'Status'}</th>
                <th className="px-2 py-2 text-center">{ar ? 'مُعيق' : 'Blocks'}</th>
                <th className="px-2 py-2 text-end"></th>
              </tr></thead>
              <tbody>
                {records.map((r) => (
                  <tr key={r.id} className="border-b border-slate-800/60 hover:bg-slate-900/50">
                    <td className="px-2 py-2"><span className="font-mono text-[11px] text-sky-300" dir="ltr">{r.businessKey}</span> <span className="font-medium text-slate-100">{r.title}</span></td>
                    <td className="px-2 py-2"><Pill tone="violet">{typeLabel(r.recordType, ar)}</Pill></td>
                    <td className="px-2 py-2 text-center">{r.severity ? <SeverityBadge severity={sevBadge(r.severity)} /> : <span className="text-xs text-slate-500">—</span>}</td>
                    <td className="px-2 py-2 text-center">{r.inspectionResult ? <Pill tone={r.inspectionResult === 'pass' ? 'emerald' : r.inspectionResult === 'fail' ? 'rose' : 'amber'}>{r.inspectionResult}</Pill> : <span className="text-xs text-slate-500">—</span>}</td>
                    <td className="px-2 py-2 text-center"><Pill tone={r.status === 'closed' ? 'emerald' : r.status === 'in_progress' ? 'sky' : 'amber'}>{r.status}</Pill></td>
                    <td className="px-2 py-2 text-center">{r.blocksProgress ? <Pill tone="rose">{ar ? `إعاقة · ${r.eotDays ?? 0}d` : `block · ${r.eotDays ?? 0}d`}</Pill> : <span className="text-xs text-slate-500">—</span>}</td>
                    <td className="px-2 py-2 text-end"><RecordActions table="quality_record" id={r.id} record={r as unknown as Record<string, unknown>} fields={['title', 'status', 'disposition']} onChanged={refresh} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="mt-3"><AddQualityForm projectKey={projectKey} ar={ar} onDone={refresh} /></div>
      </Card>

      {findings.length > 0 && (
        <Card title={ar ? 'سجل مخاطر الجودة' : 'Quality risk register'} hint={ar ? 'يُحسَب حتمياً من حالة السجلات' : 'Computed deterministically from record state'}>
          <div className="space-y-2">
            {findings.map((f, i) => (
              <div key={i} className="rounded-lg border border-slate-700/70 bg-slate-900/60 px-3 py-2">
                <div className="flex flex-wrap items-center gap-2"><SeverityBadge severity={f.severity} /><span className="flex-1 text-sm font-semibold text-slate-100">{f.title}</span></div>
                <p className="mt-1 text-xs text-slate-300">{f.description}</p>
                <p className="mt-1 text-xs text-sky-200">↳ {f.recommendation}</p>
              </div>
            ))}
          </div>
        </Card>
      )}

      <AiAnalysisPanel endpoint="/quality/ai-analysis" body={{ projectKey }} />
    </div>
  );
}

function Stat({ label, value, tone = 'slate' }: { label: string; value: string; tone?: 'slate' | 'emerald' | 'amber' | 'rose' }) {
  const color = tone === 'emerald' ? 'text-emerald-300' : tone === 'amber' ? 'text-amber-300' : tone === 'rose' ? 'text-rose-300' : 'text-slate-100';
  return (
    <div className="rounded-xl border border-slate-700/70 bg-slate-900/60 p-3">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{label}</p>
      <p className={`mt-1 text-base font-bold tabular-nums ${color}`} dir="ltr">{value}</p>
    </div>
  );
}

function AddQualityForm({ projectKey, ar, onDone }: { projectKey: string; ar: boolean; onDone: () => Promise<void> }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [recordType, setRecordType] = useState<(typeof RECORD_TYPES)[number]>('ncr');
  const [severity, setSeverity] = useState('');
  const [inspectionResult, setInspectionResult] = useState('');
  const [blocksProgress, setBlocksProgress] = useState(false);
  const [holdPoint, setHoldPoint] = useState(false);
  const [affected, setAffected] = useState('');
  const [eotDays, setEotDays] = useState('');
  const [costImpact, setCostImpact] = useState('');
  const [busy, setBusy] = useState(false);
  const field = 'mt-1 block w-full rounded-lg border border-slate-700 bg-slate-900/70 px-3 py-2 text-sm text-slate-100';

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true);
    try {
      await api('/quality/records', { method: 'POST', body: JSON.stringify({
        projectKey, title, recordType, severity: severity || null, inspectionResult: inspectionResult || null,
        blocksProgress, holdPoint, affectedActivityKeys: affected.trim() ? affected.split(',').map((s) => s.trim()).filter(Boolean) : null,
        eotDays: eotDays ? Number(eotDays) : null, costImpact: costImpact ? Number(costImpact) : null,
      }) });
      toast.success(ar ? 'تمت الإضافة' : 'Record added');
      setTitle(''); setSeverity(''); setInspectionResult(''); setBlocksProgress(false); setHoldPoint(false); setAffected(''); setEotDays(''); setCostImpact(''); setOpen(false);
      await onDone();
    } catch (err) { toast.error(ar ? 'فشلت الإضافة' : 'Add failed', (err as Error).message); } finally { setBusy(false); }
  };

  if (!open) return <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>{ar ? '+ إضافة سجل جودة' : '+ Add quality record'}</Button>;
  return (
    <form onSubmit={submit} className="grid grid-cols-1 gap-3 rounded-lg border border-slate-700/70 bg-slate-900/40 p-4 sm:grid-cols-2 lg:grid-cols-3">
      <label className="text-xs text-slate-400">{ar ? 'العنوان' : 'Title'}<input required className={field} value={title} onChange={(e) => setTitle(e.target.value)} placeholder={ar ? 'مثال: عدم مطابقة صبّة العمود' : 'e.g. Column concrete NCR'} /></label>
      <label className="text-xs text-slate-400">{ar ? 'النوع' : 'Type'}<select className={field} value={recordType} onChange={(e) => setRecordType(e.target.value as (typeof RECORD_TYPES)[number])}>{RECORD_TYPES.map((t) => <option key={t} value={t}>{typeLabel(t, ar)}</option>)}</select></label>
      <label className="text-xs text-slate-400">{ar ? 'الخطورة' : 'Severity'}<select className={field} value={severity} onChange={(e) => setSeverity(e.target.value)}><option value="">{ar ? '— لا يوجد' : '— none'}</option>{SEVERITIES.map((s) => <option key={s} value={s}>{s}</option>)}</select></label>
      <label className="text-xs text-slate-400">{ar ? 'نتيجة الفحص' : 'Inspection result'}<select className={field} value={inspectionResult} onChange={(e) => setInspectionResult(e.target.value)}>{RESULTS.map((s) => <option key={s} value={s}>{s || (ar ? '— لا يوجد' : '— none')}</option>)}</select></label>
      <label className="text-xs text-slate-400">{ar ? 'تمديد المدة (أيام)' : 'EOT (days)'}<input type="number" min="0" className={field} value={eotDays} onChange={(e) => setEotDays(e.target.value)} /></label>
      <label className="text-xs text-slate-400">{ar ? 'أثر التكلفة' : 'Cost impact'}<input type="number" min="0" className={field} value={costImpact} onChange={(e) => setCostImpact(e.target.value)} /></label>
      <label className="text-xs text-slate-400 sm:col-span-2">{ar ? 'الأنشطة المتأثرة (مفصولة بفواصل)' : 'Affected activities (comma-separated)'}<input className={field} value={affected} onChange={(e) => setAffected(e.target.value)} placeholder="WBS-1.2, WBS-3.4" dir="ltr" /></label>
      <label className="flex items-center gap-2 text-xs text-slate-400"><input type="checkbox" checked={blocksProgress} onChange={(e) => setBlocksProgress(e.target.checked)} className="h-4 w-4" />{ar ? 'يُعيق التقدّم' : 'Blocks progress'}</label>
      <label className="flex items-center gap-2 text-xs text-slate-400"><input type="checkbox" checked={holdPoint} onChange={(e) => setHoldPoint(e.target.checked)} className="h-4 w-4" />{ar ? 'نقطة توقّف' : 'Hold point'}</label>
      <div className="flex items-end gap-2"><Button type="submit" variant="primary" disabled={busy}>{busy ? '…' : (ar ? 'إضافة' : 'Add')}</Button><Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>{ar ? 'إلغاء' : 'Cancel'}</Button></div>
    </form>
  );
}

function typeLabel(t: string, ar: boolean): string {
  const map: Record<string, { en: string; ar: string }> = {
    inspection_request: { en: 'WIR', ar: 'طلب تفتيش' },
    material_inspection: { en: 'MIR', ar: 'فحص مواد' },
    method_statement: { en: 'Method statement', ar: 'بيان طريقة' },
    itp: { en: 'ITP', ar: 'خطة تفتيش' },
    ncr: { en: 'NCR', ar: 'عدم مطابقة' },
    corrective_action: { en: 'Corrective', ar: 'إجراء تصحيحي' },
    test_report: { en: 'Test report', ar: 'تقرير اختبار' },
  };
  const e = map[t];
  return e ? (ar ? e.ar : e.en) : t;
}
function sevBadge(s: string): 'critical' | 'warning' | 'info' {
  if (s === 'critical' || s === 'high') return 'critical';
  if (s === 'medium' || s === 'low') return 'warning';
  return 'info';
}

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

// ── Local API response types (the fire-safety surface owns these shapes) ──

interface FireSafetyRecordRow {
  id: string;
  businessKey: string;
  title: string;
  recordType: string;
  authority: string | null;
  status: string;
  openComments: number;
  submittedDate: string | null;
  approvalForecastDate: string | null;
  severity: string | null;
}

interface OutstandingCommentsRow {
  businessKey: string;
  title: string;
  recordType: string;
  status: string;
  openComments: number;
}

interface ApprovalForecast {
  businessKey: string | null;
  title: string | null;
  approvalForecastDate: string | null;
  daysToForecast: number | null;
  flag: 'overdue' | 'at-risk' | 'on-track' | 'none';
}

interface FireReadiness {
  projectKey: string;
  asOfDate: string;
  score: number;
  status: 'green' | 'yellow' | 'orange' | 'red';
  components: { approvalRate: number; commentBurden: number; rejectionFreedom: number };
  records: number;
  totals: { approved: number; rejected: number; openCommentRecords: number; outstandingComments: number };
  outstandingComments: OutstandingCommentsRow[];
  approvalForecast: ApprovalForecast;
  narrative: string;
}

interface FireSafetyFinding {
  type: 'rejected-record' | 'outstanding-comments' | 'approval-overdue' | 'approval-at-risk' | 'fire-readiness';
  severity: 'critical' | 'warning' | 'info';
  title: string;
  description: string;
  recommendation: string;
  refs: Record<string, unknown>;
}

const RECORD_TYPES = ['fire_strategy', 'fire_drawing', 'civil_defense_review', 'testing_commissioning', 'inspection'] as const;
const RECORD_STATUSES = ['draft', 'submitted', 'under_review', 'comments', 'approved', 'rejected'] as const;

export default function FireSafetyRoute() {
  return (
    <AuthGate capability="canRunFireLifeSafety" surface="Fire & Life Safety Governance">
      <FireSafetyPage />
    </AuthGate>
  );
}

function FireSafetyPage() {
  const { lang } = useI18n();
  const ar = lang === 'ar';
  const projectKey = useCurrentProjectKey();
  const toast = useToast();
  const [records, setRecords] = useState<FireSafetyRecordRow[]>([]);
  const [readiness, setReadiness] = useState<FireReadiness | null>(null);
  const [findings, setFindings] = useState<FireSafetyFinding[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [recs, score, finds] = await Promise.all([
        api<FireSafetyRecordRow[]>(`/fire-safety/records?projectKey=${encodeURIComponent(projectKey)}`),
        api<FireReadiness>(`/fire-safety/score?projectKey=${encodeURIComponent(projectKey)}`),
        api<FireSafetyFinding[]>(`/fire-safety/findings?projectKey=${encodeURIComponent(projectKey)}`),
      ]);
      setRecords(recs); setReadiness(score); setFindings(finds);
    } catch (e) {
      toast.error(ar ? 'تعذّر تحميل بيانات الحريق والسلامة' : 'Failed to load fire & life safety data', (e as Error).message);
    }
  }, [projectKey, toast, ar]);

  useEffect(() => { void refresh(); }, [refresh]);

  const run = async () => {
    setBusy('gov');
    try {
      await api('/fire-safety/governance/run', { method: 'POST', body: JSON.stringify({ projectKey }) });
      toast.success(ar ? 'تم تشغيل حوكمة الحريق والسلامة' : 'Fire & life safety governance complete');
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
        eyebrow={`Fire & Life Safety · ext.fire_life_safety · ${projectKey}`}
        title={ar ? 'حوكمة الحريق والسلامة' : 'Fire & Life Safety Governance'}
        description={ar
          ? 'حوكمة الامتثال لاستراتيجية الحريق واعتمادات الجهات (الدفاع المدني) — الاستراتيجية والرسومات ومراجعات الدفاع المدني والاختبار والتشغيل والتفتيش، مع متابعة الملاحظات المفتوحة ومخاطر مواعيد الاعتماد وجاهزية الحريق.'
          : 'Govern fire-strategy compliance and authority approvals (Civil Defence) — strategy, drawings, civil-defence reviews, testing & commissioning and inspections, with outstanding-comment tracking, approval-forecast risk and Fire Readiness.'}
        actions={(
          <Button variant="success" size="sm" disabled={busy === 'gov'} onClick={run}>
            {busy === 'gov' ? (ar ? 'جارٍ…' : 'Running…') : (ar ? 'تشغيل حوكمة الحريق والسلامة' : 'Run fire & life safety governance')}
          </Button>
        )}
      />

      {/* Fire readiness + position */}
      <div className="grid gap-6 lg:grid-cols-[auto,1fr]">
        <Card title={ar ? 'جاهزية الحريق' : 'Fire Readiness'} hint={readiness ? `${ar ? 'حتى' : 'as of'} ${readiness.asOfDate}` : undefined}>
          {!readiness ? (
            <p className="text-sm text-slate-400">…</p>
          ) : (
            <div className="flex flex-col items-center gap-3">
              <GaugeChart
                value={readiness.score}
                max={100}
                width={220}
                label={`${readiness.score}`}
                hint={ar ? 'من 100' : 'of 100'}
              />
              <GovernanceStatusBadge status={readiness.status} />
              <div className="grid w-full grid-cols-3 gap-2">
                <Component label={ar ? 'نسبة الاعتماد' : 'Approval rate'} value={readiness.components.approvalRate} ar={ar} />
                <Component label={ar ? 'إغلاق الملاحظات' : 'Comments cleared'} value={readiness.components.commentBurden} ar={ar} />
                <Component label={ar ? 'خلوّ من الرفض' : 'Rejection-free'} value={readiness.components.rejectionFreedom} ar={ar} />
              </div>
            </div>
          )}
        </Card>

        <Card title={ar ? 'موقف الحريق والسلامة' : 'Fire & life safety position'} hint={readiness?.narrative}>
          {!readiness ? (
            <p className="text-sm text-slate-400">…</p>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <Stat label={ar ? 'السجلّات' : 'Records'} value={String(readiness.records)} />
                <Stat label={ar ? 'مُعتمَد' : 'Approved'} value={String(readiness.totals.approved)} tone="emerald" />
                <Stat label={ar ? 'مرفوض' : 'Rejected'} value={String(readiness.totals.rejected)} tone="amber" />
                <Stat label={ar ? 'سجلّات بملاحظات' : 'With comments'} value={String(readiness.totals.openCommentRecords)} />
                <Stat label={ar ? 'إجمالي الملاحظات' : 'Outstanding comments'} value={String(readiness.totals.outstandingComments)} tone="amber" />
                <Stat
                  label={ar ? 'أقرب اعتماد' : 'Nearest approval'}
                  value={readiness.approvalForecast.daysToForecast !== null ? `${readiness.approvalForecast.daysToForecast}d` : '—'}
                  tone={readiness.approvalForecast.flag === 'overdue' ? 'amber' : 'slate'}
                />
              </div>
            </div>
          )}
        </Card>
      </div>

      {/* Records table */}
      <Card
        title={ar ? 'سجلّات الحريق والسلامة' : 'Fire & life safety records'}
        hint={ar ? 'النوع، الجهة، الحالة، الملاحظات المفتوحة، تاريخ التقديم، تاريخ الاعتماد المتوقع' : 'Type, authority, status, open comments, submitted, approval forecast'}
      >
        {records.length === 0 ? (
          <EmptyState
            title={ar ? 'لا توجد سجلّات بعد' : 'No records yet'}
            description={ar ? 'أضف أول سجلّ حريق وسلامة لبدء متابعة الاعتمادات والملاحظات والتفتيش.' : 'Add the first fire & life safety record to begin approval, comment and inspection tracking.'}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b border-slate-800 text-start text-[11px] uppercase tracking-wider text-slate-400">
                  <th className="px-2 py-2 text-start">{ar ? 'السجلّ' : 'Record'}</th>
                  <th className="px-2 py-2 text-start">{ar ? 'النوع' : 'Type'}</th>
                  <th className="px-2 py-2 text-start">{ar ? 'الجهة' : 'Authority'}</th>
                  <th className="px-2 py-2 text-center">{ar ? 'ملاحظات' : 'Comments'}</th>
                  <th className="px-2 py-2 text-center">{ar ? 'الاعتماد المتوقع' : 'Forecast'}</th>
                  <th className="px-2 py-2 text-center">{ar ? 'الحالة' : 'Status'}</th>
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
                    <td className="px-2 py-2 text-slate-300">{r.authority ?? '—'}</td>
                    <td className="px-2 py-2 text-center">
                      <span className={`font-mono tabular-nums ${r.status !== 'approved' && r.openComments > 0 ? (r.openComments >= 10 ? 'text-rose-300' : 'text-amber-300') : 'text-slate-400'}`} dir="ltr">
                        {r.openComments}
                      </span>
                    </td>
                    <td className="px-2 py-2 text-center font-mono text-[11px] tabular-nums text-slate-300" dir="ltr">{r.approvalForecastDate ?? '—'}</td>
                    <td className="px-2 py-2 text-center"><StatusPill status={r.status} ar={ar} /></td>
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

      {/* Outstanding comments roll-up */}
      {readiness && readiness.outstandingComments.length > 0 && (
        <Card
          title={ar ? 'الملاحظات المفتوحة' : 'Outstanding comments'}
          hint={ar ? 'مجموع الملاحظات المفتوحة على السجلّات غير المعتمَدة، لكل سجلّ' : 'Sum of open comments on non-approved records, per record'}
        >
          <div className="space-y-2">
            {readiness.outstandingComments.map((o) => (
              <div key={o.businessKey} className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-700/70 bg-slate-900/60 px-3 py-2">
                <span className="font-mono text-[11px] text-sky-300" dir="ltr">{o.businessKey}</span>
                <Pill tone="violet">{recordTypeLabel(o.recordType, ar)}</Pill>
                <span className="flex-1 text-sm font-medium text-slate-100">{o.title}</span>
                <StatusPill status={o.status} ar={ar} />
                <Pill tone={o.openComments >= 10 ? 'rose' : 'amber'}>
                  <span dir="ltr">{o.openComments}</span> {ar ? 'مفتوحة' : 'open'}
                </Pill>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Findings */}
      {findings.length > 0 && (
        <Card title={ar ? 'نتائج حوكمة الحريق والسلامة' : 'Fire & life safety findings'} hint={ar ? 'تُحسَب حتمياً من حالة السجلّات (غير مُخزَّنة)' : 'Computed deterministically from record state (not persisted)'}>
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

      <AiAnalysisPanel endpoint="/fire-safety/ai-analysis" body={{ projectKey }} />
    </div>
  );
}

// ── small presentational pieces ──

function Component({ label, value, ar }: { label: string; value: number; ar: boolean }) {
  const tone = value >= 0.75 ? 'text-emerald-300' : value >= 0.5 ? 'text-amber-300' : 'text-rose-300';
  return (
    <div className="rounded-lg border border-slate-700/70 bg-slate-900/60 px-2 py-1.5 text-center">
      <p className="text-[9px] uppercase tracking-wider text-slate-400">{label}</p>
      <p className={`text-sm font-bold tabular-nums ${tone}`} dir="ltr">{(value * 100).toFixed(0)}%</p>
    </div>
  );
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
  const map: Record<string, { tone: 'emerald' | 'rose' | 'sky' | 'amber' | 'slate'; en: string; ar: string }> = {
    draft: { tone: 'slate', en: 'draft', ar: 'مسوّدة' },
    submitted: { tone: 'sky', en: 'submitted', ar: 'مُقدَّم' },
    under_review: { tone: 'sky', en: 'under review', ar: 'قيد المراجعة' },
    comments: { tone: 'amber', en: 'comments', ar: 'ملاحظات' },
    approved: { tone: 'emerald', en: 'approved', ar: 'مُعتمَد' },
    rejected: { tone: 'rose', en: 'rejected', ar: 'مرفوض' },
  };
  const s = map[status] ?? { tone: 'slate' as const, en: status, ar: status };
  return <Pill tone={s.tone}>{ar ? s.ar : s.en}</Pill>;
}

function AddRecordForm({ projectKey, ar, onDone }: { projectKey: string; ar: boolean; onDone: () => Promise<void> }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [recordType, setRecordType] = useState<(typeof RECORD_TYPES)[number]>('fire_strategy');
  const [authority, setAuthority] = useState('Civil Defence');
  const [status, setStatus] = useState<(typeof RECORD_STATUSES)[number]>('submitted');
  const [openComments, setOpenComments] = useState('');
  const [submittedDate, setSubmittedDate] = useState('');
  const [approvalForecastDate, setApprovalForecastDate] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api('/fire-safety/records', {
        method: 'POST',
        body: JSON.stringify({
          projectKey,
          title,
          recordType,
          authority: authority || null,
          status,
          openComments: openComments ? Number(openComments) : 0,
          submittedDate: submittedDate || null,
          approvalForecastDate: approvalForecastDate || null,
        }),
      });
      toast.success(ar ? 'تمت إضافة السجلّ' : 'Record added');
      setTitle(''); setAuthority('Civil Defence'); setOpenComments('');
      setSubmittedDate(''); setApprovalForecastDate('');
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
    return <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>{ar ? '+ إضافة سجلّ حريق وسلامة' : '+ Add record'}</Button>;
  }
  return (
    <form onSubmit={submit} className="grid grid-cols-1 gap-3 rounded-lg border border-slate-700/70 bg-slate-900/40 p-4 sm:grid-cols-2 lg:grid-cols-3">
      <label className="text-xs text-slate-400">{ar ? 'العنوان' : 'Title'}
        <input required className={field} value={title} onChange={(e) => setTitle(e.target.value)} placeholder={ar ? 'مثال: استراتيجية الحريق للمبنى أ' : 'e.g. Tower A fire strategy'} />
      </label>
      <label className="text-xs text-slate-400">{ar ? 'النوع' : 'Type'}
        <select className={field} value={recordType} onChange={(e) => setRecordType(e.target.value as (typeof RECORD_TYPES)[number])}>
          {RECORD_TYPES.map((t) => <option key={t} value={t}>{recordTypeLabel(t, ar)}</option>)}
        </select>
      </label>
      <label className="text-xs text-slate-400">{ar ? 'الجهة' : 'Authority'}
        <input className={field} value={authority} onChange={(e) => setAuthority(e.target.value)} placeholder={ar ? 'الدفاع المدني' : 'Civil Defence'} />
      </label>
      <label className="text-xs text-slate-400">{ar ? 'الحالة' : 'Status'}
        <select className={field} value={status} onChange={(e) => setStatus(e.target.value as (typeof RECORD_STATUSES)[number])}>
          {RECORD_STATUSES.map((s) => <option key={s} value={s}>{statusLabel(s, ar)}</option>)}
        </select>
      </label>
      <label className="text-xs text-slate-400">{ar ? 'الملاحظات المفتوحة' : 'Open comments'}
        <input type="number" min="0" step="1" className={field} value={openComments} onChange={(e) => setOpenComments(e.target.value)} placeholder="0" />
      </label>
      <label className="text-xs text-slate-400">{ar ? 'تاريخ التقديم' : 'Submitted date'}
        <input type="date" className={field} value={submittedDate} onChange={(e) => setSubmittedDate(e.target.value)} dir="ltr" />
      </label>
      <label className="text-xs text-slate-400">{ar ? 'تاريخ الاعتماد المتوقع' : 'Approval forecast date'}
        <input type="date" className={field} value={approvalForecastDate} onChange={(e) => setApprovalForecastDate(e.target.value)} dir="ltr" />
      </label>
      <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-1">
        <Button type="submit" variant="primary" disabled={busy}>{busy ? '…' : (ar ? 'إضافة' : 'Add record')}</Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>{ar ? 'إلغاء' : 'Cancel'}</Button>
      </div>
    </form>
  );
}

// ── label maps ──

function recordTypeLabel(t: string, ar: boolean): string {
  const map: Record<string, { en: string; ar: string }> = {
    fire_strategy: { en: 'Fire strategy', ar: 'استراتيجية الحريق' },
    fire_drawing: { en: 'Fire drawing', ar: 'مخطط الحريق' },
    civil_defense_review: { en: 'Civil Defence review', ar: 'مراجعة الدفاع المدني' },
    testing_commissioning: { en: 'Testing & commissioning', ar: 'الاختبار والتشغيل' },
    inspection: { en: 'Inspection', ar: 'تفتيش' },
  };
  const e = map[t];
  return e ? (ar ? e.ar : e.en) : t;
}

function statusLabel(s: string, ar: boolean): string {
  const map: Record<string, { en: string; ar: string }> = {
    draft: { en: 'Draft', ar: 'مسوّدة' },
    submitted: { en: 'Submitted', ar: 'مُقدَّم' },
    under_review: { en: 'Under review', ar: 'قيد المراجعة' },
    comments: { en: 'Comments', ar: 'ملاحظات' },
    approved: { en: 'Approved', ar: 'مُعتمَد' },
    rejected: { en: 'Rejected', ar: 'مرفوض' },
  };
  const e = map[s];
  return e ? (ar ? e.ar : e.en) : s;
}

function findingTypeLabel(t: FireSafetyFinding['type'], ar: boolean): string {
  const map: Record<FireSafetyFinding['type'], { en: string; ar: string }> = {
    'rejected-record': { en: 'Rejection', ar: 'رفض' },
    'outstanding-comments': { en: 'Comments', ar: 'ملاحظات' },
    'approval-overdue': { en: 'Overdue', ar: 'متأخّر عن الموعد' },
    'approval-at-risk': { en: 'At risk', ar: 'معرّض للخطر' },
    'fire-readiness': { en: 'Readiness', ar: 'الجاهزية' },
  };
  return ar ? map[t].ar : map[t].en;
}

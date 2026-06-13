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

// ── Local API response types (the authority surface owns these shapes) ──

interface AuthoritySubmissionRecord {
  id: string;
  businessKey: string;
  title: string;
  authority: string;
  submissionType: string | null;
  status: string;
  openComments: number;
  submittedDate: string | null;
  forecastApprovalDate: string | null;
  requiredByDate: string | null;
  affectedActivityKeys: string[] | null;
}

interface DelayExposureRow {
  businessKey: string;
  title: string;
  authority: string;
  status: string;
  requiredByDate: string | null;
  forecastApprovalDate: string | null;
  delayExposureDays: number;
  affectedActivityKeys: string[];
  criticalActivityKeys: string[];
  criticalPathImpact: boolean;
}

interface AuthorityScore {
  projectKey: string;
  asOfDate: string;
  score: number;
  status: 'green' | 'yellow' | 'orange' | 'red';
  submissions: number;
  statusCounts: Record<string, number>;
  totals: {
    approved: number;
    rejected: number;
    pending: number;
    openComments: number;
    totalDelayExposureDays: number;
    criticalPathImpacts: number;
  };
  forecastApprovals: Array<{ businessKey: string; title: string; authority: string; forecastApprovalDate: string | null; requiredByDate: string | null }>;
  delayExposure: DelayExposureRow[];
  narrative: string;
}

interface AuthorityFinding {
  type: 'delay-exposure' | 'critical-path-impact' | 'outstanding-comments' | 'rejected-submission' | 'approval-pending';
  severity: 'critical' | 'warning' | 'info';
  title: string;
  description: string;
  recommendation: string;
  refs: Record<string, unknown>;
}

const AUTHORITIES = [
  'municipality',
  'civil_defense',
  'electricity',
  'water',
  'telecom',
  'environmental',
  'rta',
  'health',
  'other',
] as const;

const SUBMISSION_STATUSES = ['draft', 'submitted', 'under_review', 'comments', 'approved', 'rejected'] as const;

export default function AuthorityRoute() {
  return (
    <AuthGate capability="canRunAuthority" surface="Authority Governance">
      <AuthorityPage />
    </AuthGate>
  );
}

function AuthorityPage() {
  const { lang } = useI18n();
  const ar = lang === 'ar';
  const projectKey = useCurrentProjectKey();
  const toast = useToast();
  const [submissions, setSubmissions] = useState<AuthoritySubmissionRecord[]>([]);
  const [score, setScore] = useState<AuthorityScore | null>(null);
  const [findings, setFindings] = useState<AuthorityFinding[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [subs, scr, finds] = await Promise.all([
        api<AuthoritySubmissionRecord[]>(`/authority/submissions?projectKey=${encodeURIComponent(projectKey)}`),
        api<AuthorityScore>(`/authority/score?projectKey=${encodeURIComponent(projectKey)}`),
        api<AuthorityFinding[]>(`/authority/findings?projectKey=${encodeURIComponent(projectKey)}`),
      ]);
      setSubmissions(subs); setScore(scr); setFindings(finds);
    } catch (e) {
      toast.error(ar ? 'تعذّر تحميل بيانات الجهات' : 'Failed to load authority data', (e as Error).message);
    }
  }, [projectKey, toast, ar]);

  useEffect(() => { void refresh(); }, [refresh]);

  const run = async () => {
    setBusy('gov');
    try {
      await api('/authority/governance/run', { method: 'POST', body: JSON.stringify({ projectKey }) });
      toast.success(ar ? 'تم تشغيل حوكمة الجهات' : 'Authority governance complete');
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
        eyebrow={`Authority Governance · ext.authority · ${projectKey}`}
        title={ar ? 'حوكمة الجهات' : 'Authority Governance'}
        description={ar
          ? 'حوكمة جميع تقديمات الجهات والموافقات (البلدية، الدفاع المدني، الكهرباء، المياه، الاتصالات، البيئة، الطرق، الصحة). تتعقّب الجاهزية والملاحظات المفتوحة وتواريخ الموافقة المتوقّعة، وتحسب تلقائياً تعرّض المشروع للتأخير وأثره على المسار الحرج عند تجاوز الموافقة المتوقّعة لتاريخها المطلوب (تأخير من الجهة — وليس خطأ المقاول — يغذّي مطالبات تمديد المدة).'
          : 'Govern all authority submissions & approvals (municipality, civil defence, utilities, environmental, RTA, health). Track readiness, open comments and forecast approvals, and auto-calculate project delay exposure + critical-path impact when a forecast slips past required-by — authority delay (not the contractor’s fault) feeding EOT claims.'}
        actions={(
          <Button variant="success" size="sm" disabled={busy === 'gov'} onClick={run}>
            {busy === 'gov' ? (ar ? 'جارٍ…' : 'Running…') : (ar ? 'تشغيل حوكمة الجهات' : 'Run authority governance')}
          </Button>
        )}
      />

      {/* Authority readiness + approval dashboard */}
      <div className="grid gap-6 lg:grid-cols-[auto,1fr]">
        <Card title={ar ? 'جاهزية الجهات' : 'Authority Readiness'} hint={score ? `${ar ? 'حتى' : 'as of'} ${score.asOfDate}` : undefined}>
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
              <div className="grid w-full grid-cols-3 gap-2">
                <Stat label={ar ? 'مُعتمَد' : 'Approved'} value={String(score.totals.approved)} tone="emerald" />
                <Stat label={ar ? 'قيد الإجراء' : 'Pending'} value={String(score.totals.pending)} tone="amber" />
                <Stat label={ar ? 'مرفوض' : 'Rejected'} value={String(score.totals.rejected)} tone="rose" />
              </div>
            </div>
          )}
        </Card>

        <Card title={ar ? 'لوحة الموافقات وتعرّض التأخير' : 'Approvals & delay exposure'} hint={score?.narrative}>
          {!score ? (
            <p className="text-sm text-slate-400">…</p>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <Stat label={ar ? 'إجمالي التقديمات' : 'Submissions'} value={String(score.submissions)} />
                <Stat label={ar ? 'الملاحظات المفتوحة' : 'Open comments'} value={String(score.totals.openComments)} />
                <Stat label={ar ? 'تعرّض التأخير (أيام)' : 'Delay exposure (d)'} value={String(score.totals.totalDelayExposureDays)} tone={score.totals.totalDelayExposureDays > 0 ? 'amber' : 'slate'} />
                <Stat label={ar ? 'أثر المسار الحرج' : 'Critical-path impacts'} value={String(score.totals.criticalPathImpacts)} tone={score.totals.criticalPathImpacts > 0 ? 'rose' : 'slate'} />
                <Stat label={ar ? 'قيد المراجعة' : 'Under review'} value={String(score.statusCounts.under_review ?? 0)} />
                <Stat label={ar ? 'بملاحظات' : 'In comments'} value={String(score.statusCounts.comments ?? 0)} />
              </div>
              {score.delayExposure.filter((d) => d.delayExposureDays > 0).length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[520px] text-sm">
                    <thead>
                      <tr className="border-b border-slate-800 text-start text-[11px] uppercase tracking-wider text-slate-400">
                        <th className="px-2 py-1.5 text-start">{ar ? 'التقديم' : 'Submission'}</th>
                        <th className="px-2 py-1.5 text-center">{ar ? 'مطلوب بحلول' : 'Required by'}</th>
                        <th className="px-2 py-1.5 text-center">{ar ? 'متوقّع' : 'Forecast'}</th>
                        <th className="px-2 py-1.5 text-end">{ar ? 'تأخير (يوم)' : 'Delay (d)'}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {score.delayExposure.filter((d) => d.delayExposureDays > 0).map((d) => (
                        <tr key={d.businessKey} className="border-b border-slate-800/60">
                          <td className="px-2 py-1.5">
                            <span className="font-mono text-[11px] text-sky-300" dir="ltr">{d.businessKey}</span>{' '}
                            <span className="text-slate-200">{d.title}</span>
                            {d.criticalPathImpact && <span className="ms-1 text-[9px] font-semibold text-rose-300">{ar ? 'مسار حرج' : 'critical path'}</span>}
                          </td>
                          <td className="px-2 py-1.5 text-center font-mono text-[11px] text-slate-300" dir="ltr">{d.requiredByDate ?? '—'}</td>
                          <td className="px-2 py-1.5 text-center font-mono text-[11px] text-slate-300" dir="ltr">{d.forecastApprovalDate ?? '—'}</td>
                          <td className={`px-2 py-1.5 text-end font-mono tabular-nums ${d.criticalPathImpact ? 'text-rose-300' : 'text-amber-300'}`} dir="ltr">{d.delayExposureDays}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </Card>
      </div>

      {/* Submissions table */}
      <Card
        title={ar ? 'تقديمات الجهات' : 'Authority submissions'}
        hint={ar ? 'الجهة، النوع، الحالة، الملاحظات، تاريخ الموافقة المتوقّع مقابل المطلوب' : 'Authority, type, status, comments, forecast vs required-by approval'}
      >
        {submissions.length === 0 ? (
          <EmptyState
            title={ar ? 'لا توجد تقديمات بعد' : 'No submissions yet'}
            description={ar ? 'أضف أول تقديم جهة لبدء مراقبة الجاهزية والملاحظات وتعرّض التأخير.' : 'Add the first authority submission to begin readiness, comment and delay-exposure monitoring.'}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <thead>
                <tr className="border-b border-slate-800 text-start text-[11px] uppercase tracking-wider text-slate-400">
                  <th className="px-2 py-2 text-start">{ar ? 'التقديم' : 'Submission'}</th>
                  <th className="px-2 py-2 text-start">{ar ? 'الجهة' : 'Authority'}</th>
                  <th className="px-2 py-2 text-center">{ar ? 'الحالة' : 'Status'}</th>
                  <th className="px-2 py-2 text-center">{ar ? 'ملاحظات' : 'Comments'}</th>
                  <th className="px-2 py-2 text-center">{ar ? 'متوقّع / مطلوب' : 'Forecast / Required'}</th>
                </tr>
              </thead>
              <tbody>
                {submissions.map((s) => (
                  <tr key={s.id} className="border-b border-slate-800/60 hover:bg-slate-900/50">
                    <td className="px-2 py-2">
                      <span className="font-mono text-[11px] text-sky-300" dir="ltr">{s.businessKey}</span>{' '}
                      <span className="font-medium text-slate-100">{s.title}</span>
                      {s.affectedActivityKeys && s.affectedActivityKeys.length > 0 && (
                        <span className="ms-1 text-[10px] text-slate-500" dir="ltr">→ {s.affectedActivityKeys.join(', ')}</span>
                      )}
                    </td>
                    <td className="px-2 py-2"><Pill tone="violet">{authorityLabel(s.authority, ar)}</Pill></td>
                    <td className="px-2 py-2 text-center"><StatusPill status={s.status} ar={ar} /></td>
                    <td className="px-2 py-2 text-center">
                      <span className={`font-mono tabular-nums ${s.openComments > 0 ? 'text-amber-300' : 'text-slate-500'}`} dir="ltr">{s.openComments}</span>
                    </td>
                    <td className="px-2 py-2 text-center font-mono text-[11px]" dir="ltr">
                      <span className="text-slate-300">{s.forecastApprovalDate ?? '—'}</span>
                      <span className="text-slate-600"> / </span>
                      <span className="text-slate-400">{s.requiredByDate ?? '—'}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="mt-3">
          <AddSubmissionForm projectKey={projectKey} ar={ar} onDone={refresh} />
        </div>
      </Card>

      {/* Findings */}
      {findings.length > 0 && (
        <Card title={ar ? 'نتائج حوكمة الجهات' : 'Authority governance findings'} hint={ar ? 'تُحسَب حتمياً من حالة التقديمات (غير مُخزَّنة)' : 'Computed deterministically from submission state (not persisted)'}>
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

      <AiAnalysisPanel endpoint="/authority/ai-analysis" body={{ projectKey }} />
    </div>
  );
}

// ── small presentational pieces ──

function Stat({ label, value, tone = 'slate' }: { label: string; value: string; tone?: 'slate' | 'emerald' | 'amber' | 'rose' }) {
  const color = tone === 'emerald' ? 'text-emerald-300' : tone === 'amber' ? 'text-amber-300' : tone === 'rose' ? 'text-rose-300' : 'text-slate-100';
  return (
    <div className="rounded-xl border border-slate-700/70 bg-slate-900/60 p-3">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{label}</p>
      <p className={`mt-1 text-base font-bold tabular-nums ${color}`} dir="ltr">{value}</p>
    </div>
  );
}

function StatusPill({ status, ar }: { status: string; ar: boolean }) {
  const map: Record<string, { tone: 'emerald' | 'rose' | 'sky' | 'amber' | 'violet' | 'slate'; en: string; ar: string }> = {
    draft: { tone: 'slate', en: 'draft', ar: 'مسودة' },
    submitted: { tone: 'sky', en: 'submitted', ar: 'مُقدَّم' },
    under_review: { tone: 'violet', en: 'under review', ar: 'قيد المراجعة' },
    comments: { tone: 'amber', en: 'comments', ar: 'بملاحظات' },
    approved: { tone: 'emerald', en: 'approved', ar: 'مُعتمَد' },
    rejected: { tone: 'rose', en: 'rejected', ar: 'مرفوض' },
  };
  const s = map[status] ?? { tone: 'slate' as const, en: status, ar: status };
  return <Pill tone={s.tone}>{ar ? s.ar : s.en}</Pill>;
}

function AddSubmissionForm({ projectKey, ar, onDone }: { projectKey: string; ar: boolean; onDone: () => Promise<void> }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [authority, setAuthority] = useState<(typeof AUTHORITIES)[number]>('municipality');
  const [submissionType, setSubmissionType] = useState('');
  const [status, setStatus] = useState<(typeof SUBMISSION_STATUSES)[number]>('submitted');
  const [openComments, setOpenComments] = useState('');
  const [submittedDate, setSubmittedDate] = useState('');
  const [forecastApprovalDate, setForecastApprovalDate] = useState('');
  const [requiredByDate, setRequiredByDate] = useState('');
  const [affectedActivityKeys, setAffectedActivityKeys] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api('/authority/submissions', {
        method: 'POST',
        body: JSON.stringify({
          projectKey,
          title,
          authority,
          submissionType: submissionType || null,
          status,
          openComments: openComments ? Number(openComments) : 0,
          submittedDate: submittedDate || null,
          forecastApprovalDate: forecastApprovalDate || null,
          requiredByDate: requiredByDate || null,
          affectedActivityKeys: affectedActivityKeys
            ? affectedActivityKeys.split(',').map((k) => k.trim()).filter(Boolean)
            : null,
        }),
      });
      toast.success(ar ? 'تمت إضافة التقديم' : 'Submission added');
      setTitle(''); setSubmissionType(''); setOpenComments('');
      setSubmittedDate(''); setForecastApprovalDate(''); setRequiredByDate(''); setAffectedActivityKeys('');
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
    return <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>{ar ? '+ إضافة تقديم جهة' : '+ Add submission'}</Button>;
  }
  return (
    <form onSubmit={submit} className="grid grid-cols-1 gap-3 rounded-lg border border-slate-700/70 bg-slate-900/40 p-4 sm:grid-cols-2 lg:grid-cols-3">
      <label className="text-xs text-slate-400">{ar ? 'العنوان' : 'Title'}
        <input required className={field} value={title} onChange={(e) => setTitle(e.target.value)} placeholder={ar ? 'مثال: رخصة بناء المبنى الرئيسي' : 'e.g. Main building permit'} />
      </label>
      <label className="text-xs text-slate-400">{ar ? 'الجهة' : 'Authority'}
        <select className={field} value={authority} onChange={(e) => setAuthority(e.target.value as (typeof AUTHORITIES)[number])}>
          {AUTHORITIES.map((a) => <option key={a} value={a}>{authorityLabel(a, ar)}</option>)}
        </select>
      </label>
      <label className="text-xs text-slate-400">{ar ? 'نوع التقديم' : 'Submission type'}
        <input className={field} value={submissionType} onChange={(e) => setSubmissionType(e.target.value)} placeholder={ar ? 'رخصة / عدم ممانعة / توصيل' : 'permit / NOC / connection'} />
      </label>
      <label className="text-xs text-slate-400">{ar ? 'الحالة' : 'Status'}
        <select className={field} value={status} onChange={(e) => setStatus(e.target.value as (typeof SUBMISSION_STATUSES)[number])}>
          {SUBMISSION_STATUSES.map((st) => <option key={st} value={st}>{statusLabel(st, ar)}</option>)}
        </select>
      </label>
      <label className="text-xs text-slate-400">{ar ? 'الملاحظات المفتوحة' : 'Open comments'}
        <input type="number" min="0" step="1" className={field} value={openComments} onChange={(e) => setOpenComments(e.target.value)} placeholder="0" />
      </label>
      <label className="text-xs text-slate-400">{ar ? 'تاريخ التقديم' : 'Submitted date'}
        <input type="date" className={field} value={submittedDate} onChange={(e) => setSubmittedDate(e.target.value)} dir="ltr" />
      </label>
      <label className="text-xs text-slate-400">{ar ? 'تاريخ الموافقة المتوقّع' : 'Forecast approval date'}
        <input type="date" className={field} value={forecastApprovalDate} onChange={(e) => setForecastApprovalDate(e.target.value)} dir="ltr" />
      </label>
      <label className="text-xs text-slate-400">{ar ? 'مطلوب بحلول' : 'Required by date'}
        <input type="date" className={field} value={requiredByDate} onChange={(e) => setRequiredByDate(e.target.value)} dir="ltr" />
      </label>
      <label className="text-xs text-slate-400">{ar ? 'أنشطة الجدول المتأثّرة (مفصولة بفواصل)' : 'Affected activities (comma-separated)'}
        <input className={field} value={affectedActivityKeys} onChange={(e) => setAffectedActivityKeys(e.target.value)} placeholder="A-1010, A-1020" dir="ltr" />
      </label>
      <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-1">
        <Button type="submit" variant="primary" disabled={busy}>{busy ? '…' : (ar ? 'إضافة' : 'Add submission')}</Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>{ar ? 'إلغاء' : 'Cancel'}</Button>
      </div>
    </form>
  );
}

// ── label maps ──

function authorityLabel(a: string, ar: boolean): string {
  const map: Record<string, { en: string; ar: string }> = {
    municipality: { en: 'Municipality', ar: 'البلدية' },
    civil_defense: { en: 'Civil Defence', ar: 'الدفاع المدني' },
    electricity: { en: 'Electricity', ar: 'الكهرباء' },
    water: { en: 'Water', ar: 'المياه' },
    telecom: { en: 'Telecom', ar: 'الاتصالات' },
    environmental: { en: 'Environmental', ar: 'البيئة' },
    rta: { en: 'RTA', ar: 'الطرق والمواصلات' },
    health: { en: 'Health', ar: 'الصحة' },
    other: { en: 'Other', ar: 'أخرى' },
  };
  const e = map[a];
  return e ? (ar ? e.ar : e.en) : a;
}

function statusLabel(s: string, ar: boolean): string {
  const map: Record<string, { en: string; ar: string }> = {
    draft: { en: 'Draft', ar: 'مسودة' },
    submitted: { en: 'Submitted', ar: 'مُقدَّم' },
    under_review: { en: 'Under review', ar: 'قيد المراجعة' },
    comments: { en: 'Comments', ar: 'بملاحظات' },
    approved: { en: 'Approved', ar: 'مُعتمَد' },
    rejected: { en: 'Rejected', ar: 'مرفوض' },
  };
  const e = map[s];
  return e ? (ar ? e.ar : e.en) : s;
}

function findingTypeLabel(t: AuthorityFinding['type'], ar: boolean): string {
  const map: Record<AuthorityFinding['type'], { en: string; ar: string }> = {
    'delay-exposure': { en: 'Delay', ar: 'تأخير' },
    'critical-path-impact': { en: 'Critical path', ar: 'مسار حرج' },
    'outstanding-comments': { en: 'Comments', ar: 'ملاحظات' },
    'rejected-submission': { en: 'Rejected', ar: 'مرفوض' },
    'approval-pending': { en: 'Pending', ar: 'قيد الإجراء' },
  };
  return ar ? map[t].ar : map[t].en;
}

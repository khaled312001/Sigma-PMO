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

// ── Local API response types (the operational-readiness surface owns these shapes) ──

interface ReadinessItemRecord {
  id: string;
  businessKey: string;
  title: string;
  category: string;
  status: string;
  completionPct: number | null;
  dueDate: string | null;
}

interface ReadinessScore {
  projectKey: string;
  asOfDate: string;
  score: number;
  status: 'green' | 'yellow' | 'orange' | 'red';
  subScores: { goLiveReadiness: number; handoverReadiness: number; commissioningReadiness: number };
  items: number;
  totals: {
    complete: number;
    inProgress: number;
    notStarted: number;
    overdue: number;
    avgCompletionPct: number | null;
  };
  narrative: string;
}

interface ReadinessFinding {
  type: 'overdue-item' | 'incomplete-item' | 'not-started' | 'category-gap' | 'go-live-blocker';
  severity: 'critical' | 'warning' | 'info';
  title: string;
  description: string;
  recommendation: string;
  refs: Record<string, unknown>;
}

const CATEGORIES = [
  'om_manual',
  'asset_register',
  'training',
  'testing_commissioning',
  'handover',
  'staffing',
  'spares',
  'warranty',
] as const;

const STATUSES = ['not_started', 'in_progress', 'submitted', 'approved', 'complete'] as const;

export default function OperationalReadinessRoute() {
  return (
    <AuthGate capability="canRunOperationalReadiness" surface="Operational Readiness Governance">
      <OperationalReadinessPage />
    </AuthGate>
  );
}

function OperationalReadinessPage() {
  const { lang } = useI18n();
  const ar = lang === 'ar';
  const projectKey = useCurrentProjectKey();
  const toast = useToast();
  const [items, setItems] = useState<ReadinessItemRecord[]>([]);
  const [score, setScore] = useState<ReadinessScore | null>(null);
  const [findings, setFindings] = useState<ReadinessFinding[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [its, scr, finds] = await Promise.all([
        api<ReadinessItemRecord[]>(`/operational-readiness/items?projectKey=${encodeURIComponent(projectKey)}`),
        api<ReadinessScore>(`/operational-readiness/score?projectKey=${encodeURIComponent(projectKey)}`),
        api<ReadinessFinding[]>(`/operational-readiness/findings?projectKey=${encodeURIComponent(projectKey)}`),
      ]);
      setItems(its); setScore(scr); setFindings(finds);
    } catch (e) {
      toast.error(ar ? 'تعذّر تحميل بيانات الجاهزية التشغيلية' : 'Failed to load operational readiness data', (e as Error).message);
    }
  }, [projectKey, toast, ar]);

  useEffect(() => { void refresh(); }, [refresh]);

  const run = async () => {
    setBusy('gov');
    try {
      await api('/operational-readiness/governance/run', { method: 'POST', body: JSON.stringify({ projectKey }) });
      toast.success(ar ? 'تم تشغيل حوكمة الجاهزية التشغيلية' : 'Operational readiness governance complete');
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
        eyebrow={`Operational Readiness Governance · ext.operational_readiness · ${projectKey}`}
        title={ar ? 'حوكمة الجاهزية التشغيلية' : 'Operational Readiness Governance'}
        description={ar
          ? 'حوكمة الانتقال من اكتمال الإنشاء إلى بدء التشغيل الفعلي — أدلة التشغيل والصيانة، وسجلات الأصول، والتدريب، والاختبار والتشغيل، والتسليم، والتوظيف، وقطع الغيار، والضمانات.'
          : 'Govern the construction-complete → operational go-live transition — O&M manuals, asset registers, training, testing & commissioning, handover, staffing, spares and warranties.'}
        actions={(
          <Button variant="success" size="sm" disabled={busy === 'gov'} onClick={run}>
            {busy === 'gov' ? (ar ? 'جارٍ…' : 'Running…') : (ar ? 'تشغيل حوكمة الجاهزية' : 'Run readiness governance')}
          </Button>
        )}
      />

      {/* Readiness score + position */}
      <div className="grid gap-6 lg:grid-cols-[auto,1fr]">
        <Card title={ar ? 'درجة الجاهزية التشغيلية' : 'Operational Readiness Score'} hint={score ? `${ar ? 'حتى' : 'as of'} ${score.asOfDate}` : undefined}>
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
                <Sub label={ar ? 'جاهزية بدء التشغيل' : 'Go-live'} value={score.subScores.goLiveReadiness} />
                <Sub label={ar ? 'جاهزية التسليم' : 'Handover'} value={score.subScores.handoverReadiness} />
                <Sub label={ar ? 'جاهزية الاختبار والتشغيل' : 'Commissioning'} value={score.subScores.commissioningReadiness} />
              </div>
            </div>
          )}
        </Card>

        <Card title={ar ? 'مركز الجاهزية' : 'Readiness position'} hint={score?.narrative}>
          {!score ? (
            <p className="text-sm text-slate-400">…</p>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <Stat label={ar ? 'العناصر' : 'Items'} value={String(score.items)} />
                <Stat label={ar ? 'مكتمل' : 'Complete'} value={String(score.totals.complete)} tone="emerald" />
                <Stat label={ar ? 'قيد التنفيذ' : 'In progress'} value={String(score.totals.inProgress)} />
                <Stat label={ar ? 'لم يبدأ' : 'Not started'} value={String(score.totals.notStarted)} />
                <Stat label={ar ? 'متأخر' : 'Overdue'} value={String(score.totals.overdue)} tone="amber" />
                <Stat label={ar ? 'متوسط الإنجاز' : 'Avg complete'} value={score.totals.avgCompletionPct !== null ? `${score.totals.avgCompletionPct.toFixed(0)}%` : '—'} />
              </div>
            </div>
          )}
        </Card>
      </div>

      {/* Items table */}
      <Card
        title={ar ? 'عناصر الجاهزية التشغيلية' : 'Operational readiness items'}
        hint={ar ? 'الفئة، الحالة، نسبة الإنجاز، تاريخ الاستحقاق' : 'Category, status, completion, due date'}
      >
        {items.length === 0 ? (
          <EmptyState
            title={ar ? 'لا توجد عناصر بعد' : 'No items yet'}
            description={ar ? 'أضِف أول عنصر جاهزية لبدء متابعة التسليم والاختبار والتشغيل وبدء التشغيل الفعلي.' : 'Add the first readiness item to begin handover, commissioning and go-live monitoring.'}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-slate-800 text-start text-[11px] uppercase tracking-wider text-slate-400">
                  <th className="px-2 py-2 text-start">{ar ? 'العنصر' : 'Item'}</th>
                  <th className="px-2 py-2 text-start">{ar ? 'الفئة' : 'Category'}</th>
                  <th className="px-2 py-2 text-center">{ar ? 'الحالة' : 'Status'}</th>
                  <th className="px-2 py-2 text-end">{ar ? 'الإنجاز' : 'Completion'}</th>
                  <th className="px-2 py-2 text-center">{ar ? 'الاستحقاق' : 'Due'}</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it) => (
                  <tr key={it.id} className="border-b border-slate-800/60 hover:bg-slate-900/50">
                    <td className="px-2 py-2">
                      <span className="font-mono text-[11px] text-sky-300" dir="ltr">{it.businessKey}</span>{' '}
                      <span className="font-medium text-slate-100">{it.title}</span>
                    </td>
                    <td className="px-2 py-2"><Pill tone="violet">{categoryLabel(it.category, ar)}</Pill></td>
                    <td className="px-2 py-2 text-center"><StatusPill status={it.status} ar={ar} /></td>
                    <td className="px-2 py-2 text-end font-mono tabular-nums text-slate-200" dir="ltr">
                      {it.completionPct !== null ? `${it.completionPct.toFixed(0)}%` : '—'}
                    </td>
                    <td className="px-2 py-2 text-center font-mono text-[11px] text-slate-300" dir="ltr">{it.dueDate ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="mt-3">
          <AddItemForm projectKey={projectKey} ar={ar} onDone={refresh} />
        </div>
      </Card>

      {/* Findings */}
      {findings.length > 0 && (
        <Card title={ar ? 'نتائج حوكمة الجاهزية' : 'Readiness governance findings'} hint={ar ? 'تُحسَب حتمياً من حالة العناصر (غير مُخزَّنة)' : 'Computed deterministically from item state (not persisted)'}>
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

      <AiAnalysisPanel endpoint="/operational-readiness/ai-analysis" body={{ projectKey }} />
    </div>
  );
}

// ── small presentational pieces ──

function Sub({ label, value }: { label: string; value: number }) {
  const tone = value >= 75 ? 'text-emerald-300' : value >= 50 ? 'text-amber-300' : 'text-rose-300';
  return (
    <div className="rounded-lg border border-slate-700/70 bg-slate-900/60 px-2 py-1.5 text-center">
      <p className="text-[9px] uppercase tracking-wider text-slate-400">{label}</p>
      <p className={`text-sm font-bold tabular-nums ${tone}`} dir="ltr">{value}%</p>
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
  const map: Record<string, { tone: 'emerald' | 'rose' | 'sky' | 'slate' | 'amber' | 'violet'; en: string; ar: string }> = {
    not_started: { tone: 'slate', en: 'not started', ar: 'لم يبدأ' },
    in_progress: { tone: 'amber', en: 'in progress', ar: 'قيد التنفيذ' },
    submitted: { tone: 'sky', en: 'submitted', ar: 'مُقدَّم' },
    approved: { tone: 'violet', en: 'approved', ar: 'مُعتمَد' },
    complete: { tone: 'emerald', en: 'complete', ar: 'مكتمل' },
  };
  const s = map[status] ?? { tone: 'slate' as const, en: status, ar: status };
  return <Pill tone={s.tone}>{ar ? s.ar : s.en}</Pill>;
}

function AddItemForm({ projectKey, ar, onDone }: { projectKey: string; ar: boolean; onDone: () => Promise<void> }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>('om_manual');
  const [status, setStatus] = useState<(typeof STATUSES)[number]>('not_started');
  const [completionPct, setCompletionPct] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api('/operational-readiness/items', {
        method: 'POST',
        body: JSON.stringify({
          projectKey,
          title,
          category,
          status,
          completionPct: completionPct ? Number(completionPct) : null,
          dueDate: dueDate || null,
        }),
      });
      toast.success(ar ? 'تمت إضافة العنصر' : 'Item added');
      setTitle(''); setCompletionPct(''); setDueDate(''); setStatus('not_started'); setCategory('om_manual');
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
    return <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>{ar ? '+ إضافة عنصر جاهزية' : '+ Add readiness item'}</Button>;
  }
  return (
    <form onSubmit={submit} className="grid grid-cols-1 gap-3 rounded-lg border border-slate-700/70 bg-slate-900/40 p-4 sm:grid-cols-2 lg:grid-cols-3">
      <label className="text-xs text-slate-400">{ar ? 'العنوان' : 'Title'}
        <input required className={field} value={title} onChange={(e) => setTitle(e.target.value)} placeholder={ar ? 'مثال: دليل التشغيل والصيانة للمضخات' : 'e.g. Pump O&M manual'} />
      </label>
      <label className="text-xs text-slate-400">{ar ? 'الفئة' : 'Category'}
        <select className={field} value={category} onChange={(e) => setCategory(e.target.value as (typeof CATEGORIES)[number])}>
          {CATEGORIES.map((c) => <option key={c} value={c}>{categoryLabel(c, ar)}</option>)}
        </select>
      </label>
      <label className="text-xs text-slate-400">{ar ? 'الحالة' : 'Status'}
        <select className={field} value={status} onChange={(e) => setStatus(e.target.value as (typeof STATUSES)[number])}>
          {STATUSES.map((s) => <option key={s} value={s}>{statusLabel(s, ar)}</option>)}
        </select>
      </label>
      <label className="text-xs text-slate-400">{ar ? 'نسبة الإنجاز %' : 'Completion %'}
        <input type="number" min="0" max="100" step="any" className={field} value={completionPct} onChange={(e) => setCompletionPct(e.target.value)} placeholder="60" />
      </label>
      <label className="text-xs text-slate-400">{ar ? 'تاريخ الاستحقاق' : 'Due date'}
        <input type="date" className={field} value={dueDate} onChange={(e) => setDueDate(e.target.value)} dir="ltr" />
      </label>
      <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-1">
        <Button type="submit" variant="primary" disabled={busy}>{busy ? '…' : (ar ? 'إضافة' : 'Add item')}</Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>{ar ? 'إلغاء' : 'Cancel'}</Button>
      </div>
    </form>
  );
}

// ── label maps ──

function categoryLabel(c: string, ar: boolean): string {
  const map: Record<string, { en: string; ar: string }> = {
    om_manual: { en: 'O&M manual', ar: 'دليل التشغيل والصيانة' },
    asset_register: { en: 'Asset register', ar: 'سجل الأصول' },
    training: { en: 'Training', ar: 'التدريب' },
    testing_commissioning: { en: 'Testing & commissioning', ar: 'الاختبار والتشغيل' },
    handover: { en: 'Handover', ar: 'التسليم' },
    staffing: { en: 'Staffing', ar: 'التوظيف' },
    spares: { en: 'Spares', ar: 'قطع الغيار' },
    warranty: { en: 'Warranty', ar: 'الضمان' },
  };
  const e = map[c];
  return e ? (ar ? e.ar : e.en) : c;
}

function statusLabel(s: string, ar: boolean): string {
  const map: Record<string, { en: string; ar: string }> = {
    not_started: { en: 'Not started', ar: 'لم يبدأ' },
    in_progress: { en: 'In progress', ar: 'قيد التنفيذ' },
    submitted: { en: 'Submitted', ar: 'مُقدَّم' },
    approved: { en: 'Approved', ar: 'مُعتمَد' },
    complete: { en: 'Complete', ar: 'مكتمل' },
  };
  const e = map[s];
  return e ? (ar ? e.ar : e.en) : s;
}

function findingTypeLabel(t: ReadinessFinding['type'], ar: boolean): string {
  const map: Record<ReadinessFinding['type'], { en: string; ar: string }> = {
    'overdue-item': { en: 'Overdue', ar: 'متأخر' },
    'incomplete-item': { en: 'Incomplete', ar: 'غير مكتمل' },
    'not-started': { en: 'Not started', ar: 'لم يبدأ' },
    'category-gap': { en: 'Category gap', ar: 'فجوة فئة' },
    'go-live-blocker': { en: 'Go-live blocker', ar: 'معيق بدء التشغيل' },
  };
  return ar ? map[t].ar : map[t].en;
}

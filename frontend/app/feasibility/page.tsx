'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { AuthGate } from '../../components/AuthGate';
import { GovernanceStatusBadge } from '../../components/GovernanceStatusBadge';
import { IconSparkles } from '../../components/Icons';
import { useToast } from '../../components/ToastProvider';
import { useI18n } from '../../lib/i18n';
import { api, OpportunityRecord } from '../../lib/api';
import { Button, Card, EmptyState, PageHeader, Pill } from '../../components/ui';

export default function FeasibilityPageRoute() {
  return (
    <AuthGate capability="canRunFeasibility" surface="Investment & Feasibility">
      <FeasibilityPage />
    </AuthGate>
  );
}

const STAGE_TONE: Record<string, 'slate' | 'sky' | 'emerald' | 'amber' | 'rose' | 'violet'> = {
  idea: 'slate', assessed: 'sky', study: 'violet', approved: 'emerald', rejected: 'rose', hold: 'amber',
};

const REC_LABEL: Record<string, string> = {
  proceed: 'Proceed',
  proceed_with_conditions: 'Proceed with conditions',
  hold: 'Hold',
  reject: 'Reject',
};

const REC_LABEL_AR: Record<string, string> = {
  proceed: 'المضي قدماً',
  proceed_with_conditions: 'المضي بشروط',
  hold: 'تعليق',
  reject: 'رفض',
};

const STAGE_LABEL_AR: Record<string, string> = {
  idea: 'فكرة',
  assessed: 'مُقيّمة',
  study: 'دراسة',
  approved: 'معتمدة',
  rejected: 'مرفوضة',
  hold: 'مُعلّقة',
};

function FeasibilityPage() {
  const { lang } = useI18n();
  const ar = lang === 'ar';
  const toast = useToast();
  const [rows, setRows] = useState<OpportunityRecord[]>([]);
  const [projectTypes, setProjectTypes] = useState<Record<string, { label: string }>>({});
  const [showForm, setShowForm] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const [list, assumptions] = await Promise.all([
        api<OpportunityRecord[]>('/feasibility/opportunities'),
        api<{ projectTypes: Record<string, { label: string }> }>('/feasibility/assumptions'),
      ]);
      setRows(list);
      setProjectTypes(assumptions.projectTypes);
    } catch (e) {
      toast.error(ar ? 'تعذّر تحميل الفرص' : 'Failed to load opportunities', (e as Error).message);
    } finally {
      setLoaded(true);
    }
  }, [toast, ar]);

  useEffect(() => { void refresh(); }, [refresh]);

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="Investment & Feasibility Intelligence · ext.investment"
        title={ar ? 'الفرص الاستثمارية' : 'Investment opportunities'}
        description={ar
          ? 'من فكرة أولية أو رسم مفاهيمي إلى تقييم سريع (المستوى الأول) ودراسة احترافية قابلة للتمويل البنكي (المستوى الثاني) — صافي القيمة الحالية NPV، ومعدل العائد الداخلي IRR، وفترة الاسترداد، ونسبة تغطية خدمة الدين DSCR، والمخاطر، وتوصية الحوكمة.'
          : 'From a raw idea or a concept sketch to a rapid assessment (Level 1) and a bankable professional study (Level 2) — NPV, IRR, payback, DSCR, risk and a governance recommendation.'}
        actions={
          <Button variant="primary" size="sm" onClick={() => setShowForm((s) => !s)}>
            <IconSparkles className="h-3.5 w-3.5" /> {showForm ? (ar ? 'إغلاق' : 'Close') : (ar ? 'فرصة جديدة' : 'New opportunity')}
          </Button>
        }
      />

      {showForm && (
        <CreateOpportunityForm
          projectTypes={projectTypes}
          onCreated={async () => { setShowForm(false); await refresh(); }}
        />
      )}

      {loaded && rows.length === 0 && !showForm ? (
        <EmptyState
          title={ar ? 'لا توجد فرص بعد' : 'No opportunities yet'}
          description={ar
            ? 'ابدأ بنوع المشروع والموقع وحجم الاستثمار فقط — أو ارفع رسماً مفاهيمياً ودع المنصة تستخرج المُدخلات.'
            : 'Start with just a project type, a location and an investment size — or upload a concept sketch and let the platform extract the inputs.'}
          action={<Button variant="primary" onClick={() => setShowForm(true)}>{ar ? 'فرصة جديدة' : 'New opportunity'}</Button>}
        />
      ) : (
        <section className="grid gap-3">
          {rows.map((o) => {
            const a = o.latestAssessment;
            const res = (a?.results ?? {}) as Record<string, unknown>;
            return (
              <Link
                key={o.id}
                href={`/feasibility/${o.id}`}
                className="group rounded-xl border border-slate-700/70 bg-slate-900/60 p-4 shadow-sm transition hover:border-sky-500/50 hover:bg-slate-900/80"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-[11px] font-bold text-sky-300" dir="ltr">{o.code}</span>
                  <span className="flex-1 truncate text-sm font-semibold text-slate-50">{o.title}</span>
                  <Pill tone={STAGE_TONE[o.stage] ?? 'slate'}>{ar ? (STAGE_LABEL_AR[o.stage] ?? o.stage) : o.stage}</Pill>
                  {a?.governanceStatus && <GovernanceStatusBadge status={a.governanceStatus} size="sm" />}
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-300">
                  <span>{projectTypes[o.projectType]?.label ?? o.projectType}</span>
                  <span>{[o.city, o.country].filter(Boolean).join(', ') || '—'}</span>
                  {o.estimatedInvestment && (
                    <span dir="ltr">{o.currency} {(Number(o.estimatedInvestment) / 1_000_000).toFixed(1)}M</span>
                  )}
                  {a?.recommendation && (
                    <span className="font-semibold text-slate-100">
                      {(ar ? REC_LABEL_AR : REC_LABEL)[String(a.recommendation)] ?? String(a.recommendation)}
                    </span>
                  )}
                  {typeof res.projectIrr === 'number' && (
                    <span dir="ltr">IRR {(res.projectIrr * 100).toFixed(1)}%</span>
                  )}
                  {typeof res.npv === 'number' && (
                    <span dir="ltr">NPV {(res.npv / 1_000_000).toFixed(1)}M</span>
                  )}
                  {typeof res.attractivenessScore === 'number' && (
                    <span>{ar ? 'الدرجة' : 'Score'} <span dir="ltr">{res.attractivenessScore}/100</span></span>
                  )}
                </div>
              </Link>
            );
          })}
        </section>
      )}
    </div>
  );
}

function CreateOpportunityForm({
  projectTypes,
  onCreated,
}: {
  projectTypes: Record<string, { label: string }>;
  onCreated: () => Promise<void>;
}) {
  const { lang } = useI18n();
  const ar = lang === 'ar';
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    title: '',
    projectType: 'residential',
    country: 'UAE',
    city: 'Dubai',
    estimatedInvestment: '',
    currency: 'AED',
    equityPct: '40',
    interestRatePct: '6',
    tenorYears: '15',
    businessObjective: '',
    builtUpAreaSqm: '',
  });
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const typeOptions = useMemo(() => Object.entries(projectTypes), [projectTypes]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const equity = Math.max(0, Math.min(100, Number(form.equityPct) || 40)) / 100;
      const body = {
        title: form.title,
        projectType: form.projectType,
        country: form.country || null,
        city: form.city || null,
        estimatedInvestment: form.estimatedInvestment ? Number(form.estimatedInvestment) : null,
        currency: form.currency || 'AED',
        fundingStructure: {
          equityPct: equity,
          debtPct: Math.round((1 - equity) * 100) / 100,
          interestRatePct: (Number(form.interestRatePct) || 6) / 100,
          tenorYears: Number(form.tenorYears) || 15,
        },
        businessObjective: form.businessObjective || null,
        inputs: form.builtUpAreaSqm ? { builtUpAreaSqm: Number(form.builtUpAreaSqm) } : {},
      };
      const created = await api<OpportunityRecord>('/feasibility/opportunities', {
        method: 'POST', body: JSON.stringify(body),
      });
      toast.success(ar ? 'تم إنشاء الفرصة' : 'Opportunity created', `${created.code} · ${created.title}`);
      await onCreated();
    } catch (err) {
      toast.error(ar ? 'فشل الإنشاء' : 'Create failed', (err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const field = 'w-full rounded-lg border border-slate-700 bg-slate-900/70 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-sky-500/60 focus:outline-none';
  const label = 'mb-1 block text-[11px] font-semibold uppercase tracking-wider text-slate-400';

  return (
    <Card
      title={ar ? 'التقييم الاستثماري السريع — مُدخلات المستوى الأول' : 'Rapid Investment Assessment — Level 1 inputs'}
      hint={ar ? 'قدر يسير من المعلومات يكفي؛ تُكمل الافتراضات المرجعية ما تبقّى' : 'Only a small amount of information is needed; reference assumptions fill the rest'}
    >
      <form onSubmit={submit} className="grid gap-4 md:grid-cols-3">
        <div className="md:col-span-2">
          <label className={label}>{ar ? 'عنوان الفرصة *' : 'Opportunity title *'}</label>
          <input className={field} required value={form.title} onChange={set('title')} placeholder={ar ? 'مثال: برج مارينا متعدد الاستخدامات' : 'e.g. Marina mixed-use tower'} />
        </div>
        <div>
          <label className={label}>{ar ? 'نوع المشروع *' : 'Project type *'}</label>
          <select className={field} value={form.projectType} onChange={set('projectType')}>
            {typeOptions.map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </div>
        <div>
          <label className={label}>{ar ? 'الدولة' : 'Country'}</label>
          <input className={field} value={form.country} onChange={set('country')} />
        </div>
        <div>
          <label className={label}>{ar ? 'المدينة' : 'City'}</label>
          <input className={field} value={form.city} onChange={set('city')} />
        </div>
        <div>
          <label className={label}>{ar ? `الاستثمار التقديري (${form.currency})` : `Estimated investment (${form.currency})`}</label>
          <input className={field} type="number" min="0" value={form.estimatedInvestment} onChange={set('estimatedInvestment')} placeholder={ar ? 'مثال: 100000000' : 'e.g. 100000000'} />
        </div>
        <div>
          <label className={label}>{ar ? 'المسطح المبني (م²) — اختياري' : 'Built-up area (m²) — optional'}</label>
          <input className={field} type="number" min="0" value={form.builtUpAreaSqm} onChange={set('builtUpAreaSqm')} placeholder={ar ? 'يُستخدم في حال عدم توفّر قيمة الاستثمار' : 'used if no investment figure'} />
        </div>
        <div>
          <label className={label}>{ar ? 'نسبة حقوق الملكية ٪ (والباقي دَيْن)' : 'Equity % (rest is debt)'}</label>
          <input className={field} type="number" min="0" max="100" value={form.equityPct} onChange={set('equityPct')} />
        </div>
        <div>
          <label className={label}>{ar ? 'سعر الفائدة ٪ / مدة القرض (سنوات)' : 'Interest % / tenor (years)'}</label>
          <div className="flex gap-2">
            <input className={field} type="number" step="0.1" min="0" value={form.interestRatePct} onChange={set('interestRatePct')} />
            <input className={field} type="number" min="1" value={form.tenorYears} onChange={set('tenorYears')} />
          </div>
        </div>
        <div className="md:col-span-3">
          <label className={label}>{ar ? 'الهدف الاستثماري' : 'Business objective'}</label>
          <textarea className={field} rows={2} value={form.businessObjective} onChange={set('businessObjective')} placeholder={ar ? 'ما الذي يسعى المستثمر لتحقيقه' : 'What the investor wants to achieve'} />
        </div>
        <div className="md:col-span-3 flex justify-end gap-2">
          <Button type="submit" variant="primary" disabled={busy}>{busy ? (ar ? 'جارٍ الإنشاء…' : 'Creating…') : (ar ? 'إنشاء الفرصة' : 'Create opportunity')}</Button>
        </div>
      </form>
    </Card>
  );
}

'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';

import { AuthGate } from '../../../components/AuthGate';
import { DonutChart, CHART_PALETTE } from '../../../components/Charts';
import { GovernanceStatusBadge } from '../../../components/GovernanceStatusBadge';
import { IconSparkles } from '../../../components/Icons';
import { MarkdownLite } from '../../../components/MarkdownLite';
import { useToast } from '../../../components/ToastProvider';
import { useI18n } from '../../../lib/i18n';
import {
  api,
  AssessmentRecord,
  ConceptDocumentRecord,
  FeasibilityPackage,
  OpportunityRecord,
  StudySectionRecord,
} from '../../../lib/api';
import { Button, Card, EmptyState, PageHeader, Pill } from '../../../components/ui';

export default function OpportunityRoute() {
  return (
    <AuthGate capability="canRunFeasibility" surface="Investment & Feasibility">
      <OpportunityPage />
    </AuthGate>
  );
}

type Tab = 'assessment' | 'study' | 'packages' | 'sketches';

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

const REC_BANNER: Record<string, string> = {
  proceed: 'border-emerald-500/50 bg-emerald-500/10 text-emerald-100',
  proceed_with_conditions: 'border-amber-400/50 bg-amber-400/10 text-amber-100',
  hold: 'border-orange-500/50 bg-orange-500/10 text-orange-100',
  reject: 'border-red-500/50 bg-red-500/10 text-red-100',
};

interface Detail {
  opportunity: OpportunityRecord;
  latestAssessment: AssessmentRecord | null;
  sections: StudySectionRecord[];
  documents: ConceptDocumentRecord[];
}

function OpportunityPage() {
  const { lang } = useI18n();
  const ar = lang === 'ar';
  const { id } = useParams<{ id: string }>();
  const toast = useToast();
  const [detail, setDetail] = useState<Detail | null>(null);
  const [tab, setTab] = useState<Tab>('assessment');
  const [busy, setBusy] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setDetail(await api<Detail>(`/feasibility/opportunities/${id}`));
    } catch (e) {
      toast.error(ar ? 'تعذّر تحميل الفرصة' : 'Failed to load opportunity', (e as Error).message);
    }
  }, [id, toast, ar]);

  useEffect(() => { void refresh(); }, [refresh]);

  if (!detail) return <p className="text-sm text-slate-400">{ar ? 'جارٍ التحميل…' : 'Loading…'}</p>;
  const { opportunity: opp, latestAssessment: a } = detail;
  const cur = opp.currency;
  const fmtM = (n: number | null | undefined) =>
    n === null || n === undefined ? '—' : `${cur} ${(n / 1_000_000).toFixed(2)}M`;
  const pct = (n: number | null | undefined) =>
    n === null || n === undefined ? '—' : `${(n * 100).toFixed(1)}%`;

  const runAssessment = async () => {
    setBusy('assess');
    try {
      const r = await api<{ assessment: AssessmentRecord }>(`/feasibility/opportunities/${opp.id}/assess`, { method: 'POST' });
      const recLabel = (ar ? REC_LABEL_AR : REC_LABEL)[r.assessment?.recommendation ?? ''] ?? r.assessment?.recommendation;
      toast.success(ar ? 'اكتمل التقييم' : 'Assessment complete', ar ? `${recLabel} · موثّق عبر ext.investment` : `${recLabel} · audited via ext.investment`);
      await refresh();
    } catch (e) { toast.error(ar ? 'فشل التقييم' : 'Assessment failed', (e as Error).message); }
    finally { setBusy(null); }
  };

  const generateStudy = async () => {
    setBusy('study');
    try {
      const rows = await api<StudySectionRecord[]>(`/feasibility/opportunities/${opp.id}/study/generate`, { method: 'POST' });
      toast.success(ar ? 'تم توليد الدراسة' : 'Study generated', ar ? `${rows.length} بنود (الإصدار v${rows[0]?.version ?? 1})` : `${rows.length} sections (v${rows[0]?.version ?? 1})`);
      setTab('study');
      await refresh();
    } catch (e) { toast.error(ar ? 'فشل توليد الدراسة' : 'Study generation failed', (e as Error).message); }
    finally { setBusy(null); }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={`Investment & Feasibility · ${opp.code}`}
        title={opp.title}
        description={`${opp.projectType} · ${[opp.city, opp.country].filter(Boolean).join(', ') || (ar ? 'الموقع لم يُحدّد بعد' : 'location TBD')} · ${ar ? 'المرحلة' : 'stage'}: ${ar ? (STAGE_LABEL_AR[opp.stage] ?? opp.stage) : opp.stage}`}
        actions={
          <>
            <Button variant="success" size="sm" disabled={busy === 'assess'} onClick={runAssessment}>
              {busy === 'assess' ? (ar ? 'جارٍ…' : 'Running…') : (ar ? 'تشغيل التقييم السريع' : 'Run rapid assessment')}
            </Button>
            <Button variant="primary" size="sm" disabled={busy === 'study'} onClick={generateStudy}>
              <IconSparkles className="h-3.5 w-3.5" /> {busy === 'study' ? (ar ? 'جارٍ التوليد…' : 'Generating…') : (ar ? 'توليد الدراسة الاحترافية' : 'Generate professional study')}
            </Button>
          </>
        }
      />

      <nav className="flex flex-wrap gap-2" role="tablist" aria-label={ar ? 'عروض الفرصة' : 'Opportunity views'}>
        {([
          ['assessment', ar ? 'المستوى الأول · التقييم' : 'Level 1 · Assessment'],
          ['study', `${ar ? 'المستوى الثاني · الدراسة' : 'Level 2 · Study'}${detail.sections.length ? ` (${detail.sections.length})` : ''}`],
          ['packages', ar ? 'الحزم' : 'Packages'],
          ['sketches', `${ar ? 'الرسوم المفاهيمية' : 'Concept sketches'}${detail.documents.length ? ` (${detail.documents.length})` : ''}`],
        ] as Array<[Tab, string]>).map(([k, label]) => (
          <button
            key={k}
            role="tab"
            aria-selected={tab === k}
            onClick={() => setTab(k)}
            className={`rounded-full border px-3.5 py-1.5 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/60 ${
              tab === k
                ? 'border-sky-500/60 bg-sky-500/15 text-sky-100'
                : 'border-slate-700 text-slate-300 hover:border-slate-500 hover:text-slate-100'
            }`}
          >
            {label}
          </button>
        ))}
      </nav>

      {tab === 'assessment' && <AssessmentTab opp={opp} a={a} fmtM={fmtM} pct={pct} />}
      {tab === 'study' && <StudyTab opp={opp} sections={detail.sections} refresh={refresh} onGenerate={generateStudy} busy={busy === 'study'} />}
      {tab === 'packages' && <PackagesTab opp={opp} hasStudy={detail.sections.length > 0} />}
      {tab === 'sketches' && <SketchesTab opp={opp} documents={detail.documents} refresh={refresh} />}
    </div>
  );
}

// ───────────────────────── Level 1 · Assessment ─────────────────────────

function AssessmentTab({
  opp, a, fmtM, pct,
}: {
  opp: OpportunityRecord;
  a: AssessmentRecord | null;
  fmtM: (n: number | null | undefined) => string;
  pct: (n: number | null | undefined) => string;
}) {
  const { lang } = useI18n();
  const ar = lang === 'ar';
  if (!a) {
    return (
      <EmptyState
        title={ar ? 'لا يوجد تقييم بعد' : 'No assessment yet'}
        description={ar
          ? 'شغّل التقييم السريع — يكتفي النموذج الحتمي بالمُدخلات التي قدّمتها عند الإنشاء (أو برسم مفاهيمي مُعتمد).'
          : 'Run the rapid assessment — the deterministic model needs only the inputs you provided at creation (or a confirmed concept sketch).'}
      />
    );
  }
  const r = a.results;
  const rec = String(a.recommendation);

  return (
    <div className="space-y-5">
      {/* Recommendation banner */}
      <div className={`flex flex-wrap items-center gap-3 rounded-xl border px-4 py-3 ${REC_BANNER[rec] ?? REC_BANNER.hold}`}>
        <GovernanceStatusBadge status={a.governanceStatus} />
        <span className="text-base font-bold">{(ar ? REC_LABEL_AR : REC_LABEL)[rec] ?? rec}</span>
        <span className="text-xs opacity-90">{ar ? 'المخاطر' : 'Risk'}: {a.riskRating}</span>
        <span className="text-xs opacity-90">{ar ? 'الجاذبية' : 'Attractiveness'} <span dir="ltr">{r.attractivenessScore}/100</span></span>
        <span className="text-xs opacity-90">{ar ? 'الثقة' : 'Confidence'} <span dir="ltr">{(a.confidence * 100).toFixed(0)}%</span></span>
        <span className="ms-auto text-[11px] opacity-75">{new Date(a.createdAt).toLocaleString()}</span>
      </div>

      {/* KPI tiles */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Kpi label="NPV" value={fmtM(r.npv)} good={r.npv > 0} />
        <Kpi label={`${ar ? 'IRR المشروع (الحد الأدنى للعائد' : 'Project IRR (hurdle'} ${pct(r.hurdleIrrPct)})`} value={pct(r.projectIrr)} good={(r.projectIrr ?? -1) >= r.hurdleIrrPct} />
        <Kpi label={ar ? 'IRR حقوق الملكية' : 'Equity IRR'} value={pct(r.equityIrr)} good={(r.equityIrr ?? -1) >= r.hurdleIrrPct} />
        <Kpi label={ar ? 'فترة الاسترداد (سنوات)' : 'Payback (years)'} value={String(r.paybackYears ?? '—')} good={r.paybackYears !== null} />
        <Kpi label={ar ? 'أدنى DSCR (عند الاستقرار)' : 'Min DSCR (stabilized)'} value={String(r.dscr?.min ?? '—')} good={(r.dscr?.min ?? 0) >= 1.2} />
      </div>

      {(r.conditions?.length ?? 0) > 0 && (
        <Card title={ar ? 'الشروط / المبررات' : 'Conditions / rationale'} hint={ar ? 'كل قاعدة تدرّج جرى تفعيلها، مُسمّاة' : 'Every fired ladder rule, named'}>
          <ul className="list-disc space-y-1 ps-5 text-sm text-slate-200">
            {r.conditions.map((c, i) => <li key={i}>{c}</li>)}
          </ul>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title={ar ? 'توزيع التكلفة الرأسمالية CAPEX' : 'CAPEX breakdown'} hint={ar ? `${fmtM(r.debtAmount + r.equityAmount)} إجمالي المظروف` : `${fmtM(r.debtAmount + r.equityAmount)} total envelope`}>
          <DonutChart
            data={[
              { label: ar ? 'الإنشاء' : 'Construction', value: r.capexBreakdown?.construction ?? 0, accent: CHART_PALETTE.crimson },
              { label: ar ? 'الأرض' : 'Land', value: r.capexBreakdown?.land ?? 0, accent: '#38bdf8' },
              { label: ar ? 'التكاليف غير المباشرة' : 'Soft costs', value: r.capexBreakdown?.softCosts ?? 0, accent: '#a78bfa' },
              { label: ar ? 'الاحتياطي الطارئ' : 'Contingency', value: r.capexBreakdown?.contingency ?? 0, accent: '#f59e0b' },
            ]}
            centerValue={fmtM(r.debtAmount + r.equityAmount)}
            centerLabel="CAPEX"
          />
        </Card>
        <Card title={ar ? 'هيكل التمويل والتشغيل' : 'Funding & operating profile'} hint={ar ? 'من مجموعة الافتراضات المُلتقطة' : 'From the snapshotted assumption set'}>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <Dt k={ar ? 'حقوق الملكية' : 'Equity'} v={fmtM(r.equityAmount)} />
            <Dt k={ar ? 'الدَّيْن' : 'Debt'} v={fmtM(r.debtAmount)} />
            <Dt k={ar ? 'خدمة الدين السنوية' : 'Annual debt service'} v={fmtM(r.annualDebtService)} />
            <Dt k={ar ? 'متوسط DSCR' : 'Avg DSCR'} v={String(r.dscr?.avg ?? '—')} />
            <Dt k={ar ? 'الإيراد عند الاستقرار / سنة' : 'Stabilized revenue / yr'} v={fmtM(r.stabilizedRevenue)} />
            <Dt k={ar ? 'EBITDA عند الاستقرار / سنة' : 'Stabilized EBITDA / yr'} v={fmtM(r.stabilizedEbitda)} />
            <Dt k={ar ? 'قيمة الخروج (النهائية)' : 'Exit (terminal) value'} v={fmtM(r.terminalValue)} />
            <Dt k={ar ? 'عوامل المخاطر' : 'Risk factors'} v={r.riskFactors?.length ? r.riskFactors.join('; ') : (ar ? 'لا عوامل مُفعّلة' : 'none fired')} />
          </dl>
        </Card>
      </div>

      <Card title={ar ? 'إسقاط التدفقات النقدية' : 'Cash-flow projection'} hint={ar ? 'تدفقات المشروع غير المُمَوّلة بالدين؛ قيمة الخروج في السنة الأخيرة' : 'Unlevered project flows; exit value in the final year'}>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-slate-800/80">
                {(ar
                  ? ['السنة', 'المرحلة', 'الإيراد', 'OPEX', 'EBITDA', 'مخرج CAPEX', 'خدمة الدين', 'DSCR', 'تدفق المشروع', 'التراكمي']
                  : ['Year', 'Phase', 'Revenue', 'OPEX', 'EBITDA', 'CAPEX out', 'Debt service', 'DSCR', 'Project CF', 'Cumulative']
                ).map((h) => (
                  <th key={h} className="px-2.5 py-2 text-start font-semibold uppercase tracking-wider text-slate-300">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {r.years?.map((y) => (
                <tr key={y.year} className="border-t border-slate-800 odd:bg-slate-900/40">
                  <td className="px-2.5 py-1.5 font-mono text-slate-200" dir="ltr">{y.year}</td>
                  <td className="px-2.5 py-1.5"><Pill tone={y.phase === 'construction' ? 'amber' : 'emerald'}>{ar ? (y.phase === 'construction' ? 'الإنشاء' : y.phase === 'operation' ? 'التشغيل' : y.phase) : y.phase}</Pill></td>
                  {[y.revenue, y.opex, y.ebitda, y.capexOutflow, y.debtService].map((v, i) => (
                    <td key={i} className="px-2.5 py-1.5 tabular-nums text-slate-200" dir="ltr">{v ? (v / 1_000_000).toFixed(2) + 'M' : '—'}</td>
                  ))}
                  <td className="px-2.5 py-1.5 tabular-nums" dir="ltr">{y.dscr ?? '—'}</td>
                  <td className={`px-2.5 py-1.5 tabular-nums ${y.projectCashflow < 0 ? 'text-rose-300' : 'text-emerald-300'}`} dir="ltr">
                    {(y.projectCashflow / 1_000_000).toFixed(2)}M
                  </td>
                  <td className={`px-2.5 py-1.5 tabular-nums ${y.cumulativeProjectCashflow < 0 ? 'text-rose-300' : 'text-emerald-300'}`} dir="ltr">
                    {(y.cumulativeProjectCashflow / 1_000_000).toFixed(2)}M
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <p className="text-[11px] text-slate-500">
        {ar
          ? `نموذج حتمي · مكتبة الافتراضات ${String((a.assumptions as Record<string, unknown>).libraryVersion ?? '')} · أساس المُدخلات: ${String((a.inputs as Record<string, unknown>).capexBasis ?? '')} · موثّق كتنفيذ وكيل AgentExecution (ext.investment).`
          : `Deterministic model · assumption library ${String((a.assumptions as Record<string, unknown>).libraryVersion ?? '')} · inputs basis: ${String((a.inputs as Record<string, unknown>).capexBasis ?? '')} · audited as AgentExecution (ext.investment).`}
        {' '}<Link href="/agents" className="text-sky-400 hover:underline">{ar ? 'العرض في سجل الوكلاء ←' : 'View in agent registry →'}</Link>
      </p>
    </div>
  );
}

function Kpi({ label, value, good }: { label: string; value: string; good: boolean }) {
  return (
    <div className={`rounded-xl border p-3 ${good ? 'border-emerald-500/40 bg-emerald-500/5' : 'border-rose-500/40 bg-rose-500/5'}`}>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{label}</p>
      <p className={`mt-1 text-lg font-bold tabular-nums ${good ? 'text-emerald-200' : 'text-rose-200'}`} dir="ltr">{value}</p>
    </div>
  );
}

function Dt({ k, v }: { k: string; v: string }) {
  return (
    <>
      <dt className="text-slate-400">{k}</dt>
      <dd className="text-end font-medium tabular-nums text-slate-100" dir="ltr">{v}</dd>
    </>
  );
}

// ───────────────────────── Level 2 · Study ─────────────────────────

function StudyTab({
  opp, sections, refresh, onGenerate, busy,
}: {
  opp: OpportunityRecord;
  sections: StudySectionRecord[];
  refresh: () => Promise<void>;
  onGenerate: () => Promise<void>;
  busy: boolean;
}) {
  const { lang } = useI18n();
  const ar = lang === 'ar';
  const toast = useToast();
  const [open, setOpen] = useState<string | null>(sections[0]?.sectionKey ?? null);

  if (!sections.length) {
    return (
      <EmptyState
        title={ar ? 'لا توجد دراسة احترافية بعد' : 'No professional study yet'}
        description={ar
          ? 'يُولّد المستوى الثاني تدريجياً دراسة الجدوى والقابلية للتمويل البنكي كاملةً — 17 بنداً من الملخص التنفيذي إلى توصية الحوكمة — انطلاقاً من النموذج الحتمي.'
          : 'Level 2 progressively generates the full feasibility & bankability study — 17 sections from Executive Summary to Governance Recommendation — from the deterministic model.'}
        action={<Button variant="primary" disabled={busy} onClick={onGenerate}>{busy ? (ar ? 'جارٍ التوليد…' : 'Generating…') : (ar ? 'توليد الدراسة الاحترافية' : 'Generate professional study')}</Button>}
      />
    );
  }

  const approve = async (sectionKey: string) => {
    try {
      await api(`/feasibility/opportunities/${opp.id}/study/${sectionKey}/approve`, { method: 'POST' });
      toast.success(ar ? 'تم اعتماد البند' : 'Section approved', sectionKey);
      await refresh();
    } catch (e) { toast.error(ar ? 'فشل الاعتماد' : 'Approve failed', (e as Error).message); }
  };

  return (
    <div className="space-y-2.5">
      <p className="text-xs text-slate-400">
        {ar
          ? `الإصدار ${sections[0]?.version} · ${sections.filter((s) => s.status === 'approved').length}/${sections.length} مُعتمد · كل بند قابل لإعادة التوليد؛ والاعتماد هو البوابة البشرية قبل التجميع.`
          : `Version ${sections[0]?.version} · ${sections.filter((s) => s.status === 'approved').length}/${sections.length} approved · every section is regenerable; approval is the human gate before packaging.`}
      </p>
      {sections.map((s, i) => (
        <div key={s.id} className="overflow-hidden rounded-xl border border-slate-700/70 bg-slate-900/60">
          <button
            onClick={() => setOpen((o) => (o === s.sectionKey ? null : s.sectionKey))}
            className="flex w-full items-center gap-3 px-4 py-3 text-start transition hover:bg-slate-800/50"
            aria-expanded={open === s.sectionKey}
          >
            <span className="font-mono text-[10px] font-bold text-slate-500" dir="ltr">{String(i + 1).padStart(2, '0')}</span>
            <span className="flex-1 text-sm font-semibold text-slate-100">{s.title}</span>
            <Pill tone={s.source === 'llm' ? 'violet' : 'slate'}>{ar ? (s.source === 'llm' ? 'ذكاء اصطناعي' : s.source === 'deterministic' ? 'حتمي' : s.source) : s.source}</Pill>
            <Pill tone={s.status === 'approved' ? 'emerald' : 'amber'}>{ar ? (s.status === 'approved' ? 'مُعتمد' : s.status === 'draft' ? 'مسودة' : s.status) : s.status}</Pill>
          </button>
          {open === s.sectionKey && (
            <div className="space-y-3 border-t border-slate-800 px-4 py-4">
              <MarkdownLite text={s.content} />
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-slate-500">v{s.version} · {new Date(s.createdAt).toLocaleString()}{s.approvedBy ? (ar ? ` · اعتمده ${s.approvedBy}` : ` · approved by ${s.approvedBy}`) : ''}</span>
                {s.status !== 'approved' && (
                  <Button variant="success" size="sm" onClick={() => approve(s.sectionKey)}>{ar ? 'اعتماد البند' : 'Approve section'}</Button>
                )}
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ───────────────────────── Audience packages ─────────────────────────

const AUDIENCES: Array<{ key: string; title: string; desc: string; titleAr: string; descAr: string }> = [
  { key: 'investor', title: 'Investor Package', desc: 'Returns story: market, revenue, NPV/IRR/payback, sensitivity, risk.', titleAr: 'حزمة المستثمر', descAr: 'سردية العوائد: السوق، الإيراد، NPV/IRR/فترة الاسترداد، تحليل الحساسية، المخاطر.' },
  { key: 'partner', title: 'Partner Package', desc: 'Venture story: market, technical & operational model, CAPEX/OPEX.', titleAr: 'حزمة الشريك', descAr: 'سردية المشروع: السوق، النموذج الفني والتشغيلي، CAPEX/OPEX.' },
  { key: 'bank', title: 'Bank Financing Package', desc: 'Credit story: statements, DSCR, funding requirements, bankability.', titleAr: 'حزمة التمويل البنكي', descAr: 'السردية الائتمانية: القوائم المالية، DSCR، متطلبات التمويل، القابلية للتمويل البنكي.' },
];

function PackagesTab({ opp, hasStudy }: { opp: OpportunityRecord; hasStudy: boolean }) {
  const { lang } = useI18n();
  const ar = lang === 'ar';
  const toast = useToast();
  const [pkg, setPkg] = useState<FeasibilityPackage | null>(null);
  const [loading, setLoading] = useState<string | null>(null);
  const printRef = useRef<HTMLDivElement>(null);

  if (!hasStudy) {
    return <EmptyState title={ar ? 'ولّد الدراسة أولاً' : 'Generate the study first'} description={ar ? 'الحزم تركيبات خاصة بكل جمهور من بنود دراسة المستوى الثاني.' : 'Packages are audience-specific compositions of the Level-2 study sections.'} />;
  }

  const load = async (audience: string) => {
    setLoading(audience);
    try {
      setPkg(await api<FeasibilityPackage>(`/feasibility/opportunities/${opp.id}/package/${audience}`));
    } catch (e) { toast.error(ar ? 'فشل تجهيز الحزمة' : 'Package failed', (e as Error).message); }
    finally { setLoading(null); }
  };

  return (
    <div className="space-y-5">
      <div className="grid gap-3 md:grid-cols-3">
        {AUDIENCES.map((a) => (
          <button
            key={a.key}
            onClick={() => load(a.key)}
            className={`rounded-xl border p-4 text-start transition hover:border-sky-500/60 hover:bg-slate-900/80 ${
              pkg?.audience === a.key ? 'border-sky-500/60 bg-sky-500/10' : 'border-slate-700/70 bg-slate-900/60'
            }`}
          >
            <p className="text-sm font-bold text-slate-50">{ar ? a.titleAr : a.title}</p>
            <p className="mt-1 text-xs text-slate-400">{ar ? a.descAr : a.desc}</p>
            <p className="mt-2 text-[11px] font-semibold text-sky-300">{loading === a.key ? (ar ? 'جارٍ التجميع…' : 'Composing…') : (ar ? 'تجميع ←' : 'Compose →')}</p>
          </button>
        ))}
      </div>

      {pkg && (
        <Card
          title={`${(ar ? AUDIENCES.find((a) => a.key === pkg.audience)?.titleAr : AUDIENCES.find((a) => a.key === pkg.audience)?.title) ?? pkg.audience} — ${pkg.opportunity.code}`}
          hint={ar ? `${pkg.generatedSections} بنود · ${pkg.approvedSections} مُعتمد` : `${pkg.generatedSections} sections · ${pkg.approvedSections} approved`}
          actions={<Button variant="ghost" size="sm" onClick={() => window.print()}>{ar ? 'طباعة / حفظ PDF' : 'Print / save PDF'}</Button>}
        >
          <div ref={printRef} className="space-y-6">
            <div className="border-b border-slate-700 pb-3">
              <p className="text-lg font-bold text-slate-50">{pkg.opportunity.title}</p>
              <p className="text-xs text-slate-400">
                {pkg.opportunity.code} · {pkg.opportunity.projectType} · {[pkg.opportunity.city, pkg.opportunity.country].filter(Boolean).join(', ')} · {pkg.opportunity.currency}
              </p>
            </div>
            {pkg.sections.map((s, i) => (
              <section key={s.id}>
                <h3 className="mb-2 text-sm font-bold uppercase tracking-wider text-sky-300">
                  {i + 1}. {s.title}
                  {s.status === 'approved' && <span className="ms-2 text-[10px] font-semibold text-emerald-400">{ar ? '✓ مُعتمد' : '✓ approved'}</span>}
                </h3>
                <MarkdownLite text={s.content} />
              </section>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

// ───────────────────────── Concept sketches ─────────────────────────

const FIELD_DEFS: Array<{ key: string; label: string; labelAr: string; kind: 'number' | 'text' | 'list' }> = [
  { key: 'plotAreaSqm', label: 'Plot area (m²)', labelAr: 'مساحة الأرض (م²)', kind: 'number' },
  { key: 'builtUpAreaSqm', label: 'Built-up area (m²)', labelAr: 'المسطح المبني (م²)', kind: 'number' },
  { key: 'floors', label: 'Floors', labelAr: 'عدد الطوابق', kind: 'number' },
  { key: 'functionalZones', label: 'Functional zones (comma-separated)', labelAr: 'النطاقات الوظيفية (مفصولة بفواصل)', kind: 'list' },
  { key: 'approxDimensions', label: 'Approx. dimensions', labelAr: 'الأبعاد التقريبية', kind: 'text' },
  { key: 'capacity', label: 'Capacity', labelAr: 'السعة', kind: 'text' },
  { key: 'writtenNotes', label: 'Written notes (comma-separated)', labelAr: 'الملاحظات المكتوبة (مفصولة بفواصل)', kind: 'list' },
  { key: 'keyAssumptions', label: 'Key assumptions (comma-separated)', labelAr: 'الافتراضات الرئيسية (مفصولة بفواصل)', kind: 'list' },
];

function SketchesTab({
  opp, documents, refresh,
}: {
  opp: OpportunityRecord;
  documents: ConceptDocumentRecord[];
  refresh: () => Promise<void>;
}) {
  const { lang } = useI18n();
  const ar = lang === 'ar';
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState<ConceptDocumentRecord | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const upload = async (file: File) => {
    setBusy('upload');
    try {
      const b64 = await toBase64(file);
      await api(`/feasibility/opportunities/${opp.id}/documents`, {
        method: 'POST',
        body: JSON.stringify({ filename: file.name, mimeType: file.type || 'application/octet-stream', contentBase64: b64 }),
      });
      toast.success(ar ? 'تم رفع الرسم' : 'Sketch uploaded', file.name);
      await refresh();
    } catch (e) { toast.error(ar ? 'فشل الرفع' : 'Upload failed', (e as Error).message); }
    finally { setBusy(null); if (fileRef.current) fileRef.current.value = ''; }
  };

  const extract = async (doc: ConceptDocumentRecord) => {
    setBusy(doc.id);
    try {
      const updated = await api<ConceptDocumentRecord>(`/feasibility/documents/${doc.id}/extract`, { method: 'POST' });
      if (updated.extractionStatus === 'extracted') {
        toast.success(ar ? 'تم اقتراح الاستخراج' : 'Extraction proposed', ar ? 'راجع الحقول، وعدّلها عند الحاجة، ثم اعتمدها.' : 'Review the fields, edit if needed, then confirm.');
        setReviewing(updated);
      } else {
        toast.error(ar ? 'الاستخراج غير متاح' : 'Extraction not available', updated.extractionError ?? (ar ? 'غير معروف' : 'unknown'));
        if (updated.extractionStatus === 'manual') setReviewing(updated);
      }
      await refresh();
    } catch (e) { toast.error(ar ? 'فشل الاستخراج' : 'Extraction failed', (e as Error).message); }
    finally { setBusy(null); }
  };

  const statusAr: Record<string, string> = { confirmed: 'مُعتمد', extracted: 'مُستخرج', failed: 'فشل', manual: 'يدوي', pending: 'قيد الانتظار' };

  return (
    <div className="space-y-5">
      <Card
        title={ar ? 'رفع رسم مفاهيمي / مخطط أولي' : 'Upload a concept sketch / preliminary drawing'}
        hint={ar
          ? 'PNG أو JPEG أو WEBP أو GIF أو PDF · بحد أقصى 15 ميجابايت · يقترح الاستخراج عبر OCR والرؤية الحاسوبية المُدخلات؛ ويعتمدها مختص بشري قبل تطبيق أي شيء'
          : 'PNG, JPEG, WEBP, GIF or PDF · max 15 MB · OCR + vision extraction proposes the inputs; a human confirms before anything is applied'}
      >
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif,application/pdf"
          disabled={busy === 'upload'}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); }}
          className="block w-full cursor-pointer rounded-lg border border-dashed border-slate-600 bg-slate-900/50 px-3 py-6 text-center text-sm text-slate-300 file:me-3 file:rounded-md file:border-0 file:bg-sky-600 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-white hover:border-sky-500/60"
        />
      </Card>

      {documents.length === 0 ? (
        <EmptyState title={ar ? 'لا توجد وثائق مفاهيمية' : 'No concept documents'} description={ar ? 'يبدأ كثير من المستثمرين برسم بسيط أو ملاحظات بخط اليد — ارفع أحدها لاستخراج مساحة الأرض والمسطح المبني BUA وعدد الطوابق والنطاقات ومزيج الوحدات والملاحظات.' : 'Many investors start with a simple sketch or handwritten notes — upload one to extract plot area, BUA, floors, zones, unit mix and notes.'} />
      ) : (
        <div className="space-y-2.5">
          {documents.map((d) => (
            <div key={d.id} className="rounded-xl border border-slate-700/70 bg-slate-900/60 px-4 py-3">
              <div className="flex flex-wrap items-center gap-3">
                <span className="flex-1 truncate text-sm font-semibold text-slate-100">{d.filename}</span>
                <span className="text-[11px] text-slate-500" dir="ltr">{(d.sizeBytes / 1024).toFixed(0)} KB</span>
                <Pill tone={
                  d.extractionStatus === 'confirmed' ? 'emerald'
                  : d.extractionStatus === 'extracted' ? 'sky'
                  : d.extractionStatus === 'failed' ? 'rose'
                  : d.extractionStatus === 'manual' ? 'amber' : 'slate'
                }>{ar ? (statusAr[d.extractionStatus] ?? d.extractionStatus) : d.extractionStatus}</Pill>
                {(d.extractionStatus === 'pending' || d.extractionStatus === 'failed') && (
                  <Button variant="primary" size="sm" disabled={busy === d.id} onClick={() => extract(d)}>
                    <IconSparkles className="h-3.5 w-3.5" /> {busy === d.id ? (ar ? 'جارٍ الاستخراج…' : 'Extracting…') : (ar ? 'استخراج بالذكاء الاصطناعي' : 'AI extract')}
                  </Button>
                )}
                {d.extractionStatus !== 'confirmed' && d.extractionStatus !== 'pending' && (
                  <Button variant="ghost" size="sm" onClick={() => setReviewing(d)}>{ar ? 'مراجعة واعتماد' : 'Review & confirm'}</Button>
                )}
              </div>
              {d.extractionError && <p className="mt-1.5 text-[11px] text-amber-300/90">{d.extractionError}</p>}
              {d.extractionStatus === 'confirmed' && d.confirmedFields && (
                <p className="mt-1.5 text-[11px] text-emerald-300/80">
                  {ar ? 'طُبّقت على مُدخلات دراسة الجدوى' : 'Applied to feasibility inputs'}{d.confirmedBy ? (ar ? ` بواسطة ${d.confirmedBy}` : ` by ${d.confirmedBy}`) : ''}: {summarizeFields(d.confirmedFields, ar)}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {reviewing && (
        <ConfirmFieldsForm
          doc={reviewing}
          onDone={async () => { setReviewing(null); await refresh(); }}
          onCancel={() => setReviewing(null)}
        />
      )}
    </div>
  );
}

function ConfirmFieldsForm({
  doc, onDone, onCancel,
}: {
  doc: ConceptDocumentRecord;
  onDone: () => Promise<void>;
  onCancel: () => void;
}) {
  const { lang } = useI18n();
  const ar = lang === 'ar';
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const proposed = (doc.extraction?.fields ?? {}) as Record<string, unknown>;
  const [values, setValues] = useState<Record<string, string>>(() => {
    const v: Record<string, string> = {};
    for (const f of FIELD_DEFS) {
      const raw = proposed[f.key];
      v[f.key] = Array.isArray(raw) ? (raw as unknown[]).join(', ') : raw == null ? '' : String(raw);
    }
    return v;
  });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const fields: Record<string, unknown> = {};
      for (const f of FIELD_DEFS) {
        const raw = values[f.key]?.trim();
        if (!raw) continue;
        fields[f.key] =
          f.kind === 'number' ? Number(raw)
          : f.kind === 'list' ? raw.split(',').map((s) => s.trim()).filter(Boolean)
          : raw;
      }
      await api(`/feasibility/documents/${doc.id}/confirm`, {
        method: 'POST', body: JSON.stringify({ fields }),
      });
      toast.success(ar ? 'تم اعتماد الحقول' : 'Fields confirmed', ar ? 'دُمجت في مُدخلات الفرصة — أعِد تشغيل التقييم للاستفادة منها.' : 'Merged into the opportunity inputs — re-run the assessment to use them.');
      await onDone();
    } catch (err) { toast.error(ar ? 'فشل الاعتماد' : 'Confirm failed', (err as Error).message); }
    finally { setBusy(false); }
  };

  const field = 'w-full rounded-lg border border-slate-700 bg-slate-900/70 px-3 py-2 text-sm text-slate-100 focus:border-sky-500/60 focus:outline-none';

  return (
    <Card
      title={ar ? `مراجعة الحقول المُستخرجة — ${doc.filename}` : `Review extracted fields — ${doc.filename}`}
      hint={doc.extraction?.confidence !== undefined
        ? (ar
            ? `اقتراح الذكاء الاصطناعي بثقة ${((doc.extraction.confidence ?? 0) * 100).toFixed(0)}٪ — أنت بوابة الاعتماد`
            : `AI proposal at ${((doc.extraction.confidence ?? 0) * 100).toFixed(0)}% confidence — you are the approval gate`)
        : (ar ? 'إدخال يدوي — املأ ما يُظهره الرسم' : 'Manual entry — fill in what the sketch shows')}
    >
      <form onSubmit={submit} className="grid gap-3 md:grid-cols-2">
        {FIELD_DEFS.map((f) => (
          <div key={f.key} className={f.kind === 'list' ? 'md:col-span-2' : ''}>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-slate-400">{ar ? f.labelAr : f.label}</label>
            <input
              className={field}
              type={f.kind === 'number' ? 'number' : 'text'}
              step="any"
              value={values[f.key] ?? ''}
              onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
            />
          </div>
        ))}
        <div className="md:col-span-2 flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onCancel}>{ar ? 'إلغاء' : 'Cancel'}</Button>
          <Button type="submit" variant="success" disabled={busy}>{busy ? (ar ? 'جارٍ الاعتماد…' : 'Confirming…') : (ar ? 'اعتماد وتطبيق على المُدخلات' : 'Confirm & apply to inputs')}</Button>
        </div>
      </form>
    </Card>
  );
}

function summarizeFields(f: Record<string, unknown>, ar = false): string {
  const bits: string[] = [];
  if (f.plotAreaSqm) bits.push(ar ? `الأرض ${f.plotAreaSqm} م²` : `plot ${f.plotAreaSqm} m²`);
  if (f.builtUpAreaSqm) bits.push(ar ? `المسطح المبني ${f.builtUpAreaSqm} م²` : `BUA ${f.builtUpAreaSqm} m²`);
  if (f.floors) bits.push(ar ? `${f.floors} طوابق` : `${f.floors} floors`);
  if (Array.isArray(f.functionalZones) && f.functionalZones.length) bits.push(ar ? `${(f.functionalZones as string[]).length} نطاقات` : `${(f.functionalZones as string[]).length} zones`);
  return bits.join(' · ') || (ar ? 'تم حفظ الحقول' : 'fields saved');
}

function toBase64(file: File): Promise<string> {
  return new Promise((resolveB64, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? '');
      resolveB64(result.split(',')[1] ?? '');
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useToast } from '../../components/ToastProvider';
import { api } from '../../lib/api';
import { AuthGate } from '../../components/AuthGate';
import { useI18n } from '../../lib/i18n';
import { IconRefresh, IconUpload } from '../../components/Icons';
import { Button, Card, ConfidenceBar, EmptyState, PageHeader, Pill } from '../../components/ui';
import { HierarchyPicker } from '../../components/HierarchyPicker';
import { emptyHierarchySel, placeProjectInHierarchy, resolveEnterprise, type GovTree, type HierarchySel } from '../../lib/hierarchy';
import { useMe } from '../../lib/me-context';
import { CAPABILITIES } from '../../lib/capabilities';

type Completeness = 'complete' | 'uncertain' | 'missing';
type Decision = 'pending' | 'confirm' | 'correct' | 'exclude' | 'assumption' | 'missing' | 'limited_confidence';

interface InputItem {
  id: string;
  layer: string;
  label: string;
  value: string;
  confidence: number;
  completeness: Completeness;
  assumptions: string[];
  question: string | null;
  evidence: string | null;
  dates?: { type: string; value: string; inferred: boolean }[];
  effectiveDate?: string | null;
  chronologyNote?: string | null;
  chronologyConflict?: boolean;
  decision?: Decision;
  correctedValue?: string | null;
}
interface Proposal {
  id: string;
  status: 'pending_review' | 'committed' | 'discarded';
  projectBusinessKey: string | null;
  summary: string | null;
  model: string | null;
  items: InputItem[];
  questions: string[] | null;
  commitResult?: Record<string, number | string | unknown> | null;
  createdAt?: string;
}

const LAYER_LABEL: Record<string, { en: string; ar: string; tone: 'sky' | 'emerald' | 'amber' | 'rose' | 'violet' | 'slate' }> = {
  'project-data': { en: 'Project Data', ar: 'بيانات المشروع', tone: 'sky' },
  planning: { en: 'Planning', ar: 'التخطيط', tone: 'sky' },
  commercial: { en: 'Commercial', ar: 'التجاري', tone: 'emerald' },
  risk: { en: 'Risk', ar: 'المخاطر', tone: 'amber' },
  claims: { en: 'Claims', ar: 'المطالبات', tone: 'rose' },
  governance: { en: 'Governance', ar: 'الحوكمة', tone: 'violet' },
  procurement: { en: 'Procurement', ar: 'المشتريات', tone: 'emerald' },
  qs: { en: 'Quantity Survey', ar: 'حصر الكميات', tone: 'emerald' },
  'daily-reporting': { en: 'Daily Reporting', ar: 'التقارير اليومية', tone: 'slate' },
  compliance: { en: 'Compliance', ar: 'الامتثال', tone: 'violet' },
  approvals: { en: 'Approvals', ar: 'الاعتمادات', tone: 'violet' },
  stakeholders: { en: 'Stakeholders', ar: 'الأطراف', tone: 'slate' },
  assumptions: { en: 'Assumptions', ar: 'الافتراضات', tone: 'amber' },
  'missing-information': { en: 'Missing Information', ar: 'معلومات ناقصة', tone: 'rose' },
  'supporting-evidence': { en: 'Supporting Evidence', ar: 'أدلة داعمة', tone: 'slate' },
};

/** Where each layer's committed data lands in the platform — for the distribution links. */
const LAYER_ROUTE: Record<string, string> = {
  'project-data': '/projects', planning: '/baselines',
  commercial: '/quantity-survey', cost: '/quantity-survey', qs: '/quantity-survey',
  procurement: '/procurement', risk: '/risk', claims: '/claims',
  contract: '/contract-rules', 'contract-rules': '/contract-rules',
  governance: '/governance-command', compliance: '/governance-command', approvals: '/approval',
  reports: '/reports/monthly', 'daily-reporting': '/reports/monthly',
  letters: '/letters', correspondence: '/letters', communications: '/communications',
  safety: '/safety', quality: '/quality', stakeholders: '/hierarchy', 'supporting-evidence': '/evidence',
};
const layerRoute = (layer: string): string => LAYER_ROUTE[layer] ?? '/review';

/**
 * Every per-project surface a freshly-added project unlocks — shown after analysis so the
 * user can jump straight into Contract, Letters, Reports, etc. for the new project
 * (Mr. Ayham, 2026-06-21). Each opens scoped to ?projectKey.
 */
const PROJECT_SURFACES: { href: string; en: string; ar: string }[] = [
  { href: '/projects', en: 'Project', ar: 'المشروع' },
  { href: '/baselines', en: 'Baseline / Schedule', ar: 'الجدول الأساسي' },
  { href: '/contract-rules', en: 'Contract', ar: 'العقد' },
  { href: '/letters', en: 'Letters', ar: 'الرسائل' },
  { href: '/communications', en: 'Communications', ar: 'المراسلات' },
  { href: '/reports/monthly', en: 'Reports', ar: 'التقارير' },
  { href: '/quantity-survey', en: 'Quantity Survey', ar: 'حصر الكميات' },
  { href: '/procurement', en: 'Procurement', ar: 'المشتريات' },
  { href: '/risk', en: 'Risk', ar: 'المخاطر' },
  { href: '/claims', en: 'Claims', ar: 'المطالبات' },
  { href: '/governance-command', en: 'Governance', ar: 'الحوكمة' },
];

/** Schedule file types that should also be ingested into a Project + Activities. */
const SCHEDULE_EXT = ['.xer', '.xml', '.mpp', '.mpx'];

const ACCEPT = '.xer,.xml,.xlsx,.xls,.csv,.pdf,.docx,.doc,.txt,.md,.json,.png,.jpg,.jpeg,.webp';
const MAX_BYTES = 24 * 1024 * 1024;

export default function InputPageRoute() {
  return <AuthGate capability="canIngestSchedule" surface="Input"><UniversalInput /></AuthGate>;
}

function UniversalInput() {
  const { lang } = useI18n();
  const isAr = lang === 'ar';
  const toast = useToast();
  const [files, setFiles] = useState<File[]>([]);
  const [text, setText] = useState('');
  const [projectKey, setProjectKey] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [decisions, setDecisions] = useState<Record<string, { decision: Decision; correctedValue?: string }>>({});
  const [committing, setCommitting] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInput = useRef<HTMLInputElement | null>(null);
  // Index of recent input operations (Mr. Ayham, 2026-06-21).
  const [history, setHistory] = useState<Proposal[]>([]);
  const loadHistory = useCallback(async () => {
    try { setHistory(await api<Proposal[]>('/input/proposals')); } catch { /* ignore */ }
  }, []);
  useEffect(() => { void loadHistory(); }, [loadHistory]);

  // Assign-to-hierarchy: pick a target project + place it under a client/portfolio/program/phase
  // — same model as the Projects "Add" form (Mr. Ayham, 2026-06-21).
  const { me } = useMe();
  const canHierarchy = !!me?.user && !!CAPABILITIES[me.user.role]?.canManageHierarchy;
  const [tree, setTree] = useState<GovTree | null>(null);
  const [hsel, setHsel] = useState<HierarchySel>(emptyHierarchySel());
  const [projList, setProjList] = useState<{ businessKey: string; name: string; clientName: string | null }[]>([]);
  useEffect(() => {
    api<{ businessKey: string; name: string; clientName: string | null }[]>('/projects').then(setProjList).catch(() => {});
  }, []);
  useEffect(() => {
    if (canHierarchy) api<GovTree>('/hierarchy/tree').then(setTree).catch(() => setTree({ enterprises: [] }));
  }, [canHierarchy]);

  // Default each item's decision from its completeness so the user starts from a sane state.
  useEffect(() => {
    if (!proposal) return;
    const init: Record<string, { decision: Decision; correctedValue?: string }> = {};
    for (const it of proposal.items) {
      init[it.id] = { decision: it.completeness === 'missing' ? 'missing' : it.completeness === 'uncertain' ? 'limited_confidence' : 'confirm' };
    }
    setDecisions(init);
  }, [proposal]);

  const addFiles = (list: FileList | File[] | null) => {
    if (!list) return;
    const next: File[] = [];
    for (const f of Array.from(list)) {
      if (f.size > MAX_BYTES) { toast.error(isAr ? 'ملف كبير' : 'File too large', `${f.name} > 24MB`); continue; }
      next.push(f);
    }
    setFiles((cur) => [...cur, ...next].slice(0, 12));
  };
  const toB64 = (f: File) => new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] ?? '');
    r.onerror = reject;
    r.readAsDataURL(f);
  });

  const analyze = async () => {
    if (files.length === 0 && !text.trim()) { toast.error(isAr ? 'لا يوجد إدخال' : 'No input', isAr ? 'أضف ملفات أو الصق نصاً' : 'Add files or paste text'); return; }
    setAnalyzing(true); setProposal(null);
    try {
      const payloadFiles = await Promise.all(files.map(async (f) => ({ filename: f.name, contentBase64: await toB64(f) })));

      // Schedule files (XER / P6-XML / MS-Project) also create the Project + Activities
      // via ingestion — so uploading a Primavera file actually adds the project.
      const scheduleFiles = payloadFiles.filter((f) => SCHEDULE_EXT.some((e) => f.filename.toLowerCase().endsWith(e)));
      const before = new Set(projList.map((p) => p.businessKey));
      let createdFromSchedule = 0;
      for (const sf of scheduleFiles) {
        try {
          await api('/ingestion/upload', { method: 'POST', body: JSON.stringify({ filename: sf.filename, contentBase64: sf.contentBase64 }) });
          createdFromSchedule += 1;
        } catch (e) { toast.error(isAr ? 'تعذّر استيراد الجدول كمشروع' : 'Could not import schedule as a project', (e as Error).message); }
      }

      // Detect newly-created project(s) (the upload API returns counts, not keys) so we can
      // both target the AI analysis at them and place them in the hierarchy.
      let targetKey = projectKey.trim();
      let newKeys: string[] = [];
      if (createdFromSchedule > 0) {
        try {
          const after = await api<{ businessKey: string; name: string; clientName: string | null }[]>('/projects');
          setProjList(after);
          newKeys = after.map((p) => p.businessKey).filter((k) => !before.has(k));
        } catch { /* ignore */ }
        toast.success(isAr ? 'تم استيراد الجدول كمشروع' : 'Schedule imported as a project', isAr ? 'المشروع وأنشطته ظهروا في صفحة المشاريع' : 'The project + activities now appear in Projects');
      }
      if (!targetKey && newKeys.length > 0) targetKey = newKeys[0];

      // Assign/place the target (and any newly-created) project under the chosen
      // client → portfolio → program → phase. Idempotent; reuses the Projects-page logic.
      if (canHierarchy && hsel.entSel && tree) {
        try {
          const { key: entKey, name: entName } = await resolveEnterprise(hsel, tree);
          const toPlace = Array.from(new Set([targetKey, ...newKeys].filter(Boolean)));
          for (const k of toPlace) await placeProjectInHierarchy(k, hsel, entKey, entName);
          if (toPlace.length) {
            toast.success(isAr ? 'تم تصنيف المشروع في الهيكل' : 'Project placed in the hierarchy', isAr ? 'العميل/المحفظة/البرنامج/المرحلة' : 'client / portfolio / program / phase');
            try { setTree(await api<GovTree>('/hierarchy/tree')); } catch { /* ignore */ }
          }
        } catch (e) { toast.error(isAr ? 'تعذّر التصنيف في الهيكل' : 'Hierarchy placement failed', (e as Error).message); }
      }

      const p = await api<Proposal>('/input/analyze', {
        method: 'POST',
        body: JSON.stringify({ files: payloadFiles, text: text.trim() || undefined, projectKey: targetKey || undefined }),
      });
      setProposal(p);
      void loadHistory();
      toast.success(isAr ? 'تم التحليل' : 'Analysed', isAr ? `${p.items.length} عنصر — راجِعها قبل الالتزام` : `${p.items.length} items — review before committing`);
    } catch (e) { toast.error(isAr ? 'فشل التحليل' : 'Analysis failed', (e as Error).message); }
    finally { setAnalyzing(false); }
  };

  const setDecision = (id: string, decision: Decision) => setDecisions((d) => ({ ...d, [id]: { ...d[id], decision } }));
  const setCorrected = (id: string, v: string) => setDecisions((d) => ({ ...d, [id]: { decision: 'correct', correctedValue: v } }));

  const commit = async () => {
    if (!proposal) return;
    setCommitting(true);
    try {
      const payload = { decisions: proposal.items.map((it) => ({ id: it.id, decision: decisions[it.id]?.decision ?? 'confirm', correctedValue: decisions[it.id]?.correctedValue ?? null })) };
      const p = await api<Proposal>(`/input/proposals/${proposal.id}/commit`, { method: 'POST', body: JSON.stringify(payload) });
      setProposal(p);
      void loadHistory();
      const r = (p.commitResult ?? {}) as Record<string, number>;
      toast.success(isAr ? 'تم الالتزام' : 'Committed', isAr ? `${r.committed ?? 0} سجل · ${r.assumptions ?? 0} افتراض · ${r.missing ?? 0} ناقص` : `${r.committed ?? 0} records · ${r.assumptions ?? 0} assumptions · ${r.missing ?? 0} missing`);
    } catch (e) { toast.error(isAr ? 'فشل الالتزام' : 'Commit failed', (e as Error).message); }
    finally { setCommitting(false); }
  };

  const reset = () => { setProposal(null); setFiles([]); setText(''); setDecisions({}); };

  const grouped = useMemo(() => {
    const m = new Map<string, InputItem[]>();
    for (const it of proposal?.items ?? []) { (m.get(it.layer) ?? m.set(it.layer, []).get(it.layer)!).push(it); }
    return [...m.entries()];
  }, [proposal]);

  const committed = proposal?.status === 'committed';

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow={isAr ? 'الإدخال العام' : 'General Input'}
        title={isAr ? 'الإدخال الموحّد بالذكاء الاصطناعي' : 'Universal AI Input'}
        description={isAr
          ? 'ارفع أو الصق أي معلومات عن المشروع بأي صيغة. الذكاء الاصطناعي يستخرجها ويوزّعها على طبقات سيجما — وتراجعها وتؤكّدها قبل أن تُسجَّل رسميًا.'
          : 'Upload or paste any project information, in any format. The AI extracts it and maps it to the Sigma layers — you review and confirm before anything is committed.'}
        actions={proposal ? <Button variant="ghost" size="sm" onClick={reset}><IconRefresh className="h-3.5 w-3.5" /> {isAr ? 'إدخال جديد' : 'New input'}</Button> : undefined}
      />

      {/* ===== Step 1 — provide input ===== */}
      {!proposal && (
        <Card title={isAr ? 'قدّم المعلومات' : 'Provide the information'} hint={isAr ? 'Excel · CSV · Word · PDF · Primavera · نص ملصوق · BOQ · تقارير · محاضر — أي شيء.' : 'Excel · CSV · Word · PDF · Primavera · pasted text · BOQ · reports · minutes — anything.'}>
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => { e.preventDefault(); setDragOver(false); addFiles(e.dataTransfer.files); }}
            className={`flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-6 py-8 text-center transition ${dragOver ? 'border-sky-500 bg-sky-500/5' : 'border-slate-700 bg-slate-900/30'}`}
          >
            <div className="grid h-12 w-12 place-items-center rounded-full bg-sky-500/10 text-sky-300 ring-1 ring-sky-500/30"><IconUpload className="h-5 w-5" /></div>
            <p className="text-sm text-slate-200">{isAr ? 'أفلِت الملفات هنا أو تصفّح (عدة ملفات بأي نوع)' : 'Drop files here or browse (multiple files, any type)'}</p>
            <input ref={fileInput} type="file" multiple accept={ACCEPT} className="hidden" onChange={(e) => addFiles(e.target.files)} />
            <Button variant="ghost" size="sm" onClick={() => fileInput.current?.click()}>{isAr ? 'اختر ملفات' : 'Choose files'}</Button>
          </div>

          {files.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {files.map((f, i) => (
                <span key={i} className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-slate-200">
                  {f.name} <span className="text-slate-500">{(f.size / 1024).toFixed(0)}KB</span>
                  <button onClick={() => setFiles((c) => c.filter((_, j) => j !== i))} className="text-slate-500 hover:text-rose-300">✕</button>
                </span>
              ))}
            </div>
          )}

          <div className="mt-5">
            <label className="block text-xs font-medium text-slate-300">{isAr ? 'أو الصق نصاً (بريد، محضر اجتماع، ملاحظات…)' : 'Or paste text (email, meeting minutes, notes…)'}</label>
            <textarea value={text} onChange={(e) => setText(e.target.value)} rows={5} placeholder={isAr ? 'الصق أي معلومات عن المشروع هنا…' : 'Paste any project information here…'}
              className="mt-2 block w-full rounded-xl border border-white/10 bg-slate-900/60 px-4 py-3 text-sm text-slate-100 placeholder:text-slate-500 focus:border-sky-500/70 focus:outline-none" />
          </div>

          {/* ===== Assign this input / project to a target + hierarchy (Mr. Ayham, 2026-06-21) ===== */}
          <div className="mt-5 space-y-3 rounded-xl border border-white/10 bg-white/[0.02] p-3.5">
            <p className="text-xs font-semibold text-slate-200">{isAr ? 'تصنيف الإدخال / المشروع' : 'Assign this input / project'}</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-xs font-medium text-slate-300">{isAr ? 'المشروع المستهدف' : 'Target project'}
                <select value={projList.some((p) => p.businessKey === projectKey) ? projectKey : ''} onChange={(e) => setProjectKey(e.target.value)} dir="auto"
                  className="mt-2 w-full rounded-xl border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-slate-100 focus:border-sky-500/70 focus:outline-none">
                  <option value="">{isAr ? '— مشروع جديد من الملف / غير محدّد —' : '— New from file / unassigned —'}</option>
                  {projList.map((p) => <option key={p.businessKey} value={p.businessKey}>{p.clientName ? `${p.clientName} · ` : ''}{p.name} ({p.businessKey})</option>)}
                </select>
              </label>
              <label className="block text-xs font-medium text-slate-300">{isAr ? 'أو مفتاح يدوي' : 'Or type a key'}
                <input value={projectKey} onChange={(e) => setProjectKey(e.target.value)} placeholder="P-1000" dir="ltr"
                  className="mt-2 w-full rounded-xl border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-slate-100 focus:border-sky-500/70 focus:outline-none" />
              </label>
            </div>
            {canHierarchy && (
              <div className="border-t border-white/10 pt-3">
                <p className="text-[11px] text-slate-500">{isAr ? 'صنّف المشروع تحت عميل / محفظة / برنامج / مرحلة (نفس صفحة المشاريع):' : 'Place the project under a client / portfolio / program / phase (same as Projects):'}</p>
                <div className="mt-2"><HierarchyPicker value={hsel} onChange={setHsel} tree={tree} isAr={isAr} /></div>
              </div>
            )}
            <div className="flex justify-end">
              <Button variant="primary" onClick={analyze} disabled={analyzing}>
                {analyzing ? (isAr ? 'يحلّل بالذكاء الاصطناعي…' : 'Analysing with AI…') : (isAr ? 'حلّل ووزّع بالذكاء الاصطناعي' : 'Analyse & map with AI')}
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* ===== Step 2 — review ===== */}
      {proposal && (
        <>
          <Card title={isAr ? 'ملخّص الذكاء الاصطناعي' : 'AI summary'} hint={proposal.model ? `${proposal.model}` : undefined}>
            {proposal.summary && <p className="text-sm text-slate-300">{proposal.summary}</p>}
            <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
              <Pill tone="sky">{proposal.items.length} {isAr ? 'عنصر' : 'items'}</Pill>
              <Pill tone="violet">{new Set(proposal.items.map((i) => i.layer)).size} {isAr ? 'طبقة' : 'layers'}</Pill>
              <Pill tone={committed ? 'emerald' : 'amber'}>{committed ? (isAr ? 'تم الالتزام' : 'Committed') : (isAr ? 'بانتظار المراجعة' : 'Pending review')}</Pill>
            </div>
            {(proposal.questions?.length ?? 0) > 0 && !committed && (
              <div className="mt-3 rounded-lg border border-amber-400/30 bg-amber-400/[0.06] p-3">
                <p className="text-[11px] font-semibold text-amber-200">{isAr ? 'أسئلة المتابعة:' : 'Follow-up questions:'}</p>
                <ul className="mt-1 list-disc space-y-1 ps-5 text-[12px] text-amber-100/90">{proposal.questions!.map((q, i) => <li key={i}>{q}</li>)}</ul>
              </div>
            )}
          </Card>

          {/* Where the extracted data is distributed across the platform — with links. */}
          <Card title={isAr ? 'توزيع البيانات على موديولات المنصّة' : 'Distribution across platform modules'} hint={isAr ? 'كل طبقة، عدد عناصرها، ورابط صفحتها' : 'Each layer, its item count, and a link to its page'}>
            <div className="flex flex-wrap gap-2">
              {grouped.map(([layer, items]) => {
                const L = LAYER_LABEL[layer] ?? { en: layer, ar: layer, tone: 'slate' as const };
                return (
                  <Link key={layer} href={layerRoute(layer)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1.5 text-[11px] text-slate-200 transition hover:border-sky-400/50 hover:bg-sky-500/10">
                    <Pill tone={L.tone}>{isAr ? L.ar : L.en}</Pill>
                    <span className="font-mono text-slate-400">{items.length}</span>
                    <span className="text-sky-300">→</span>
                  </Link>
                );
              })}
            </div>
            <p className="mt-2 text-[11px] text-slate-500">{isAr ? 'بعد الالتزام تتسجّل العناصر المؤكَّدة في الصفحات دي.' : 'After committing, confirmed items are recorded on these pages.'}</p>
          </Card>

          {/* Per-project surfaces unlocked by adding this project — Contract, Letters, Reports, … */}
          {proposal.projectBusinessKey && (
            <Card title={isAr ? 'صفحات المشروع المتاحة الآن' : 'Project surfaces now available'} hint={isAr ? `المشروع ${proposal.projectBusinessKey} — افتح أي صفحة مرتبطة به` : `Project ${proposal.projectBusinessKey} — open any of its linked pages`}>
              <div className="flex flex-wrap gap-2">
                {PROJECT_SURFACES.map((s) => (
                  <Link key={s.href} href={`${s.href}?projectKey=${encodeURIComponent(proposal.projectBusinessKey!)}`}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1.5 text-[11px] text-slate-200 transition hover:border-sky-400/50 hover:bg-sky-500/10">
                    {isAr ? s.ar : s.en}<span className="text-sky-300">→</span>
                  </Link>
                ))}
              </div>
              <p className="mt-2 text-[11px] text-slate-500">{isAr ? 'العقد والرسائل والتقارير وكل الموديولات أصبحت مرتبطة بهذا المشروع — تُملأ من الإدخال أو يدويًا من صفحاتها.' : 'Contract, letters, reports and every module are now linked to this project — populated from input or directly on their pages.'}</p>
            </Card>
          )}

          {committed ? (
            <Card title={isAr ? 'نتيجة الالتزام' : 'Commit result'}>
              <div className="flex flex-wrap gap-2 text-[12px]">
                {Object.entries((proposal.commitResult ?? {}) as Record<string, unknown>).filter(([k]) => ['committed', 'assumptions', 'missing', 'excluded', 'limitedConfidence'].includes(k)).map(([k, v]) => (
                  <Pill key={k} tone={k === 'committed' ? 'emerald' : k === 'missing' ? 'rose' : 'amber'}>{k}: {String(v)}</Pill>
                ))}
              </div>
              <p className="mt-3 text-[12px] text-slate-400">{isAr ? 'سُجِّلت العناصر المؤكَّدة في سجلات المشروع، وكل القرارات (افتراضات/استبعاد/نواقص) في سجل التدقيق. يمكنك الآن تشغيل الحوكمة من صفحة المراجعة.' : 'Confirmed items are now in the project records, and every decision (assumptions / exclusions / missing) is in the audit log. You can now run governance from the Review page.'}</p>
            </Card>
          ) : (
            <>
              {grouped.map(([layer, items]) => {
                const L = LAYER_LABEL[layer] ?? { en: layer, ar: layer, tone: 'slate' as const };
                return (
                  <div key={layer} className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
                    <div className="mb-3 flex items-center gap-2">
                      <Pill tone={L.tone}>{isAr ? L.ar : L.en}</Pill>
                      <span className="text-[11px] text-slate-500">{items.length}</span>
                    </div>
                    <div className="space-y-3">
                      {items.map((it) => {
                        const dec = decisions[it.id]?.decision ?? 'confirm';
                        return (
                          <div key={it.id} className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
                            <div className="flex flex-wrap items-start justify-between gap-2">
                              <div className="min-w-0 flex-1">
                                <p className="text-[13px] font-medium text-slate-100">{it.label}</p>
                                {dec === 'correct' ? (
                                  <input defaultValue={it.value} onChange={(e) => setCorrected(it.id, e.target.value)} dir="auto"
                                    className="mt-1 block w-full rounded-lg border border-sky-500/40 bg-slate-900/60 px-2.5 py-1.5 text-[12px] text-slate-100 focus:outline-none" />
                                ) : (
                                  <p className="mt-0.5 text-[12px] text-slate-300" dir="auto">{it.value || <span className="text-slate-500">{isAr ? '— (فارغ)' : '— (empty)'}</span>}</p>
                                )}
                              </div>
                              <div className="flex shrink-0 flex-col items-end gap-1">
                                <span className="w-24"><ConfidenceBar value={it.confidence} /></span>
                                <CompletenessBadge c={it.completeness} ar={isAr} />
                              </div>
                            </div>
                            {(it.effectiveDate || (it.dates?.length ?? 0) > 0 || it.chronologyNote || it.chronologyConflict) && (
                              <div className={`mt-1.5 rounded-md px-2 py-1 text-[11px] ${it.chronologyConflict ? 'bg-rose-500/10 text-rose-200 ring-1 ring-rose-400/30' : 'bg-slate-500/10 text-slate-300'}`}>
                                <span className="font-medium">{it.chronologyConflict ? (isAr ? '⚠ تعارض زمني' : '⚠ Chronology conflict') : (isAr ? '🕑 التسلسل الزمني' : '🕑 Chronology')}</span>
                                {it.effectiveDate && <span> · {isAr ? 'تاريخ فعّال:' : 'Effective:'} {it.effectiveDate}</span>}
                                {(it.dates ?? []).map((d, k) => <span key={k}> · {d.type}: {d.value}{d.inferred ? (isAr ? ' (مُستنتَج)' : ' (inferred)') : ''}</span>)}
                                {it.chronologyNote && <span className="block text-[10px] opacity-90">{it.chronologyNote}</span>}
                              </div>
                            )}
                            {it.assumptions.length > 0 && <p className="mt-1.5 text-[11px] text-amber-200/80">{isAr ? 'افتراضات: ' : 'Assumptions: '}{it.assumptions.join(' · ')}</p>}
                            {it.question && <p className="mt-1 text-[11px] text-rose-200/80">❓ {it.question}</p>}
                            {it.evidence && <p className="mt-1 text-[10px] text-slate-500">{isAr ? 'المصدر: ' : 'Source: '}{it.evidence}</p>}
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              {([
                                ['confirm', isAr ? 'تأكيد' : 'Confirm'],
                                ['correct', isAr ? 'تصحيح' : 'Correct'],
                                ['assumption', isAr ? 'افتراض معتمد' : 'Assumption'],
                                ['limited_confidence', isAr ? 'ثقة محدودة' : 'Limited'],
                                ['missing', isAr ? 'ناقص' : 'Missing'],
                                ['exclude', isAr ? 'استبعاد' : 'Exclude'],
                              ] as [Decision, string][]).map(([d, lbl]) => (
                                <button key={d} type="button" onClick={() => setDecision(it.id, d)}
                                  className={`rounded-md px-2 py-1 text-[10px] font-medium transition ${dec === d ? 'bg-sky-500/30 text-sky-100 ring-1 ring-sky-400/50' : 'bg-white/5 text-slate-400 hover:bg-white/10 hover:text-slate-200'}`}>
                                  {lbl}
                                </button>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}

              <div className="sticky bottom-4 flex items-center justify-end gap-3 rounded-xl border border-white/10 bg-slate-900/80 p-3 backdrop-blur">
                <p className="me-auto text-[11px] text-slate-400">{isAr ? 'العناصر المؤكَّدة فقط ستُسجَّل رسميًا. كل القرارات تُوثَّق في سجل التدقيق.' : 'Only confirmed items are committed. Every decision is recorded in the audit log.'}</p>
                <Button variant="primary" onClick={commit} disabled={committing}>
                  {committing ? (isAr ? 'يلتزم…' : 'Committing…') : (isAr ? 'تأكيد والالتزام' : 'Confirm & Commit')}
                </Button>
              </div>
            </>
          )}
        </>
      )}

      {!proposal && !analyzing && files.length === 0 && !text && (
        <EmptyState title={isAr ? 'ابدأ بإضافة معلومات' : 'Start by adding information'} description={isAr ? 'ارفع ملفات أو الصق نصاً ثم اضغط «حلّل».' : 'Upload files or paste text, then press Analyse.'} />
      )}

      {/* ===== Index of input operations ===== */}
      {history.length > 0 && (
        <Card title={isAr ? 'فهرس عمليات الإدخال' : 'Input operations index'} hint={isAr ? 'آخر العمليات — اضغط أي صف لاستعراضه' : 'Recent operations — click a row to review it'}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-[12px]">
              <thead><tr className="border-b border-white/10 text-[10px] uppercase tracking-wider text-slate-500">
                <th className="px-2 py-2 text-start">{isAr ? 'الوقت' : 'When'}</th>
                <th className="px-2 py-2 text-start">{isAr ? 'المشروع' : 'Project'}</th>
                <th className="px-2 py-2 text-center">{isAr ? 'عناصر' : 'Items'}</th>
                <th className="px-2 py-2 text-center">{isAr ? 'الحالة' : 'Status'}</th>
                <th className="px-2 py-2 text-start">{isAr ? 'ملخّص' : 'Summary'}</th>
              </tr></thead>
              <tbody>
                {history.map((h) => (
                  <tr key={h.id} className="cursor-pointer border-b border-white/5 hover:bg-white/[0.03]"
                    onClick={() => { setProposal(h); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>
                    <td className="px-2 py-2 font-mono text-[10px] text-slate-500" dir="ltr">{h.createdAt ? h.createdAt.slice(0, 16).replace('T', ' ') : '—'}</td>
                    <td className="px-2 py-2 font-mono text-[11px] text-sky-300" dir="ltr">{h.projectBusinessKey ?? (isAr ? 'غير مُسند' : 'unassigned')}</td>
                    <td className="px-2 py-2 text-center text-slate-300">{h.items?.length ?? 0}</td>
                    <td className="px-2 py-2 text-center"><Pill tone={h.status === 'committed' ? 'emerald' : h.status === 'discarded' ? 'slate' : 'amber'}>{h.status}</Pill></td>
                    <td className="px-2 py-2"><span className="block max-w-[24rem] truncate text-slate-400">{h.summary ?? '—'}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

function CompletenessBadge({ c, ar }: { c: Completeness; ar: boolean }) {
  const map: Record<Completeness, { tone: 'emerald' | 'amber' | 'rose'; en: string; ar: string }> = {
    complete: { tone: 'emerald', en: 'Complete', ar: 'مكتمل' },
    uncertain: { tone: 'amber', en: 'Uncertain', ar: 'غير مؤكّد' },
    missing: { tone: 'rose', en: 'Missing', ar: 'ناقص' },
  };
  const m = map[c];
  return <Pill tone={m.tone}>{ar ? m.ar : m.en}</Pill>;
}

'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useToast } from '../../components/ToastProvider';
import { api } from '../../lib/api';
import { AuthGate } from '../../components/AuthGate';
import { useI18n } from '../../lib/i18n';
import { IconRefresh, IconUpload } from '../../components/Icons';
import { Button, Card, ConfidenceBar, EmptyState, PageHeader, Pill } from '../../components/ui';

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
      const p = await api<Proposal>('/input/analyze', {
        method: 'POST',
        body: JSON.stringify({ files: payloadFiles, text: text.trim() || undefined, projectKey: projectKey.trim() || undefined }),
      });
      setProposal(p);
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

          <div className="mt-4 flex flex-wrap items-end gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-300">{isAr ? 'مفتاح المشروع (اختياري)' : 'Project key (optional)'}</label>
              <input value={projectKey} onChange={(e) => setProjectKey(e.target.value)} placeholder="P-1000" dir="ltr"
                className="mt-2 w-40 rounded-xl border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-slate-100 focus:border-sky-500/70 focus:outline-none" />
            </div>
            <Button variant="primary" onClick={analyze} disabled={analyzing} className="ms-auto">
              {analyzing ? (isAr ? 'يحلّل بالذكاء الاصطناعي…' : 'Analysing with AI…') : (isAr ? 'حلّل ووزّع بالذكاء الاصطناعي' : 'Analyse & map with AI')}
            </Button>
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

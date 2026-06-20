'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { AuthGate } from '../../components/AuthGate';
import { RecordActions } from '../../components/RecordActions';
import { Button, Card, EmptyState, PageHeader, Pill } from '../../components/ui';
import { IconRefresh, IconUpload } from '../../components/Icons';
import { useToast } from '../../components/ToastProvider';
import { api } from '../../lib/api';
import { CAPABILITIES } from '../../lib/capabilities';
import { useI18n } from '../../lib/i18n';
import { useMe } from '../../lib/me-context';

type Kind = 'standard' | 'dispute' | 'claim' | 'completed_project';
type Mode = 'standard' | 'extended' | 'dispute_intensive' | 'completed_project';
interface Limits { maxFiles: number; maxBytes: number; maxBytesPerFile: number; chunkChars: number; filesPerTick: number; depth: string }
interface Room {
  id: string; title: string; kind: Kind; mode: Mode; status: string; stage: string | null;
  projectBusinessKey: string | null; limits: Limits; limitOverride: boolean;
  counts: Record<string, number> | null; report: Record<string, unknown> | null;
}
interface EvFile { id: string; fileName: string; category: string; status: string; bytes: number; chunkCount: number; docNumber: string | null; party: string | null; docDate: string | null; pageCount: number | null }
interface SourceRef { fileId: string; fileName: string; page: number | null; paragraph: number | null }
interface Item { id: string; type: string; layer: string | null; label: string; value: string | null; explanation: string | null; effectiveDate: string | null; confidence: number; sourceRefs: SourceRef[] | null; status: string }

const KINDS: Kind[] = ['standard', 'dispute', 'claim', 'completed_project'];
const MODES: Mode[] = ['standard', 'extended', 'dispute_intensive', 'completed_project'];
const TYPE_TONE: Record<string, 'slate' | 'sky' | 'emerald' | 'amber' | 'rose' | 'violet'> = {
  fact: 'sky', event: 'violet', conflict: 'rose', gap: 'amber', strength: 'emerald', weakness: 'rose', claim_point: 'sky',
};
const STATUS_TONE: Record<string, 'slate' | 'sky' | 'emerald' | 'amber' | 'rose'> = {
  open: 'slate', indexing: 'amber', extracting: 'amber', chunking: 'amber', analyzing: 'amber', timelining: 'amber', ready: 'emerald', committed: 'emerald', failed: 'rose',
};
const ACCEPT = '.pdf,.docx,.doc,.xlsx,.xls,.csv,.txt,.md,.json,.xml,.png,.jpg,.jpeg,.webp,.gif,.tif,.tiff,.dwg,.dxf,.rvt,.ifc,.nwd,.mp4,.mov,.zip';
const fmtMB = (b: number) => (b >= 1048576 ? `${Math.round(b / 1048576)}MB` : `${Math.round(b / 1024)}KB`);

const fileToB64 = (file: File) => new Promise<string>((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(String(r.result).split(',')[1] ?? '');
  r.onerror = reject;
  r.readAsDataURL(file);
});

export default function DisputeRoomsRoute() {
  return <AuthGate capability="canRead" surface="Dispute Data Room"><Evidence /></AuthGate>;
}

function Evidence() {
  const { lang } = useI18n();
  const isAr = lang === 'ar';
  const toast = useToast();
  const { me } = useMe();
  const canIngest = !!me?.user && CAPABILITIES[me.user.role].canIngestSchedule;
  const canEvaluate = !!me?.user && CAPABILITIES[me.user.role].canEvaluateRules;
  const canEditPolicy = !!me?.user && CAPABILITIES[me.user.role].canEditPolicy;

  const [rooms, setRooms] = useState<Room[]>([]);
  const [open, setOpen] = useState<Room | null>(null);
  const [files, setFiles] = useState<EvFile[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [busy, setBusy] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ title: '', kind: 'dispute' as Kind, mode: 'dispute_intensive' as Mode, projectKey: '' });
  const fileInput = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    try { setRooms(await api<Room[]>('/evidence/rooms')); }
    catch (e) { toast.error(isAr ? 'تعذّر التحميل' : 'Failed to load', (e as Error).message); }
  }, [toast, isAr]);
  useEffect(() => { void refresh(); }, [refresh]);

  const loadRoom = useCallback(async (id: string) => {
    try {
      const [room, fl, it] = await Promise.all([
        api<Room>(`/evidence/rooms/${id}`),
        api<EvFile[]>(`/evidence/rooms/${id}/files-list`),
        api<Item[]>(`/evidence/rooms/${id}/items`),
      ]);
      setOpen(room); setFiles(fl); setItems(it);
    } catch (e) { toast.error(isAr ? 'تعذّر الفتح' : 'Failed to open', (e as Error).message); }
  }, [toast, isAr]);

  // Poll while a room is processing.
  useEffect(() => {
    if (!open || ['ready', 'committed', 'failed', 'open'].includes(open.status)) return;
    const t = setInterval(() => void loadRoom(open.id), 4000);
    return () => clearInterval(t);
  }, [open, loadRoom]);

  const create = async () => {
    if (!form.title.trim()) { toast.error(isAr ? 'العنوان مطلوب' : 'Title required'); return; }
    try {
      const room = await api<Room>('/evidence/rooms', { method: 'POST', body: JSON.stringify({ ...form, projectKey: form.projectKey || null }) });
      toast.success(isAr ? 'تم إنشاء غرفة الأدلّة' : 'Data room created');
      setCreating(false); setForm({ title: '', kind: 'dispute', mode: 'dispute_intensive', projectKey: '' });
      await refresh(); await loadRoom(room.id);
    } catch (e) { toast.error(isAr ? 'فشل الإنشاء' : 'Failed', (e as Error).message); }
  };

  const upload = async (fileList: FileList | null) => {
    if (!open || !fileList || fileList.length === 0) return;
    setBusy(true);
    try {
      const arr = Array.from(fileList);
      let added = 0, dups = 0; const rejected: string[] = [];
      for (let i = 0; i < arr.length; i += 8) {
        const group = await Promise.all(arr.slice(i, i + 8).map(async (f) => ({ filename: f.name, contentBase64: await fileToB64(f) })));
        const r = await api<{ added: number; duplicates: number; rejected: Array<{ filename: string; reason: string }> }>(`/evidence/rooms/${open.id}/files`, { method: 'POST', body: JSON.stringify({ files: group }) });
        added += r.added; dups += r.duplicates; r.rejected.forEach((x) => rejected.push(`${x.filename}: ${x.reason}`));
      }
      toast.success(isAr ? `تمت إضافة ${added} ملف` : `${added} file(s) added`, [dups ? `${dups} dup` : '', rejected.length ? `${rejected.length} rejected` : ''].filter(Boolean).join(' · '));
      if (rejected.length) toast.warning(isAr ? 'ملفات مرفوضة' : 'Rejected', rejected.slice(0, 3).join('\n'));
      await loadRoom(open.id);
    } catch (e) { toast.error(isAr ? 'فشل الرفع' : 'Upload failed', (e as Error).message); }
    finally { setBusy(false); if (fileInput.current) fileInput.current.value = ''; }
  };

  const act = async (path: string, body?: object, okMsg?: string) => {
    if (!open) return;
    setBusy(true);
    try {
      await api(`/evidence/rooms/${open.id}/${path}`, { method: 'POST', body: body ? JSON.stringify(body) : undefined });
      toast.success(okMsg ?? (isAr ? 'تم' : 'Done'));
      await loadRoom(open.id); await refresh();
    } catch (e) { toast.error(isAr ? 'فشل' : 'Failed', (e as Error).message); }
    finally { setBusy(false); }
  };

  const raiseLimit = async () => {
    const v = window.prompt(isAr ? 'الحد الأقصى الجديد لعدد الملفات:' : 'New max file count:', String(open?.limits.maxFiles ?? 1000));
    if (!v || !open) return;
    await act('limits', { maxFiles: Number(v) }, isAr ? 'تم رفع السعة' : 'Capacity raised');
  };

  const grouped = useMemo(() => {
    const g: Record<string, Item[]> = {};
    for (const it of items) (g[it.type] ??= []).push(it);
    return g;
  }, [items]);
  const processing = open && !['open', 'ready', 'committed', 'failed'].includes(open.status);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={isAr ? 'ذاكرة الأدلّة' : 'Evidence Memory'}
        title={isAr ? 'غرف بيانات النزاعات والمطالبات' : 'Dispute Data Rooms'}
        description={isAr ? 'مستودع أدلّة قابل للتوسّع وللاسترجاع والتحقّق: رفع دفعات كبيرة من أي نوع ملفات ← معالجة في الخلفية ← فهرسة وتقطيع مع حفظ المصدر ← استخراج وقائع مرتبطة بمصدرها ← تسلسل زمني وتعارضات ونواقص ← مراجعة بشرية قبل الاعتماد.' : 'A scalable, retrievable, verifiable evidence repository: batch-upload any file type, background processing, index + source-preserving chunking, source-linked facts, timeline, conflicts & gaps, human review before commit.'}
        actions={<>
          <Button variant="ghost" size="sm" onClick={refresh}><IconRefresh className="h-3.5 w-3.5" /> {isAr ? 'تحديث' : 'Refresh'}</Button>
          {canIngest && <Button variant="primary" size="sm" onClick={() => setCreating((v) => !v)}>{isAr ? 'غرفة جديدة' : 'New data room'}</Button>}
        </>}
      />

      {creating && canIngest && (
        <Card title={isAr ? 'إنشاء غرفة بيانات' : 'Create a data room'}>
          <div className="grid gap-3 sm:grid-cols-2">
            <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder={isAr ? 'العنوان (مثال: مطالبة تمديد المدة)' : 'Title (e.g. EOT Claim — Tower A)'} className="rounded-lg border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-slate-100 sm:col-span-2" />
            <label className="text-[12px] text-slate-300">{isAr ? 'النوع' : 'Kind'}
              <select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as Kind, mode: e.target.value === 'standard' ? 'standard' : e.target.value === 'completed_project' ? 'completed_project' : 'dispute_intensive' })} className="mt-1 block w-full rounded-lg border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-slate-100">
                {KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
              </select>
            </label>
            <label className="text-[12px] text-slate-300">{isAr ? 'وضع المعالجة' : 'Processing mode'}
              <select value={form.mode} onChange={(e) => setForm({ ...form, mode: e.target.value as Mode })} className="mt-1 block w-full rounded-lg border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-slate-100">
                {MODES.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </label>
            <input value={form.projectKey} onChange={(e) => setForm({ ...form, projectKey: e.target.value })} placeholder={isAr ? 'مفتاح المشروع (اختياري)' : 'Project key (optional)'} dir="ltr" className="rounded-lg border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-slate-100 sm:col-span-2" />
          </div>
          <div className="mt-3 flex justify-end"><Button variant="primary" size="sm" onClick={create}>{isAr ? 'إنشاء' : 'Create'}</Button></div>
        </Card>
      )}

      {rooms.length === 0 ? (
        <EmptyState title={isAr ? 'لا توجد غرف أدلّة' : 'No data rooms'} description={isAr ? 'أنشئ غرفة لتحليل نزاع أو مطالبة أو مشروع منتهٍ.' : 'Create a room to analyse a dispute, claim or completed project.'} />
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          {rooms.map((r) => (
            <button key={r.id} onClick={() => loadRoom(r.id)} className="rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3 text-start transition hover:border-sky-400/50 hover:bg-sky-500/[0.06]">
              <div className="flex flex-wrap items-center gap-2">
                <Pill tone="violet">{r.kind}</Pill><Pill tone="slate">{r.mode}</Pill>
                <Pill tone={STATUS_TONE[r.status] ?? 'slate'}>{r.status}</Pill>
                {r.limitOverride && <Pill tone="amber">{isAr ? 'سعة موسّعة' : 'expanded'}</Pill>}
              </div>
              <p className="mt-1 text-[14px] font-semibold text-slate-100">{r.title}</p>
              <p className="text-[11px] text-slate-500">{isAr ? 'ملفات' : 'files'}: {r.counts?.files ?? 0} · {isAr ? 'وقائع' : 'items'}: {r.counts?.items ?? 0} · {isAr ? 'تعارضات' : 'conflicts'}: {r.counts?.conflicts ?? 0} · {isAr ? 'نواقص' : 'gaps'}: {r.counts?.gaps ?? 0}</p>
            </button>
          ))}
        </div>
      )}

      {open && (
        <div className="fixed inset-0 z-40 flex justify-end bg-black/50" onClick={() => setOpen(null)}>
          <div className="h-full w-full max-w-2xl overflow-y-auto border-s border-white/10 bg-slate-950 p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <div className="flex flex-wrap items-center gap-2">
                <Pill tone="violet">{open.kind}</Pill><Pill tone="slate">{open.mode}</Pill>
                <Pill tone={STATUS_TONE[open.status] ?? 'slate'}>{processing ? `${open.stage ?? open.status}…` : open.status}</Pill>
              </div>
              <button onClick={() => setOpen(null)} className="text-slate-400 hover:text-slate-100">✕</button>
            </div>
            <h3 className="mt-2 text-lg font-semibold text-slate-100">{open.title}</h3>
            <p className="text-[11px] text-slate-500">
              {isAr ? 'السعة' : 'Capacity'}: {open.limits.maxFiles} {isAr ? 'ملف' : 'files'} · {fmtMB(open.limits.maxBytes)} · {open.limits.depth}
              {canEditPolicy && <button onClick={raiseLimit} className="ms-2 text-sky-400 hover:underline">{isAr ? 'رفع السعة' : 'raise capacity'}</button>}
            </p>

            {canIngest && (
              <div className="mt-3 rounded-lg border border-dashed border-white/15 bg-white/[0.02] p-3">
                <input ref={fileInput} type="file" multiple accept={ACCEPT} className="hidden" onChange={(e) => upload(e.target.files)} />
                <Button variant="primary" size="sm" disabled={busy} onClick={() => fileInput.current?.click()}><IconUpload className="h-3.5 w-3.5" /> {isAr ? 'رفع دفعة ملفات (أي نوع)' : 'Batch-upload files (any type)'}</Button>
                <span className="ms-2 text-[10px] text-slate-500">{isAr ? 'عقود · مراسلات · محاضر · جداول · رسومات · RFIs · NCRs · مطالبات · شهادات دفع · صور · فيديو' : 'contracts · letters · minutes · schedules · drawings · RFIs · NCRs · claims · payment certs · images · video'}</span>
              </div>
            )}

            {open.report && typeof open.report.summary === 'string' && (
              <div className="mt-3 rounded-lg border border-sky-400/30 bg-sky-500/[0.06] p-3 text-[12px] text-slate-200">
                <p className="font-semibold text-sky-200">{isAr ? 'ملخّص القضية (يتطلّب مراجعة)' : 'Case summary (requires review)'}</p>
                <p className="mt-1">{String(open.report.summary)}</p>
              </div>
            )}

            <div className="mt-4">
              <p className="text-[12px] font-semibold text-slate-200">{isAr ? 'فهرس الأدلّة' : 'Evidence index'} ({files.length})</p>
              <div className="mt-1 space-y-1">
                {files.map((f) => (
                  <div key={f.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-white/10 bg-white/[0.02] px-3 py-1.5 text-[11px]">
                    <Pill tone="slate">{f.category}</Pill>
                    <span className="flex-1 truncate text-slate-200" dir="auto">{f.fileName}</span>
                    <span className="text-slate-500">{fmtMB(f.bytes)} · {f.chunkCount} {isAr ? 'مقطع' : 'chunks'}</span>
                    <Pill tone={f.status === 'analyzed' ? 'emerald' : f.status === 'failed' ? 'rose' : 'amber'}>{f.status}</Pill>
                    {f.docDate && <span className="text-slate-500">{f.docDate}</span>}
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-4 space-y-3">
              {['conflict', 'gap', 'event', 'fact', 'claim_point', 'strength', 'weakness'].filter((t) => grouped[t]?.length).map((t) => (
                <div key={t}>
                  <p className="text-[12px] font-semibold text-slate-200"><Pill tone={TYPE_TONE[t] ?? 'slate'}>{t}</Pill> ({grouped[t].length})</p>
                  <div className="mt-1 space-y-1">
                    {grouped[t].slice(0, 50).map((it) => (
                      <div key={it.id} className="rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2 text-[11px]">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold text-slate-100">{it.effectiveDate ? `${it.effectiveDate} · ` : ''}{it.label}</span>
                          <Pill tone={it.status === 'confirmed' ? 'emerald' : it.status === 'excluded' ? 'rose' : 'slate'}>{it.status}</Pill>
                        </div>
                        {it.value && <p className="mt-0.5 text-slate-300">{it.value}</p>}
                        {it.explanation && <p className="mt-0.5 text-slate-400">{it.explanation}</p>}
                        {it.sourceRefs && it.sourceRefs.length > 0 && (
                          <p className="mt-0.5 text-[10px] text-sky-400/80">{isAr ? 'المصدر:' : 'source:'} {it.sourceRefs.map((s) => `${s.fileName}${s.page ? ` p${s.page}` : ''}${s.paragraph ? ` ¶${s.paragraph}` : ''}`).join(' · ')}</p>
                        )}
                        <div className="mt-1 flex items-center gap-1.5">
                          {canEvaluate && it.status === 'proposed' && (<>
                            <Button variant="success" size="sm" onClick={() => act('decide', { decisions: [{ id: it.id, decision: 'confirm' }] })}>{isAr ? 'تأكيد' : 'Confirm'}</Button>
                            <Button variant="ghost" size="sm" onClick={() => act('decide', { decisions: [{ id: it.id, decision: 'exclude' }] })}>{isAr ? 'استبعاد' : 'Exclude'}</Button>
                          </>)}
                          <RecordActions table="evidence_item" id={it.id} record={it as unknown as Record<string, unknown>} fields={['label', 'value', 'status']} onChanged={() => open && loadRoom(open.id)} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-4 flex flex-wrap gap-2 border-t border-white/10 pt-3">
              {canIngest && <Button variant="ghost" size="sm" disabled={busy} onClick={() => act('process', undefined, isAr ? 'تم دفع المعالجة' : 'Processing advanced')}>{isAr ? 'دفع المعالجة' : 'Advance processing'}</Button>}
              {canEvaluate && items.some((i) => i.status === 'proposed') && <Button variant="primary" size="sm" disabled={busy} onClick={() => act('decide', { decisions: items.filter((i) => i.status === 'proposed').map((i) => ({ id: i.id, decision: 'confirm' })) }, isAr ? 'تم تأكيد الكل' : 'All confirmed')}>{isAr ? 'تأكيد الكل' : 'Confirm all'}</Button>}
              {canEvaluate && <Button variant="success" size="sm" disabled={busy} onClick={() => act('commit', undefined, isAr ? 'تم الاعتماد للسجلات' : 'Committed to records')}>{isAr ? 'اعتماد المؤكَّد' : 'Commit confirmed'}</Button>}
            </div>
            <p className="mt-3 text-[10px] text-slate-500">{isAr ? 'كل واقعة مرتبطة بمصدرها (ملف/صفحة/فقرة). المعالجة تتم في الخلفية، والمخرجات تتطلّب مراجعة بشرية قبل الاعتماد. كل حدث في سجل التدقيق.' : 'Every finding links to its source (file/page/paragraph). Processing runs in the background; outputs require human review before commit. Every event is audited.'}</p>
          </div>
        </div>
      )}
    </div>
  );
}

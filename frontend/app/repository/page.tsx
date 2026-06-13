'use client';

/**
 * /repository — the L1 Data Collection document repository (Mr. Ayham's Layer 1
 * record families: RFIs, Submittals, NCRs, Change Requests, Procurement /
 * Resource / Cost logs, Site Photos, plus the expanded Email correspondence and
 * OCR document families). Browse by type, search (LIKE across ref / title /
 * details JSON), register records, classify them (deterministic keyword tagging),
 * and ingest scanned documents via AI Vision OCR.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { AuthGate } from '../../components/AuthGate';
import { IconDatabase, IconRefresh, IconSearch, IconUpload } from '../../components/Icons';
import { useToast } from '../../components/ToastProvider';
import { Button, Card, EmptyState, ErrorBanner, PageHeader, Pill } from '../../components/ui';
import { api } from '../../lib/api';
import { CAPABILITIES } from '../../lib/capabilities';
import { useI18n, type Lang } from '../../lib/i18n';
import { useMe } from '../../lib/me-context';
import { useCurrentProjectKey } from '../../lib/project-context';

interface RecordRow {
  id: string; recordType: string; refNumber: string; title: string;
  status: string | null; party: string | null; raisedDate: string | null;
  dueDate: string | null; amount: string | null;
  details?: { tags?: string[]; ocrSource?: string; extractedText?: string | null } & Record<string, unknown>;
}

const TYPE_LABEL: Record<string, string> = {
  rfi: 'RFI', submittal: 'Submittal', ncr: 'NCR', 'change-request': 'Change Request',
  'procurement-log': 'Procurement', 'resource-log': 'Resource Log', 'cost-report': 'Cost Report',
  'site-photo': 'Site Photo', 'email-correspondence': 'Email', 'ocr-document': 'OCR Doc',
  'bim-model': 'BIM Model', other: 'Other',
};

// Domain-appropriate Arabic labels for the L1 record families. English
// acronyms (RFI / NCR / BIM / OCR) are kept per standards convention.
const TYPE_LABEL_AR: Record<string, string> = {
  rfi: 'RFI', submittal: 'مستند اعتماد', ncr: 'NCR', 'change-request': 'طلب تغيير',
  'procurement-log': 'المشتريات', 'resource-log': 'سجل الموارد', 'cost-report': 'تقرير التكلفة',
  'site-photo': 'صورة موقع', 'email-correspondence': 'مراسلة', 'ocr-document': 'مستند OCR',
  'bim-model': 'نموذج BIM', other: 'أخرى',
};

/** Localized record-family label; falls back to the raw type key. */
function typeLabel(t: string, lang: Lang): string {
  return (lang === 'ar' ? TYPE_LABEL_AR[t] : TYPE_LABEL[t]) ?? TYPE_LABEL[t] ?? t;
}

export default function RepositoryRoute() {
  return (
    <AuthGate surface="Document Repository">
      <RepositoryPage />
    </AuthGate>
  );
}

function RepositoryPage() {
  const toast = useToast();
  const { lang } = useI18n();
  const projectKey = useCurrentProjectKey();
  const { me } = useMe();
  const canIngest = !!(me?.user?.role && CAPABILITIES[me.user.role].canIngest);

  const [rows, setRows] = useState<RecordRow[] | null>(null);
  const [inventory, setInventory] = useState<Record<string, number>>({});
  const [filter, setFilter] = useState<string>('all');
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [busyClassify, setBusyClassify] = useState<string | null>(null);

  // Debounced search across ref / title / details JSON.
  const [query, setQuery] = useState('');
  const [searchRows, setSearchRows] = useState<RecordRow[] | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    if (!projectKey) return;
    try {
      const [r, inv] = await Promise.all([
        api<RecordRow[]>(`/records?projectKey=${encodeURIComponent(projectKey)}`),
        api<Record<string, number>>(`/records/inventory?projectKey=${encodeURIComponent(projectKey)}`),
      ]);
      setRows(r); setInventory(inv); setError(null);
    } catch (e) { setError((e as Error).message); setRows([]); }
  }, [projectKey]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const term = query.trim();
    if (!term || !projectKey) { setSearchRows(null); return; }
    debounceRef.current = setTimeout(async () => {
      try {
        setSearchRows(await api<RecordRow[]>(`/records/search?projectKey=${encodeURIComponent(projectKey)}&q=${encodeURIComponent(term)}`));
      } catch (e) { setError((e as Error).message); }
    }, 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, projectKey]);

  const classify = useCallback(async (id: string) => {
    setBusyClassify(id);
    try {
      await api(`/records/${id}/classify`, { method: 'POST' });
      toast.success(
        lang === 'ar' ? 'أُعيد التصنيف' : 'Re-classified',
        lang === 'ar' ? 'حُدِّثت الوسوم عبر مُصنِّف الكلمات المفتاحية الحتمي.' : 'Tags refreshed from the deterministic keyword classifier.',
      );
      await load();
      if (query.trim() && projectKey) {
        setSearchRows(await api<RecordRow[]>(`/records/search?projectKey=${encodeURIComponent(projectKey)}&q=${encodeURIComponent(query.trim())}`));
      }
    } catch (e) { toast.error(lang === 'ar' ? 'فشل التصنيف' : 'Classify failed', (e as Error).message); }
    finally { setBusyClassify(null); }
  }, [load, toast, query, projectKey, lang]);

  const filtered = useMemo(
    () => (searchRows ? searchRows : filter === 'all' ? rows ?? [] : (rows ?? []).filter((r) => r.recordType === filter)),
    [rows, filter, searchRows],
  );
  const total = rows?.length ?? 0;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={lang === 'ar' ? 'الطبقة 1 · جمع البيانات' : 'Layer 1 · Data Collection'}
        title={lang === 'ar' ? 'مستودع الوثائق' : 'Document Repository'}
        description={lang === 'ar'
          ? 'كل سجل مشروع تم جمعه — طلبات المعلومات (RFI) ومستندات الاعتماد وتقارير عدم المطابقة (NCR) وطلبات التغيير وسجلات المشتريات والموارد والتكلفة وصور الموقع والمراسلات والمستندات الممسوحة ضوئياً (OCR) — إضافة فقط، مؤرشف بالإصدارات، موسوم تلقائياً، وقابل للبحث.'
          : 'Every collected project record — RFIs, Submittals, NCRs, Change Requests, Procurement / Resource / Cost logs, Site Photos, Email correspondence and OCR-scanned documents — append-only, versioned, auto-tagged, and searchable.'}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="ghost" size="sm" onClick={load}><IconRefresh className="h-3.5 w-3.5" /> {lang === 'ar' ? 'تحديث' : 'Refresh'}</Button>
            {canIngest && <Button variant="primary" size="sm" onClick={() => setShowForm((v) => !v)}><IconUpload className="h-3.5 w-3.5" /> {lang === 'ar' ? 'تسجيل سجل' : 'Register record'}</Button>}
          </div>
        }
      />
      <ErrorBanner message={error} />

      {/* LIKE search across ref / title / details JSON. */}
      <Card>
        <div className="relative">
          <span className="pointer-events-none absolute inset-y-0 start-0 flex items-center ps-3 text-slate-500">
            <IconSearch className="h-4 w-4" />
          </span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={lang === 'ar' ? 'ابحث في السجلات — الرقم المرجعي، العنوان، الوسوم، نص المراسلة، نص الـ OCR…' : 'Search records — ref number, title, tags, email body, OCR text…'}
            className="w-full rounded-lg border border-slate-800 bg-slate-950/60 ps-9 pe-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-sky-500 focus:outline-none"
          />
        </div>
        {searchRows && (
          <p className="mt-2 text-[11px] text-slate-500">
            {lang === 'ar'
              ? `${searchRows.length} نتيجة لـ "${query.trim()}". أفرغ الحقل للتصفح حسب النوع.`
              : `${searchRows.length} match(es) for “${query.trim()}”. Clear the box to browse by type.`}
          </p>
        )}
      </Card>

      {canIngest && showForm && (
        <RecordForms
          projectKey={projectKey}
          lang={lang}
          onCancel={() => setShowForm(false)}
          onSaved={async () => { setShowForm(false); await load(); }}
          toast={toast}
        />
      )}

      {!searchRows && (
        <div className="flex flex-wrap items-center gap-1.5">
          <button type="button" onClick={() => setFilter('all')} aria-pressed={filter === 'all'} className={chip(filter === 'all')}>{lang === 'ar' ? 'الكل' : 'All'} <span className="ms-1 font-mono text-[9px] text-slate-400">{total}</span></button>
          {Object.entries(inventory).map(([t, n]) => (
            <button key={t} type="button" onClick={() => setFilter(t)} aria-pressed={filter === t} className={chip(filter === t)}>
              {typeLabel(t, lang)} <span className="ms-1 font-mono text-[9px] text-slate-400">{n}</span>
            </button>
          ))}
        </div>
      )}

      {rows === null ? (
        <Card><div className="h-24 animate-pulse rounded bg-slate-800/40" /></Card>
      ) : (searchRows ? searchRows.length === 0 : filtered.length === 0) ? (
        <EmptyState
          icon={<IconDatabase className="h-8 w-8" />}
          title={lang === 'ar' ? (searchRows ? 'لا توجد سجلات مطابقة' : 'لا توجد سجلات') : (searchRows ? 'No matching records' : 'No records')}
          description={lang === 'ar'
            ? (canIngest ? 'سجّل أول سجل مشروع لتعبئة الطبقة 1.' : 'تظهر السجلات هنا بمجرد جمعها.')
            : (canIngest ? 'Register the first project record to populate L1.' : 'Records appear here once collected.')}
        />
      ) : (
        <Card padded={false}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-800 text-[10px] uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-4 py-2 text-start">{lang === 'ar' ? 'النوع' : 'Type'}</th><th className="px-4 py-2 text-start">{lang === 'ar' ? 'المرجع' : 'Ref'}</th>
                  <th className="px-4 py-2 text-start">{lang === 'ar' ? 'العنوان والوسوم' : 'Title & tags'}</th><th className="px-4 py-2 text-start">{lang === 'ar' ? 'الحالة' : 'Status'}</th>
                  <th className="px-4 py-2 text-start">{lang === 'ar' ? 'الطرف' : 'Party'}</th><th className="px-4 py-2 text-start">{lang === 'ar' ? 'تاريخ الاستحقاق' : 'Due'}</th>
                  {canIngest && <th className="px-4 py-2 text-end">{lang === 'ar' ? 'الإجراءات' : 'Actions'}</th>}
                </tr>
              </thead>
              <tbody>
                {(searchRows ?? filtered).map((r) => (
                  <tr key={r.id} className="border-b border-slate-800/50 last:border-b-0 align-top">
                    <td className="px-4 py-2"><Pill tone="sky">{typeLabel(r.recordType, lang)}</Pill></td>
                    <td className="px-4 py-2 font-mono text-xs text-slate-300" dir="ltr">{r.refNumber}</td>
                    <td className="px-4 py-2 text-slate-100">
                      <div>{r.title}</div>
                      {(r.details?.tags ?? []).length > 0 && (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {(r.details?.tags ?? []).map((t) => (
                            <span key={t} className="inline-flex items-center rounded bg-violet-500/15 px-1.5 py-0.5 text-[10px] text-violet-200 ring-1 ring-violet-500/30">{t}</span>
                          ))}
                        </div>
                      )}
                      {r.recordType === 'ocr-document' && r.details?.ocrSource === 'manual-pending' && (
                        <div className="mt-1 inline-flex items-center rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] text-amber-200 ring-1 ring-amber-500/30">{lang === 'ar' ? 'OCR قيد الانتظار — الذكاء الاصطناعي غير متصل' : 'OCR pending — AI offline'}</div>
                      )}
                    </td>
                    <td className="px-4 py-2 text-slate-300">{r.status ?? '—'}</td>
                    <td className="px-4 py-2 text-slate-300">{r.party ?? '—'}</td>
                    <td className="px-4 py-2 text-slate-400" dir="ltr">{r.dueDate ?? '—'}</td>
                    {canIngest && (
                      <td className="px-4 py-2 text-end">
                        <Button variant="ghost" size="sm" disabled={busyClassify === r.id} onClick={() => void classify(r.id)}>
                          {busyClassify === r.id ? (lang === 'ar' ? 'جارٍ التصنيف…' : 'Classifying…') : (lang === 'ar' ? 'تصنيف' : 'Classify')}
                        </Button>
                      </td>
                    )}
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

function chip(active: boolean): string {
  return `inline-flex items-center rounded-full border px-3 py-1 text-xs transition ${active ? 'border-sky-500/50 bg-sky-500/15 text-sky-200' : 'border-slate-800 bg-slate-900/40 text-slate-300 hover:border-slate-600'}`;
}

type FormMode = 'record' | 'email' | 'ocr';

function RecordForms({
  projectKey, lang, onCancel, onSaved, toast,
}: {
  projectKey: string;
  lang: Lang;
  onCancel: () => void;
  onSaved: () => void | Promise<void>;
  toast: ReturnType<typeof useToast>;
}) {
  const [mode, setMode] = useState<FormMode>('record');
  const modes: [FormMode, string][] = lang === 'ar'
    ? [['record', 'سجل قياسي'], ['email', 'مراسلة'], ['ocr', 'مستند OCR']]
    : [['record', 'Standard record'], ['email', 'Email correspondence'], ['ocr', 'OCR document']];
  return (
    <Card title={lang === 'ar' ? 'تسجيل سجل مشروع' : 'Register a project record'}>
      <div className="mb-3 flex flex-wrap gap-1.5">
        {modes.map(([m, label]) => (
          <button key={m} type="button" onClick={() => setMode(m)} aria-pressed={mode === m} className={chip(mode === m)}>{label}</button>
        ))}
      </div>
      {mode === 'record' && <StandardRecordForm projectKey={projectKey} lang={lang} onCancel={onCancel} onSaved={onSaved} toast={toast} />}
      {mode === 'email' && <EmailForm projectKey={projectKey} lang={lang} onCancel={onCancel} onSaved={onSaved} toast={toast} />}
      {mode === 'ocr' && <OcrForm projectKey={projectKey} lang={lang} onCancel={onCancel} onSaved={onSaved} toast={toast} />}
    </Card>
  );
}

const cls = 'mt-1 w-full rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-sky-500 focus:outline-none';
const lab = 'text-[11px] font-semibold uppercase tracking-wider text-slate-400';

function StandardRecordForm({
  projectKey, lang, onCancel, onSaved, toast,
}: {
  projectKey: string; lang: Lang; onCancel: () => void; onSaved: () => void | Promise<void>; toast: ReturnType<typeof useToast>;
}) {
  const [recordType, setRecordType] = useState('rfi');
  const [refNumber, setRefNumber] = useState('');
  const [title, setTitle] = useState('');
  const [status, setStatus] = useState('open');
  const [party, setParty] = useState('contractor');
  const [dueDate, setDueDate] = useState('');
  const [busy, setBusy] = useState(false);

  const standardTypes = ['rfi', 'submittal', 'ncr', 'change-request', 'procurement-log', 'resource-log', 'cost-report', 'site-photo', 'other'];

  const submit = async () => {
    if (!refNumber.trim() || !title.trim()) return;
    setBusy(true);
    try {
      await api('/records', { method: 'POST', body: JSON.stringify({ projectKey, projectBusinessKey: projectKey, recordType, refNumber: refNumber.trim(), title: title.trim(), status, party, dueDate: dueDate || null }) });
      toast.success(
        lang === 'ar' ? 'تم تسجيل السجل' : 'Record registered',
        lang === 'ar' ? `أُضيف ${refNumber.trim()} إلى الطبقة 1.` : `${refNumber.trim()} added to L1.`,
      );
      await onSaved();
    } catch (e) { toast.error(lang === 'ar' ? 'فشل التسجيل' : 'Register failed', (e as Error).message); }
    finally { setBusy(false); }
  };

  const partyLabel = (p: string): string => (lang === 'ar'
    ? ({ contractor: 'المقاول', consultant: 'الاستشاري', client: 'المالك', subcontractor: 'مقاول الباطن' } as Record<string, string>)[p] ?? p
    : p);

  return (
    <div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div><label className={lab}>{lang === 'ar' ? 'النوع' : 'Type'}</label><select className={cls} value={recordType} onChange={(e) => setRecordType(e.target.value)}>{standardTypes.map((v) => <option key={v} value={v}>{typeLabel(v, lang)}</option>)}</select></div>
        <div><label className={lab}>{lang === 'ar' ? 'الرقم المرجعي' : 'Ref number'}</label><input className={`${cls} font-mono`} dir="ltr" value={refNumber} onChange={(e) => setRefNumber(e.target.value)} placeholder="RFI-014" /></div>
        <div><label className={lab}>{lang === 'ar' ? 'الحالة' : 'Status'}</label><input className={cls} value={status} onChange={(e) => setStatus(e.target.value)} /></div>
        <div className="sm:col-span-2"><label className={lab}>{lang === 'ar' ? 'العنوان' : 'Title'}</label><input className={cls} value={title} onChange={(e) => setTitle(e.target.value)} /></div>
        <div><label className={lab}>{lang === 'ar' ? 'الطرف' : 'Party'}</label><select className={cls} value={party} onChange={(e) => setParty(e.target.value)}>{['contractor', 'consultant', 'client', 'subcontractor'].map((p) => <option key={p} value={p}>{partyLabel(p)}</option>)}</select></div>
        <div><label className={lab}>{lang === 'ar' ? 'تاريخ الاستحقاق' : 'Due date'}</label><input type="date" className={cls} value={dueDate} onChange={(e) => setDueDate(e.target.value)} /></div>
      </div>
      <div className="mt-3 flex justify-end gap-2"><Button variant="ghost" size="sm" onClick={onCancel}>{lang === 'ar' ? 'إلغاء' : 'Cancel'}</Button><Button variant="primary" size="sm" disabled={busy || !refNumber.trim() || !title.trim()} onClick={submit}>{busy ? (lang === 'ar' ? 'جارٍ الحفظ…' : 'Saving…') : (lang === 'ar' ? 'تسجيل' : 'Register')}</Button></div>
    </div>
  );
}

function EmailForm({
  projectKey, lang, onCancel, onSaved, toast,
}: {
  projectKey: string; lang: Lang; onCancel: () => void; onSaved: () => void | Promise<void>; toast: ReturnType<typeof useToast>;
}) {
  const [refNumber, setRefNumber] = useState('');
  const [subject, setSubject] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [sentAt, setSentAt] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!refNumber.trim() || !subject.trim()) return;
    setBusy(true);
    try {
      await api('/records', {
        method: 'POST',
        body: JSON.stringify({
          projectKey, projectBusinessKey: projectKey, recordType: 'email-correspondence',
          refNumber: refNumber.trim(), title: subject.trim(), party: from.trim() || null,
          raisedDate: sentAt || null,
          details: { from: from.trim(), to: to.trim(), subject: subject.trim(), sentAt: sentAt || null, body: body.trim() },
        }),
      });
      toast.success(
        lang === 'ar' ? 'تم حفظ المراسلة' : 'Email captured',
        lang === 'ar' ? `أُضيف ${refNumber.trim()} إلى الطبقة 1 (موسوم تلقائياً).` : `${refNumber.trim()} added to L1 (auto-tagged).`,
      );
      await onSaved();
    } catch (e) { toast.error(lang === 'ar' ? 'فشل الحفظ' : 'Capture failed', (e as Error).message); }
    finally { setBusy(false); }
  };

  return (
    <div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div><label className={lab}>{lang === 'ar' ? 'الرقم المرجعي' : 'Ref number'}</label><input className={`${cls} font-mono`} dir="ltr" value={refNumber} onChange={(e) => setRefNumber(e.target.value)} placeholder="EMAIL-2026-014" /></div>
        <div><label className={lab}>{lang === 'ar' ? 'تاريخ الإرسال' : 'Sent at'}</label><input type="date" className={cls} value={sentAt} onChange={(e) => setSentAt(e.target.value)} /></div>
        <div className="sm:col-span-2"><label className={lab}>{lang === 'ar' ? 'الموضوع' : 'Subject'}</label><input className={cls} value={subject} onChange={(e) => setSubject(e.target.value)} placeholder={lang === 'ar' ? 'إشعار تمديد مدة (EoT) — تأخير متزامن في بلاطة الطابق الثالث' : 'EoT notice — concurrent delay on Level 3 slab'} /></div>
        <div><label className={lab}>{lang === 'ar' ? 'من' : 'From'}</label><input className={cls} value={from} onChange={(e) => setFrom(e.target.value)} placeholder={lang === 'ar' ? 'مدير مشروع المقاول' : 'contractor PM'} /></div>
        <div><label className={lab}>{lang === 'ar' ? 'إلى' : 'To'}</label><input className={cls} value={to} onChange={(e) => setTo(e.target.value)} placeholder={lang === 'ar' ? 'المهندس' : 'engineer'} /></div>
        <div className="sm:col-span-2"><label className={lab}>{lang === 'ar' ? 'النص' : 'Body'}</label><textarea className={cls} rows={4} value={body} onChange={(e) => setBody(e.target.value)} /></div>
      </div>
      <div className="mt-3 flex justify-end gap-2"><Button variant="ghost" size="sm" onClick={onCancel}>{lang === 'ar' ? 'إلغاء' : 'Cancel'}</Button><Button variant="primary" size="sm" disabled={busy || !refNumber.trim() || !subject.trim()} onClick={submit}>{busy ? (lang === 'ar' ? 'جارٍ الحفظ…' : 'Saving…') : (lang === 'ar' ? 'حفظ المراسلة' : 'Capture email')}</Button></div>
    </div>
  );
}

function OcrForm({
  projectKey, lang, onCancel, onSaved, toast,
}: {
  projectKey: string; lang: Lang; onCancel: () => void; onSaved: () => void | Promise<void>; toast: ReturnType<typeof useToast>;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [refNumber, setRefNumber] = useState('');
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<{ text: string | null; source: string } | null>(null);
  const fileInput = useRef<HTMLInputElement | null>(null);

  const setFileSafe = (f: File | null) => {
    if (!f) { setFile(null); return; }
    if (!/^image\//.test(f.type) && f.type !== 'application/pdf') {
      toast.error(
        lang === 'ar' ? 'نوع ملف غير مدعوم' : 'Unsupported file',
        lang === 'ar' ? 'يقبل الـ OCR ملفات الصور (image/*) أو PDF فقط.' : 'OCR accepts image/* or PDF only.',
      );
      return;
    }
    if (f.size > 20 * 1024 * 1024) {
      toast.error(
        lang === 'ar' ? 'الملف كبير جداً' : 'File too large',
        lang === 'ar'
          ? `${(f.size / 1024 / 1024).toFixed(1)} ميجابايت تتجاوز الحد الأقصى 20 ميجابايت.`
          : `${(f.size / 1024 / 1024).toFixed(1)} MB exceeds the 20 MB limit.`,
      );
      return;
    }
    setFile(f);
    if (!refNumber) setRefNumber(f.name);
  };

  const submit = async () => {
    if (!file) return;
    setBusy(true);
    setPreview(null);
    try {
      const buf = await file.arrayBuffer();
      let bin = '';
      const bytes = new Uint8Array(buf);
      for (let i = 0; i < bytes.length; i += 1) bin += String.fromCharCode(bytes[i]);
      const r = await api<RecordRow>('/records/ocr', {
        method: 'POST',
        body: JSON.stringify({
          projectBusinessKey: projectKey, filename: file.name, mimeType: file.type,
          contentBase64: btoa(bin), refNumber: refNumber.trim() || null, title: title.trim() || null,
        }),
      });
      const src = String(r.details?.ocrSource ?? 'manual-pending');
      setPreview({ text: r.details?.extractedText ?? null, source: src });
      if (src === 'ai-vision') toast.success(
        lang === 'ar' ? 'تم استخراج النص' : 'OCR extracted',
        lang === 'ar' ? 'تم التقاط النص حرفياً عبر AI Vision.' : 'Verbatim text captured via AI Vision.',
      );
      else toast.info(
        lang === 'ar' ? 'مؤرشف — OCR قيد الانتظار' : 'Archived — OCR pending',
        lang === 'ar'
          ? 'الذكاء الاصطناعي غير متصل؛ حُفظ المسح الضوئي للتفريغ اليدوي لاحقاً.'
          : 'AI is offline; the scan is stored for manual transcription later.',
      );
      await onSaved();
    } catch (e) { toast.error(lang === 'ar' ? 'فشل الـ OCR' : 'OCR failed', (e as Error).message); }
    finally { setBusy(false); }
  };

  return (
    <div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div><label className={lab}>{lang === 'ar' ? 'الرقم المرجعي (اختياري)' : 'Ref number (optional)'}</label><input className={`${cls} font-mono`} dir="ltr" value={refNumber} onChange={(e) => setRefNumber(e.target.value)} placeholder={lang === 'ar' ? 'يُستخدم اسم الملف افتراضياً' : 'defaults to filename'} /></div>
        <div><label className={lab}>{lang === 'ar' ? 'العنوان (اختياري)' : 'Title (optional)'}</label><input className={cls} value={title} onChange={(e) => setTitle(e.target.value)} /></div>
      </div>
      <div className={`mt-3 flex flex-wrap items-center gap-3 rounded-xl border-2 border-dashed px-5 py-5 border-slate-700 bg-slate-900/30`}>
        <div className="grid h-11 w-11 place-items-center rounded-full bg-emerald-500/10 text-emerald-300 ring-1 ring-emerald-500/30">
          <IconUpload className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          {file ? <p className="text-sm font-medium text-slate-100" dir="ltr">{file.name} <span className="text-xs text-slate-400">({(file.size / 1024 / 1024).toFixed(2)} MB)</span></p>
            : <p className="text-sm text-slate-200">{lang === 'ar' ? 'اختر صورة ممسوحة ضوئياً أو ملف PDF لإجراء الـ OCR.' : 'Choose a scanned image or PDF to OCR.'}</p>}
        </div>
        <input ref={fileInput} type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => setFileSafe(e.target.files?.[0] ?? null)} aria-label={lang === 'ar' ? 'مستند لإجراء الـ OCR' : 'Document to OCR'} />
        <Button variant="ghost" size="sm" onClick={() => fileInput.current?.click()}>{lang === 'ar' ? 'استعراض' : 'Browse'}</Button>
        <Button variant="primary" size="sm" disabled={!file || busy} onClick={submit}>{busy ? (lang === 'ar' ? 'جارٍ الاستخراج…' : 'Extracting…') : (lang === 'ar' ? 'رفع وإجراء OCR' : 'Upload & OCR')}</Button>
      </div>

      {preview && (
        <div className="mt-3 rounded-lg border border-slate-800 bg-slate-950/40 p-3">
          <div className="mb-1 flex items-center gap-2">
            <Pill tone={preview.source === 'ai-vision' ? 'emerald' : 'amber'}>{preview.source === 'ai-vision' ? (lang === 'ar' ? 'OCR عبر AI Vision' : 'AI Vision OCR') : (lang === 'ar' ? 'بانتظار التفريغ اليدوي' : 'manual-pending')}</Pill>
            <span className="text-[11px] text-slate-500">{lang === 'ar' ? 'معاينة النص المُستخرَج' : 'extracted-text preview'}</span>
          </div>
          {preview.text ? (
            <pre className="max-h-48 overflow-auto whitespace-pre-wrap text-[12px] text-slate-200">{preview.text.slice(0, 4000)}</pre>
          ) : (
            <p className="text-sm text-amber-200">{lang === 'ar'
              ? 'الذكاء الاصطناعي غير متصل — المستند مؤرشف (SHA-256) وبانتظار التفريغ اليدوي. أعد الرفع بعد تهيئة المفتاح للاستخراج التلقائي.'
              : 'AI is offline — the document is archived (SHA-256) and awaits manual transcription. Re-upload once a key is configured to auto-extract.'}</p>
          )}
        </div>
      )}

      <div className="mt-3 flex justify-end gap-2"><Button variant="ghost" size="sm" onClick={onCancel}>{lang === 'ar' ? 'إغلاق' : 'Close'}</Button></div>
    </div>
  );
}

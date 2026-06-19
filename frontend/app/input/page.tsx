'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { useToast } from '../../components/ToastProvider';
import { api, IngestionRun } from '../../lib/api';
import { AuthGate } from '../../components/AuthGate';
import { useI18n } from '../../lib/i18n';
import { IconRefresh, IconUpload } from '../../components/Icons';
import { Button, Card, ConfidenceBar, EmptyState, PageHeader, Pill } from '../../components/ui';

interface IngestOutcome {
  runId: string;
  parser: string;
  status: string;
  counts: Record<string, number>;
  confidence: { overall: number } | null;
}

const ACCEPTED_EXT = /\.(xer|xml|xlsx|csv|pdf)$/i;
const MAX_BYTES = 24 * 1024 * 1024;

export default function InputPageRoute() {
  // Gate on the SAME capability the upload route enforces (canIngestSchedule),
  // so the page + Ingest button match the backend. Subcontractors (who have
  // canIngest but not canIngestSchedule) ingest progress via /repository.
  return <AuthGate capability="canIngestSchedule" surface="Input"><InputPage /></AuthGate>;
}

function InputPage() {
  const { t, lang } = useI18n();
  const isAr = lang === 'ar';
  const toast = useToast();
  const [runs, setRuns] = useState<IngestionRun[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [outcome, setOutcome] = useState<IngestOutcome | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInput = useRef<HTMLInputElement | null>(null);

  const refresh = useCallback(async () => {
    try { setRuns(await api<IngestionRun[]>('/ingestion/runs?limit=20')); }
    catch (e) { toast.error(isAr ? 'تعذّر تحميل عمليات الإدخال' : 'Failed to load runs', (e as Error).message); }
  }, [toast, isAr]);

  useEffect(() => { void refresh(); }, [refresh]);

  const setFileSafe = (f: File | null) => {
    if (!f) { setFile(null); return; }
    if (!ACCEPTED_EXT.test(f.name)) {
      toast.error(
        isAr ? 'صيغة غير مدعومة' : 'Unsupported file',
        isAr
          ? 'الصيغ المقبولة: ‎.xer و‎.xml و‎.xlsx و‎.csv و‎.pdf (تصدير Primavera P6 بصيغة PDF)'
          : 'Accepted formats: .xer, .xml, .xlsx, .csv, .pdf (Primavera P6 PDF export)',
      );
      return;
    }
    if (f.size > MAX_BYTES) {
      toast.error(
        isAr ? 'الملف أكبر من الحدّ المسموح' : 'File too large',
        isAr
          ? `${(f.size / 1024 / 1024).toFixed(1)} ميغابايت تتجاوز حدّ الـ 24 ميغابايت. استخدم مسار الإدخال (ingest-path) للملفات الأكبر.`
          : `${(f.size / 1024 / 1024).toFixed(1)} MB exceeds the 24 MB limit. Use ingest-path for larger files.`,
      );
      return;
    }
    setFile(f);
  };

  const upload = async () => {
    if (!file) return;
    setUploading(true); setOutcome(null);
    try {
      const buf = await file.arrayBuffer();
      let bin = '';
      const bytes = new Uint8Array(buf);
      for (let i = 0; i < bytes.length; i += 1) bin += String.fromCharCode(bytes[i]);
      const b64 = btoa(bin);
      const r = await api<IngestOutcome>('/ingestion/upload', {
        method: 'POST',
        body: JSON.stringify({ filename: file.name, contentBase64: b64 }),
      });
      setOutcome(r);
      setFile(null);
      const total = Object.values(r.counts ?? {}).reduce((a, b) => a + (Number(b) || 0), 0);
      if (total === 0) {
        // Upload succeeded but nothing was saved — make the reason explicit
        // instead of a misleading "success" with all-zero counts.
        toast.warning(
          isAr ? 'تم الرفع لكن لم تُحفظ أي صفوف' : 'Uploaded, but no rows were saved',
          isAr
            ? 'تأكّد أن عمود projectKey يطابق مشروعاً موجوداً (ارفع المشروع أولاً)، أو استخدم القالب الرسمي. لم يُعثر على صفوف صالحة.'
            : 'Check that the projectKey column matches an existing project (upload the project first), or use the official template. No valid rows were found.',
        );
      } else {
        toast.success(isAr ? 'تم الإدخال' : 'Ingested', `${r.parser} · ${Object.entries(r.counts).map(([k, v]) => `${k}:${v}`).join(' · ')}`);
      }
      await refresh();
    } catch (e) { toast.error(isAr ? 'فشل الإدخال' : 'Ingestion failed', (e as Error).message); }
    finally { setUploading(false); }
  };

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow={t('input.eyebrow')}
        title={t('input.title')}
        description={t('input.description')}
        actions={<Button variant="ghost" size="sm" onClick={refresh}><IconRefresh className="h-3.5 w-3.5" /> {isAr ? 'تحديث' : 'Refresh'}</Button>}
      />

      {/* Official import templates — upload the project first, then activities. */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-slate-700/60 bg-slate-900/30 px-4 py-2.5 text-xs text-slate-300">
        <span className="font-medium text-slate-200">{isAr ? 'قوالب الإدخال الرسمية:' : 'Official import templates:'}</span>
        <a href="/templates/sigma-projects-template.csv" download className="text-sky-300 underline-offset-2 hover:underline">{isAr ? 'قالب المشاريع (CSV)' : 'Projects (CSV)'}</a>
        <span className="text-slate-600">·</span>
        <a href="/templates/sigma-activities-template.csv" download className="text-sky-300 underline-offset-2 hover:underline">{isAr ? 'قالب الأنشطة (CSV)' : 'Activities (CSV)'}</a>
        <span className="text-slate-500">{isAr ? '— ارفع المشروع أولاً ثم الأنشطة (projectKey يطابق businessKey)' : '— upload the project first, then activities (projectKey matches businessKey)'}</span>
      </div>

      <Card
        title={isAr ? 'رفع ملف' : 'Upload a file'}
        hint={isAr
          ? 'أفلِت الملف هنا أو تصفّح. يُؤرشَف الملف بصورة غير قابلة للتعديل ويُتتبَّع عبر مسار المعالجة بالكامل.'
          : 'Drop here or browse. The file is archived immutably and traced through the entire pipeline.'}
      >
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files?.[0]; if (f) setFileSafe(f); }}
          className={`flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-6 py-10 text-center transition ${
            dragOver ? 'border-sky-500 bg-sky-500/5' : 'border-slate-700 bg-slate-900/30'
          }`}
          role="region"
          aria-label={isAr ? 'منطقة إفلات الملف للرفع' : 'Drop zone for file upload'}
        >
          <div className="grid h-12 w-12 place-items-center rounded-full bg-sky-500/10 text-sky-300 ring-1 ring-sky-500/30">
            <IconUpload className="h-5 w-5" />
          </div>
          {file ? (
            <>
              <p className="text-sm font-medium text-slate-100">{file.name}</p>
              <p className="text-xs text-slate-400">{(file.size / 1024).toFixed(1)} KB</p>
            </>
          ) : (
            <>
              <p className="text-sm text-slate-200" dir={isAr ? 'rtl' : 'ltr'}>
                {isAr
                  ? 'اسحب إلى هنا ملف P6 (‎.xer / ‎.xml / ‎.pdf) · MS Project · Excel · CSV'
                  : 'Drag a P6 (.xer / .xml / .pdf) · MS Project · Excel · CSV file here'}
              </p>
              <p className="text-xs text-slate-400">{isAr ? 'أو انقر بالأسفل للتصفّح' : 'or click below to browse'}</p>
            </>
          )}
          <div className="flex items-center gap-2">
            <input
              ref={fileInput}
              type="file"
              accept=".xer,.xml,.xlsx,.csv,.pdf,application/pdf"
              onChange={(e) => setFileSafe(e.target.files?.[0] ?? null)}
              className="hidden"
              aria-label={isAr ? 'الملف المراد إدخاله' : 'File to ingest'}
            />
            <Button variant="ghost" size="sm" onClick={() => fileInput.current?.click()}>{isAr ? 'تصفّح' : 'Browse'}</Button>
            <Button variant="primary" size="sm" disabled={!file || uploading} onClick={upload}>
              {uploading ? (isAr ? 'جارٍ الإدخال…' : 'Ingesting…') : (isAr ? 'إدخال' : 'Ingest')}
            </Button>
          </div>
        </div>

        {outcome && (() => {
          const total = Object.values(outcome.counts ?? {}).reduce((a, b) => a + (Number(b) || 0), 0);
          const zero = total === 0;
          return (
            <div className={`mt-4 rounded-lg border px-4 py-3 text-sm ${zero ? 'border-amber-400/50 bg-amber-400/10 text-amber-100' : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-100'}`}>
              <div className="flex flex-wrap items-center gap-2">
                <span>{isAr ? 'تم الإدخال عبر' : 'Ingested via'}</span>
                <Pill tone={zero ? 'amber' : 'emerald'}>{outcome.parser}</Pill>
                <Pill tone="slate">{outcome.status}</Pill>
                {outcome.confidence && <Pill tone="emerald">{(outcome.confidence.overall * 100).toFixed(1)}% {isAr ? 'ثقة' : 'confidence'}</Pill>}
              </div>
              <p className={`mt-2 text-xs ${zero ? 'text-amber-100/90' : 'text-emerald-100/80'}`}>
                {isAr ? 'الصفوف:' : 'Rows:'} {Object.entries(outcome.counts).map(([k, v]) => `${k}:${v}`).join(' · ')}
              </p>
              {zero && (
                <p className="mt-2 text-xs text-amber-100/90">
                  {isAr
                    ? '⚠ تم قبول الملف لكن لم تُحفظ أي صفوف. غالباً لأن عمود projectKey لا يطابق مشروعاً موجوداً — ارفع ملف المشروع أولاً ثم الأنشطة، أو استخدم القالب الرسمي.'
                    : '⚠ The file was accepted but no rows were saved — usually because the projectKey column does not match an existing project. Upload the project file first, then the activities, or use the official template.'}
                </p>
              )}
            </div>
          );
        })()}
      </Card>

      <Card
        title={isAr ? 'عمليات الإدخال الأخيرة' : 'Recent runs'}
        hint={isAr
          ? 'سجلّ تدقيق تراكمي لا يقبل التعديل. كل صف مرتبط بالملف المصدر المؤرشَف الخاص به.'
          : 'Append-only audit trail. Each row pins to its archived source file.'}
        padded={false}
      >
        {runs.length === 0 ? (
          <EmptyState
            title={isAr ? 'لا توجد عمليات إدخال بعد' : 'No ingestion runs yet'}
            description={isAr ? 'ارفع ملفاً بالأعلى لبدء مسار المعالجة.' : 'Upload a file above to start the pipeline.'}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="bg-slate-900/40 text-start text-[10px] uppercase tracking-wider text-slate-400">
                <tr><th scope="col" className="px-5 py-2.5 text-start">{isAr ? 'الوقت' : 'When'}</th><th scope="col" className="py-2.5 text-start">{isAr ? 'المُحلِّل' : 'Parser'}</th><th scope="col" className="py-2.5 text-start">{isAr ? 'الحالة' : 'Status'}</th><th scope="col" className="py-2.5 text-start">{isAr ? 'الأعداد' : 'Counts'}</th><th scope="col" className="py-2.5 pr-5 text-start">{isAr ? 'الثقة' : 'Confidence'}</th></tr>
              </thead>
              <tbody>
                {runs.map((r) => {
                  const conf = (r.summary?.confidence as { overall?: number } | undefined)?.overall;
                  return (
                    <tr key={r.id} className="border-t border-slate-800/60 hover:bg-slate-900/30">
                      <td className="px-5 py-2.5 text-slate-300">{new Date(r.createdAt).toLocaleString()}</td>
                      <td className="py-2.5"><Pill tone="sky">{r.parser}</Pill></td>
                      <td className="py-2.5"><Pill tone="emerald">{r.status}</Pill></td>
                      <td className="py-2.5 text-xs text-slate-300">{Object.entries(r.rowCounts ?? {}).map(([k, v]) => `${k}:${v}`).join(' · ')}</td>
                      <td className="py-2.5 pr-5"><ConfidenceBar value={conf ?? null} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

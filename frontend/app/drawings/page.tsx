'use client';

/**
 * `/drawings` — phase-1 drawings ingestion surface (correction-plan §2.7;
 * ADR-0021). Upload a PDF drawing set → the backend archives it immutably
 * (SHA-256) and extracts floor / discipline hints → "Generate baseline
 * from this package" hands the package to the drawing-driven Author Path
 * where the detected floor count genuinely scales the WBS.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

import { api } from '../../lib/api';
import { AuthGate } from '../../components/AuthGate';
import { useToast } from '../../components/ToastProvider';
import { CAPABILITIES } from '../../lib/capabilities';
import { useMe } from '../../lib/me-context';
import { useCurrentProjectKey } from '../../lib/project-context';
import { useI18n } from '../../lib/i18n';
import { Button, Card, EmptyState, ErrorBanner, PageHeader, Pill } from '../../components/ui';
import { IconRefresh, IconSparkles, IconUpload } from '../../components/Icons';

interface DrawingPackageRow {
  id: string;
  createdAt: string;
  projectBusinessKey: string;
  sourceFileId: string;
  filename: string;
  format: string;
  summary: {
    pageCount?: number;
    sheetTitles?: string[];
    floorHints?: string[];
    disciplineHints?: string[];
    extractionNote?: string | null;
  };
  uploadedBy: string | null;
}

interface BimCheck { check: string; pass: boolean }
interface BimStorey { name: string; elevation: number | null }
interface BimModelRow {
  id: string;
  createdAt: string;
  refNumber: string;
  title: string;
  status: string | null;
  details: {
    projectName?: string | null;
    unitsDefined?: boolean;
    storeys?: BimStorey[];
    counts?: Record<string, number>;
    checks?: { validation?: BimCheck[]; governance?: BimCheck[] };
    sha256?: string;
  };
}

/** GET /integrations/autodesk/status — UI-friendly connector status (no secrets). */
interface ApsStatus {
  enabled: boolean;
  credentialSource: 'db' | 'env' | 'none';
  configuredVia: 'settings' | 'env' | null;
  baseUrl: string;
  requiredEnv: string[];
  reachable: boolean | null;
  detail: string | null;
}

/** POST /integrations/autodesk/import → { result, record }. */
interface ApsImportResult {
  urn: string;
  status: 'pending' | 'inprogress' | 'success' | 'failed' | 'timeout';
  objectCount: number;
  counts: Record<string, number>;
  categories: Record<string, number>;
}
interface ApsImportResponse {
  result: ApsImportResult;
  record: { id: string; refNumber: string; projectBusinessKey?: string };
}

const MAX_BYTES = 24 * 1024 * 1024;
const MAX_IFC_BYTES = 50 * 1024 * 1024;
const MAX_APS_BYTES = 50 * 1024 * 1024;

export default function DrawingsRoute() {
  return (
    <AuthGate surface="Drawings">
      <DrawingsPage />
    </AuthGate>
  );
}

function DrawingsPage() {
  const { lang } = useI18n();
  const isAr = lang === 'ar';
  const toast = useToast();
  const router = useRouter();
  const projectKey = useCurrentProjectKey();
  const { me } = useMe();
  const canIngest = !!me?.user && CAPABILITIES[me.user.role].canIngest;
  const canAuthor = !!me?.user && CAPABILITIES[me.user.role].canSimulate;

  const [packages, setPackages] = useState<DrawingPackageRow[] | null>(null);
  const [bimModels, setBimModels] = useState<BimModelRow[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!projectKey) return;
    setLoadError(null);
    try {
      const [pkgs, bims] = await Promise.all([
        api<DrawingPackageRow[]>(`/drawings?projectKey=${encodeURIComponent(projectKey)}`),
        api<BimModelRow[]>(`/bim?projectKey=${encodeURIComponent(projectKey)}`),
      ]);
      setPackages(pkgs);
      setBimModels(bims);
    } catch (e) {
      setPackages([]);
      setBimModels([]);
      setLoadError((e as Error).message);
    }
  }, [projectKey]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  /** Hand the package to the drawing-driven Author Path. */
  const onGenerateBaseline = useCallback(
    async (pkg: DrawingPackageRow) => {
      setBusyId(pkg.id);
      try {
        await api('/baselines/jobs/author', {
          method: 'POST',
          body: JSON.stringify({
            projectKey,
            authoredBy: me?.user?.displayName ?? 'unknown',
            drawingPackageId: pkg.id,
          }),
        });
        toast.success(
          isAr ? 'بدأ التخطيط انطلاقاً من المخططات' : 'Planning started from drawings',
          isAr
            ? `تم رصد ${detectedFloors(pkg)} طابق(طوابق) — تتوسّع هيكلة العمل (WBS) تبعاً لذلك. جارٍ فتح ‎/baselines…`
            : `${detectedFloors(pkg)} floor(s) detected — the WBS scales accordingly. Opening /baselines…`,
        );
        router.push('/baselines');
      } catch (e) {
        toast.error(isAr ? 'فشل التوليد' : 'Generation failed', (e as Error).message);
      } finally {
        setBusyId(null);
      }
    },
    [projectKey, me?.user?.displayName, toast, router, isAr],
  );

  return (
    <div className="space-y-6 animate-[fade-in-up_240ms_ease-out]">
      <PageHeader
        eyebrow={isAr ? 'الهندسة · المخططات · ADR-0021' : 'Engineering · Drawings · ADR-0021'}
        title={isAr ? 'حِزَم المخططات' : 'Drawing Packages'}
        description={isAr
          ? 'ارفع حِزَم المخططات بصيغة PDF. تؤرشف المنصّة كل بايت بصورة غير قابلة للتعديل (SHA-256)، وتستخرج مؤشّرات الطوابق والتخصّصات، ويبني مُخطِّط الذكاء الاصطناعي خط الأساس انطلاقاً من المخططات — فمجموعة G+5 تُنتج جدولاً زمنياً مختلفاً فعلياً عن مجموعة G+1.'
          : 'Upload PDF drawing sets. The platform archives every byte immutably (SHA-256), extracts floor + discipline hints, and the AI planner builds the baseline FROM the drawings — a G+5 set produces a genuinely different schedule than a G+1 set.'}
        actions={
          <Button variant="ghost" size="sm" onClick={() => void refresh()}>
            <IconRefresh className="h-3.5 w-3.5" /> {isAr ? 'تحديث' : 'Refresh'}
          </Button>
        }
      />

      <ErrorBanner message={loadError} />

      <UploadCard projectKey={projectKey} canIngest={canIngest} uploadedBy={me?.user?.displayName ?? null} onUploaded={refresh} />

      {packages === null ? (
        <Card title={isAr ? 'الحِزَم' : 'Packages'}><p className="text-sm text-slate-300">{isAr ? 'جارٍ التحميل…' : 'Loading…'}</p></Card>
      ) : packages.length === 0 ? (
        <EmptyState
          title={isAr ? 'لا توجد حِزَم مخططات بعد' : 'No drawing packages yet'}
          description={isAr
            ? 'ارفع مجموعة مخططات معمارية / إنشائية / كهروميكانيكية (MEP) بصيغة PDF بالأعلى. تقرأ المرحلة الأولى الطبقة النصية؛ وتأتي صيغتا IFC و DWG في مراحل لاحقة.'
            : 'Upload an architectural / structural / MEP PDF set above. Phase 1 reads the text layer; IFC and DWG land in later phases.'}
        />
      ) : (
        <div className="grid grid-cols-1 gap-3">
          {packages.map((pkg) => (
            <PackageCard
              key={pkg.id}
              pkg={pkg}
              canAuthor={canAuthor}
              busy={busyId === pkg.id}
              onGenerate={() => void onGenerateBaseline(pkg)}
            />
          ))}
        </div>
      )}

      <BimSection
        projectKey={projectKey}
        canIngest={canIngest}
        uploadedBy={me?.user?.displayName ?? null}
        models={bimModels}
        onUploaded={refresh}
      />

      <AutodeskApsSection
        projectKey={projectKey}
        canIngest={canIngest}
        uploadedBy={me?.user?.displayName ?? null}
        onImported={refresh}
      />
    </div>
  );
}

function BimSection({
  projectKey,
  canIngest,
  uploadedBy,
  models,
  onUploaded,
}: {
  projectKey: string;
  canIngest: boolean;
  uploadedBy: string | null;
  models: BimModelRow[] | null;
  onUploaded: () => Promise<void> | void;
}) {
  const { lang } = useI18n();
  const isAr = lang === 'ar';
  return (
    <div className="space-y-3 border-t border-slate-800 pt-6">
      <div>
        <h2 className="text-base font-semibold text-slate-100">{isAr ? 'نماذج BIM (IFC)' : 'BIM Models (IFC)'}</h2>
        <p className="mt-0.5 text-sm text-slate-400">
          {isAr ? (
            <>
              ارفع نموذج IFC بصيغة STEP (‎.ifc). يقوم مُحلِّل حتمي بإحصاء الطوابق / الفراغات / العناصر الإنشائية،
              ويُجري فحوصات التحقّق من النموذج وفحوصات الحوكمة عند الرفع — دون نواة هندسية، بل اعتماداً على
              سجلّ العناصر فقط. تُراجَع التعارضات الناتجة عن هذه النماذج في شاشة{' '}
              <a href="/clashes" className="text-sky-300 underline-offset-2 hover:underline">التعارضات</a>.
            </>
          ) : (
            <>
              Upload an IFC STEP model (.ifc). A deterministic parser counts storeys / spaces / structural
              elements and runs model-validation + governance checks at upload — no geometry kernel, just
              the entity ledger. Clashes from these models are reviewed on the{' '}
              <a href="/clashes" className="text-sky-300 underline-offset-2 hover:underline">Clashes</a> surface.
            </>
          )}
        </p>
      </div>

      <BimUploadCard projectKey={projectKey} canIngest={canIngest} uploadedBy={uploadedBy} onUploaded={onUploaded} />

      {models === null ? (
        <Card title={isAr ? 'النماذج' : 'Models'}><p className="text-sm text-slate-300">{isAr ? 'جارٍ التحميل…' : 'Loading…'}</p></Card>
      ) : models.length === 0 ? (
        <EmptyState
          title={isAr ? 'لا توجد نماذج BIM بعد' : 'No BIM models yet'}
          description={isAr
            ? 'ارفع تصدير IFC بصيغة STEP (‎.ifc) بالأعلى. يُحصي المُحلِّل الطوابق والجدران والبلاطات والأعمدة والكمرات والأبواب والنوافذ والفراغات، ثم يتحقّق من صحّة النموذج.'
            : 'Upload an .ifc STEP export above. The parser tallies storeys, walls, slabs, columns, beams, doors, windows and spaces, then validates the model.'}
        />
      ) : (
        <div className="grid grid-cols-1 gap-3">
          {models.map((m) => <BimModelCard key={m.id} model={m} />)}
        </div>
      )}
    </div>
  );
}

/**
 * Autodesk APS section — the live DWG/RVT translation path (R3). Shows whether
 * the connector is configured (ENABLED/DISABLED, never a secret), lets a user
 * translate a DWG/RVT/IFC via the Model Derivative API, and renders the job
 * result (urn, status, object/element counts, categories, errors) with links to
 * the clash + BOQ surfaces once a model lands. When disabled it explains exactly
 * which env vars to set and that IFC keeps working natively today.
 */
function AutodeskApsSection({
  projectKey,
  canIngest,
  uploadedBy,
  onImported,
}: {
  projectKey: string;
  canIngest: boolean;
  uploadedBy: string | null;
  onImported: () => Promise<void> | void;
}) {
  const { lang } = useI18n();
  const isAr = lang === 'ar';
  const toast = useToast();

  const [status, setStatus] = useState<ApsStatus | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ApsImportResult | null>(null);
  const [resultError, setResultError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement | null>(null);

  const loadStatus = useCallback(async () => {
    setStatusError(null);
    try {
      setStatus(await api<ApsStatus>('/integrations/autodesk/status'));
    } catch (e) {
      setStatus(null);
      setStatusError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  const enabled = !!status?.enabled;
  const requiredEnv = status?.requiredEnv ?? ['AUTODESK_CLIENT_ID', 'AUTODESK_CLIENT_SECRET'];

  const setFileSafe = (f: File | null) => {
    if (!f) { setFile(null); return; }
    if (!/\.(dwg|rvt|ifc|zip)$/i.test(f.name)) {
      toast.error(
        isAr ? 'صيغة غير مدعومة' : 'Unsupported file',
        isAr
          ? 'يقبل تحويل APS ملفات DWG / RVT / IFC (أو ‎.zip لمجموعة مرتبطة).'
          : 'APS translation accepts DWG / RVT / IFC (or .zip for a linked set).',
      );
      return;
    }
    if (f.size > MAX_APS_BYTES) {
      toast.error(
        isAr ? 'الملف أكبر من الحدّ المسموح' : 'File too large',
        isAr
          ? `${(f.size / 1024 / 1024).toFixed(1)} ميغابايت تتجاوز حدّ الـ 50 ميغابايت.`
          : `${(f.size / 1024 / 1024).toFixed(1)} MB exceeds the 50 MB limit.`,
      );
      return;
    }
    setFile(f);
  };

  const runImport = async () => {
    if (!file) return;
    setImporting(true);
    setResult(null);
    setResultError(null);
    try {
      const buf = await file.arrayBuffer();
      let bin = '';
      const bytes = new Uint8Array(buf);
      for (let i = 0; i < bytes.length; i += 1) bin += String.fromCharCode(bytes[i]);
      const r = await api<ApsImportResponse>('/integrations/autodesk/import', {
        method: 'POST',
        body: JSON.stringify({ projectKey, filename: file.name, contentBase64: btoa(bin), uploadedBy }),
      });
      setResult(r.result);
      setFile(null);
      if (r.result.status === 'failed' || r.result.status === 'timeout') {
        setResultError(
          isAr
            ? `انتهى التحويل بالحالة "${r.result.status}". راجع رقم الـ URN لدى Autodesk، أو حاول مجدّداً.`
            : `Translation ended with status "${r.result.status}". Inspect the URN at Autodesk or retry.`,
        );
        toast.error(isAr ? 'فشل التحويل' : 'Translation failed', r.result.status);
      } else {
        toast.success(
          isAr ? 'اكتمل تحويل النموذج' : 'Model translation done',
          isAr
            ? `${totalGoverned(r.result.counts)} عنصر محكوم · الحالة ${r.result.status}`
            : `${totalGoverned(r.result.counts)} governed element(s) · status ${r.result.status}`,
        );
      }
      await onImported();
    } catch (e) {
      setResultError((e as Error).message);
      toast.error(isAr ? 'فشل التحويل' : 'Translation failed', (e as Error).message);
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="space-y-3 border-t border-slate-800 pt-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-100">
            {isAr ? 'Autodesk APS · تحويل DWG·RVT' : 'Autodesk APS · DWG/RVT translation'}
          </h2>
          <p className="mt-0.5 max-w-3xl text-sm text-slate-400">
            {isAr ? (
              <>
                استخراج هندسة وكمّيات ملفات <span dir="ltr">DWG</span> و<span dir="ltr">RVT</span> يجري عبر
                واجهة <span dir="ltr">Model Derivative</span> من Autodesk APS (مصادقة ثنائية الطرف). تُترجَم
                النماذج إلى عدادات عناصر تُغذّي مسح الكمّيات وجدول الكمّيات (BOQ) والكلفة. أما ملفات
                <span dir="ltr"> IFC</span> فتعمل محلياً اليوم دون APS.
              </>
            ) : (
              <>
                Extracting geometry and quantities from <span dir="ltr">DWG</span> and <span dir="ltr">RVT</span> runs
                through Autodesk APS&rsquo;s <span dir="ltr">Model Derivative</span> API (2-legged OAuth). Models are
                translated into element counts that feed Quantity Survey, the BOQ and cost. <span dir="ltr">IFC</span>{' '}
                files already work natively today without APS.
              </>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {status === null ? (
            <Pill tone="slate">{isAr ? 'جارٍ فحص الحالة…' : 'Checking…'}</Pill>
          ) : enabled ? (
            <Pill tone="emerald">{isAr ? 'APS مُهيّأ' : 'APS configured'}</Pill>
          ) : (
            <Pill tone="amber">{isAr ? 'APS غير مُهيّأ' : 'APS not configured'}</Pill>
          )}
          <Button variant="ghost" size="sm" onClick={() => void loadStatus()}>
            <IconRefresh className="h-3.5 w-3.5" /> {isAr ? 'تحديث' : 'Refresh'}
          </Button>
        </div>
      </div>

      <ErrorBanner message={statusError} />

      {status && !enabled && (
        <Card title={isAr ? 'إعداد APS مطلوب' : 'APS configuration required'}>
          <div className="space-y-2 text-sm text-slate-300">
            <p>
              {isAr
                ? 'لتفعيل تحويل DWG/RVT من جهة الخادم، اضبط متغيّري البيئة التاليين على الخادم (أو من شاشة /admin/settings المشفّرة). لا تُعرض المفاتيح هنا أبداً:'
                : 'To enable server-side DWG/RVT translation, set the following environment variables on the server (or via the encrypted /admin/settings screen). Keys are never shown here:'}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {requiredEnv.map((v) => (
                <span key={v} className="inline-flex items-center rounded-md bg-slate-800/70 px-2 py-0.5 font-mono text-[11px] text-slate-200 ring-1 ring-slate-700" dir="ltr">{v}</span>
              ))}
            </div>
            <p className="text-[12px] text-slate-400">
              {isAr
                ? 'تُستخدم واجهة Model Derivative بمصادقة ثنائية الطرف (client_credentials)، لذا لا حاجة إلى عنوان رد نداء (callback) ولا إلى نطاقات ثلاثية الطرف. (المتغيّر AUTODESK_BASE_URL اختياري.)'
                : 'This uses the Model Derivative API with 2-legged (client_credentials) auth, so no callback URL and no 3-legged scopes are needed. (AUTODESK_BASE_URL is optional.)'}
            </p>
            <p className="rounded-lg border border-sky-500/30 bg-sky-500/10 px-3 py-1.5 text-[12px] text-sky-100">
              {isAr
                ? 'حتى يُهيّأ APS، تظلّ ملفات IFC (STEP) تعمل محلياً اليوم: تُحصى العناصر وتُجرى فحوصات التحقّق والتعارضات عبر المحرّك الأصلي.'
                : 'Until APS is configured, IFC (STEP) files still work natively today: elements are counted and validation + clash checks run on the built-in engine.'}
            </p>
          </div>
        </Card>
      )}

      <Card
        title={isAr ? 'تحويل نموذج DWG / RVT / IFC عبر APS' : 'Translate a DWG / RVT / IFC via APS'}
        hint={
          enabled
            ? (isAr ? `يُكتب الناتج في نفس مساحة BIM للمشروع ${projectKey}.` : `Output is written to the same BIM surface for project ${projectKey}.`)
            : (isAr ? 'مُعطّل حتى تُضبط بيانات اعتماد APS.' : 'Disabled until APS credentials are set.')
        }
      >
        <div className={`flex flex-wrap items-center gap-3 rounded-xl border-2 border-dashed px-5 py-5 ${(!canIngest || !enabled) ? 'border-slate-800 bg-slate-900/20 opacity-60' : 'border-slate-700 bg-slate-900/30'}`}>
          <div className="grid h-11 w-11 place-items-center rounded-full bg-amber-500/10 text-amber-300 ring-1 ring-amber-500/30">
            <IconUpload className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            {file ? (
              <p className="text-sm font-medium text-slate-100" dir="ltr">{file.name} <span className="text-xs text-slate-400">({(file.size / 1024 / 1024).toFixed(1)} MB)</span></p>
            ) : (
              <p className="text-sm text-slate-200">{isAr ? 'اختر ملف DWG / RVT / IFC لتحويله عبر APS.' : 'Choose a DWG / RVT / IFC file to translate via APS.'}</p>
            )}
          </div>
          <input ref={fileInput} type="file" accept=".dwg,.rvt,.ifc,.zip" className="hidden" disabled={!canIngest || !enabled}
            onChange={(e) => setFileSafe(e.target.files?.[0] ?? null)} aria-label={isAr ? 'نموذج للتحويل عبر APS' : 'Model to translate via APS'} />
          <Button variant="ghost" size="sm" disabled={!canIngest || !enabled} onClick={() => fileInput.current?.click()}>{isAr ? 'تصفّح' : 'Browse'}</Button>
          <Button variant="primary" size="sm" disabled={!canIngest || !enabled || !file || importing} onClick={runImport}>
            {importing ? (isAr ? 'جارٍ التحويل…' : 'Translating…') : (isAr ? 'تحويل عبر APS' : 'Translate via APS')}
          </Button>
        </div>
        {importing && (
          <p className="mt-3 text-[12px] text-slate-400">
            {isAr
              ? 'يجري الرفع إلى Autodesk وبدء مهمّة Model Derivative والاستطلاع حتى الاكتمال — قد يستغرق ذلك من ثوانٍ إلى دقائق بحسب حجم النموذج.'
              : 'Uploading to Autodesk, starting the Model Derivative job and polling until done — this can take seconds to minutes depending on model size.'}
          </p>
        )}
      </Card>

      {resultError && <ErrorBanner message={resultError} />}

      {result && (
        <ApsResultCard result={result} />
      )}
    </div>
  );
}

/** Render one APS translation job result: urn, status, counts, categories + links. */
function ApsResultCard({ result }: { result: ApsImportResult }) {
  const { lang } = useI18n();
  const isAr = lang === 'ar';
  const failed = result.status === 'failed' || result.status === 'timeout';
  const counts = result.counts ?? {};
  const categories = Object.entries(result.categories ?? {}).sort((a, b) => b[1] - a[1]).slice(0, 12);
  const countLabels: [string, string][] = isAr
    ? [
        ['storeys', 'الطوابق'], ['spaces', 'الفراغات'], ['walls', 'الجدران'], ['slabs', 'البلاطات'],
        ['columns', 'الأعمدة'], ['beams', 'الكمرات'], ['doors', 'الأبواب'], ['windows', 'النوافذ'],
      ]
    : [
        ['storeys', 'Storeys'], ['spaces', 'Spaces'], ['walls', 'Walls'], ['slabs', 'Slabs'],
        ['columns', 'Columns'], ['beams', 'Beams'], ['doors', 'Doors'], ['windows', 'Windows'],
      ];

  return (
    <Card padded={false}>
      <div className="space-y-3 px-5 py-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold text-slate-100">{isAr ? 'نتيجة مهمّة التحويل' : 'Translation job result'}</span>
          <Pill tone={failed ? 'rose' : result.status === 'success' ? 'emerald' : 'amber'}>{result.status}</Pill>
          <Pill tone="slate">{isAr ? `${result.objectCount} كائن` : `${result.objectCount} object(s)`}</Pill>
          <Pill tone="sky">{isAr ? `${totalGoverned(counts)} عنصر محكوم` : `${totalGoverned(counts)} governed`}</Pill>
        </div>

        <div className="text-[11px] text-slate-400">
          <span className="font-semibold text-slate-300">{isAr ? 'معرّف المهمّة (URN):' : 'Job id (URN):'}</span>{' '}
          <span className="break-all font-mono text-slate-300" dir="ltr">{result.urn}</span>
        </div>

        {!failed && (
          <div className="flex flex-wrap gap-1.5">
            {countLabels.map(([k, l]) => (
              <span key={k} className="inline-flex items-center gap-1 rounded-md bg-slate-800/70 px-2 py-0.5 text-[11px] text-slate-200 ring-1 ring-slate-700">
                {l} <span className="font-mono text-slate-400">{counts[k] ?? 0}</span>
              </span>
            ))}
          </div>
        )}

        {!failed && categories.length > 0 && (
          <div>
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">{isAr ? 'الفئات' : 'Categories'}</p>
            <div className="flex flex-wrap gap-1.5">
              {categories.map(([name, n]) => (
                <span key={name} className="inline-flex items-center gap-1 rounded-md bg-slate-800/50 px-2 py-0.5 text-[11px] text-slate-300 ring-1 ring-slate-800" dir="ltr">
                  {name} <span className="font-mono text-slate-500">{n}</span>
                </span>
              ))}
            </div>
          </div>
        )}

        {failed && (
          <p className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-1.5 text-[12px] text-rose-100">
            {isAr
              ? 'لم ينتج التحويل عناصر قابلة للاستخدام. تحقّق من سلامة الملف (DWG/RVT صالح) ومن صحّة بيانات اعتماد APS، ثم أعد المحاولة.'
              : 'The translation produced no usable elements. Check the file is a valid DWG/RVT and the APS credentials are correct, then retry.'}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-3 pt-1">
          <a href="/clashes" className="text-[13px] text-sky-300 underline-offset-2 hover:underline">
            {isAr ? 'عرض التعارضات' : 'View clashes'}
          </a>
          <span className="text-slate-700">·</span>
          <a href="/quantity-survey" className="text-[13px] text-sky-300 underline-offset-2 hover:underline">
            {isAr ? 'عرض جدول الكمّيات (BOQ)' : 'View BOQ'}
          </a>
        </div>
      </div>
    </Card>
  );
}

/** Sum the eight governed BimCounts families (matches the backend totalElements). */
function totalGoverned(counts: Record<string, number>): number {
  return ['walls', 'slabs', 'columns', 'beams', 'doors', 'windows', 'spaces'].reduce(
    (sum, k) => sum + (counts[k] ?? 0),
    0,
  );
}

function BimUploadCard({
  projectKey,
  canIngest,
  uploadedBy,
  onUploaded,
}: {
  projectKey: string;
  canIngest: boolean;
  uploadedBy: string | null;
  onUploaded: () => Promise<void> | void;
}) {
  const { lang } = useI18n();
  const isAr = lang === 'ar';
  const toast = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef<HTMLInputElement | null>(null);

  const setFileSafe = (f: File | null) => {
    if (!f) { setFile(null); return; }
    if (!/\.ifc$/i.test(f.name)) {
      toast.error(
        isAr ? 'صيغة غير مدعومة' : 'Unsupported file',
        isAr ? 'يقبل إدخال BIM ملفات IFC النصية بصيغة STEP (‎.ifc) فقط.' : 'BIM intake accepts .ifc STEP text files only.',
      );
      return;
    }
    if (f.size > MAX_IFC_BYTES) {
      toast.error(
        isAr ? 'الملف أكبر من الحدّ المسموح' : 'File too large',
        isAr
          ? `${(f.size / 1024 / 1024).toFixed(1)} ميغابايت تتجاوز حدّ الـ 50 ميغابايت لملفات IFC.`
          : `${(f.size / 1024 / 1024).toFixed(1)} MB exceeds the 50 MB IFC limit.`,
      );
      return;
    }
    setFile(f);
  };

  const upload = async () => {
    if (!file) return;
    setUploading(true);
    try {
      const buf = await file.arrayBuffer();
      let bin = '';
      const bytes = new Uint8Array(buf);
      for (let i = 0; i < bytes.length; i += 1) bin += String.fromCharCode(bytes[i]);
      const r = await api<BimModelRow>('/bim/upload', {
        method: 'POST',
        body: JSON.stringify({ projectKey, filename: file.name, contentBase64: btoa(bin), uploadedBy }),
      });
      setFile(null);
      const counts = r.details.counts ?? {};
      toast.success(
        isAr ? 'تم إدخال نموذج IFC' : 'IFC model ingested',
        isAr
          ? `${counts.storeys ?? 0} طابق · تمّت قراءة ${(r.details.storeys ?? []).length} صفّ منسوب`
          : `${counts.storeys ?? 0} storey(s) · ${(r.details.storeys ?? []).length} level row(s) parsed`,
      );
      await onUploaded();
    } catch (e) {
      toast.error(isAr ? 'فشل الإدخال' : 'Ingestion failed', (e as Error).message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <Card
      title={isAr ? 'رفع نموذج IFC' : 'Upload an IFC model'}
      hint={isAr ? `مؤرشَف بصورة غير قابلة للتعديل للمشروع ${projectKey}.` : `Archived immutably for project ${projectKey}.`}
    >
      <div className={`flex flex-wrap items-center gap-3 rounded-xl border-2 border-dashed px-5 py-5 ${!canIngest ? 'border-slate-800 bg-slate-900/20 opacity-60' : 'border-slate-700 bg-slate-900/30'}`}>
        <div className="grid h-11 w-11 place-items-center rounded-full bg-violet-500/10 text-violet-300 ring-1 ring-violet-500/30">
          <IconUpload className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          {file ? (
            <p className="text-sm font-medium text-slate-100" dir="ltr">{file.name} <span className="text-xs text-slate-400">({(file.size / 1024 / 1024).toFixed(1)} MB)</span></p>
          ) : (
            <p className="text-sm text-slate-200">{isAr ? 'اختر تصدير IFC بصيغة STEP (‎.ifc) للتحقّق منه.' : 'Choose an .ifc STEP export to validate.'}</p>
          )}
        </div>
        <input ref={fileInput} type="file" accept=".ifc" className="hidden" disabled={!canIngest}
          onChange={(e) => setFileSafe(e.target.files?.[0] ?? null)} aria-label={isAr ? 'نموذج IFC المراد إدخاله' : 'IFC model to ingest'} />
        <Button variant="ghost" size="sm" disabled={!canIngest} onClick={() => fileInput.current?.click()}>{isAr ? 'تصفّح' : 'Browse'}</Button>
        <Button variant="primary" size="sm" disabled={!canIngest || !file || uploading} onClick={upload}>
          {uploading ? (isAr ? 'جارٍ التحليل…' : 'Parsing…') : (isAr ? 'إدخال IFC' : 'Ingest IFC')}
        </Button>
      </div>
    </Card>
  );
}

function BimModelCard({ model }: { model: BimModelRow }) {
  const { lang } = useI18n();
  const isAr = lang === 'ar';
  const counts = model.details.counts ?? {};
  const storeys = model.details.storeys ?? [];
  const validation = model.details.checks?.validation ?? [];
  const governance = model.details.checks?.governance ?? [];
  const countLabels: [string, string][] = isAr
    ? [
        ['storeys', 'الطوابق'], ['spaces', 'الفراغات'], ['walls', 'الجدران'], ['slabs', 'البلاطات'],
        ['columns', 'الأعمدة'], ['beams', 'الكمرات'], ['doors', 'الأبواب'], ['windows', 'النوافذ'],
      ]
    : [
        ['storeys', 'Storeys'], ['spaces', 'Spaces'], ['walls', 'Walls'], ['slabs', 'Slabs'],
        ['columns', 'Columns'], ['beams', 'Beams'], ['doors', 'Doors'], ['windows', 'Windows'],
      ];

  const statusLabel = (s: string | null) => {
    if (!isAr) return s ?? 'unknown';
    if (s === 'valid') return 'صالح';
    if (s === 'invalid') return 'غير صالح';
    return s ?? 'غير معروف';
  };

  return (
    <Card padded={false}>
      <div className="space-y-3 px-5 py-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-sm font-semibold text-slate-50" dir="ltr">{model.refNumber}</span>
          <Pill tone={model.status === 'valid' ? 'emerald' : 'amber'}>{statusLabel(model.status)}</Pill>
          {model.details.unitsDefined
            ? <Pill tone="sky">{isAr ? 'الوحدات مُعرّفة' : 'units defined'}</Pill>
            : <Pill tone="rose">{isAr ? 'بدون وحدات' : 'no units'}</Pill>}
          {model.details.projectName && <span className="text-sm text-slate-300">{model.details.projectName}</span>}
        </div>

        <div className="flex flex-wrap gap-1.5">
          {countLabels.map(([k, l]) => (
            <span key={k} className="inline-flex items-center gap-1 rounded-md bg-slate-800/70 px-2 py-0.5 text-[11px] text-slate-200 ring-1 ring-slate-700">
              {l} <span className="font-mono text-slate-400">{counts[k] ?? 0}</span>
            </span>
          ))}
        </div>

        {storeys.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-800 text-[10px] uppercase tracking-wider text-slate-500">
                <tr><th className="px-3 py-1.5 text-start">{isAr ? 'الطابق' : 'Storey'}</th><th className="px-3 py-1.5 text-end">{isAr ? 'المنسوب' : 'Elevation'}</th></tr>
              </thead>
              <tbody>
                {storeys.map((s, i) => (
                  <tr key={`${s.name}-${i}`} className="border-b border-slate-800/50 last:border-b-0">
                    <td className="px-3 py-1.5 text-slate-100">{s.name}</td>
                    <td className="px-3 py-1.5 text-end font-mono text-slate-300" dir="ltr">{s.elevation ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <CheckList title={isAr ? 'التحقّق من النموذج' : 'Model validation'} checks={validation} />
          <CheckList title={isAr ? 'فحوصات الحوكمة' : 'Governance checks'} checks={governance} />
        </div>

        <p className="text-[11px] text-slate-500" dir={isAr ? 'rtl' : 'ltr'}>
          {isAr ? 'رُفِع في' : 'Uploaded'} <span dir="ltr">{new Date(model.createdAt).toLocaleString()}</span> · {isAr ? 'مؤرشَف بـ SHA' : 'SHA-archived'}
          {model.details.sha256 ? ` (${model.details.sha256.slice(0, 12)}…)` : ''}
        </p>
      </div>
    </Card>
  );
}

function CheckList({ title, checks }: { title: string; checks: BimCheck[] }) {
  const { lang } = useI18n();
  const isAr = lang === 'ar';
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/30 p-3">
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">{title}</p>
      <ul className="space-y-1">
        {checks.map((c) => (
          <li key={c.check} className="flex items-center justify-between gap-2 text-[13px]">
            <span className="text-slate-200">{c.check}</span>
            <Pill tone={c.pass ? 'emerald' : 'rose'}>{c.pass ? (isAr ? 'مطابق' : 'pass') : (isAr ? 'غير مطابق' : 'fail')}</Pill>
          </li>
        ))}
      </ul>
    </div>
  );
}

function UploadCard({
  projectKey,
  canIngest,
  uploadedBy,
  onUploaded,
}: {
  projectKey: string;
  canIngest: boolean;
  uploadedBy: string | null;
  onUploaded: () => Promise<void> | void;
}) {
  const { lang } = useI18n();
  const isAr = lang === 'ar';
  const toast = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInput = useRef<HTMLInputElement | null>(null);

  const setFileSafe = (f: File | null) => {
    if (!f) { setFile(null); return; }
    if (!/\.pdf$/i.test(f.name)) {
      toast.error(
        isAr ? 'صيغة غير مدعومة' : 'Unsupported file',
        isAr ? 'تقبل المرحلة الأولى حِزَم المخططات بصيغة PDF فقط (وتأتي IFC / DWG لاحقاً).' : 'Phase 1 accepts PDF drawing sets only (IFC / DWG follow).',
      );
      return;
    }
    if (f.size > MAX_BYTES) {
      toast.error(
        isAr ? 'الملف أكبر من الحدّ المسموح' : 'File too large',
        isAr
          ? `${(f.size / 1024 / 1024).toFixed(1)} ميغابايت تتجاوز حدّ الـ 24 ميغابايت.`
          : `${(f.size / 1024 / 1024).toFixed(1)} MB exceeds the 24 MB limit.`,
      );
      return;
    }
    setFile(f);
  };

  const upload = async () => {
    if (!file) return;
    setUploading(true);
    try {
      const buf = await file.arrayBuffer();
      let bin = '';
      const bytes = new Uint8Array(buf);
      for (let i = 0; i < bytes.length; i += 1) bin += String.fromCharCode(bytes[i]);
      const r = await api<DrawingPackageRow>('/drawings/upload', {
        method: 'POST',
        body: JSON.stringify({ projectKey, filename: file.name, contentBase64: btoa(bin), uploadedBy }),
      });
      setFile(null);
      toast.success(
        isAr ? 'تم إدخال مجموعة المخططات' : 'Drawing set ingested',
        isAr
          ? `${r.summary.pageCount ?? 0} صفحة · ${detectedFloors(r)} مؤشّر طابق · ${(r.summary.disciplineHints ?? []).length} تخصّص`
          : `${r.summary.pageCount ?? 0} page(s) · ${detectedFloors(r)} floor hint(s) · ${(r.summary.disciplineHints ?? []).length} discipline(s)`,
      );
      await onUploaded();
    } catch (e) {
      toast.error(isAr ? 'فشل الإدخال' : 'Ingestion failed', (e as Error).message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <Card
      title={isAr ? 'رفع مجموعة مخططات بصيغة PDF' : 'Upload a PDF drawing set'}
      hint={isAr ? `مؤرشَفة بصورة غير قابلة للتعديل للمشروع ${projectKey}.` : `Archived immutably for project ${projectKey}.`}
    >
      <div
        onDragOver={(e) => { if (canIngest) { e.preventDefault(); setDragOver(true); } }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          if (!canIngest) return;
          e.preventDefault();
          setDragOver(false);
          const f = e.dataTransfer.files?.[0];
          if (f) setFileSafe(f);
        }}
        className={`flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-6 py-9 text-center transition ${
          !canIngest ? 'border-slate-800 bg-slate-900/20 opacity-60'
            : dragOver ? 'border-sky-500 bg-sky-500/5'
            : 'border-slate-700 bg-slate-900/30'
        }`}
      >
        <div className="grid h-12 w-12 place-items-center rounded-full bg-sky-500/10 text-sky-300 ring-1 ring-sky-500/30">
          <IconUpload className="h-5 w-5" />
        </div>
        {file ? (
          <p className="text-sm font-medium text-slate-100" dir="ltr">{file.name} <span className="text-xs text-slate-400">({(file.size / 1024 / 1024).toFixed(1)} MB)</span></p>
        ) : (
          <p className="text-sm text-slate-200">{isAr ? 'اسحب مجموعة مخططات معمارية / إنشائية / كهروميكانيكية (MEP) بصيغة PDF إلى هنا' : 'Drag an architectural / structural / MEP PDF set here'}</p>
        )}
        <div className="flex items-center gap-2">
          <input ref={fileInput} type="file" accept=".pdf,application/pdf" className="hidden" disabled={!canIngest}
            onChange={(e) => setFileSafe(e.target.files?.[0] ?? null)} aria-label={isAr ? 'مجموعة المخططات المراد إدخالها' : 'Drawing set to ingest'} />
          <Button variant="ghost" size="sm" disabled={!canIngest} onClick={() => fileInput.current?.click()}>{isAr ? 'تصفّح' : 'Browse'}</Button>
          <Button variant="primary" size="sm" disabled={!canIngest || !file || uploading} onClick={upload}>
            {uploading ? (isAr ? 'جارٍ الإدخال…' : 'Ingesting…') : (isAr ? 'إدخال' : 'Ingest')}
          </Button>
        </div>
      </div>
    </Card>
  );
}

function PackageCard({
  pkg,
  canAuthor,
  busy,
  onGenerate,
}: {
  pkg: DrawingPackageRow;
  canAuthor: boolean;
  busy: boolean;
  onGenerate: () => void;
}) {
  const { lang } = useI18n();
  const isAr = lang === 'ar';
  const floors = pkg.summary.floorHints ?? [];
  const disciplines = pkg.summary.disciplineHints ?? [];
  const scanned = !!pkg.summary.extractionNote;

  return (
    <Card padded={false}>
      <div className="flex flex-wrap items-start justify-between gap-3 px-5 py-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-sm font-semibold text-slate-50" dir="ltr">{pkg.filename}</span>
            <Pill tone="sky">{pkg.format.toUpperCase()}</Pill>
            <Pill tone="slate">{pkg.summary.pageCount ?? 0} {isAr ? 'صفحة' : 'pages'}</Pill>
            <Pill tone={floors.length > 0 ? 'emerald' : 'amber'}>
              {floors.length > 0
                ? (isAr ? `تم رصد ${detectedFloors(pkg)} طابق` : `${detectedFloors(pkg)} floor(s) detected`)
                : (isAr ? 'لا توجد مؤشّرات طوابق' : 'no floor hints')}
            </Pill>
            {disciplines.map((d) => <Pill key={d} tone="violet">{d}</Pill>)}
          </div>
          {scanned && (
            <p className="mt-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-[11px] text-amber-100">
              {pkg.summary.extractionNote}
            </p>
          )}
          {floors.length > 0 && (
            <p className="mt-2 text-[11px] text-slate-400" dir={isAr ? 'rtl' : 'ltr'}>
              {isAr ? 'المؤشّرات:' : 'Hints:'} <span dir="ltr">{floors.slice(0, 8).join(' · ')}{floors.length > 8 ? ` (+${floors.length - 8})` : ''}</span>
            </p>
          )}
          <p className="mt-1 text-[11px] text-slate-500" dir={isAr ? 'rtl' : 'ltr'}>
            {isAr ? 'رُفِع في' : 'Uploaded'} <span dir="ltr">{new Date(pkg.createdAt).toLocaleString()}</span>{pkg.uploadedBy ? (isAr ? ` بواسطة ${pkg.uploadedBy}` : ` by ${pkg.uploadedBy}`) : ''} · {isAr ? 'مؤرشَف بـ SHA' : 'SHA-archived'}
          </p>
        </div>
        <Button variant="primary" size="sm" disabled={!canAuthor || busy} onClick={onGenerate}>
          <IconSparkles className="h-3.5 w-3.5" />
          {busy ? (isAr ? 'جارٍ التخطيط…' : 'Planning…') : (isAr ? 'توليد خط الأساس من هذه الحزمة' : 'Generate baseline from this package')}
        </Button>
      </div>
    </Card>
  );
}

/** Mirror of the backend deriveFloorCount — display-only estimate. */
function detectedFloors(pkg: DrawingPackageRow): number {
  const hints = pkg.summary.floorHints ?? [];
  if (hints.length === 0) return 2;
  for (const h of hints) {
    const g = /^G\+(\d+)$/i.exec(h.trim());
    if (g) return Math.min(40, parseInt(g[1], 10) + 1);
  }
  const NAMED = ['GROUND FLOOR', 'FIRST FLOOR', 'SECOND FLOOR', 'THIRD FLOOR'];
  const named = new Set(hints.filter((h) => NAMED.includes(h.toUpperCase())));
  const levels = new Set(hints.map((h) => /LEVEL\s*(\d+)/i.exec(h)?.[1]).filter(Boolean));
  const count = Math.max(named.size, levels.size);
  return count > 0 ? Math.min(40, count) : 2;
}

'use client';

/**
 * `/site-evidence` — the smart-glasses / site-evidence capture surface
 * (Mr. Ayham acceptance 2026-06-28, requirement R6). Delivers the full visible
 * demo workflow he wrote out:
 *
 *   Capture → Evidence (archived) → Report → Governance Alert → Human Approval
 *
 * Three jobs on one page (same shape as /clashes):
 *
 *  1. **Capture** a photo / video / audio / transcript from site, with the rich
 *     metadata the channel records — project key, captured-at, location label +
 *     grid, lat/long (best-effort `navigator.geolocation`), worker name/id,
 *     device type (incl. `smart_glasses`), and an optional safety/quality
 *     finding with a note/transcript. We re-use the same base64 envelope the
 *     /input and /clashes pages use (`POST /site-evidence/capture`) so the
 *     `lib/api` helper + its rate limits keep working — and the capture form
 *     gates itself on `canIngest` (mirrors the backend `@RequiresCapability`).
 *
 *  2. **Timeline** of the day's captures for the chosen project + date
 *     (`GET /site-evidence?projectKey=&date=`): one card per capture with a
 *     media icon, time, location, worker, a finding badge (safety/quality) and
 *     the short sha256, plus whether it raised a linked Safety / Quality record.
 *
 *  3. **Workflow strip** at the top visualising the five steps, highlighting how
 *     far the *selected* capture has reached. A safety capture with a linked
 *     SafetyRecord has reached "Governance Alert" and is awaiting "Human
 *     Approval" (the backend raises a SITE_SAFETY_OBSERVATION alert that the
 *     governance dashboard's human-approval block / journey decision leg pick
 *     up — nothing is auto-approved).
 *
 * AuthGate contract: any authenticated user can view (outer gate, no
 * capability). The capture form disables itself when the role lacks
 * `canIngest`, so the user never sees a 403 surprise from an enabled button.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { AuthGate } from '../../components/AuthGate';
import { useToast } from '../../components/ToastProvider';
import { CAPABILITIES } from '../../lib/capabilities';
import { useI18n, type Lang } from '../../lib/i18n';
import { useMe } from '../../lib/me-context';
import { useCurrentProjectKey } from '../../lib/project-context';
import { api } from '../../lib/api';
import {
  IconActivity,
  IconApproval,
  IconBell,
  IconClock,
  IconEvidence,
  IconRefresh,
  IconShield,
  IconUpload,
} from '../../components/Icons';
import {
  Button,
  Card,
  EmptyState,
  ErrorBanner,
  PageHeader,
  Pill,
  SeverityBadge,
} from '../../components/ui';

// ─────────────────────────── types ───────────────────────────

type MediaKind = 'photo' | 'video' | 'audio' | 'transcript';
type DeviceType = 'smart_glasses' | 'phone' | 'tablet';
type FindingType = 'safety' | 'quality';

/** Mirrors the persisted `SiteEvidence` row (the fields the surface needs). */
interface SiteEvidenceRow {
  id: string;
  createdAt: string;
  projectBusinessKey: string;
  mediaKind: MediaKind | string;
  filename: string;
  mimeType: string;
  bytes: number;
  sha256: string;
  storedPath: string;
  capturedAt: string | null;
  reportDate: string | null;
  latitude: string | null;
  longitude: string | null;
  locationLabel: string | null;
  activityKey: string | null;
  workerName: string | null;
  workerId: string | null;
  deviceId: string | null;
  deviceType: DeviceType | string | null;
  transcriptText: string | null;
  findingType: FindingType | null;
  linkedSafetyRecordId: string | null;
  linkedQualityRecordId: string | null;
  capturedBy: string | null;
}

const MEDIA_KINDS: MediaKind[] = ['photo', 'video', 'audio', 'transcript'];
const DEVICE_TYPES: DeviceType[] = ['smart_glasses', 'phone', 'tablet'];
const MAX_BYTES = 24 * 1024 * 1024;

// ─────────────────────────── route ───────────────────────────

export default function SiteEvidenceRoute() {
  // Viewing is open to any authenticated user; the capture form gates itself
  // on `canIngest` (mirrors the backend contract on POST /site-evidence/capture).
  return (
    <AuthGate surface="Site Evidence">
      <SiteEvidencePage />
    </AuthGate>
  );
}

// ─────────────────────────── page ───────────────────────────

function SiteEvidencePage() {
  const { lang } = useI18n();
  const ar = lang === 'ar';
  const toast = useToast();
  const projectKey = useCurrentProjectKey();
  const { me } = useMe();
  const canIngest = me?.user ? CAPABILITIES[me.user.role].canIngest : false;

  const [date, setDate] = useState<string>(todayISO());
  const [rows, setRows] = useState<SiteEvidenceRow[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!projectKey) { setRows([]); return; }
    setLoadError(null);
    try {
      const q = `/site-evidence?projectKey=${encodeURIComponent(projectKey)}${date ? `&date=${encodeURIComponent(date)}` : ''}`;
      const list = await api<SiteEvidenceRow[]>(q);
      setRows(list);
    } catch (e) {
      setRows([]);
      const msg = (e as Error).message;
      setLoadError(msg);
      toast.error(ar ? 'تعذّر تحميل أدلّة الموقع' : 'Failed to load site evidence', msg);
    }
  }, [projectKey, date, toast, ar]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void refresh(); }, [refresh]);

  const list = useMemo<SiteEvidenceRow[]>(() => rows ?? [], [rows]);
  const selected = useMemo<SiteEvidenceRow | null>(
    () => list.find((r) => r.id === selectedId) ?? list[0] ?? null,
    [list, selectedId],
  );

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow={`Site Evidence · ext.smart_glasses · ${projectKey || (ar ? 'لا يوجد مشروع' : 'no project')}`}
        title={ar ? 'أدلّة الموقع — النظارة الذكية' : 'Site Evidence — Smart Glasses'}
        description={
          ar
            ? 'التقاط من الموقع (صورة / فيديو / صوت / تفريغ) مع المفتاح، الموقع/الشبكة، الوقت، العامل، وملاحظة السلامة. المسار الكامل: التقاط ← دليل مؤرشف ← تقرير ← تنبيه حوكمة ← اعتماد بشري.'
            : 'Capture from site (photo / video / audio / transcript) with the project key, location/grid, time, worker and a safety note. Full chain: Capture → Evidence → Report → Governance Alert → Human Approval.'
        }
        actions={
          <Button variant="ghost" size="sm" onClick={refresh}>
            <IconRefresh className="h-3.5 w-3.5" /> {ar ? 'تحديث' : 'Refresh'}
          </Button>
        }
      />

      <WorkflowStrip selected={selected} lang={lang} />

      <ErrorBanner message={loadError} />

      {!projectKey ? (
        <EmptyState
          title={ar ? 'لا يوجد مشروع محدّد' : 'No project selected'}
          description={ar ? 'اختر مشروعاً من المبدّل أعلى التطبيق لالتقاط أدلّة الموقع وعرضها.' : 'Pick a project from the switcher at the top of the app to capture and view site evidence.'}
        />
      ) : (
        <>
          <CaptureCard projectKey={projectKey} canIngest={canIngest} date={date} onCaptured={refresh} lang={lang} />

          <div className="flex flex-wrap items-end justify-between gap-3">
            <label className="text-xs text-slate-400">
              {ar ? 'يوم التقرير' : 'Report day'}
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="mt-1 block rounded-lg border border-slate-700 bg-slate-900/70 px-3 py-2 text-sm text-slate-100"
                dir="ltr"
              />
            </label>
            <p className="text-xs text-slate-400">
              {ar
                ? `${list.length} التقاط${list.length === 1 ? '' : 'ات'} في ${date || (ar ? 'كل الأيام' : 'all days')}`
                : `${list.length} capture${list.length === 1 ? '' : 's'} on ${date || 'all days'}`}
            </p>
          </div>

          {rows === null ? (
            <Card title={ar ? 'الجدول الزمني للالتقاط' : 'Capture timeline'}>
              <p className="text-sm text-slate-400">{ar ? 'جارٍ التحميل…' : 'Loading…'}</p>
            </Card>
          ) : list.length === 0 ? (
            <EmptyState
              title={ar ? 'لا توجد التقاطات في هذا اليوم' : 'No captures on this day'}
              description={ar ? 'التقط صورة / فيديو / صوت / تفريغ من الموقع أعلاه — أو غيّر يوم التقرير.' : 'Capture a photo / video / audio / transcript from site above — or change the report day.'}
            />
          ) : (
            <div className="grid grid-cols-1 gap-4">
              {list.map((r) => (
                <EvidenceCard
                  key={r.id}
                  row={r}
                  active={selected?.id === r.id}
                  onSelect={() => setSelectedId(r.id)}
                  lang={lang}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─────────────────────────── workflow strip ───────────────────────────

type Step = { key: string; label: string; labelAr: string; icon: React.ReactNode };

const STEPS: Step[] = [
  { key: 'capture',   label: 'Capture',          labelAr: 'التقاط',        icon: <IconUpload className="h-4 w-4" /> },
  { key: 'evidence',  label: 'Evidence',         labelAr: 'دليل مؤرشف',     icon: <IconEvidence className="h-4 w-4" /> },
  { key: 'report',    label: 'Report',           labelAr: 'تقرير',          icon: <IconClock className="h-4 w-4" /> },
  { key: 'alert',     label: 'Governance Alert', labelAr: 'تنبيه حوكمة',     icon: <IconBell className="h-4 w-4" /> },
  { key: 'approval',  label: 'Human Approval',   labelAr: 'اعتماد بشري',     icon: <IconApproval className="h-4 w-4" /> },
];

/**
 * Visualises the five workflow steps and how far the selected capture reached:
 *   capture  — always (the row exists)
 *   evidence — always (the media is archived immutably, SHA-256)
 *   report   — reached once `reportDate` is set (rolls into the daily report)
 *   alert    — reached when the capture raised a finding (safety/quality)
 *   approval — AWAITING for a safety finding (it raises a governance alert that
 *              needs an explicit human decision; nothing is auto-approved).
 */
function WorkflowStrip({ selected, lang }: { selected: SiteEvidenceRow | null; lang: Lang }) {
  const ar = lang === 'ar';
  const reached = deriveReached(selected);
  const awaitingApproval = !!selected && selected.findingType === 'safety' && !!selected.linkedSafetyRecordId;

  return (
    <Card padded={false} className="overflow-hidden">
      <div className="flex flex-wrap items-stretch gap-2 p-4">
        {STEPS.map((s, i) => {
          const isReached = reached.has(s.key);
          const isAwaiting = s.key === 'approval' && awaitingApproval;
          const tone = isAwaiting
            ? 'border-amber-500/60 bg-amber-500/10 text-amber-100'
            : isReached
              ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-100'
              : 'border-slate-800 bg-slate-900/40 text-slate-400';
          return (
            <div key={s.key} className="flex items-center gap-2">
              <div className={`flex min-w-[8.5rem] flex-col gap-1 rounded-lg border px-3 py-2 transition ${tone}`}>
                <div className="flex items-center gap-1.5">
                  {s.icon}
                  <span className="text-xs font-semibold">{ar ? s.labelAr : s.label}</span>
                </div>
                <span className="text-[10px] uppercase tracking-wider opacity-80">
                  {isAwaiting
                    ? (ar ? 'بانتظار الاعتماد' : 'awaiting')
                    : isReached
                      ? (ar ? 'تمّ' : 'reached')
                      : (ar ? '—' : '—')}
                </span>
              </div>
              {i < STEPS.length - 1 && (
                <span className="text-slate-600" dir="ltr">{ar ? '←' : '→'}</span>
              )}
            </div>
          );
        })}
      </div>
      {selected && (
        <div className="border-t border-slate-800/70 px-4 py-2 text-[11px] text-slate-400">
          {ar ? 'الالتقاط المحدّد:' : 'Selected capture:'}{' '}
          <span className="font-mono text-slate-300" dir="ltr">{selected.filename}</span>
          {selected.findingType === 'safety' && selected.linkedSafetyRecordId && (
            <span className="ms-2 text-amber-300">
              {ar
                ? '— أثار تنبيه سلامة حوكمي بانتظار اعتماد بشري في لوحة الحوكمة.'
                : '— raised a governance safety alert awaiting human approval on the governance dashboard.'}
            </span>
          )}
        </div>
      )}
    </Card>
  );
}

function deriveReached(row: SiteEvidenceRow | null): Set<string> {
  const r = new Set<string>();
  if (!row) return r;
  r.add('capture');                       // the row exists
  if (row.sha256) r.add('evidence');      // archived immutably
  if (row.reportDate) r.add('report');    // rolls into the daily report
  if (row.findingType) r.add('alert');    // raised a safety/quality finding
  return r;
}

// ─────────────────────────── capture card ───────────────────────────

interface CaptureForm {
  mediaKind: MediaKind;
  capturedAt: string;
  locationLabel: string;
  grid: string;
  latitude: string;
  longitude: string;
  workerName: string;
  workerId: string;
  deviceType: DeviceType;
  deviceId: string;
  findingType: '' | FindingType;
  findingTitle: string;
  findingSeverity: string;
  transcriptText: string;
}

const EMPTY_FORM: CaptureForm = {
  mediaKind: 'photo',
  capturedAt: nowLocalInput(),
  locationLabel: '',
  grid: '',
  latitude: '',
  longitude: '',
  workerName: '',
  workerId: '',
  deviceType: 'smart_glasses',
  deviceId: '',
  findingType: '',
  findingTitle: '',
  findingSeverity: 'medium',
  transcriptText: '',
};

function CaptureCard({
  projectKey,
  canIngest,
  date,
  onCaptured,
  lang,
}: {
  projectKey: string;
  canIngest: boolean;
  date: string;
  onCaptured: () => Promise<void> | void;
  lang: Lang;
}) {
  const ar = lang === 'ar';
  const toast = useToast();
  const [form, setForm] = useState<CaptureForm>(EMPTY_FORM);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [locating, setLocating] = useState(false);
  const fileInput = useRef<HTMLInputElement | null>(null);

  const set = <K extends keyof CaptureForm>(k: K, v: CaptureForm[K]) => setForm((f) => ({ ...f, [k]: v }));

  const setFileSafe = (f: File | null) => {
    if (!f) { setFile(null); return; }
    if (f.size > MAX_BYTES) {
      toast.error(
        ar ? 'الملف كبير جداً' : 'File too large',
        ar ? `${(f.size / 1024 / 1024).toFixed(1)} ميغابايت تتجاوز الحد 24 ميغابايت.` : `${(f.size / 1024 / 1024).toFixed(1)} MB exceeds the 24 MB limit.`,
      );
      return;
    }
    setFile(f);
  };

  const useMyLocation = () => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      toast.error(ar ? 'الموقع غير متاح' : 'Geolocation unavailable', ar ? 'المتصفّح لا يدعم تحديد الموقع.' : 'This browser does not expose geolocation.');
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        set('latitude', pos.coords.latitude.toFixed(7));
        set('longitude', pos.coords.longitude.toFixed(7));
        setLocating(false);
        toast.success(ar ? 'تم تحديد الموقع' : 'Location captured');
      },
      (err) => {
        setLocating(false);
        toast.error(ar ? 'تعذّر تحديد الموقع' : 'Could not get location', err.message);
      },
      { enableHighAccuracy: true, timeout: 8000 },
    );
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canIngest || busy) return;
    if (!file) {
      toast.error(ar ? 'لا يوجد ملف' : 'No file', ar ? 'اختر ملف وسائط لالتقاطه.' : 'Pick a media file to capture.');
      return;
    }
    setBusy(true);
    try {
      const buf = await file.arrayBuffer();
      // Same base64 pump /clashes + /input use — keeps the upload envelope
      // identical so the API helper rate-limits both paths uniformly.
      let bin = '';
      const bytes = new Uint8Array(buf);
      for (let i = 0; i < bytes.length; i += 1) bin += String.fromCharCode(bytes[i]);
      const contentBase64 = btoa(bin);

      const locationLabel = [form.locationLabel.trim(), form.grid.trim()].filter(Boolean).join(' · ') || null;

      await api<SiteEvidenceRow>('/site-evidence/capture', {
        method: 'POST',
        body: JSON.stringify({
          projectBusinessKey: projectKey,
          mediaKind: form.mediaKind,
          filename: file.name,
          mimeType: file.type || 'application/octet-stream',
          contentBase64,
          capturedAt: form.capturedAt ? new Date(form.capturedAt).toISOString() : null,
          latitude: form.latitude || null,
          longitude: form.longitude || null,
          locationLabel,
          workerName: form.workerName.trim() || null,
          workerId: form.workerId.trim() || null,
          deviceType: form.deviceType,
          deviceId: form.deviceId.trim() || null,
          transcriptText: form.transcriptText.trim() || null,
          findingType: form.findingType || null,
          findingTitle: form.findingType ? (form.findingTitle.trim() || null) : null,
          findingSeverity: form.findingType ? form.findingSeverity : null,
        }),
      });

      toast.success(
        ar ? 'تم التقاط الدليل' : 'Evidence captured',
        form.findingType === 'safety'
          ? (ar ? 'أُثير تنبيه سلامة حوكمي بانتظار اعتماد بشري.' : 'A governance safety alert was raised — awaiting human approval.')
          : form.findingType === 'quality'
            ? (ar ? 'تم رفع سجلّ جودة (عدم مطابقة).' : 'A quality (NCR) record was raised.')
            : (ar ? 'أُرشف الملف بشكل غير قابل للتغيير (SHA-256).' : 'Archived immutably (SHA-256).'),
      );
      setForm({ ...EMPTY_FORM, capturedAt: nowLocalInput(), deviceType: form.deviceType });
      setFile(null);
      if (fileInput.current) fileInput.current.value = '';
      await onCaptured();
    } catch (err) {
      toast.error(ar ? 'تعذّر الالتقاط' : 'Capture failed', (err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const field = 'mt-1 block w-full rounded-lg border border-slate-700 bg-slate-900/70 px-3 py-2 text-sm text-slate-100';

  return (
    <Card
      title={ar ? 'التقاط دليل من الموقع' : 'Capture site evidence'}
      hint={ar ? `يُحفظ في المشروع ${projectKey} ويُؤرشف غير قابل للتغيير (SHA-256). يوم التقرير: ${date}.` : `Saved to project ${projectKey}, archived immutably (SHA-256). Report day: ${date}.`}
    >
      {!canIngest && (
        <div className="mb-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
          {ar
            ? 'يتيح دورك عرض أدلّة الموقع دون التقاطها. يلزم توفّر صلاحية `canIngest` (مسؤول Sigma / مقاول / مقاول من الباطن).'
            : 'Your role can view site evidence but not capture. `canIngest` is required (Sigma admin / contractor / subcontractor).'}
        </div>
      )}
      <form onSubmit={submit} className="space-y-4">
        {/* media + file */}
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <label className="text-xs text-slate-400">
            {ar ? 'نوع الوسائط' : 'Media kind'}
            <select className={field} value={form.mediaKind} disabled={!canIngest} onChange={(e) => set('mediaKind', e.target.value as MediaKind)}>
              {MEDIA_KINDS.map((m) => <option key={m} value={m}>{ar ? mediaKindAr(m) : m}</option>)}
            </select>
          </label>
          <label className="text-xs text-slate-400 md:col-span-2">
            {ar ? 'ملف الوسائط' : 'Media file'}
            <input
              ref={fileInput}
              type="file"
              disabled={!canIngest}
              onChange={(e) => setFileSafe(e.target.files?.[0] ?? null)}
              className={`${field} file:mr-3 file:rounded file:border-0 file:bg-slate-700 file:px-2 file:py-1 file:text-xs file:text-slate-100`}
            />
            {file && <span className="mt-1 block text-[11px] text-slate-400" dir="ltr">{file.name} · {(file.size / 1024).toFixed(1)} KB</span>}
          </label>
        </div>

        {/* when + where */}
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <label className="text-xs text-slate-400">
            {ar ? 'وقت الالتقاط' : 'Captured at'}
            <input type="datetime-local" className={field} value={form.capturedAt} disabled={!canIngest} onChange={(e) => set('capturedAt', e.target.value)} dir="ltr" />
          </label>
          <label className="text-xs text-slate-400">
            {ar ? 'الموقع (وصف)' : 'Location label'}
            <input className={field} value={form.locationLabel} disabled={!canIngest} placeholder={ar ? 'الطابق 3' : 'Level 3'} onChange={(e) => set('locationLabel', e.target.value)} />
          </label>
          <label className="text-xs text-slate-400">
            {ar ? 'الشبكة (Grid)' : 'Grid'}
            <input className={field} value={form.grid} disabled={!canIngest} placeholder="C-4" onChange={(e) => set('grid', e.target.value)} dir="ltr" />
          </label>
        </div>

        {/* geo */}
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <label className="text-xs text-slate-400">
            {ar ? 'خط العرض' : 'Latitude'}
            <input className={field} value={form.latitude} disabled={!canIngest} placeholder="25.2048" onChange={(e) => set('latitude', e.target.value)} dir="ltr" />
          </label>
          <label className="text-xs text-slate-400">
            {ar ? 'خط الطول' : 'Longitude'}
            <input className={field} value={form.longitude} disabled={!canIngest} placeholder="55.2708" onChange={(e) => set('longitude', e.target.value)} dir="ltr" />
          </label>
          <div className="flex items-end">
            <Button variant="ghost" size="sm" disabled={!canIngest || locating} onClick={useMyLocation}>
              <IconActivity className="h-3.5 w-3.5" />
              {locating ? (ar ? 'جارٍ تحديد الموقع…' : 'Locating…') : ar ? 'استخدم موقعي' : 'Use my location'}
            </Button>
          </div>
        </div>

        {/* who + device */}
        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <label className="text-xs text-slate-400">
            {ar ? 'اسم العامل' : 'Worker name'}
            <input className={field} value={form.workerName} disabled={!canIngest} placeholder={ar ? 'أحمد ك.' : 'Ahmed K.'} onChange={(e) => set('workerName', e.target.value)} />
          </label>
          <label className="text-xs text-slate-400">
            {ar ? 'رقم العامل' : 'Worker id'}
            <input className={field} value={form.workerId} disabled={!canIngest} onChange={(e) => set('workerId', e.target.value)} dir="ltr" />
          </label>
          <label className="text-xs text-slate-400">
            {ar ? 'نوع الجهاز' : 'Device type'}
            <select className={field} value={form.deviceType} disabled={!canIngest} onChange={(e) => set('deviceType', e.target.value as DeviceType)}>
              {DEVICE_TYPES.map((d) => <option key={d} value={d}>{ar ? deviceTypeAr(d) : d.replace('_', ' ')}</option>)}
            </select>
          </label>
          <label className="text-xs text-slate-400">
            {ar ? 'معرّف الجهاز' : 'Device id'}
            <input className={field} value={form.deviceId} disabled={!canIngest} placeholder="glass-07" onChange={(e) => set('deviceId', e.target.value)} dir="ltr" />
          </label>
        </div>

        {/* finding (optional) */}
        <div className="rounded-lg border border-slate-800 bg-slate-900/40 px-4 py-3">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <label className="text-xs text-slate-400">
              {ar ? 'نوع النتيجة (اختياري)' : 'Finding (optional)'}
              <select className={field} value={form.findingType} disabled={!canIngest} onChange={(e) => set('findingType', e.target.value as '' | FindingType)}>
                <option value="">{ar ? 'لا شيء' : 'None'}</option>
                <option value="safety">{ar ? 'سلامة' : 'Safety'}</option>
                <option value="quality">{ar ? 'جودة' : 'Quality'}</option>
              </select>
            </label>
            {form.findingType && (
              <label className="text-xs text-slate-400">
                {ar ? 'الخطورة' : 'Severity'}
                <select className={field} value={form.findingSeverity} disabled={!canIngest} onChange={(e) => set('findingSeverity', e.target.value)}>
                  {['info', 'low', 'medium', 'high', 'critical'].map((s) => <option key={s} value={s}>{ar ? severityAr(s) : s}</option>)}
                </select>
              </label>
            )}
            {form.findingType && (
              <label className="text-xs text-slate-400">
                {ar ? 'عنوان النتيجة' : 'Finding title'}
                <input className={field} value={form.findingTitle} disabled={!canIngest} placeholder={ar ? 'تعشيش خرسانة عند C-4' : 'Honeycombing at C-4'} onChange={(e) => set('findingTitle', e.target.value)} />
              </label>
            )}
          </div>
          <label className="mt-3 block text-xs text-slate-400">
            {ar ? 'ملاحظة السلامة / التفريغ' : 'Safety note / transcript'}
            <textarea
              className={`${field} min-h-[68px]`}
              value={form.transcriptText}
              disabled={!canIngest}
              placeholder={ar ? 'وُصف على الموقع… (يُحفظ حرفياً)' : 'Spoken on site… (kept verbatim)'}
              onChange={(e) => set('transcriptText', e.target.value)}
            />
          </label>
          {form.findingType === 'safety' && (
            <p className="mt-2 flex items-center gap-1.5 text-[11px] text-amber-200">
              <IconShield className="h-3.5 w-3.5" />
              {ar
                ? 'نتيجة السلامة تُسجّل حادثاً وتُثير تنبيه حوكمة يتطلّب اعتماداً بشرياً (لا اعتماد تلقائي).'
                : 'A safety finding records an incident and raises a governance alert requiring human approval (nothing is auto-approved).'}
            </p>
          )}
        </div>

        <div className="flex items-center justify-end gap-2">
          <Button type="submit" variant="primary" disabled={!canIngest || !file || busy}>
            <IconUpload className="h-3.5 w-3.5" />
            {busy ? (ar ? 'جارٍ الالتقاط…' : 'Capturing…') : ar ? 'التقاط الدليل' : 'Capture evidence'}
          </Button>
        </div>
      </form>
    </Card>
  );
}

// ─────────────────────────── evidence card ───────────────────────────

function EvidenceCard({
  row,
  active,
  onSelect,
  lang,
}: {
  row: SiteEvidenceRow;
  active: boolean;
  onSelect: () => void;
  lang: Lang;
}) {
  const ar = lang === 'ar';
  const when = row.capturedAt ?? row.createdAt;

  return (
    <button
      onClick={onSelect}
      className={`w-full rounded-xl border bg-slate-900/60 px-5 py-4 text-start transition ${
        active ? 'border-sky-500/60 ring-1 ring-sky-500/30' : 'border-slate-700/70 hover:border-slate-600'
      }`}
      aria-pressed={active}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="grid h-9 w-9 place-items-center rounded-lg bg-slate-800 text-lg" aria-hidden>{mediaIcon(row.mediaKind)}</span>
        <span className="font-mono text-xs text-slate-200" dir="ltr">{row.filename}</span>
        <Pill tone="slate">{ar ? mediaKindAr(row.mediaKind) : row.mediaKind}</Pill>
        {row.deviceType && <Pill tone="violet">{ar ? deviceTypeAr(row.deviceType) : String(row.deviceType).replace('_', ' ')}</Pill>}
        <span className="flex-1" />
        {row.findingType === 'safety' && <FindingBadge type="safety" lang={lang} />}
        {row.findingType === 'quality' && <FindingBadge type="quality" lang={lang} />}
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1.5 text-xs text-slate-300 md:grid-cols-4">
        <Meta label={ar ? 'الوقت' : 'Time'} value={<span dir="ltr">{new Date(when).toLocaleString()}</span>} />
        <Meta label={ar ? 'الموقع' : 'Location'} value={row.locationLabel || '—'} />
        <Meta label={ar ? 'العامل' : 'Worker'} value={row.workerName || '—'} />
        <Meta
          label={ar ? 'الإحداثيات' : 'Geo'}
          value={row.latitude && row.longitude ? <span dir="ltr">{Number(row.latitude).toFixed(4)}, {Number(row.longitude).toFixed(4)}</span> : '—'}
        />
        <Meta label={ar ? 'النشاط' : 'Activity'} value={row.activityKey ? <span dir="ltr">{row.activityKey}</span> : '—'} />
        <Meta label={ar ? 'يوم التقرير' : 'Report day'} value={row.reportDate ? <span dir="ltr">{row.reportDate}</span> : '—'} />
        <Meta label="SHA-256" value={<span className="font-mono text-slate-400" dir="ltr">{row.sha256.slice(0, 12)}…</span>} />
        <Meta label={ar ? 'الحجم' : 'Size'} value={<span dir="ltr">{(row.bytes / 1024).toFixed(1)} KB</span>} />
      </dl>

      {row.transcriptText && (
        <p className="mt-3 rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2 text-xs italic text-slate-300">
          “{row.transcriptText}”
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px]">
        {row.linkedSafetyRecordId && (
          <Pill tone="rose">
            {ar ? 'سجلّ سلامة' : 'Safety record'} <span className="ms-1 font-mono" dir="ltr">{row.linkedSafetyRecordId.slice(0, 8)}</span>
          </Pill>
        )}
        {row.linkedQualityRecordId && (
          <Pill tone="amber">
            {ar ? 'سجلّ جودة' : 'Quality record'} <span className="ms-1 font-mono" dir="ltr">{row.linkedQualityRecordId.slice(0, 8)}</span>
          </Pill>
        )}
        {row.findingType === 'safety' && row.linkedSafetyRecordId && (
          <span className="text-amber-300">{ar ? '→ تنبيه حوكمة بانتظار اعتماد بشري' : '→ governance alert awaiting human approval'}</span>
        )}
        {row.capturedBy && <span className="text-slate-500">{ar ? 'التقطه' : 'by'} {row.capturedBy}</span>}
      </div>
    </button>
  );
}

function Meta({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-[10px] uppercase tracking-wider text-slate-500">{label}</dt>
      <dd className="text-slate-200">{value}</dd>
    </div>
  );
}

function FindingBadge({ type, lang }: { type: FindingType; lang: Lang }) {
  const ar = lang === 'ar';
  if (type === 'safety') {
    return (
      <span className="inline-flex items-center gap-1">
        <SeverityBadge severity="critical" />
        <span className="text-[11px] font-semibold text-rose-200">{ar ? 'سلامة' : 'Safety'}</span>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1">
      <SeverityBadge severity="warning" />
      <span className="text-[11px] font-semibold text-amber-200">{ar ? 'جودة' : 'Quality'}</span>
    </span>
  );
}

// ─────────────────────────── helpers ───────────────────────────

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

/** `YYYY-MM-DDTHH:mm` in local time for a `datetime-local` input default. */
function nowLocalInput(): string {
  const d = new Date();
  const off = d.getTimezoneOffset() * 60_000;
  return new Date(d.getTime() - off).toISOString().slice(0, 16);
}

function mediaIcon(kind: string): string {
  switch (kind) {
    case 'photo': return '📷';
    case 'video': return '🎥';
    case 'audio': return '🎙️';
    case 'transcript': return '📝';
    default: return '📎';
  }
}

function mediaKindAr(kind: string): string {
  const map: Record<string, string> = { photo: 'صورة', video: 'فيديو', audio: 'صوت', transcript: 'تفريغ' };
  return map[kind] ?? kind;
}

function deviceTypeAr(d: string): string {
  const map: Record<string, string> = { smart_glasses: 'نظارة ذكية', phone: 'هاتف', tablet: 'لوحي' };
  return map[d] ?? d;
}

function severityAr(s: string): string {
  const map: Record<string, string> = { info: 'معلومة', low: 'منخفضة', medium: 'متوسطة', high: 'عالية', critical: 'حرجة' };
  return map[s] ?? s;
}

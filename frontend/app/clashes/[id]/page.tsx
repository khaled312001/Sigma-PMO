'use client';

/**
 * `/clashes/[id]` — dedicated single-clash detail surface (correction-plan
 * §2.2 acceptance: "الـ /clashes/[id] page تعرض الـ clash + 3 cards").
 *
 * Same simulate → modal → approve & apply flow as the list-page card, on a
 * full page with room for the rationale + audit trail. The list page links
 * here for deep work; toast outcomes mirror the inline card.
 */

import { use, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';

import { API_BASE, api, getApiKey } from '../../../lib/api';
import { AuthGate } from '../../../components/AuthGate';
import { PersonaActiveBadge } from '../../../components/PersonaActiveBadge';
import { PolicyAddonInline } from '../../../components/PolicyAddonInline';
import { SimulationModal, SimulationProjectionView } from '../../../components/SimulationModal';
import { useToast } from '../../../components/ToastProvider';
import { CAPABILITIES } from '../../../lib/capabilities';
import { useI18n, type Lang } from '../../../lib/i18n';
import { useMe } from '../../../lib/me-context';
import { Button, Card, ErrorBanner, PageHeader, Pill } from '../../../components/ui';
import { IconBook, IconSparkles } from '../../../components/Icons';

interface ProposedClashOption {
  label: string;
  timeImpactDays: number;
  costImpactAED: number | null;
  scopeImpact: string;
}

/**
 * First-class detail projection lifted by `GET /clashes/:id` (Req 2 + R4).
 * `modelA` / `modelB` are extracted server-side from `viewState` so the UI
 * never has to dig into the opaque JSON.
 */
interface ClashDetailProjection {
  clashRef: string;
  severity: string;
  disciplinesInvolved: string[];
  modelA: string | null;
  modelB: string | null;
  elementGuidA: string | null;
  elementGuidB: string | null;
  location: { x: number; y: number; z: number } | null;
  gridLocation: string | null;
  penetrationMm: number | null;
  snapshotImagePath: string | null;
  viewUrn: string | null;
  viewState: Record<string, unknown> | null;
  linkedActivityKeys: string[];
  responsibleParty: string | null;
}

interface ClashItem {
  id: string;
  createdAt: string;
  projectBusinessKey: string;
  clashRef: string;
  disciplinesInvolved: string[];
  severity: string;
  description: string;
  proposedOptions: ProposedClashOption[] | null;
  chosenOptionIndex: number | null;
  decidedBy: string | null;
  decidedAt: string | null;
  /** Present on `GET /clashes/:id`; absent on the refetch shapes that don't ask for it. */
  detail?: ClashDetailProjection;
}

interface ApplyOutcome {
  revisedActivityKeys: string[];
  revisionNumber: number;
  claimLetterId: string | null;
  warnings: string[];
}

export default function ClashDetailRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <AuthGate surface="Clash detail">
      <ClashDetailPage id={id} />
    </AuthGate>
  );
}

function ClashDetailPage({ id }: { id: string }) {
  const toast = useToast();
  const { lang } = useI18n();
  const { me } = useMe();
  const canAct = !!me?.user && CAPABILITIES[me.user.role].canEvaluateRules;
  const canSimulate = !!me?.user && CAPABILITIES[me.user.role].canSimulate;
  const canApprove = !!me?.user && CAPABILITIES[me.user.role].canEditPolicy;
  const approverName = me?.user?.displayName ?? 'unknown';

  const [clash, setClash] = useState<ClashItem | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [picked, setPicked] = useState<number | null>(null);
  const [busy, setBusy] = useState<'propose' | 'simulate' | 'apply' | null>(null);
  const [projection, setProjection] = useState<SimulationProjectionView | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  const refresh = useCallback(async () => {
    setLoadError(null);
    try {
      const row = await api<ClashItem>(`/clashes/${id}`);
      setClash(row);
      setPicked(row.chosenOptionIndex);
    } catch (e) {
      setLoadError((e as Error).message);
    }
  }, [id]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  /**
   * Stream `GET /clashes/:id/pdf` to a Blob download (Req R4). We bypass the
   * JSON `api` helper because the response is binary; the same x-api-key
   * header + Blob-download dance the `/letters` page uses keeps the page
   * state intact instead of navigating away.
   */
  const onDownloadPdf = useCallback(async () => {
    const key = getApiKey();
    try {
      const res = await fetch(`${API_BASE}/clashes/${id}/pdf`, {
        headers: key ? { 'x-api-key': key } : undefined,
        cache: 'no-store',
      });
      if (!res.ok) {
        const body = await res.text();
        throw new Error(body.slice(0, 240) || `HTTP ${res.status}`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `clash-${clash?.clashRef ?? id.slice(0, 8)}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast.error(lang === 'ar' ? 'تعذّر تنزيل ملف PDF' : 'PDF download failed', (e as Error).message);
    }
  }, [id, clash, toast, lang]);

  const onPropose = useCallback(async () => {
    setBusy('propose');
    try {
      await api(`/clashes/${id}/propose`, { method: 'POST' });
      await refresh();
      toast.success(
        lang === 'ar' ? 'تم اقتراح الخيارات' : 'Options proposed',
        lang === 'ar'
          ? 'صاغت الشخصية الخبيرة لمحلّل التضاربات ثلاثة خيارات.'
          : 'Three options drafted by the clash analyst persona.',
      );
    } catch (e) {
      toast.error(lang === 'ar' ? 'تعذّر اقتراح الخيارات' : 'Propose failed', (e as Error).message);
    } finally {
      setBusy(null);
    }
  }, [id, refresh, toast, lang]);

  const onSimulate = useCallback(async () => {
    if (picked === null) return;
    setBusy('simulate');
    try {
      const p = await api<SimulationProjectionView>(`/clashes/${id}/options/${picked}/simulate`, {
        method: 'POST',
        body: JSON.stringify({ requestedBy: approverName }),
      });
      setProjection(p);
      setModalOpen(true);
    } catch (e) {
      toast.error(lang === 'ar' ? 'تعذّرت المحاكاة' : 'Simulation failed', (e as Error).message);
    } finally {
      setBusy(null);
    }
  }, [id, picked, approverName, toast, lang]);

  const onApprove = useCallback(async () => {
    if (picked === null || !projection) return;
    setBusy('apply');
    try {
      const r = await api<ApplyOutcome>(`/clashes/${id}/options/${picked}/apply`, {
        method: 'POST',
        body: JSON.stringify({ approvedBy: approverName, scenarioId: projection.scenarioId }),
      });
      setModalOpen(false);
      await refresh();
      toast.success(
        lang === 'ar' ? 'تم تطبيق الحل' : 'Resolution applied',
        lang === 'ar'
          ? `${r.revisedActivityKeys.length} مراجعة أنشطة عند الإصدار ${r.revisionNumber}` +
              (r.claimLetterId ? ` · خطاب المطالبة ${r.claimLetterId.slice(0, 8)}` : '')
          : `${r.revisedActivityKeys.length} activity revision(s) at rev ${r.revisionNumber}` +
              (r.claimLetterId ? ` · claim letter ${r.claimLetterId.slice(0, 8)}` : ''),
      );
      for (const w of r.warnings) toast.error(lang === 'ar' ? 'ملاحظة' : 'Note', w);
    } catch (e) {
      toast.error(lang === 'ar' ? 'تعذّر التطبيق' : 'Apply failed', (e as Error).message);
    } finally {
      setBusy(null);
    }
  }, [id, picked, projection, approverName, refresh, toast, lang]);

  const decided = clash?.chosenOptionIndex !== null && clash?.chosenOptionIndex !== undefined;
  const options = clash?.proposedOptions ?? [];

  return (
    <div className="space-y-6 animate-[fade-in-up_240ms_ease-out]">
      <Link href="/clashes" className="text-xs text-sky-300 underline-offset-2 hover:underline">
        {lang === 'ar' ? '→ العودة إلى التضاربات' : '← Back to clashes'}
      </Link>
      <PageHeader
        eyebrow={lang === 'ar' ? `الهندسة · التضارب ${clash?.clashRef ?? id.slice(0, 8)}` : `Engineering · Clash ${clash?.clashRef ?? id.slice(0, 8)}`}
        title={clash ? (lang === 'ar' ? `التضارب ${clash.clashRef}` : `Clash ${clash.clashRef}`) : (lang === 'ar' ? 'تفاصيل التضارب' : 'Clash detail')}
        description={clash?.description ?? ''}
        actions={
          <span className="flex items-center gap-2">
            <PersonaActiveBadge
              personaSlug="revit-clash-analyst"
              expertise={
                lang === 'ar'
                  ? 'محلّل تضاربات BIM — خبرة 10-20 عاماً في التنسيق عبر Revit / Navisworks.'
                  : 'BIM clash analyst — 10-20 years Revit / Navisworks coordination.'
              }
              surface="engineering"
            />
            <Button variant="ghost" size="sm" disabled={!clash} onClick={() => void onDownloadPdf()}>
              <IconBook className="h-3.5 w-3.5" />
              {lang === 'ar' ? 'تنزيل PDF' : 'Download PDF'}
            </Button>
          </span>
        }
      />

      <ErrorBanner message={loadError} />

      {clash && (
        <>
          <PolicyAddonInline projectKey={clash.projectBusinessKey} surface="engineering" />

          <div className="flex flex-wrap items-center gap-2">
            <Pill tone={clash.severity === 'critical' ? 'rose' : clash.severity === 'major' ? 'amber' : 'sky'}>
              {lang === 'ar'
                ? clash.severity === 'critical'
                  ? 'حرج'
                  : clash.severity === 'major'
                    ? 'رئيسي'
                    : clash.severity === 'minor'
                      ? 'ثانوي'
                      : clash.severity
                : clash.severity}
            </Pill>
            {clash.disciplinesInvolved.map((d) => <Pill key={d} tone="violet">{d}</Pill>)}
            <Pill tone={decided ? 'emerald' : options.length > 0 ? 'sky' : 'slate'}>
              {decided
                ? (lang === 'ar' ? 'تمّ البتّ فيه' : 'Decided')
                : options.length > 0
                  ? (lang === 'ar' ? 'مُقترَح' : 'Proposed')
                  : (lang === 'ar' ? 'قيد الانتظار' : 'Pending')}
            </Pill>
          </div>

          <ClashDetailSections clash={clash} lang={lang} />

          {options.length === 0 ? (
            <Card title={lang === 'ar' ? 'لا توجد خيارات بعد' : 'No options yet'}>
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm text-slate-300">
                  {lang === 'ar'
                    ? 'شغّل الشخصية الخبيرة لمحلّل التضاربات لصياغة الخيارات الثلاثة (مفاضلة زمنية / مفاضلة كلفوية / تنسيق).'
                    : 'Trigger the clash analyst persona to draft the three options (time-trade / cost-trade / coordination).'}
                </p>
                <Button variant="primary" size="sm" disabled={!canAct || busy === 'propose'} onClick={() => void onPropose()}>
                  <IconSparkles className="h-3.5 w-3.5" />
                  {busy === 'propose' ? (lang === 'ar' ? 'جارٍ الاقتراح…' : 'Proposing…') : lang === 'ar' ? 'اقتراح الخيارات' : 'Propose options'}
                </Button>
              </div>
            </Card>
          ) : (
            <Card
              title={lang === 'ar' ? 'خيارات الحل' : 'Resolution options'}
              hint={
                lang === 'ar'
                  ? 'اختر خياراً، حاكِ الأثر الزمني / الكلفوي، ثم اعتمد — يُصدر الاعتماد مراجعة جدول زمني بنظام الإضافة فقط مع خطاب المطالبة وفق FIDIC.'
                  : 'Pick one, simulate the time/cost impact, then approve — approval issues an append-only schedule revision + the FIDIC claim letter.'
              }
            >
              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                {options.map((opt, idx) => {
                  const active = picked === idx;
                  const isChosen = clash.chosenOptionIndex === idx;
                  return (
                    <button
                      key={idx}
                      type="button"
                      disabled={decided}
                      onClick={() => setPicked(idx)}
                      className={`flex flex-col gap-2 rounded-xl border px-4 py-3 text-start transition-all duration-200 ${
                        isChosen
                          ? 'border-emerald-500/70 bg-emerald-500/10 ring-1 ring-emerald-500/40'
                          : active
                            ? 'border-sky-500/70 bg-sky-500/10 ring-1 ring-sky-500/40 scale-[1.02]'
                            : 'border-slate-700 bg-slate-900/40 hover:border-slate-500'
                      } ${decided && !isChosen ? 'opacity-50' : ''}`}
                    >
                      <span className="text-sm font-semibold text-slate-50" dir="auto">{opt.label}</span>
                      <div className="grid grid-cols-1 gap-1.5 text-[11px]">
                        <span className={`rounded-md px-2 py-1 ring-1 ${opt.timeImpactDays > 0 ? 'bg-amber-500/15 text-amber-100 ring-amber-500/40' : 'bg-emerald-500/15 text-emerald-100 ring-emerald-500/40'}`}>
                          {lang === 'ar' ? 'الزمن:' : 'Time:'} {opt.timeImpactDays >= 0 ? '+' : ''}{opt.timeImpactDays} {lang === 'ar' ? 'يوم' : 'day(s)'}
                        </span>
                        <span className={`rounded-md px-2 py-1 ring-1 ${opt.costImpactAED && opt.costImpactAED > 0 ? 'bg-amber-500/15 text-amber-100 ring-amber-500/40' : 'bg-slate-800 text-slate-200 ring-slate-700'}`} dir="ltr">
                          {lang === 'ar' ? 'التكلفة:' : 'Cost:'} {opt.costImpactAED === null ? (lang === 'ar' ? '— (خارج جدول الكميات)' : '— (not in BoQ)') : `AED ${opt.costImpactAED.toLocaleString()}`}
                        </span>
                        <span className="rounded-md bg-violet-500/15 px-2 py-1 text-violet-100 ring-1 ring-violet-500/40" dir="auto">
                          {lang === 'ar' ? 'النطاق:' : 'Scope:'} {opt.scopeImpact || (lang === 'ar' ? 'لا يوجد' : 'none')}
                        </span>
                      </div>
                      {isChosen && <Pill tone="emerald">{lang === 'ar' ? 'المختار' : 'Chosen'}</Pill>}
                    </button>
                  );
                })}
              </div>

              {!decided && (
                <div className="mt-4 flex items-center justify-end gap-2 border-t border-slate-700/70 pt-3">
                  <Button variant="primary" size="sm" disabled={!canSimulate || picked === null || busy === 'simulate'} onClick={() => void onSimulate()}>
                    {busy === 'simulate' ? (lang === 'ar' ? 'جارٍ المحاكاة…' : 'Simulating…') : lang === 'ar' ? 'محاكاة الأثر' : 'Simulate impact'}
                  </Button>
                </div>
              )}

              {decided && (
                <p className="mt-4 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-2.5 text-xs text-emerald-100">
                  {lang === 'ar' ? 'تمّ البتّ فيه بقرار ' : 'Decided by '}<span className="font-semibold">{clash.decidedBy}</span>
                  {clash.decidedAt ? (lang === 'ar' ? ` بتاريخ ${new Date(clash.decidedAt).toLocaleString()}` : ` on ${new Date(clash.decidedAt).toLocaleString()}`) : ''}
                  {lang === 'ar'
                    ? ' — صدرت مراجعة الجدول الزمني وخطاب المطالبة عند الاعتماد.'
                    : ' — the schedule revision and claim letter were issued at approval time.'}
                </p>
              )}
            </Card>
          )}

          <SimulationModal
            open={modalOpen}
            optionLabel={picked !== null ? options[picked]?.label ?? '' : ''}
            projection={projection}
            applying={busy === 'apply'}
            onApprove={canApprove ? () => void onApprove() : () => toast.error(lang === 'ar' ? 'غير مصرّح' : 'Not permitted', lang === 'ar' ? 'يتطلّب الاعتماد صلاحية canEditPolicy.' : 'Approving requires canEditPolicy.')}
            onClose={() => setModalOpen(false)}
          />
        </>
      )}
    </div>
  );
}

// ─────────────────────────── detail sections (R4) ───────────────────────────

/**
 * The full clash-detail evidence surface (Req R4 — "تقرير Clash Detail واضح").
 * Lays out every acceptance field grouped into sections so a reviewer reads
 * the proof on screen exactly as it prints in the PDF: Identification,
 * Geometry, Schedule & responsibility, Impact, Evidence, Decision audit.
 *
 * All values come from the `detail` projection lifted by `GET /clashes/:id`
 * (with `modelA` / `modelB` already extracted from `viewState`). Fields that
 * are null render an em-dash rather than being hidden, so the reviewer can
 * see at a glance which data the source export did or did not carry.
 */
function ClashDetailSections({ clash, lang }: { clash: ClashItem; lang: Lang }) {
  const d = clash.detail;
  if (!d) return null;
  const isAr = lang === 'ar';

  // Impact draws from the chosen option when decided, else the leading proposal.
  const options = clash.proposedOptions ?? [];
  const opt =
    clash.chosenOptionIndex != null && options[clash.chosenOptionIndex]
      ? options[clash.chosenOptionIndex]
      : options[0];
  const optDecided = clash.chosenOptionIndex != null;

  const loc = d.location;

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      {/* Identification */}
      <Card title={isAr ? 'التعريف' : 'Identification'}>
        <dl className="grid grid-cols-1 gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
          <Field label={isAr ? 'مرجع التضارب' : 'Clash reference'} value={d.clashRef} mono />
          <Field label={isAr ? 'النموذج A' : 'Model A'} value={d.modelA} mono />
          <Field label={isAr ? 'النموذج B' : 'Model B'} value={d.modelB} mono />
          <Field label={isAr ? 'التخصصات' : 'Disciplines'} value={d.disciplinesInvolved.join(', ')} />
          <Field label={isAr ? 'الخطورة' : 'Severity'} value={d.severity} />
        </dl>
      </Card>

      {/* Geometry */}
      <Card title={isAr ? 'الهندسة' : 'Geometry'}>
        <dl className="grid grid-cols-1 gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
          <Field label={isAr ? 'معرّف العنصر A' : 'Element GUID A'} value={d.elementGuidA} mono />
          <Field label={isAr ? 'معرّف العنصر B' : 'Element GUID B'} value={d.elementGuidB} mono />
          <Field label="X" value={loc ? String(loc.x) : null} mono />
          <Field label="Y" value={loc ? String(loc.y) : null} mono />
          <Field label="Z" value={loc ? String(loc.z) : null} mono />
          <Field label={isAr ? 'موقع المحاور' : 'Grid location'} value={d.gridLocation} />
          <Field
            label={isAr ? 'عمق الاختراق / المسافة' : 'Penetration / distance'}
            value={d.penetrationMm != null ? `${d.penetrationMm} mm` : null}
            mono
          />
        </dl>
      </Card>

      {/* Schedule & responsibility */}
      <Card title={isAr ? 'الجدول الزمني والمسؤولية' : 'Schedule & responsibility'}>
        <dl className="grid grid-cols-1 gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
          <Field
            label={isAr ? 'النشاط المرتبط (CPM/P6)' : 'Linked activity (CPM/P6)'}
            value={d.linkedActivityKeys.length > 0 ? d.linkedActivityKeys.join(', ') : null}
            mono
          />
          <Field label={isAr ? 'الجهة المسؤولة' : 'Responsible party'} value={d.responsibleParty} />
        </dl>
      </Card>

      {/* Impact */}
      <Card title={isAr ? 'الأثر' : 'Impact'}>
        {opt ? (
          <dl className="grid grid-cols-1 gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
            <Field
              label={isAr ? 'خيار الحل' : 'Resolution option'}
              value={`${opt.label}${optDecided ? (isAr ? ' (المختار)' : ' (chosen)') : isAr ? ' (مقترح)' : ' (proposed)'}`}
            />
            <Field
              label={isAr ? 'الأثر الزمني' : 'Time impact'}
              value={`${opt.timeImpactDays >= 0 ? '+' : ''}${opt.timeImpactDays} ${isAr ? 'يوم' : 'day(s)'}`}
            />
            <Field
              label={isAr ? 'الأثر الكلفوي' : 'Cost impact'}
              value={opt.costImpactAED == null ? (isAr ? '— (خارج جدول الكميات)' : '— (not in BoQ)') : `AED ${opt.costImpactAED.toLocaleString()}`}
            />
            <Field label={isAr ? 'أثر النطاق' : 'Scope impact'} value={opt.scopeImpact || null} />
          </dl>
        ) : (
          <p className="text-sm text-slate-400">
            {isAr ? 'لم تُقترَح خيارات بعد — لا يوجد أثر زمني / كلفوي.' : 'No options proposed yet — no time / cost impact.'}
          </p>
        )}
      </Card>

      {/* Evidence — snapshot ref + viewer URN. We surface the storage refs
          (not an inline <img>) because clash snapshots are stored behind the
          StorageService and have no public file route yet; the PDF carries the
          same refs so the audit trail is complete either way. */}
      <Card title={isAr ? 'الدليل' : 'Evidence'} className="lg:col-span-2">
        {d.snapshotImagePath || d.viewUrn ? (
          <dl className="grid grid-cols-1 gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
            <Field label={isAr ? 'مسار اللقطة' : 'Snapshot path'} value={d.snapshotImagePath} mono />
            <Field label={isAr ? 'معرّف العارض (URN)' : 'Viewer URN'} value={d.viewUrn} mono />
          </dl>
        ) : (
          <p className="text-sm text-slate-400">
            {isAr ? 'لا توجد لقطة أو حالة عارض محفوظة لهذا التضارب.' : 'No snapshot or viewer state captured for this clash.'}
          </p>
        )}
      </Card>

      {/* Decision audit */}
      <Card title={isAr ? 'سجل القرار' : 'Decision audit'} className="lg:col-span-2">
        <dl className="grid grid-cols-1 gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
          <Field label={isAr ? 'بقرار' : 'Decided by'} value={clash.decidedBy} />
          <Field
            label={isAr ? 'التاريخ' : 'Decided at'}
            value={clash.decidedAt ? new Date(clash.decidedAt).toLocaleString() : null}
          />
        </dl>
      </Card>
    </div>
  );
}

/** One labelled detail field; null/empty values render an em-dash. */
function Field({ label, value, mono }: { label: string; value: string | null; mono?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5 border-b border-slate-800/50 py-1 last:border-0">
      <dt className="text-[11px] uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className={`break-words text-slate-200 ${mono ? 'font-mono text-xs' : 'text-sm'}`} dir="auto">
        {value && value.length > 0 ? value : '—'}
      </dd>
    </div>
  );
}

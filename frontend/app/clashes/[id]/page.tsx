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

import { api } from '../../../lib/api';
import { AuthGate } from '../../../components/AuthGate';
import { PersonaActiveBadge } from '../../../components/PersonaActiveBadge';
import { PolicyAddonInline } from '../../../components/PolicyAddonInline';
import { SimulationModal, SimulationProjectionView } from '../../../components/SimulationModal';
import { useToast } from '../../../components/ToastProvider';
import { CAPABILITIES } from '../../../lib/capabilities';
import { useI18n } from '../../../lib/i18n';
import { useMe } from '../../../lib/me-context';
import { Button, Card, ErrorBanner, PageHeader, Pill } from '../../../components/ui';
import { IconSparkles } from '../../../components/Icons';

interface ProposedClashOption {
  label: string;
  timeImpactDays: number;
  costImpactAED: number | null;
  scopeImpact: string;
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
          <PersonaActiveBadge
            personaSlug="revit-clash-analyst"
            expertise={
              lang === 'ar'
                ? 'محلّل تضاربات BIM — خبرة 10-20 عاماً في التنسيق عبر Revit / Navisworks.'
                : 'BIM clash analyst — 10-20 years Revit / Navisworks coordination.'
            }
            surface="engineering"
          />
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

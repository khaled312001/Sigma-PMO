'use client';

import { useCallback, useEffect, useState } from 'react';

import { AuthGate } from '../../components/AuthGate';
import { useToast } from '../../components/ToastProvider';
import { useI18n } from '../../lib/i18n';
import { useCurrentProjectKey } from '../../lib/project-context';
import { api } from '../../lib/api';
import { Button, Card, EmptyState, PageHeader, Pill } from '../../components/ui';

interface ClauseRule {
  id: string; businessKey: string; contractStandard: string; clauseRef: string | null; title: string;
  ruleType: string; daysToAct: number | null; actor: string | null; consequence: string | null; status: string;
}
interface Preset { key: string; standard: string; ruleCount: number }
interface EvalResult { eventDate: string; deadline: string; daysToAct: number; actionDate: string | null; daysElapsed: number | null; remainingDays: number | null; verdict: string; basis: string }

export default function ContractRulesRoute() {
  return (
    <AuthGate capability="canRead" surface="Contract Rules Engine">
      <ContractRulesPage />
    </AuthGate>
  );
}

function ContractRulesPage() {
  const { lang } = useI18n();
  const ar = lang === 'ar';
  const projectKey = useCurrentProjectKey();
  const toast = useToast();
  const [rules, setRules] = useState<ClauseRule[]>([]);
  const [presets, setPresets] = useState<Preset[]>([]);
  const [preset, setPreset] = useState('');

  const refresh = useCallback(async () => {
    try {
      const [r, p] = await Promise.all([
        api<ClauseRule[]>(`/contract-rules?projectKey=${encodeURIComponent(projectKey)}`),
        api<{ presets: Preset[] }>(`/contract-rules/presets`),
      ]);
      setRules(r); setPresets(p.presets); if (!preset && p.presets[0]) setPreset(p.presets[0].key);
    } catch (e) { toast.error(ar ? 'تعذّر التحميل' : 'Failed to load', (e as Error).message); }
  }, [projectKey, toast, ar, preset]);

  useEffect(() => { void refresh(); }, [refresh]);

  const seed = async () => {
    try { const res = await api<{ added: number; standard: string }>('/contract-rules/apply-preset', { method: 'POST', body: JSON.stringify({ projectKey, presetKey: preset }) }); toast.success(ar ? `تمت إضافة ${res.added} قاعدة (${res.standard})` : `Seeded ${res.added} rule(s) (${res.standard})`); await refresh(); }
    catch (e) { toast.error(ar ? 'فشل التهيئة' : 'Seed failed', (e as Error).message); }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={`Contract Rules Engine · ${projectKey}`}
        title={ar ? 'محرّك قواعد العقد' : 'Contract Rules Engine'}
        description={ar
          ? 'تحويل شروط العقد إلى قواعد تشغيلية: مدة الإشعار، حاجز الزمن (time bar)، فترة الرد، الاعتماد الضمني، فترة التقرير — ثم اختبار الوقائع والتواريخ ضد العقد لإصدار حُكم: محفوظة إجرائياً / ضعيفة / ساقطة بالتقادم.'
          : 'Turn contract terms into operational rules: notice period, time bar, response period, deemed approval, determination — then test facts and dates against the contract to produce a verdict: preserved / weak / time-barred.'}
        actions={(
          <div className="flex items-center gap-2">
            <select value={preset} onChange={(e) => setPreset(e.target.value)} className="rounded-lg border border-slate-700 bg-slate-900/70 px-2 py-1.5 text-xs text-slate-100">
              {presets.map((p) => <option key={p.key} value={p.key}>{p.standard}</option>)}
            </select>
            <Button variant="success" size="sm" onClick={seed}>{ar ? 'تهيئة من FIDIC' : 'Seed FIDIC preset'}</Button>
          </div>
        )}
      />

      <EvaluateTool ar={ar} />

      <Card title={ar ? 'سجل قواعد العقد' : 'Contract clause-rule register'}>
        {rules.length === 0 ? (
          <EmptyState title={ar ? 'لا توجد قواعد بعد' : 'No rules yet'} description={ar ? 'هيّئ مجموعة قواعد FIDIC أو أضف قاعدة لربط الوقائع بشروط العقد.' : 'Seed a FIDIC preset or add a rule to link facts to contract terms.'} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead><tr className="border-b border-slate-800 text-[11px] uppercase tracking-wider text-slate-400">
                <th className="px-2 py-2 text-start">{ar ? 'البند' : 'Clause'}</th>
                <th className="px-2 py-2 text-start">{ar ? 'العنوان' : 'Title'}</th>
                <th className="px-2 py-2 text-start">{ar ? 'النوع' : 'Type'}</th>
                <th className="px-2 py-2 text-end">{ar ? 'الأيام' : 'Days'}</th>
                <th className="px-2 py-2 text-start">{ar ? 'المعيار' : 'Standard'}</th>
              </tr></thead>
              <tbody>
                {rules.map((r) => (
                  <tr key={r.id} className="border-b border-slate-800/60 hover:bg-slate-900/50">
                    <td className="px-2 py-2 font-mono text-[11px] text-sky-300" dir="ltr">{r.clauseRef ?? r.businessKey}</td>
                    <td className="px-2 py-2"><span className="font-medium text-slate-100">{r.title}</span>{r.consequence && <span className="block text-[11px] text-slate-400">{r.consequence}</span>}</td>
                    <td className="px-2 py-2"><Pill tone={r.ruleType === 'time_bar' ? 'rose' : 'violet'}>{r.ruleType.replace(/_/g, ' ')}</Pill></td>
                    <td className="px-2 py-2 text-end font-mono tabular-nums text-amber-300" dir="ltr">{r.daysToAct ?? '—'}</td>
                    <td className="px-2 py-2 text-[11px] text-slate-400">{r.contractStandard}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function EvaluateTool({ ar }: { ar: boolean }) {
  const toast = useToast();
  const [eventDate, setEventDate] = useState('');
  const [actionDate, setActionDate] = useState('');
  const [daysToAct, setDaysToAct] = useState('28');
  const [result, setResult] = useState<EvalResult | null>(null);
  const [busy, setBusy] = useState(false);
  const field = 'mt-1 block w-full rounded-lg border border-slate-700 bg-slate-900/70 px-3 py-2 text-sm text-slate-100';

  const run = async () => {
    if (!eventDate) { toast.error(ar ? 'أدخل تاريخ الحدث' : 'Enter the event date'); return; }
    setBusy(true);
    try { setResult(await api<EvalResult>('/contract-rules/evaluate', { method: 'POST', body: JSON.stringify({ eventDate, actionDate: actionDate || null, daysToAct: Number(daysToAct) }) })); }
    catch (e) { toast.error(ar ? 'فشل التقييم' : 'Evaluate failed', (e as Error).message); } finally { setBusy(false); }
  };

  const tone = (v?: string) => (v === 'preserved' ? 'emerald' : v === 'pending' ? 'sky' : v === 'weak' ? 'amber' : 'rose');
  const vlabel = (v: string) => (ar ? ({ preserved: 'محفوظة', weak: 'ضعيفة', time_barred: 'ساقطة بالتقادم', pending: 'قيد المهلة', indeterminate: 'غير محدّدة' }[v] ?? v) : v.replace('_', ' '));

  return (
    <Card title={ar ? 'تقييم إجرائي' : 'Procedural evaluator'} hint={ar ? 'تاريخ الحدث + تاريخ الإجراء + المهلة ← محفوظة/ضعيفة/ساقطة' : 'event date + action date + day limit → preserved/weak/time-barred'}>
      <div className="grid gap-3 sm:grid-cols-4">
        <label className="text-xs text-slate-400">{ar ? 'تاريخ الحدث' : 'Event date'}<input type="date" className={field} value={eventDate} onChange={(e) => setEventDate(e.target.value)} dir="ltr" /></label>
        <label className="text-xs text-slate-400">{ar ? 'تاريخ الإجراء (اختياري)' : 'Action date (opt.)'}<input type="date" className={field} value={actionDate} onChange={(e) => setActionDate(e.target.value)} dir="ltr" /></label>
        <label className="text-xs text-slate-400">{ar ? 'المهلة (أيام)' : 'Days to act'}<input type="number" className={field} value={daysToAct} onChange={(e) => setDaysToAct(e.target.value)} /></label>
        <div className="flex items-end"><Button variant="primary" size="sm" disabled={busy} onClick={run}>{busy ? '…' : (ar ? 'تقييم' : 'Evaluate')}</Button></div>
      </div>
      {result && (
        <div className={`mt-3 rounded-lg border p-3 ${tone(result.verdict) === 'emerald' ? 'border-emerald-500/40 bg-emerald-500/10' : tone(result.verdict) === 'rose' ? 'border-rose-500/40 bg-rose-500/10' : tone(result.verdict) === 'amber' ? 'border-amber-500/40 bg-amber-500/10' : 'border-sky-500/40 bg-sky-500/10'}`}>
          <div className="flex flex-wrap items-center gap-2">
            <Pill tone={tone(result.verdict)}>{vlabel(result.verdict)}</Pill>
            <span className="text-xs text-slate-400">{ar ? 'الموعد النهائي:' : 'Deadline:'} <span className="font-mono text-slate-200" dir="ltr">{result.deadline}</span></span>
            {result.remainingDays != null && <span className="text-xs text-slate-400">{ar ? 'المتبقّي:' : 'Remaining:'} <span className="font-mono text-slate-200" dir="ltr">{result.remainingDays}d</span></span>}
          </div>
          <p className="mt-1.5 text-sm text-slate-200">{result.basis}</p>
        </div>
      )}
    </Card>
  );
}

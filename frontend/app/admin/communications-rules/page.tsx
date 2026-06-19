'use client';

import { useCallback, useEffect, useState } from 'react';

import { AuthGate } from '../../../components/AuthGate';
import { Button, Card, PageHeader, Pill } from '../../../components/ui';
import { useToast } from '../../../components/ToastProvider';
import { api } from '../../../lib/api';
import { CAPABILITIES } from '../../../lib/capabilities';
import { useI18n } from '../../../lib/i18n';
import { useMe } from '../../../lib/me-context';

const CATEGORIES = ['rfi', 'ncr', 'delay-notice', 'approval-request', 'claim-notice', 'instruction', 'variation', 'daily-report', 'meeting-minutes', 'general'];
const ROLE_OPTIONS = ['consultant', 'contractor', 'subcontractor', 'pmo', 'owner', 'client', 'governance_board', 'operator'];

interface Tier { level: number; afterHours: number; toRole: string }
interface RulesConfig {
  channels: string[]; approvedRecipients: string[]; approvedRoles: string[];
  unreadAlertHours: number; escalationLevels: Tier[];
  requiredAckCategories: string[]; requiredResponseCategories: string[]; requiredResponseHours: number;
  criticalCategories: string[]; deemedNoticeEnabled: boolean; deemedNoticeHours: number;
  responsibleByCategory: Record<string, string>;
}
interface RulesResponse { config: RulesConfig; configured: boolean; version: number; authoredBy: string | null; updatedAt: string | null }

export default function CommunicationRulesRoute() {
  return (
    <AuthGate capability="canEditPolicy" surface="Communication Rules">
      <CommunicationRulesPage />
    </AuthGate>
  );
}

function CommunicationRulesPage() {
  const { lang } = useI18n();
  const isAr = lang === 'ar';
  const toast = useToast();
  const { me } = useMe();
  const canEdit = !!me?.user && CAPABILITIES[me.user.role].canEditPolicy;
  const updatedBy = me?.user?.displayName ?? me?.user?.email ?? null;

  const [state, setState] = useState<RulesResponse | null>(null);
  const [draft, setDraft] = useState<RulesConfig | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await api<RulesResponse>('/communication-rules');
      setState(r);
      setDraft(r.config);
    } catch (e) { toast.error(isAr ? 'تعذّر التحميل' : 'Failed to load', (e as Error).message); }
  }, [toast, isAr]);
  useEffect(() => { void load(); }, [load]);

  const save = async () => {
    if (!draft) return;
    setSaving(true);
    try {
      const r = await api<RulesResponse>('/communication-rules', { method: 'POST', body: JSON.stringify({ ...draft, updatedBy }) });
      setState((s) => (s ? { ...s, ...r, configured: true } : s));
      setDraft(r.config);
      toast.success(isAr ? 'تم حفظ قواعد المراسلات' : 'Communication rules saved');
    } catch (e) { toast.error(isAr ? 'فشل الحفظ' : 'Save failed', (e as Error).message); }
    finally { setSaving(false); }
  };

  const toggleCat = (key: keyof RulesConfig, cat: string) => {
    if (!draft) return;
    const cur = draft[key] as string[];
    setDraft({ ...draft, [key]: cur.includes(cat) ? cur.filter((c) => c !== cat) : [...cur, cat] });
  };

  if (!draft || !state) {
    return <div className="h-64 animate-pulse rounded-xl bg-slate-800/40" />;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={isAr ? 'الإدارة · قواعد المراسلات' : 'Admin · Communication Rules'}
        title={isAr ? 'قواعد مصفوفة المراسلات' : 'Communication Matrix Rules'}
        description={isAr ? 'القنوات الرسمية، المستلمون المعتمدون، مهلة التنبيه، مصفوفة التصعيد، الإقرار/الرد المطلوب، مهلة الرد وقواعد الإبلاغ الحُكمي.' : 'Official channels, approved recipients, unread-alert period, escalation matrix, required ack/response, response SLA and deemed-notice rules.'}
        actions={<span className="flex items-center gap-2">
          {state.configured ? <Pill tone="emerald">{isAr ? `نسخة ${state.version}` : `v${state.version}`}</Pill> : <Pill tone="amber">{isAr ? 'افتراضي' : 'default'}</Pill>}
          <Button variant="primary" size="sm" onClick={save} disabled={!canEdit || saving}>{isAr ? 'حفظ' : 'Save'}</Button>
        </span>}
      />

      <Card title={isAr ? 'التنبيه والتصعيد والإبلاغ الحُكمي' : 'Alerting, escalation & deemed-notice'}>
        <div className="grid gap-4 sm:grid-cols-2">
          <NumberField label={isAr ? 'مهلة التنبيه عند عدم الفتح (ساعات)' : 'Unread alert period (hours)'} value={draft.unreadAlertHours} min={1} max={720} onChange={(v) => setDraft({ ...draft, unreadAlertHours: v })} />
          <NumberField label={isAr ? 'مهلة الرد المطلوب (ساعات)' : 'Required response SLA (hours)'} value={draft.requiredResponseHours} min={1} max={1440} onChange={(v) => setDraft({ ...draft, requiredResponseHours: v })} />
          <label className="flex items-center gap-2 text-[12px] text-slate-300">
            <input type="checkbox" checked={draft.deemedNoticeEnabled} onChange={(e) => setDraft({ ...draft, deemedNoticeEnabled: e.target.checked })} />
            {isAr ? 'تفعيل الإبلاغ الحُكمي (deemed notice) حيث يُسمح تعاقدياً' : 'Enable deemed-notice (where contractually approved)'}
          </label>
          <NumberField label={isAr ? 'مهلة الإبلاغ الحُكمي (ساعات)' : 'Deemed-served after (hours)'} value={draft.deemedNoticeHours} min={1} max={2160} onChange={(v) => setDraft({ ...draft, deemedNoticeHours: v })} />
        </div>
      </Card>

      <Card title={isAr ? 'مصفوفة التصعيد' : 'Escalation matrix'} hint={isAr ? 'يُصعَّد الإشعار غير المفتوح حسب المستوى والمدة والدور المستهدف.' : 'An unopened notice escalates by tier: after N hours → to role.'}>
        <div className="space-y-2">
          {draft.escalationLevels.map((t, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2">
              <Pill tone="slate">{isAr ? `مستوى ${t.level}` : `L${t.level}`}</Pill>
              <span className="text-[11px] text-slate-400">{isAr ? 'بعد' : 'after'}</span>
              <input type="number" value={t.afterHours} min={1} className="w-20 rounded-lg border border-slate-700 bg-slate-900 px-2 py-1 text-sm text-slate-100 tabular-nums" dir="ltr"
                onChange={(e) => { const v = [...draft.escalationLevels]; v[i] = { ...t, afterHours: Number(e.target.value) || t.afterHours }; setDraft({ ...draft, escalationLevels: v }); }} />
              <span className="text-[11px] text-slate-400">{isAr ? 'ساعة → إلى' : 'h → to'}</span>
              <select value={t.toRole} className="rounded-lg border border-slate-700 bg-slate-900 px-2 py-1 text-sm text-slate-100" dir="ltr"
                onChange={(e) => { const v = [...draft.escalationLevels]; v[i] = { ...t, toRole: e.target.value }; setDraft({ ...draft, escalationLevels: v }); }}>
                {ROLE_OPTIONS.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
              <Button variant="ghost" size="sm" onClick={() => setDraft({ ...draft, escalationLevels: draft.escalationLevels.filter((_, j) => j !== i) })}>✕</Button>
            </div>
          ))}
          <Button variant="ghost" size="sm" onClick={() => setDraft({ ...draft, escalationLevels: [...draft.escalationLevels, { level: draft.escalationLevels.length + 1, afterHours: 24, toRole: 'pmo' }] })}>
            {isAr ? '+ مستوى تصعيد' : '+ Add tier'}
          </Button>
        </div>
      </Card>

      <Card title={isAr ? 'التصنيفات الحاكمة' : 'Governing categories'} hint={isAr ? 'حدّد أي التصنيفات تتطلّب إقراراً أو رداً أو تُعدّ حرجة.' : 'Choose which categories require acknowledgement, a response, or are critical.'}>
        <CatGroup label={isAr ? 'تتطلّب إقراراً' : 'Require acknowledgement'} selected={draft.requiredAckCategories} onToggle={(c) => toggleCat('requiredAckCategories', c)} />
        <CatGroup label={isAr ? 'تتطلّب رداً' : 'Require a response'} selected={draft.requiredResponseCategories} onToggle={(c) => toggleCat('requiredResponseCategories', c)} />
        <CatGroup label={isAr ? 'حرجة' : 'Critical'} selected={draft.criticalCategories} onToggle={(c) => toggleCat('criticalCategories', c)} />
      </Card>

      <Card title={isAr ? 'القنوات والمعتمدون' : 'Channels & approved parties'}>
        <div className="grid gap-4">
          <CsvField label={isAr ? 'القنوات الرسمية' : 'Official channels'} value={draft.channels} onChange={(v) => setDraft({ ...draft, channels: v })} />
          <CsvField label={isAr ? 'الأدوار المعتمدة للاستلام (فارغ = الكل)' : 'Approved recipient roles (empty = any)'} value={draft.approvedRoles} onChange={(v) => setDraft({ ...draft, approvedRoles: v })} />
          <CsvField label={isAr ? 'البريد المعتمد للاستلام (فارغ = الكل)' : 'Approved recipient emails (empty = any)'} value={draft.approvedRecipients} onChange={(v) => setDraft({ ...draft, approvedRecipients: v })} />
        </div>
      </Card>

      <p className="text-[11px] text-slate-500">
        {state.updatedAt ? (isAr ? `آخر حفظ: ${state.authoredBy ?? ''} · ${new Date(state.updatedAt).toLocaleString()}` : `Last saved by ${state.authoredBy ?? '—'} · ${new Date(state.updatedAt).toLocaleString()}`) : (isAr ? 'القيم الافتراضية مطبّقة — احفظ لإنشاء نسخة خاصة بشركتك.' : 'Defaults applied — save to author your company’s own version.')}
      </p>
    </div>
  );
}

function NumberField({ label, value, min, max, onChange }: { label: string; value: number; min?: number; max?: number; onChange: (v: number) => void }) {
  return (
    <label className="block">
      <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">{label}</span>
      <input type="number" value={Number.isFinite(value) ? value : ''} min={min} max={max} dir="ltr"
        onChange={(e) => { const n = Number(e.target.value); if (Number.isFinite(n)) onChange(n); }}
        className="mt-1 block w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 tabular-nums outline-none focus:border-sky-500/60 focus:ring-2 focus:ring-sky-500/30" />
    </label>
  );
}

function CatGroup({ label, selected, onToggle }: { label: string; selected: string[]; onToggle: (c: string) => void }) {
  return (
    <div className="mb-3">
      <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">{label}</p>
      <div className="flex flex-wrap gap-1.5">
        {CATEGORIES.map((c) => (
          <button key={c} type="button" onClick={() => onToggle(c)}
            className={`rounded-full border px-2.5 py-1 text-[11px] transition ${selected.includes(c) ? 'border-sky-400/60 bg-sky-500/15 text-sky-100' : 'border-white/10 bg-white/[0.02] text-slate-400 hover:border-white/20'}`}>
            {c}
          </button>
        ))}
      </div>
    </div>
  );
}

function CsvField({ label, value, onChange }: { label: string; value: string[]; onChange: (v: string[]) => void }) {
  return (
    <label className="block">
      <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">{label}</span>
      <input value={value.join(', ')} dir="ltr"
        onChange={(e) => onChange(e.target.value.split(',').map((s) => s.trim()).filter(Boolean))}
        className="mt-1 block w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-sky-500/60 focus:ring-2 focus:ring-sky-500/30" />
    </label>
  );
}

'use client';

/**
 * Governance Configuration Center (/admin/governance) — the single screen where
 * a policy admin tunes the governance engine and the AI agent fleet.
 *
 * Two surfaces:
 *  1. Governance config — escalation window, auto-evaluate-on-ingest, dual
 *     approval, and the three status-roll-up weights (must sum to 1). Persisted
 *     through GET/POST /admin/governance-config (canEditPolicy). On save the
 *     backend also mirrors `governance.escalateAfterDays` as its own setting.
 *  2. AI Agents — every registered agent from /agents/config with an enabled
 *     toggle + a model-tier select, saved per row via POST /agents/:key/config
 *     (canManageRoles). The toggle/select are visually gated when the user
 *     lacks canManageRoles, mirroring how the other admin pages gate edits.
 *
 * Page gate is canEditPolicy (governance config is the primary purpose). The
 * agents table is read-only for users with canEditPolicy but not canManageRoles.
 */

import { useCallback, useEffect, useState } from 'react';

import { AuthGate } from '../../../components/AuthGate';
import { IconCheck, IconRefresh, IconShield, IconSparkles, IconX } from '../../../components/Icons';
import { useToast } from '../../../components/ToastProvider';
import { Button, Card, ErrorBanner, PageHeader, Pill } from '../../../components/ui';
import { api } from '../../../lib/api';
import { CAPABILITIES } from '../../../lib/capabilities';
import { useI18n } from '../../../lib/i18n';
import { useMe } from '../../../lib/me-context';

// ── Types mirrored from the backend (defined locally per agent boundaries) ──

interface StatusWeights {
  alerts: number;
  escalations: number;
  confidence: number;
}
interface GovernanceConfig {
  escalateAfterDays: number;
  autoEvaluateOnIngest: boolean;
  dualApprovalForCritical: boolean;
  statusWeights: StatusWeights;
}
interface GovernanceConfigResponse {
  config: GovernanceConfig;
  configured: boolean;
  updatedBy: string | null;
  updatedAt: string | null;
}

type ModelTier = 'default' | 'claude-haiku' | 'claude-sonnet' | 'claude-opus';
interface AgentConfig {
  enabled: boolean;
  modelTier: ModelTier;
}
interface EnrichedAgentDescriptor {
  agentKey: string;
  layer: string;
  objective: string;
  inputs: string[];
  outputs: string[];
  ruleReferences: string[];
  personaSlug?: string;
  config: AgentConfig;
}
interface AgentConfigListResponse {
  agents: EnrichedAgentDescriptor[];
  allowedModelTiers: string[];
}

// Model-tier labels. Tier names that are Claude product names stay in English
// across both languages; only the "Platform default" wording is localized.
const TIER_LABEL: Record<string, string> = {
  default: 'Platform default',
  'claude-haiku': 'Claude Haiku',
  'claude-sonnet': 'Claude Sonnet',
  'claude-opus': 'Claude Opus',
};
const TIER_LABEL_AR: Record<string, string> = {
  default: 'الافتراضي للمنصّة',
  'claude-haiku': 'Claude Haiku',
  'claude-sonnet': 'Claude Sonnet',
  'claude-opus': 'Claude Opus',
};
const tierLabel = (tier: string, lang: 'en' | 'ar'): string =>
  (lang === 'ar' ? TIER_LABEL_AR[tier] : TIER_LABEL[tier]) ?? TIER_LABEL[tier] ?? tier;

// Layer labels. The L0–L8 layer codes stay in English (they are identifiers);
// the descriptive suffix is localized to the governance domain.
const LAYER_LABEL: Record<string, string> = {
  l0_knowledge: 'L0 · Knowledge',
  l1_data_collection: 'L1 · Data',
  l2_validation: 'L2 · Validation',
  l3_compliance: 'L3 · Compliance',
  l4_analytics: 'L4 · Analytics',
  l5_risk: 'L5 · Risk',
  l6_claims: 'L6 · Claims',
  l7_executive: 'L7 · Executive',
  l8_sigma_governance: 'L8 · Sigma Governance',
};
const LAYER_LABEL_AR: Record<string, string> = {
  l0_knowledge: 'L0 · المعرفة',
  l1_data_collection: 'L1 · البيانات',
  l2_validation: 'L2 · التحقق',
  l3_compliance: 'L3 · الامتثال',
  l4_analytics: 'L4 · التحليلات',
  l5_risk: 'L5 · المخاطر',
  l6_claims: 'L6 · المطالبات',
  l7_executive: 'L7 · التنفيذي',
  l8_sigma_governance: 'L8 · حوكمة سيجما',
};
const layerLabel = (layer: string, lang: 'en' | 'ar'): string =>
  (lang === 'ar' ? LAYER_LABEL_AR[layer] : LAYER_LABEL[layer]) ?? LAYER_LABEL[layer] ?? layer;

export default function GovernanceConfigRoute() {
  return (
    <AuthGate capability="canEditPolicy" surface="Governance Config">
      <GovernanceConfigPage />
    </AuthGate>
  );
}

function GovernanceConfigPage() {
  const { me } = useMe();
  const { lang } = useI18n();
  const canManageRoles = !!me?.user && CAPABILITIES[me.user.role].canManageRoles;
  const updatedBy = me?.user?.displayName ?? null;

  return (
    <div className="space-y-7 animate-[fade-in-up_240ms_ease-out]">
      <PageHeader
        eyebrow={lang === 'ar' ? 'الإدارة · الحوكمة' : 'Admin · Governance'}
        title={lang === 'ar' ? 'مركز إعداد الحوكمة' : 'Governance Configuration Center'}
        description={
          lang === 'ar'
            ? 'اضبط محرّك الحوكمة (نافذة التصعيد، التقييم التلقائي، الاعتماد المزدوج، أوزان تجميع الحالة) وأسطول وكلاء الذكاء الاصطناعي (تفعيل/تعطيل + فئة النموذج). تسري التغييرات في التشغيل التالي — دون الحاجة لإعادة تشغيل.'
            : 'Tune the governance engine (escalation window, auto-evaluation, dual approval, status-roll-up weights) and the AI agent fleet (enable/disable + model tier). Changes apply at the next run — no restart required.'
        }
      />

      <GovernanceConfigForm updatedBy={updatedBy} />

      <AgentsConfigTable canManageRoles={canManageRoles} updatedBy={updatedBy} />
    </div>
  );
}

// ───────────────────────── governance config form ─────────────────────────

function GovernanceConfigForm({ updatedBy }: { updatedBy: string | null }) {
  const toast = useToast();
  const { lang } = useI18n();
  const [state, setState] = useState<GovernanceConfigResponse | null>(null);
  const [draft, setDraft] = useState<GovernanceConfig | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setErr(null);
    try {
      const r = await api<GovernanceConfigResponse>('/admin/governance-config');
      setState(r);
      setDraft(r.config);
    } catch (e) {
      setErr((e as Error).message);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const weightSum = draft
    ? draft.statusWeights.alerts + draft.statusWeights.escalations + draft.statusWeights.confidence
    : 0;
  const weightsValid = Math.abs(weightSum - 1) <= 0.01;

  const save = async () => {
    if (!draft) return;
    if (!weightsValid) {
      toast.error(
        lang === 'ar' ? 'يجب أن يكون مجموع الأوزان 1' : 'Weights must sum to 1',
        lang === 'ar' ? `المجموع الحالي ${weightSum.toFixed(3)}.` : `Current sum is ${weightSum.toFixed(3)}.`,
      );
      return;
    }
    setSaving(true);
    try {
      const r = await api<GovernanceConfigResponse>('/admin/governance-config', {
        method: 'POST',
        body: JSON.stringify({ ...draft, updatedBy }),
      });
      setState(r);
      setDraft(r.config);
      toast.success(
        lang === 'ar' ? 'تم حفظ إعداد الحوكمة' : 'Governance config saved',
        lang === 'ar' ? 'تمّت مزامنة نافذة التصعيد مع دورة الفحص.' : 'Escalation window mirrored to the sweep.',
      );
    } catch (e) {
      toast.error(lang === 'ar' ? 'فشل الحفظ' : 'Save failed', (e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  if (err) return <ErrorBanner message={err} />;
  if (!draft || !state) {
    return (
      <Card>
        <div className="h-44 animate-pulse rounded bg-slate-800/40" />
      </Card>
    );
  }

  return (
    <Card
      title={lang === 'ar' ? 'محرّك الحوكمة' : 'Governance engine'}
      hint={
        lang === 'ar'
          ? 'الإعدادات الحتمية التي تحكم التصعيد وتقييم القواعد وتجميع الحالة بمستوياته الأربعة.'
          : 'The deterministic settings that drive escalation, rule evaluation and the 4-tier status roll-up.'
      }
      actions={
        <span className="flex items-center gap-2">
          {state.configured ? (
            <Pill tone="emerald">
              <IconCheck className="me-1 h-3 w-3" /> {lang === 'ar' ? 'مُهيّأ' : 'Configured'}
            </Pill>
          ) : (
            <Pill tone="amber">
              <IconX className="me-1 h-3 w-3" /> {lang === 'ar' ? 'الإعدادات الافتراضية سارية' : 'Defaults in effect'}
            </Pill>
          )}
        </span>
      }
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <NumberField
          label={lang === 'ar' ? 'التصعيد بعد (أيام)' : 'Escalate after (days)'}
          hint={
            lang === 'ar'
              ? 'عدد الأيام التي ينتظرها البند الحرج غير المُستلَم قبل التصعيد التلقائي. تُزامَن مع governance.escalateAfterDays عند الحفظ.'
              : 'Days an unacknowledged critical item waits before auto-escalation. Mirrored to governance.escalateAfterDays on save.'
          }
          value={draft.escalateAfterDays}
          min={1}
          max={365}
          onChange={(v) => setDraft({ ...draft, escalateAfterDays: v })}
        />
        <div className="flex flex-col justify-end gap-3">
          <ToggleField
            label={lang === 'ar' ? 'تقييم القواعد تلقائياً عند الإدخال' : 'Auto-evaluate rules on ingest'}
            hint={
              lang === 'ar'
                ? 'تشغيل تقييم القواعد تلقائياً بعد كل عملية إدخال ناجحة.'
                : 'Run rule evaluation automatically after every successful ingest.'
            }
            checked={draft.autoEvaluateOnIngest}
            onChange={(v) => setDraft({ ...draft, autoEvaluateOnIngest: v })}
          />
          <ToggleField
            label={lang === 'ar' ? 'اعتماد مزدوج للقرارات الحرجة' : 'Dual approval for critical decisions'}
            hint={
              lang === 'ar'
                ? 'قرارات الحوكمة الحرجة تتطلّب اعتماد جهتين مختلفتين.'
                : 'Critical governance decisions require two distinct approvers.'
            }
            checked={draft.dualApprovalForCritical}
            onChange={(v) => setDraft({ ...draft, dualApprovalForCritical: v })}
          />
        </div>
      </div>

      <div className="mt-5 rounded-xl border border-slate-800 bg-slate-900/50 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
            {lang === 'ar' ? 'أوزان تجميع الحالة' : 'Status roll-up weights'}
          </p>
          <Pill tone={weightsValid ? 'emerald' : 'rose'}>
            {lang === 'ar' ? 'المجموع' : 'sum'} {weightSum.toFixed(2)}
          </Pill>
        </div>
        <p className="mt-1 text-xs text-slate-400">
          {lang === 'ar'
            ? 'الأوزان النسبية لمكوّنات حالة الحوكمة. يجب أن تشكّل توزيعاً كاملاً (المجموع = 1 ± 0.01).'
            : 'Relative weights of the governance-status components. They must describe a full distribution (sum = 1 ± 0.01).'}
        </p>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
          {(['alerts', 'escalations', 'confidence'] as const).map((k) => {
            const WEIGHT_LABEL_AR: Record<string, string> = {
              alerts: 'التنبيهات',
              escalations: 'التصعيدات',
              confidence: 'الثقة',
            };
            return (
              <NumberField
                key={k}
                label={lang === 'ar' ? WEIGHT_LABEL_AR[k] : k[0].toUpperCase() + k.slice(1)}
                value={draft.statusWeights[k]}
                min={0}
                max={1}
                step={0.05}
                onChange={(v) =>
                  setDraft({ ...draft, statusWeights: { ...draft.statusWeights, [k]: v } })
                }
              />
            );
          })}
        </div>
        {!weightsValid && (
          <p className="mt-2 text-xs text-rose-300">
            {lang === 'ar'
              ? 'عدّل الأوزان الثلاثة بحيث يصبح مجموعها 1 قبل الحفظ.'
              : 'Adjust the three weights so they sum to 1 before saving.'}
          </p>
        )}
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <Button variant="primary" size="sm" onClick={save} disabled={saving || !weightsValid}>
          <IconShield className="h-3.5 w-3.5" />
          {saving
            ? lang === 'ar' ? 'جاري الحفظ…' : 'Saving…'
            : lang === 'ar' ? 'حفظ إعداد الحوكمة' : 'Save governance config'}
        </Button>
        <Button variant="ghost" size="sm" onClick={() => void load()}>
          <IconRefresh className="h-3.5 w-3.5" /> {lang === 'ar' ? 'إعادة تعيين' : 'Reset'}
        </Button>
        {state.updatedAt && (
          <span className="text-xs text-slate-400">
            {lang === 'ar' ? 'آخر حفظ بواسطة' : 'Last saved by'}{' '}
            <span className="font-medium text-slate-200">
              {state.updatedBy ?? (lang === 'ar' ? 'غير معروف' : 'unknown')}
            </span>
            <span className="mx-1.5 text-slate-500">·</span>
            <span dir="ltr">{new Date(state.updatedAt).toLocaleString()}</span>
          </span>
        )}
      </div>
    </Card>
  );
}

// ───────────────────────── AI agents config table ─────────────────────────

function AgentsConfigTable({
  canManageRoles,
  updatedBy,
}: {
  canManageRoles: boolean;
  updatedBy: string | null;
}) {
  const toast = useToast();
  const { lang } = useI18n();
  const [agents, setAgents] = useState<EnrichedAgentDescriptor[] | null>(null);
  const [tiers, setTiers] = useState<string[]>(['default', 'claude-haiku', 'claude-sonnet', 'claude-opus']);
  const [err, setErr] = useState<string | null>(null);
  // Per-row pending edits keyed by agentKey.
  const [drafts, setDrafts] = useState<Record<string, AgentConfig>>({});
  const [savingKey, setSavingKey] = useState<string | null>(null);

  const load = useCallback(async () => {
    setErr(null);
    try {
      const r = await api<AgentConfigListResponse>('/agents/config');
      r.agents.sort((a, b) => a.layer.localeCompare(b.layer) || a.agentKey.localeCompare(b.agentKey));
      setAgents(r.agents);
      if (r.allowedModelTiers?.length) setTiers(r.allowedModelTiers);
      setDrafts(Object.fromEntries(r.agents.map((a) => [a.agentKey, { ...a.config }])));
    } catch (e) {
      setErr((e as Error).message);
      setAgents([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const setDraft = (key: string, patch: Partial<AgentConfig>) =>
    setDrafts((d) => ({ ...d, [key]: { ...d[key], ...patch } }));

  const dirty = (a: EnrichedAgentDescriptor): boolean => {
    const d = drafts[a.agentKey];
    return !!d && (d.enabled !== a.config.enabled || d.modelTier !== a.config.modelTier);
  };

  const save = async (a: EnrichedAgentDescriptor) => {
    const d = drafts[a.agentKey];
    if (!d) return;
    setSavingKey(a.agentKey);
    try {
      await api<EnrichedAgentDescriptor>(`/agents/${encodeURIComponent(a.agentKey)}/config`, {
        method: 'POST',
        body: JSON.stringify({ enabled: d.enabled, modelTier: d.modelTier, updatedBy }),
      });
      toast.success(
        lang === 'ar' ? 'تم تحديث الوكيل' : 'Agent updated',
        lang === 'ar'
          ? `${a.agentKey} ← ${d.enabled ? 'مُفعَّل' : 'مُعطَّل'}، ${tierLabel(d.modelTier, lang)}.`
          : `${a.agentKey} → ${d.enabled ? 'enabled' : 'disabled'}, ${tierLabel(d.modelTier, lang)}.`,
      );
      await load();
    } catch (e) {
      toast.error(lang === 'ar' ? 'فشل الحفظ' : 'Save failed', (e as Error).message);
    } finally {
      setSavingKey(null);
    }
  };

  return (
    <Card
      title={lang === 'ar' ? 'وكلاء الذكاء الاصطناعي' : 'AI Agents'}
      hint={
        lang === 'ar'
          ? 'كل وكيل مُسجَّل من L0 إلى L8. تعطيل الوكيل يجعل المنسّق ومسار التشغيل الفردي يرفضانه (409)؛ تثبيت فئة نموذج يتجاوز الإعداد الافتراضي للمنصّة.'
          : 'Every registered L0–L8 agent. Disable an agent to make the orchestrator and single-run route refuse it (409); pin a model tier to override the platform default.'
      }
      actions={
        <Button variant="ghost" size="sm" onClick={() => void load()}>
          <IconRefresh className="h-3.5 w-3.5" /> {lang === 'ar' ? 'تحديث' : 'Refresh'}
        </Button>
      }
    >
      <ErrorBanner message={err} />

      {!canManageRoles && (
        <p className="mb-3 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-200">
          {lang === 'ar' ? (
            <>
              لا يتضمّن دورك صلاحية <code className="font-mono">canManageRoles</code> — أزرار تبديل
              الوكلاء أدناه للعرض فقط. تواصل مع مسؤول الحوكمة لتغيير تفعيل الوكيل أو فئته.
            </>
          ) : (
            <>
              Your role does not include <code className="font-mono">canManageRoles</code> — the agent
              toggles below are read-only. Contact a governance admin to change agent enablement or tier.
            </>
          )}
        </p>
      )}

      {agents === null ? (
        <div className="h-32 animate-pulse rounded bg-slate-800/40" />
      ) : agents.length === 0 ? (
        <p className="text-sm text-slate-400">
          {lang === 'ar'
            ? 'لا توجد وكلاء مُسجَّلون بعد. يظهرون هنا تلقائياً عند تسجيل كل طبقة.'
            : 'No agents are registered yet. They appear here automatically as each layer registers.'}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-800">
          <table className="w-full text-sm">
            <thead className="bg-slate-900/70 text-[10px] uppercase tracking-wider text-slate-400">
              <tr>
                <th className="px-3 py-2 text-start">{lang === 'ar' ? 'الوكيل' : 'Agent'}</th>
                <th className="px-3 py-2 text-start">{lang === 'ar' ? 'الطبقة' : 'Layer'}</th>
                <th className="px-3 py-2 text-start">{lang === 'ar' ? 'الهدف' : 'Objective'}</th>
                <th className="px-3 py-2 text-center">{lang === 'ar' ? 'مُفعَّل' : 'Enabled'}</th>
                <th className="px-3 py-2 text-start">{lang === 'ar' ? 'فئة النموذج' : 'Model tier'}</th>
                <th className="px-3 py-2 text-end">{lang === 'ar' ? 'الإجراء' : 'Action'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80">
              {agents.map((a) => {
                const d = drafts[a.agentKey] ?? a.config;
                return (
                  <tr key={a.agentKey} className="align-top">
                    <td className="px-3 py-2.5">
                      <span className="font-mono text-xs text-slate-200" dir="ltr">{a.agentKey}</span>
                      {a.personaSlug && (
                        <span className="mt-0.5 block font-mono text-[10px] text-slate-500" dir="ltr">
                          persona: {a.personaSlug}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      <Pill tone="violet">{layerLabel(a.layer, lang)}</Pill>
                    </td>
                    <td className="px-3 py-2.5 max-w-xs">
                      <span className="line-clamp-2 text-xs text-slate-300" dir="auto">
                        {a.objective}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <ToggleSwitch
                        checked={d.enabled}
                        disabled={!canManageRoles}
                        onChange={(v) => setDraft(a.agentKey, { enabled: v })}
                      />
                    </td>
                    <td className="px-3 py-2.5">
                      <select
                        value={d.modelTier}
                        disabled={!canManageRoles}
                        onChange={(e) => setDraft(a.agentKey, { modelTier: e.target.value as ModelTier })}
                        className="rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs text-slate-100 outline-none focus:border-sky-500/60 disabled:opacity-50"
                        dir="ltr"
                      >
                        {tiers.map((t) => (
                          <option key={t} value={t}>
                            {tierLabel(t, lang)}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-2.5 text-end">
                      <Button
                        variant="primary"
                        size="sm"
                        disabled={!canManageRoles || !dirty(a) || savingKey === a.agentKey}
                        onClick={() => void save(a)}
                      >
                        {savingKey === a.agentKey
                          ? lang === 'ar' ? 'جاري الحفظ…' : 'Saving…'
                          : lang === 'ar' ? 'حفظ' : 'Save'}
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

// ───────────────────────── small field primitives ─────────────────────────

function NumberField({
  label,
  hint,
  value,
  min,
  max,
  step = 1,
  onChange,
}: {
  label: string;
  hint?: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="block">
      <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">{label}</span>
      <input
        type="number"
        value={Number.isFinite(value) ? value : ''}
        min={min}
        max={max}
        step={step}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (Number.isFinite(n)) onChange(n);
        }}
        className="mt-1 block w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 tabular-nums outline-none focus:border-sky-500/60 focus:ring-2 focus:ring-sky-500/30"
        dir="ltr"
      />
      {hint && <span className="mt-1 block text-[11px] leading-snug text-slate-500">{hint}</span>}
    </label>
  );
}

function ToggleField({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-slate-800 bg-slate-900/50 px-3 py-2.5">
      <ToggleSwitch checked={checked} onChange={onChange} />
      <div className="min-w-0">
        <p className="text-xs font-medium text-slate-200">{label}</p>
        {hint && <p className="mt-0.5 text-[11px] leading-snug text-slate-500">{hint}</p>}
      </div>
    </div>
  );
}

function ToggleSwitch({
  checked,
  disabled,
  onChange,
}: {
  checked: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition ${
        checked ? 'bg-emerald-500/80' : 'bg-slate-700'
      } ${disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-slate-50 transition ${
          checked ? 'translate-x-4' : 'translate-x-0.5'
        }`}
      />
    </button>
  );
}

'use client';

/**
 * Admin Settings — runtime-configurable platform settings.
 *
 * The current entries are:
 *  - Anthropic API key  (the AI brain of the platform; without it Claude
 *    calls fall back to deterministic-only).
 *  - Slack webhook URL  (optional outbound notification channel)
 *  - Teams webhook URL  (optional outbound notification channel)
 *  - Email SMTP URL    (optional outbound notification channel)
 *
 * Values are AES-256-GCM-encrypted server-side; the API never returns
 * the plaintext. The UI shows only `configured: true|false`, the
 * fingerprint (first 8 + last 4 chars), and the audit metadata.
 */

import { useCallback, useEffect, useState } from 'react';

import { api } from '../../../lib/api';
import { AuthGate } from '../../../components/AuthGate';
import { useI18n } from '../../../lib/i18n';
import { useMe } from '../../../lib/me-context';
import { useToast } from '../../../components/ToastProvider';
import { CAPABILITIES } from '../../../lib/capabilities';
import { Button, Card, ErrorBanner, PageHeader, Pill } from '../../../components/ui';
import { IconCheck, IconRefresh, IconShield, IconSparkles, IconX } from '../../../components/Icons';

interface SettingDescriptor {
  settingKey: string;
  configured: boolean;
  fingerprint: string | null;
  updatedBy: string | null;
  updatedAt: string | null;
}

interface ClaudeStatus {
  enabled: boolean;
  keySource: 'db' | 'env' | 'none';
  defaultModel: string;
  defaultTier: string;
}

interface Definition {
  key: string;
  title: string;
  titleAr: string;
  description: string;
  descriptionAr: string;
  placeholder: string;
  badge?: 'critical';
  testHint?: string;
}

const DEFS: Definition[] = [
  {
    key: 'anthropic.api_key',
    title: 'Anthropic API key',
    titleAr: 'مفتاح واجهة Anthropic API',
    description:
      'The Claude API key that powers every persona — Letter drafter, Monthly narrator, Clash solver, etc. Without it the platform falls back to deterministic-only output (no LLM rewriting). Get a key from console.anthropic.com.',
    descriptionAr:
      'مفتاح Claude API الذي يُشغّل كل شخصية خبيرة — محرّر الخطابات، راوي التقرير الشهري، حلّال التعارضات، وغيرها. بدونه تعود المنصّة إلى المخرجات الحتمية فقط (دون إعادة صياغة بالنموذج اللغوي). احصل على مفتاح من console.anthropic.com.',
    placeholder: 'sk-ant-…',
    badge: 'critical',
    testHint: 'sk-ant-api03-… (96 chars typical)',
  },
  {
    key: 'integrations.slack_webhook',
    title: 'Slack webhook URL',
    titleAr: 'رابط Slack webhook',
    description:
      'Incoming-webhook URL the platform posts alert notifications to. Optional — when blank, alerts stay in-app only.',
    descriptionAr:
      'رابط الـ webhook الوارد الذي تنشر إليه المنصّة إشعارات التنبيهات. اختياري — عند تركه فارغاً تبقى التنبيهات داخل التطبيق فقط.',
    placeholder: 'https://hooks.slack.com/services/T…/B…/…',
  },
  {
    key: 'integrations.teams_webhook',
    title: 'Microsoft Teams webhook URL',
    titleAr: 'رابط Microsoft Teams webhook',
    description: 'Incoming-webhook URL the platform posts alert notifications to. Optional.',
    descriptionAr: 'رابط الـ webhook الوارد الذي تنشر إليه المنصّة إشعارات التنبيهات. اختياري.',
    placeholder: 'https://outlook.office.com/webhook/…',
  },
  {
    key: 'integrations.email_smtp',
    title: 'Outbound email SMTP',
    titleAr: 'بريد SMTP الصادر',
    description:
      'SMTP connection URL for notifications (governance decisions, letter drafts). Format: smtps://user:pass@host:465.',
    descriptionAr:
      'رابط اتصال SMTP للإشعارات (قرارات الحوكمة، مسوّدات الخطابات). الصيغة: smtps://user:pass@host:465.',
    placeholder: 'smtps://user:pass@host:465',
  },
  {
    key: 'autodesk.aps_client_id',
    title: 'Autodesk APS — Client ID',
    titleAr: 'Autodesk APS — معرّف العميل',
    description:
      'Client ID of your Autodesk Platform Services app. Powers the live BIM integration — translating Revit/IFC/Navisworks models and extracting element quantities into the Quantity-Survey pipeline. Create a free app at aps.autodesk.com/myapps. Without it, BIM stays on the local IFC parser.',
    descriptionAr:
      'معرّف العميل (Client ID) لتطبيق Autodesk Platform Services الخاص بك. يُشغّل التكامل الحيّ مع BIM — تحويل نماذج Revit/IFC/Navisworks واستخراج كميات العناصر إلى مسار حصر الكميات. أنشئ تطبيقاً مجانياً من aps.autodesk.com/myapps. بدونه يبقى BIM على المُحلّل المحلّي لملفات IFC.',
    placeholder: 'your-aps-client-id',
    badge: 'critical',
  },
  {
    key: 'autodesk.aps_client_secret',
    title: 'Autodesk APS — Client Secret',
    titleAr: 'Autodesk APS — السرّ',
    description:
      'Client Secret paired with the APS Client ID above (2-legged OAuth). Encrypted at rest; never returned by the API.',
    descriptionAr:
      'السرّ (Client Secret) المقترن بمعرّف عميل APS أعلاه (مصادقة OAuth ثنائية). يُشفَّر عند التخزين ولا تُعيده الواجهة أبداً.',
    placeholder: '••••••••••••••••',
    badge: 'critical',
  },
  {
    key: 'primavera.p6_base_url',
    title: 'Primavera P6 — EPPM REST URL',
    titleAr: 'Primavera P6 — رابط EPPM REST',
    description:
      'Root URL of your Primavera P6 EPPM REST API (e.g. https://host/p6ws/restapi). Enables the LIVE schedule pull in addition to .xer/.xml uploads. Get it from your P6 administrator.',
    descriptionAr:
      'الرابط الجذري لواجهة Primavera P6 EPPM REST (مثل https://host/p6ws/restapi). يُفعّل السحب الحيّ للجداول الزمنية إضافةً إلى رفع ملفات ‎.xer/.xml. احصل عليه من مسؤول P6 لديك.',
    placeholder: 'https://p6.example.com/p6ws/restapi',
    badge: 'critical',
  },
  {
    key: 'primavera.p6_database',
    title: 'Primavera P6 — Database name',
    titleAr: 'Primavera P6 — اسم قاعدة البيانات',
    description:
      'The P6 database instance the REST API connects to (the value your P6 login screen lists). Optional on single-database servers.',
    descriptionAr:
      'نسخة قاعدة بيانات P6 التي تتصل بها واجهة REST (القيمة التي تظهر في شاشة تسجيل الدخول إلى P6). اختيارية على الخوادم ذات قاعدة بيانات واحدة.',
    placeholder: 'e.g. PMDB or 1',
  },
  {
    key: 'primavera.p6_username',
    title: 'Primavera P6 — Username',
    titleAr: 'Primavera P6 — اسم المستخدم',
    description:
      'A P6 user with read access to the projects to be governed. A dedicated read-only service account is recommended.',
    descriptionAr:
      'مستخدم P6 له صلاحية قراءة المشاريع المطلوب حوكمتها. يُفضّل حساب خدمة مخصّص بصلاحية قراءة فقط.',
    placeholder: 'p6-service-account',
  },
  {
    key: 'primavera.p6_password',
    title: 'Primavera P6 — Password',
    titleAr: 'Primavera P6 — كلمة المرور',
    description:
      'Password for the P6 user above. Encrypted at rest with AES-256-GCM; never returned by the API.',
    descriptionAr:
      'كلمة مرور مستخدم P6 أعلاه. تُشفَّر عند التخزين بخوارزمية AES-256-GCM ولا تُعيدها الواجهة أبداً.',
    placeholder: '••••••••••••',
    badge: 'critical',
  },
];

export default function AdminSettingsRoute() {
  return (
    <AuthGate surface="Admin settings">
      <AdminSettingsPage />
    </AuthGate>
  );
}

function AdminSettingsPage() {
  const { me } = useMe();
  const toast = useToast();
  const { lang } = useI18n();
  const canEdit = !!me?.user && CAPABILITIES[me.user.role].canEditPolicy;

  const [catalogue, setCatalogue] = useState<SettingDescriptor[] | null>(null);
  const [claudeStatus, setClaudeStatus] = useState<ClaudeStatus | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setErr(null);
    try {
      const [r, status] = await Promise.all([
        api<{ catalogue: SettingDescriptor[] }>('/admin/settings'),
        api<ClaudeStatus>('/admin/claude/status').catch(() => null),
      ]);
      setCatalogue(r.catalogue);
      setClaudeStatus(status);
    } catch (e) {
      setCatalogue([]);
      setErr((e as Error).message);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const onSave = useCallback(
    async (key: string, value: string): Promise<void> => {
      try {
        await api<SettingDescriptor>(`/admin/settings/${encodeURIComponent(key)}`, {
          method: 'PUT',
          body: JSON.stringify({ value, updatedBy: me?.user?.displayName ?? null }),
        });
        toast.success(
          lang === 'ar' ? 'تم الحفظ' : 'Saved',
          lang === 'ar' ? `تم تحديث ${key}.` : `${key} updated.`,
        );
        await refresh();
      } catch (e) {
        toast.error(lang === 'ar' ? 'فشل الحفظ' : 'Save failed', (e as Error).message);
      }
    },
    [me?.user?.displayName, refresh, toast, lang],
  );

  const onClear = useCallback(
    async (key: string): Promise<void> => {
      try {
        await api<SettingDescriptor>(`/admin/settings/${encodeURIComponent(key)}`, {
          method: 'DELETE',
        });
        toast.success(
          lang === 'ar' ? 'تم المسح' : 'Cleared',
          lang === 'ar' ? `تمت إعادة تعيين ${key}.` : `${key} reset.`,
        );
        await refresh();
      } catch (e) {
        toast.error(lang === 'ar' ? 'فشل المسح' : 'Clear failed', (e as Error).message);
      }
    },
    [refresh, toast, lang],
  );

  return (
    <div className="space-y-6 animate-[fade-in-up_240ms_ease-out]">
      <PageHeader
        eyebrow={lang === 'ar' ? 'الإدارة · الإعدادات المتقدّمة' : 'Admin · Advanced settings'}
        title={lang === 'ar' ? 'إعدادات المنصّة' : 'Platform Settings'}
        description={
          lang === 'ar'
            ? 'الأسرار وروابط التكامل القابلة للإعداد أثناء التشغيل. تُشفَّر القيم بخوارزمية AES-256-GCM على الخادم. لا تعرض الواجهة النص الصريح أبداً — فقط بصمة وبيانات تدقيق.'
            : 'Runtime-configurable secrets and integration URLs. Values are AES-256-GCM-encrypted server-side. The UI never displays the plaintext — only a fingerprint and audit metadata.'
        }
      />

      <ErrorBanner message={err} />

      {!canEdit && (
        <Card>
          <p className="text-xs text-slate-300">
            {lang === 'ar' ? (
              <>
                لا يتضمّن دورك صلاحية <code className="font-mono">canEditPolicy</code>؛ تواصل مع مسؤول سيجما لإدارة إعدادات المنصّة.
              </>
            ) : (
              <>
                Your role does not include <code className="font-mono">canEditPolicy</code>; contact a Sigma admin to manage platform settings.
              </>
            )}
          </p>
        </Card>
      )}

      <SecurityNotice />

      <ClaudeStatusBanner status={claudeStatus} onRefresh={refresh} />

      <div className="grid grid-cols-1 gap-3">
        {DEFS.map((def) => {
          const state = catalogue?.find((c) => c.settingKey === def.key);
          return (
            <SettingCard
              key={def.key}
              def={def}
              state={state}
              canEdit={canEdit}
              onSave={onSave}
              onClear={onClear}
            />
          );
        })}
      </div>
    </div>
  );
}

function ClaudeStatusBanner({
  status,
  onRefresh,
}: {
  status: ClaudeStatus | null;
  onRefresh: () => Promise<void>;
}) {
  const toast = useToast();
  const { lang } = useI18n();
  const [busy, setBusy] = useState(false);

  const doRefresh = useCallback(async () => {
    setBusy(true);
    try {
      const r = await api<{ refreshed: true; hasDbKey: boolean; enabled: boolean }>('/admin/claude/refresh', {
        method: 'POST',
      });
      toast.success(
        lang === 'ar' ? 'تم تحديث Claude' : 'Claude refreshed',
        r.enabled
          ? lang === 'ar' ? 'تم التعرّف على مفتاح API — تم تفعيل Claude.' : 'API key recognized — Claude is enabled.'
          : lang === 'ar' ? 'لم يُعثر على مفتاح API — يبقى Claude معطّلاً.' : 'No API key found — Claude stays disabled.',
      );
      await onRefresh();
    } catch (e) {
      toast.error(lang === 'ar' ? 'فشل التحديث' : 'Refresh failed', (e as Error).message);
    } finally {
      setBusy(false);
    }
  }, [toast, onRefresh, lang]);

  if (!status) return null;

  const tone = status.enabled ? 'emerald' : 'amber';
  const bgClass = tone === 'emerald' ? 'border-emerald-500/40 bg-emerald-500/15' : 'border-amber-500/40 bg-amber-500/15';
  const textClass = tone === 'emerald' ? 'text-emerald-100' : 'text-amber-100';
  const iconBg = tone === 'emerald' ? 'bg-emerald-500/30 ring-emerald-400/50 text-emerald-100' : 'bg-amber-500/30 ring-amber-400/50 text-amber-100';

  return (
    <div className={`relative overflow-hidden rounded-xl border p-4 shadow-sm ${bgClass}`}>
      <div className="flex flex-wrap items-start gap-3">
        <div className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ring-1 ${iconBg}`}>
          <IconSparkles className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className={`text-sm font-semibold ${textClass}`}>
              {status.enabled
                ? lang === 'ar' ? 'Claude مُفعَّل' : 'Claude is enabled'
                : lang === 'ar' ? 'Claude مُعطَّل' : 'Claude is disabled'}
            </p>
            <Pill tone={status.enabled ? 'emerald' : 'amber'}>
              {status.keySource === 'db'
                ? lang === 'ar' ? 'المفتاح من /admin/settings' : 'Key from /admin/settings'
                : status.keySource === 'env'
                  ? lang === 'ar' ? 'المفتاح من ENV' : 'Key from ENV'
                  : lang === 'ar' ? 'لا يوجد مفتاح' : 'No key'}
            </Pill>
            <Pill tone="slate">{status.defaultModel}</Pill>
            <Pill tone="slate">{status.defaultTier}</Pill>
          </div>
          <p className={`mt-1 text-xs leading-relaxed ${textClass}`}>
            {status.enabled
              ? lang === 'ar'
                ? 'تم ربط Anthropic SDK، وكل استدعاء شخصية (محرّر الخطابات، راوي التقرير الشهري، حلّال التعارضات، وغيرها) سيستخدم المفتاح المُحدَّد. تُلتقَط التغييرات على مفتاح API أدناه تلقائياً — دون الحاجة لإعادة تشغيل.'
                : 'The Anthropic SDK is wired and every persona call (Letter drafter, Monthly narrator, Clash solver, etc.) will use the resolved key. Changes to the API key below are picked up automatically — no restart required.'
              : lang === 'ar'
                ? 'لم يتم إعداد مفتاح API. تعود الشخصيات إلى المخرجات الحتمية فقط. عيّن مفتاح Anthropic API في النموذج أدناه؛ يُكتشَف التغيير خلال ثوانٍ عبر مُستمِع التغيير في SettingsService.'
                : 'No API key configured. Personas fall back to deterministic-only output. Set the Anthropic API key in the form below; the change is detected within seconds via the SettingsService change listener.'}
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => void doRefresh()} disabled={busy}>
          <IconRefresh className="h-3.5 w-3.5" />
          {busy
            ? lang === 'ar' ? 'جاري التحديث…' : 'Refreshing…'
            : lang === 'ar' ? 'تحديث الحالة' : 'Refresh status'}
        </Button>
      </div>
    </div>
  );
}

function SecurityNotice() {
  const { lang } = useI18n();
  return (
    <div className="relative overflow-hidden rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 shadow-sm">
      <div
        aria-hidden
        className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full bg-emerald-500/15 blur-2xl"
      />
      <div className="relative flex items-start gap-3">
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-emerald-500/30 ring-1 ring-emerald-400/50">
          <IconShield className="h-4 w-4 text-emerald-100" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-emerald-50">
            {lang === 'ar' ? 'التشفير عند التخزين' : 'Encryption at rest'}
          </p>
          <p className="mt-1 text-xs leading-relaxed text-emerald-100">
            {lang === 'ar' ? (
              <>
                تُشفَّر كل قيمة تُدخَل أدناه بخوارزمية AES-256-GCM باستخدام مفتاح رئيسي خاص بكل جهة، مُشتقّ
                من <code className="font-mono">SETTINGS_ENCRYPTION_KEY</code>. لا يغادر النص الصريح الخادم
                أبداً — يُفكّ تشفيره فقط عندما تحتاج خدمة داخلية (مثل ClaudeService) إلى المصادقة مقابل واجهة
                خارجية. تُرجِع نقاط القراءة بصمة + سجلّ تدقيق، ولا تُرجِع القيمة أبداً.
              </>
            ) : (
              <>
                Every value entered below is encrypted with AES-256-GCM using a per-tenant master key derived
                from <code className="font-mono">SETTINGS_ENCRYPTION_KEY</code>. The raw plaintext never leaves
                the server — it&apos;s decrypted only when an internal service (e.g. ClaudeService) needs to
                authenticate against an external API. Read endpoints return a fingerprint + audit trail, never the value.
              </>
            )}
          </p>
        </div>
      </div>
    </div>
  );
}

function SettingCard({
  def,
  state,
  canEdit,
  onSave,
  onClear,
}: {
  def: Definition;
  state: SettingDescriptor | undefined;
  canEdit: boolean;
  onSave: (key: string, value: string) => Promise<void>;
  onClear: (key: string) => Promise<void>;
}) {
  const { lang } = useI18n();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState<'save' | 'clear' | null>(null);

  const isConfigured = !!state?.configured;
  const wasUpdated = state?.updatedAt
    ? new Date(state.updatedAt).toLocaleString()
    : '—';

  const submit = useCallback(async () => {
    if (!value.trim()) return;
    setBusy('save');
    try {
      await onSave(def.key, value.trim());
      setEditing(false);
      setValue('');
      setShow(false);
    } finally {
      setBusy(null);
    }
  }, [def.key, value, onSave]);

  const clear = useCallback(async () => {
    setBusy('clear');
    try {
      await onClear(def.key);
      setEditing(false);
      setValue('');
    } finally {
      setBusy(null);
    }
  }, [def.key, onClear]);

  return (
    <Card
      title={lang === 'ar' ? def.titleAr : def.title}
      hint={lang === 'ar' ? def.descriptionAr : def.description}
      actions={
        <span className="flex items-center gap-2">
          {def.badge === 'critical' && <Pill tone="rose">{lang === 'ar' ? 'حرج' : 'Critical'}</Pill>}
          {isConfigured ? (
            <Pill tone="emerald">
              <IconCheck className="me-1 h-3 w-3" /> {lang === 'ar' ? 'مُهيّأ' : 'Configured'}
            </Pill>
          ) : (
            <Pill tone="amber">
              <IconX className="me-1 h-3 w-3" /> {lang === 'ar' ? 'غير مُعيَّن' : 'Not set'}
            </Pill>
          )}
        </span>
      }
    >
      {!editing ? (
        <div className="flex flex-wrap items-center gap-3 text-xs">
          {isConfigured ? (
            <>
              <div className="rounded-lg border border-slate-700 bg-slate-900/70 px-3 py-2 font-mono text-sm text-slate-50">
                {state?.fingerprint ?? '••••'}
              </div>
              <div className="min-w-0 flex-1 text-slate-300">
                {lang === 'ar' ? 'آخر تحديث بواسطة' : 'Last updated by'}{' '}
                <span className="font-medium text-slate-100">
                  {state?.updatedBy ?? (lang === 'ar' ? 'غير معروف' : 'unknown')}
                </span>
                <span className="mx-1.5 text-slate-500">·</span>
                <span dir="ltr">{wasUpdated}</span>
              </div>
            </>
          ) : (
            <p className="flex-1 text-slate-300">
              {lang === 'ar' ? (
                <>
                  لا توجد قيمة مُعدّة. انقر <span className="font-semibold text-slate-100">تعيين قيمة</span> أدناه لإضافتها.
                </>
              ) : (
                <>
                  No value configured. Click <span className="font-semibold text-slate-100">Set value</span> below to add one.
                </>
              )}
            </p>
          )}
          {canEdit && (
            <div className="flex items-center gap-2">
              <Button variant="primary" size="sm" onClick={() => setEditing(true)}>
                <IconSparkles className="h-3.5 w-3.5" />
                {isConfigured
                  ? lang === 'ar' ? 'استبدال القيمة' : 'Replace value'
                  : lang === 'ar' ? 'تعيين قيمة' : 'Set value'}
              </Button>
              {isConfigured && (
                <Button variant="ghost" size="sm" onClick={() => void clear()} disabled={busy === 'clear'}>
                  {busy === 'clear'
                    ? lang === 'ar' ? 'جاري المسح…' : 'Clearing…'
                    : lang === 'ar' ? 'مسح' : 'Clear'}
                </Button>
              )}
            </div>
          )}
        </div>
      ) : (
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <label className="flex flex-col gap-1 text-xs">
            <span className="font-semibold uppercase tracking-[0.14em] text-slate-300">
              {lang === 'ar' ? 'قيمة جديدة' : 'New value'}
            </span>
            <div className="flex items-stretch gap-2">
              <input
                type={show ? 'text' : 'password'}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                required
                autoFocus
                placeholder={def.placeholder}
                spellCheck={false}
                autoComplete="off"
                className="flex-1 rounded-lg border border-slate-600 bg-slate-900/70 px-3 py-2 font-mono text-sm text-slate-50 outline-none transition focus:border-sky-400/80 focus:shadow-[0_0_0_3px_rgba(56,189,248,0.15)]"
                dir="ltr"
              />
              <button
                type="button"
                onClick={() => setShow((v) => !v)}
                className="rounded-lg border border-slate-600 bg-slate-900/70 px-3 text-xs text-slate-200 transition hover:border-slate-400 hover:text-slate-50"
              >
                {show
                  ? lang === 'ar' ? 'إخفاء' : 'Hide'
                  : lang === 'ar' ? 'إظهار' : 'Show'}
              </button>
            </div>
            {def.testHint && (
              <p className="text-[10px] text-slate-400">
                {lang === 'ar' ? 'الصيغة المتوقّعة: ' : 'Expected format: '}
                <span dir="ltr">{def.testHint}</span>
              </p>
            )}
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="submit" variant="primary" size="sm" disabled={busy === 'save' || !value.trim()}>
              {busy === 'save'
                ? lang === 'ar' ? 'جاري التشفير…' : 'Encrypting…'
                : lang === 'ar' ? 'حفظ (تشفير + تخزين)' : 'Save (encrypt + store)'}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setEditing(false);
                setValue('');
                setShow(false);
              }}
            >
              {lang === 'ar' ? 'إلغاء' : 'Cancel'}
            </Button>
          </div>
        </form>
      )}
    </Card>
  );
}

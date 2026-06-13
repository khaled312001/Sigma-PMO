'use client';

import { useEffect, useMemo, useState } from 'react';

import { useToast } from '../../../components/ToastProvider';
import { api, GovernancePolicyRecord } from '../../../lib/api';
import { AuthGate } from '../../../components/AuthGate';
import { useI18n } from '../../../lib/i18n';
import { PolicyStructuredView } from '../../../components/PolicyStructuredView';
import { Button, Card, PageHeader, Pill } from '../../../components/ui';

export default function PolicyAdminRoute() {
  return <AuthGate capability="canEditPolicy" surface="Policy"><PolicyAdmin /></AuthGate>;
}

function PolicyAdmin() {
  const toast = useToast();
  const { t, lang } = useI18n();
  const [policy, setPolicy] = useState<GovernancePolicyRecord | null>(null);
  const [config, setConfig] = useState('');
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [mode, setMode] = useState<'structured' | 'editor'>('structured');

  useEffect(() => {
    api<GovernancePolicyRecord>('/governance/policy').then((p) => {
      setPolicy(p);
      setConfig(JSON.stringify(p.config, null, 2));
    }).catch((e) => toast.error(lang === 'ar' ? 'تعذّر تحميل السياسة' : 'Failed to load policy', (e as Error).message));
  }, [toast, lang]);

  // Live JSON-syntax validation. The button stays enabled but turns into
  // "Fix JSON" while invalid, with the parse error shown inline below.
  const parseError = useMemo<string | null>(() => {
    if (!config.trim()) return null;
    try { JSON.parse(config); return null; } catch (e) { return (e as Error).message; }
  }, [config]);

  const prettify = () => {
    try { setConfig(JSON.stringify(JSON.parse(config), null, 2)); toast.info(lang === 'ar' ? 'تم التنسيق' : 'Formatted'); }
    catch (e) { toast.error(lang === 'ar' ? 'تعذّر التنسيق' : 'Cannot format', (e as Error).message); }
  };

  const save = async () => {
    if (parseError) { toast.error(lang === 'ar' ? 'JSON غير صالح' : 'Invalid JSON', parseError); return; }
    setSaving(true);
    try {
      const parsed = JSON.parse(config);
      const next = await api<GovernancePolicyRecord>('/governance/policy', {
        method: 'POST', body: JSON.stringify({ projectKey: null, config: parsed, authoredBy: 'console' }),
      });
      setPolicy(next);
      setConfig(JSON.stringify(next.config, null, 2));
      const t = new Date().toLocaleTimeString();
      setSavedAt(t);
      toast.success(
        lang === 'ar' ? 'تم حفظ السياسة' : 'Policy saved',
        lang === 'ar' ? `الإصدار ${next.version}` : `Version ${next.version}`,
      );
    } catch (e) { toast.error(lang === 'ar' ? 'فشل الحفظ' : 'Save failed', (e as Error).message); }
    finally { setSaving(false); }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t('admin.policy.eyebrow')}
        title={t('admin.policy.title')}
        description={t('admin.policy.description')}
        actions={policy ? (
          <>
            <Pill tone="sky">{t('admin.policy.labels.version', { n: policy.version })}</Pill>
            <Pill tone="slate">{policy.projectKey ?? t('admin.policy.labels.global')}</Pill>
            {savedAt && <Pill tone="emerald">{t('admin.policy.labels.savedAt', { time: savedAt })}</Pill>}
          </>
        ) : null}
      />

      {policy && (
        <>
          <div className="flex items-center gap-1 rounded-full border border-slate-800 bg-slate-900/60 p-0.5 text-[11px] font-semibold uppercase tracking-wider w-fit" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'structured'}
              onClick={() => setMode('structured')}
              className={`rounded-full px-3 py-1 transition ${mode === 'structured' ? 'bg-sky-500/20 text-sky-200' : 'text-slate-400 hover:text-slate-200'}`}
            >
              {t('admin.policy.tabs.structured')}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'editor'}
              onClick={() => setMode('editor')}
              className={`rounded-full px-3 py-1 transition ${mode === 'editor' ? 'bg-sky-500/20 text-sky-200' : 'text-slate-400 hover:text-slate-200'}`}
            >
              {t('admin.policy.tabs.editor')}
            </button>
          </div>

          {mode === 'structured' ? (
            <PolicyStructuredView config={policy.config} />
          ) : (
            <Card>
              <label htmlFor="policy-editor" className="block text-xs text-slate-400">
                {t('admin.policy.labels.editorLabel')}
              </label>
              <textarea
                id="policy-editor"
                value={config}
                onChange={(e) => setConfig(e.target.value)}
                spellCheck={false}
                dir="ltr"
                aria-invalid={parseError !== null}
                aria-describedby={parseError ? 'policy-error' : undefined}
                className={`mt-1 h-[64vh] w-full rounded-lg border bg-black/40 p-4 font-mono text-[12px] leading-snug text-slate-200 focus:outline-none ${
                  parseError ? 'border-red-500/60 focus:border-red-500' : 'border-slate-800 focus:border-sky-500'
                }`}
              />
              {parseError && (
                <p id="policy-error" className="mt-2 text-xs text-red-300" role="alert">
                  {lang === 'ar' ? 'خطأ في JSON: ' : 'JSON error: '}{parseError}
                </p>
              )}
              <div className="mt-3 flex justify-end gap-2">
                <Button variant="ghost" size="sm" onClick={prettify} disabled={!!parseError}>{t('admin.policy.labels.format')}</Button>
                <Button variant="success" size="sm" disabled={saving || !!parseError} onClick={save}>
                  {saving ? t('admin.policy.labels.savingNew') : parseError ? t('admin.policy.labels.fixJsonFirst') : t('admin.policy.labels.save')}
                </Button>
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

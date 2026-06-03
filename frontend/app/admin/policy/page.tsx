'use client';

import { useEffect, useMemo, useState } from 'react';

import { useToast } from '../../../components/ToastProvider';
import { api, GovernancePolicyRecord } from '../../../lib/api';
import { AuthGate } from '../../../components/AuthGate';
import { Button, Card, PageHeader, Pill } from '../../../components/ui';

export default function PolicyAdminRoute() {
  return <AuthGate capability="canEditPolicy" surface="Policy"><PolicyAdmin /></AuthGate>;
}

function PolicyAdmin() {
  const toast = useToast();
  const [policy, setPolicy] = useState<GovernancePolicyRecord | null>(null);
  const [config, setConfig] = useState('');
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  useEffect(() => {
    api<GovernancePolicyRecord>('/governance/policy').then((p) => {
      setPolicy(p);
      setConfig(JSON.stringify(p.config, null, 2));
    }).catch((e) => toast.error('Failed to load policy', (e as Error).message));
  }, [toast]);

  // Live JSON-syntax validation. The button stays enabled but turns into
  // "Fix JSON" while invalid, with the parse error shown inline below.
  const parseError = useMemo<string | null>(() => {
    if (!config.trim()) return null;
    try { JSON.parse(config); return null; } catch (e) { return (e as Error).message; }
  }, [config]);

  const prettify = () => {
    try { setConfig(JSON.stringify(JSON.parse(config), null, 2)); toast.info('Formatted'); }
    catch (e) { toast.error('Cannot format', (e as Error).message); }
  };

  const save = async () => {
    if (parseError) { toast.error('Invalid JSON', parseError); return; }
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
      toast.success('Policy saved', `Version ${next.version}`);
    } catch (e) { toast.error('Save failed', (e as Error).message); }
    finally { setSaving(false); }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Admin · Policy"
        title="Governance policy"
        description="FIDIC mappings, accountability, escalation tiers, and intervention library. Saves create a new version; prior versions stay in history."
        actions={policy ? (
          <>
            <Pill tone="sky">v{policy.version}</Pill>
            <Pill tone="slate">{policy.projectKey ?? 'global'}</Pill>
            {savedAt && <Pill tone="emerald">saved {savedAt}</Pill>}
          </>
        ) : null}
      />

      {policy && (
        <Card>
          <label htmlFor="policy-editor" className="block text-xs text-slate-400">
            Policy JSON
          </label>
          <textarea
            id="policy-editor"
            value={config}
            onChange={(e) => setConfig(e.target.value)}
            spellCheck={false}
            aria-invalid={parseError !== null}
            aria-describedby={parseError ? 'policy-error' : undefined}
            className={`mt-1 h-[64vh] w-full rounded-lg border bg-black/40 p-4 font-mono text-[12px] leading-snug text-slate-200 focus:outline-none ${
              parseError ? 'border-red-500/60 focus:border-red-500' : 'border-slate-800 focus:border-sky-500'
            }`}
          />
          {parseError && (
            <p id="policy-error" className="mt-2 text-xs text-red-300" role="alert">
              JSON error: {parseError}
            </p>
          )}
          <div className="mt-3 flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={prettify} disabled={!!parseError}>Format</Button>
            <Button variant="success" size="sm" disabled={saving || !!parseError} onClick={save}>
              {saving ? 'Saving new version…' : parseError ? 'Fix JSON first' : 'Save new policy version'}
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}

'use client';

import { useEffect, useState } from 'react';

import { api, GovernancePolicyRecord } from '../../../lib/api';
import { Button, Card, ErrorBanner, PageHeader, Pill } from '../../../components/ui';

export default function PolicyAdmin() {
  const [policy, setPolicy] = useState<GovernancePolicyRecord | null>(null);
  const [config, setConfig] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  useEffect(() => {
    api<GovernancePolicyRecord>('/governance/policy').then((p) => {
      setPolicy(p);
      setConfig(JSON.stringify(p.config, null, 2));
    }).catch((e) => setError((e as Error).message));
  }, []);

  const save = async () => {
    setSaving(true); setError(null);
    try {
      const parsed = JSON.parse(config);
      const next = await api<GovernancePolicyRecord>('/governance/policy', {
        method: 'POST', body: JSON.stringify({ projectKey: null, config: parsed, authoredBy: 'console' }),
      });
      setPolicy(next);
      setConfig(JSON.stringify(next.config, null, 2));
      setSavedAt(new Date().toLocaleTimeString());
    } catch (e) { setError((e as Error).message); }
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

      <ErrorBanner message={error} />

      {policy && (
        <Card>
          <textarea
            value={config}
            onChange={(e) => setConfig(e.target.value)}
            spellCheck={false}
            className="h-[68vh] w-full rounded-lg border border-slate-800 bg-black/40 p-4 font-mono text-[12px] leading-snug text-slate-200 focus:border-sky-500 focus:outline-none"
          />
          <div className="mt-3 flex justify-end">
            <Button variant="success" size="sm" disabled={saving} onClick={save}>
              {saving ? 'Saving new version…' : 'Save new policy version'}
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}

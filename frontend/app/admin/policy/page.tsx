'use client';

import { useEffect, useState } from 'react';

import { api, GovernancePolicyRecord } from '../../../lib/api';

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
      setSavedAt(new Date().toLocaleTimeString());
    } catch (e) { setError((e as Error).message); }
    finally { setSaving(false); }
  };

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-xl font-semibold">Governance policy</h1>
        <p className="text-xs text-slate-400">FIDIC mappings, accountability, escalation tiers, and intervention library. Each save creates a new version; the prior version is retired but kept in history.</p>
      </header>

      {error && <div className="rounded border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</div>}

      {policy && (
        <div className="space-y-3">
          <div className="flex items-center gap-3 text-xs text-slate-400">
            <span>Version <strong className="text-slate-200">{policy.version}</strong></span>
            <span>·</span>
            <span>scope: {policy.projectKey ?? 'global default'}</span>
            <span>·</span>
            <span>authored by {policy.authoredBy ?? 'system'}</span>
            {savedAt && <span className="text-emerald-300">· saved {savedAt}</span>}
          </div>
          <textarea
            value={config}
            onChange={(e) => setConfig(e.target.value)}
            spellCheck={false}
            className="h-[70vh] w-full rounded border border-slate-800 bg-black/40 p-3 font-mono text-[12px] leading-snug text-slate-200 focus:border-sky-500 focus:outline-none"
          />
          <button onClick={save} disabled={saving} className="rounded bg-emerald-600 px-4 py-2 text-xs font-medium text-white hover:bg-emerald-500 disabled:opacity-50">
            {saving ? 'Saving new version…' : 'Save new policy version'}
          </button>
        </div>
      )}
    </div>
  );
}

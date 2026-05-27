'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { api, MeResponse, setApiKey } from '../../lib/api';

export default function AuthPage() {
  const router = useRouter();
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bootstrap, setBootstrap] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const me = await api<MeResponse>('/auth/me');
        if (me.bootstrapMode) setBootstrap(true);
        else if (me.authenticated) router.push('/');
      } catch { /* ignore */ }
    })();
  }, [router]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(null);
    setApiKey(key.trim());
    try {
      const me = await api<MeResponse>('/auth/me');
      if (!me.authenticated) throw new Error('Key rejected — please check it and try again.');
      router.push('/');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-md py-12">
      <h1 className="text-xl font-semibold">Sign in</h1>
      <p className="mt-1 text-xs text-slate-400">Paste your API key. Issued via <code className="rounded bg-slate-800 px-1 py-0.5">npm run user:create</code>.</p>

      {bootstrap && (
        <div className="mt-4 rounded border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          The platform is in <strong>bootstrap mode</strong>: no users exist yet, so all writes are open. Create the first admin from the backend host with:
          <pre className="mt-2 rounded bg-black/40 p-2 text-[11px]">npm run user:create -- you@example.com sigma_admin "Your Name"</pre>
          Then return here with the printed API key.
        </div>
      )}

      <form onSubmit={submit} className="mt-6 space-y-3">
        <label className="block text-xs text-slate-400">API key
          <input
            type="password"
            autoComplete="off"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            className="mt-1 block w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-sky-500 focus:outline-none"
            placeholder="sk_…"
          />
        </label>
        {error && <p className="text-xs text-red-400">{error}</p>}
        <button type="submit" disabled={busy || !key} className="rounded bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-500 disabled:opacity-50">
          {busy ? 'Verifying…' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}

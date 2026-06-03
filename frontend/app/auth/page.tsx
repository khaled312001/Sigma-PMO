'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { useToast } from '../../components/ToastProvider';
import { api, MeResponse, setApiKey } from '../../lib/api';
import { Button, ErrorBanner } from '../../components/ui';
import { IconActivity, IconLogIn } from '../../components/Icons';

export default function AuthPage() {
  const router = useRouter();
  const toast = useToast();
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
      toast.success('Signed in', me.user ? `Welcome, ${me.user.displayName}` : undefined);
      router.push('/');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-md py-12">
      <div className="flex items-center gap-3">
        <div className="grid h-10 w-10 place-items-center rounded-lg bg-gradient-to-br from-sky-500/30 to-emerald-500/20 ring-1 ring-sky-500/30" aria-hidden>
          <IconActivity className="h-5 w-5 text-sky-300" />
        </div>
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Sign in</h1>
          <p className="text-xs text-slate-400">Paste your API key issued via the user CLI.</p>
        </div>
      </div>

      {bootstrap && (
        <div className="mt-5 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          <p className="font-medium">Bootstrap mode</p>
          <p className="mt-1 text-xs text-amber-100/80">No users exist yet — every endpoint is open. Create the first admin from the backend host:</p>
          <pre className="mt-2 overflow-auto rounded-lg bg-black/40 p-2 text-[11px] text-amber-50">npm run user:create -- you@example.com sigma_admin &quot;Your Name&quot;</pre>
          <p className="mt-2 text-xs text-amber-100/80">Then return here with the printed API key.</p>
        </div>
      )}

      <form onSubmit={submit} className="mt-6 space-y-3">
        <label htmlFor="api-key" className="block text-xs text-slate-400">API key</label>
        <input
          id="api-key"
          type="password"
          autoComplete="off"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          className="block w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm text-slate-100 focus:border-sky-500 focus:outline-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/60"
          placeholder="sk_…"
          aria-describedby={error ? 'api-key-error' : undefined}
          aria-invalid={error !== null}
        />
        {error && <div id="api-key-error"><ErrorBanner message={error} /></div>}
        <Button type="submit" variant="primary" disabled={busy || !key}>
          <IconLogIn className="h-3.5 w-3.5" /> {busy ? 'Verifying…' : 'Sign in'}
        </Button>
      </form>
    </div>
  );
}

'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { useToast } from '../../components/ToastProvider';
import { api, MeResponse, setApiKey } from '../../lib/api';
import { useMe } from '../../lib/me-context';
import { useI18n } from '../../lib/i18n';
import { LangSwitch } from '../../components/LangSwitch';
import { ThemeToggle } from '../../components/ThemeToggle';
import { Button, ErrorBanner } from '../../components/ui';
import { IconActivity, IconCheck, IconLogIn } from '../../components/Icons';

export default function AuthPage() {
  const router = useRouter();
  const toast = useToast();
  const { refresh } = useMe();
  const { t } = useI18n();
  const [key, setKey] = useState('');
  const [reveal, setReveal] = useState(false);
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
      if (!me.authenticated) throw new Error(t('auth.keyRejected'));
      await refresh();
      toast.success(t('common.confirm'), me.user ? t('auth.welcome', { name: me.user.displayName }) : undefined);
      router.push('/');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-slate-950">
      {/* Decorative gradient blobs */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute -top-32 -end-32 h-96 w-96 rounded-full bg-sky-500/15 blur-3xl" />
        <div className="absolute -bottom-32 -start-32 h-96 w-96 rounded-full bg-emerald-500/10 blur-3xl" />
      </div>

      <div className="relative grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
        {/* Brand panel */}
        <section className="hidden flex-col justify-between border-e border-slate-800/70 bg-slate-950/40 p-10 lg:flex">
          <header className="flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-xl bg-gradient-to-br from-sky-500/30 to-emerald-500/20 ring-1 ring-sky-500/30">
              <IconActivity className="h-5 w-5 text-sky-300" />
            </div>
            <div>
              <p className="text-base font-semibold tracking-tight text-slate-100">{t('brand.name')}</p>
              <p className="text-xs text-slate-400">{t('brand.tagline')}</p>
            </div>
          </header>

          <div className="max-w-md">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-sky-400">
              {t('auth.title')}
            </p>
            <h1 className="mt-3 text-3xl font-semibold leading-tight tracking-tight text-slate-100">
              {t('overview.title')}
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-slate-400">
              {t('overview.description')}
            </p>

            <ul className="mt-8 space-y-3">
              <ValueItem>{t('auth.valueProp.governance')}</ValueItem>
              <ValueItem>{t('auth.valueProp.evidence')}</ValueItem>
              <ValueItem>{t('auth.valueProp.fidic')}</ValueItem>
            </ul>
          </div>

          <footer className="flex items-center justify-between text-[11px] text-slate-500">
            <span>v1.0.0-acceptance</span>
            <span className="font-mono">P-1000 · Nile Tower</span>
          </footer>
        </section>

        {/* Form panel */}
        <section className="flex min-h-screen flex-col justify-center px-6 py-10 sm:px-10 lg:px-16">
          {/* Floating utilities (theme + lang) */}
          <div className="absolute top-4 end-4 flex items-center gap-2">
            <LangSwitch />
            <ThemeToggle />
          </div>

          {/* Mobile brand header */}
          <div className="mb-6 flex items-center gap-3 lg:hidden">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-sky-500/30 to-emerald-500/20 ring-1 ring-sky-500/30">
              <IconActivity className="h-4 w-4 text-sky-300" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-100">{t('brand.name')}</p>
              <p className="text-[11px] text-slate-400">{t('brand.tagline')}</p>
            </div>
          </div>

          <div className="mx-auto w-full max-w-md">
            <h2 className="text-2xl font-semibold tracking-tight text-slate-100">
              {t('auth.title')}
            </h2>
            <p className="mt-2 text-sm text-slate-400">{t('auth.subtitle')}</p>

            {bootstrap && (
              <div className="mt-6 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
                <p className="font-medium">{t('auth.bootstrap.title')}</p>
                <p className="mt-1 text-xs text-amber-100/80">{t('auth.bootstrap.body')}</p>
                <pre dir="ltr" className="mt-2 overflow-auto rounded-lg bg-black/40 p-2 text-[11px] text-amber-50">npm run user:create -- you@example.com sigma_admin &quot;Your Name&quot;</pre>
                <p className="mt-2 text-xs text-amber-100/80">{t('auth.bootstrap.hint')}</p>
              </div>
            )}

            <form onSubmit={submit} className="mt-7 space-y-4">
              <label htmlFor="api-key" className="block text-xs font-medium text-slate-300">
                {t('auth.apiKeyLabel')}
              </label>
              <div className="relative">
                <input
                  id="api-key"
                  type={reveal ? 'text' : 'password'}
                  autoComplete="off"
                  spellCheck={false}
                  value={key}
                  onChange={(e) => setKey(e.target.value)}
                  className="block w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 pe-20 font-mono text-sm text-slate-100 focus:border-sky-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/60"
                  placeholder={t('auth.apiKeyPlaceholder')}
                  aria-describedby={error ? 'api-key-error' : undefined}
                  aria-invalid={error !== null}
                  dir="ltr"
                />
                <button
                  type="button"
                  onClick={() => setReveal((r) => !r)}
                  className="absolute end-2 top-1/2 -translate-y-1/2 rounded-md px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400 hover:text-slate-200"
                  aria-label={reveal ? t('auth.hide') : t('auth.show')}
                >
                  {reveal ? t('auth.hide') : t('auth.show')}
                </button>
              </div>

              {error && <div id="api-key-error"><ErrorBanner message={error} /></div>}

              <Button type="submit" variant="primary" disabled={busy || !key} className="w-full justify-center">
                <IconLogIn className="h-4 w-4" /> {busy ? t('auth.verifying') : t('auth.submit')}
              </Button>
            </form>
          </div>
        </section>
      </div>
    </div>
  );
}

function ValueItem({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-3">
      <div className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-md bg-emerald-500/15 ring-1 ring-emerald-500/40">
        <IconCheck className="h-3 w-3 text-emerald-300" />
      </div>
      <span className="text-sm leading-relaxed text-slate-300">{children}</span>
    </li>
  );
}

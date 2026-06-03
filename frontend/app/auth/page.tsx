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
import {
  IconActivity,
  IconCheck,
  IconDatabase,
  IconEvidence,
  IconLogIn,
  IconReview,
  IconShield,
} from '../../components/Icons';

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
    <div className="relative min-h-screen overflow-hidden bg-slate-950 text-slate-100">
      {/* Decorative gradient blobs */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute -top-40 -end-40 h-[28rem] w-[28rem] rounded-full bg-sky-500/12 blur-3xl" />
        <div className="absolute top-1/3 -start-32 h-72 w-72 rounded-full bg-emerald-500/10 blur-3xl" />
        <div className="absolute -bottom-40 end-1/4 h-72 w-72 rounded-full bg-violet-500/10 blur-3xl" />
      </div>

      {/* Sticky top-right toggles (always visible on every breakpoint) */}
      <div className="absolute top-4 end-4 z-20 flex items-center gap-2">
        <LangSwitch />
        <ThemeToggle />
      </div>

      <div className="relative grid min-h-screen lg:grid-cols-[1.15fr_1fr]">
        {/* ===== Brand panel (lg+) ===== */}
        <section className="hidden flex-col justify-between border-e border-slate-800/60 bg-gradient-to-br from-slate-950 via-slate-950 to-slate-900/60 p-12 lg:flex">
          <header className="flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-xl bg-gradient-to-br from-sky-500/30 to-emerald-500/20 ring-1 ring-sky-500/30">
              <IconActivity className="h-5 w-5 text-sky-300" />
            </div>
            <div>
              <p className="text-base font-semibold tracking-tight">{t('brand.name')}</p>
              <p className="text-xs text-slate-400">{t('brand.tagline')}</p>
            </div>
          </header>

          <div className="max-w-md">
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-sky-400">
              {t('auth.title')}
            </p>
            <h1 className="mt-4 text-[2rem] font-semibold leading-[1.15] tracking-tight">
              {t('overview.title')}
            </h1>
            <p className="mt-4 text-sm leading-relaxed text-slate-400">
              {t('overview.description')}
            </p>

            <ul className="mt-10 space-y-4">
              <ValueItem icon={<IconShield className="h-3.5 w-3.5 text-emerald-300" />}>{t('auth.valueProp.governance')}</ValueItem>
              <ValueItem icon={<IconEvidence className="h-3.5 w-3.5 text-emerald-300" />}>{t('auth.valueProp.evidence')}</ValueItem>
              <ValueItem icon={<IconReview className="h-3.5 w-3.5 text-emerald-300" />}>{t('auth.valueProp.fidic')}</ValueItem>
            </ul>

            <div className="mt-12">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">{t('auth.standards.heading')}</p>
              <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
                <Chip>{t('auth.standards.fidic')}</Chip>
                <Chip>{t('auth.standards.pmi')}</Chip>
                <Chip>{t('auth.standards.append')}</Chip>
                <Chip>{t('auth.standards.sha')}</Chip>
              </div>
            </div>
          </div>

          <footer className="flex items-center justify-between text-[11px] text-slate-500">
            <span className="font-mono">v1.0.0-acceptance</span>
            <span className="flex items-center gap-1.5">
              <IconDatabase className="h-3 w-3" />
              <span className="font-mono" dir="ltr">P-1000 · Nile Tower</span>
            </span>
          </footer>
        </section>

        {/* ===== Form panel ===== */}
        <section className="flex min-h-screen flex-col justify-center px-6 py-12 sm:px-10 lg:px-16">
          {/* Mobile brand header */}
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-sky-500/30 to-emerald-500/20 ring-1 ring-sky-500/30">
              <IconActivity className="h-4 w-4 text-sky-300" />
            </div>
            <div>
              <p className="text-sm font-semibold">{t('brand.name')}</p>
              <p className="text-[11px] text-slate-400">{t('brand.tagline')}</p>
            </div>
          </div>

          <div className="mx-auto w-full max-w-md">
            <h2 className="text-2xl font-semibold tracking-tight">
              {t('auth.title')}
            </h2>
            <p className="mt-2 text-sm text-slate-400">{t('auth.subtitle')}</p>

            {bootstrap && (
              <div className="mt-6 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-100">
                <p className="font-medium">{t('auth.bootstrap.title')}</p>
                <p className="mt-1 text-xs text-amber-100/80">{t('auth.bootstrap.body')}</p>
                <pre dir="ltr" className="mt-2 overflow-auto rounded-lg bg-black/40 p-2 text-[11px] text-amber-50">npm run user:create -- you@example.com sigma_admin &quot;Your Name&quot;</pre>
                <p className="mt-2 text-xs text-amber-100/80">{t('auth.bootstrap.hint')}</p>
              </div>
            )}

            <form onSubmit={submit} className="mt-8 space-y-5">
              <div>
                <label htmlFor="api-key" className="block text-xs font-medium text-slate-300">
                  {t('auth.apiKeyLabel')}
                </label>
                <div className="relative mt-2">
                  <input
                    id="api-key"
                    type={reveal ? 'text' : 'password'}
                    autoComplete="off"
                    spellCheck={false}
                    value={key}
                    onChange={(e) => setKey(e.target.value)}
                    className="block w-full rounded-xl border border-slate-700 bg-slate-900/80 px-4 py-3 pe-24 font-mono text-sm text-slate-100 shadow-inner shadow-black/20 transition focus:border-sky-500 focus:bg-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/60"
                    placeholder={t('auth.apiKeyPlaceholder')}
                    aria-describedby={error ? 'api-key-error' : 'api-key-hint'}
                    aria-invalid={error !== null}
                    dir="ltr"
                  />
                  <button
                    type="button"
                    onClick={() => setReveal((r) => !r)}
                    className="absolute end-2 top-1/2 -translate-y-1/2 rounded-md border border-slate-700 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-slate-300 transition hover:border-slate-500 hover:text-white"
                    aria-label={reveal ? t('auth.hide') : t('auth.show')}
                  >
                    {reveal ? t('auth.hide') : t('auth.show')}
                  </button>
                </div>
                <p id="api-key-hint" className="mt-2 text-[11px] text-slate-500">{t('auth.keyHint')}</p>
              </div>

              {error && <div id="api-key-error"><ErrorBanner message={error} /></div>}

              <Button type="submit" variant="primary" disabled={busy || !key} className="w-full justify-center py-2.5 text-sm">
                <IconLogIn className="h-4 w-4" /> {busy ? t('auth.verifying') : t('auth.submit')}
              </Button>

              <p className="text-center text-[11px] text-slate-500">{t('auth.needHelp')}</p>
            </form>
          </div>
        </section>
      </div>
    </div>
  );
}

function ValueItem({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-3">
      <div className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-md bg-emerald-500/15 ring-1 ring-emerald-500/40">
        {icon}
      </div>
      <span className="text-sm leading-relaxed text-slate-300">{children}</span>
    </li>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full border border-slate-800 bg-slate-900/60 px-2.5 py-1 font-mono text-[10px] text-slate-300">
      {children}
    </span>
  );
}

// IconCheck is intentionally unused after the redesign; keep the export
// signature stable but quiet the linter.
void IconCheck;

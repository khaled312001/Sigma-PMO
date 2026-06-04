'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import { useToast } from '../../components/ToastProvider';
import { api, LoginResponse, MeResponse, setApiKey } from '../../lib/api';
import { useMe } from '../../lib/me-context';
import { useI18n } from '../../lib/i18n';
import { LangSwitch } from '../../components/LangSwitch';
import { ThemeToggle } from '../../components/ThemeToggle';
import { Button, ErrorBanner } from '../../components/ui';
import {
  IconActivity,
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
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [reveal, setReveal] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bootstrap, setBootstrap] = useState(false);
  const emailRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const me = await api<MeResponse>('/auth/me');
        if (me.bootstrapMode) setBootstrap(true);
        else if (me.authenticated) router.push('/');
      } catch { /* ignore */ }
    })();
    emailRef.current?.focus();
  }, [router]);

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    setCapsLock(e.getModifierState && e.getModifierState('CapsLock'));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      const res = await api<LoginResponse>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
      });
      setApiKey(res.apiKey);
      await refresh();
      toast.success(t('auth.welcome', { name: res.user.displayName }));
      router.push('/');
    } catch (err) {
      const message = (err as Error).message ?? '';
      // /auth/login returns 401 on bad creds; the api() wrapper throws "API ... → 401: ...".
      const friendly = /401|unauthor/i.test(message) ? t('auth.loginFailed') : message;
      setError(friendly);
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

      {/* Sticky top-right toggles */}
      <div className="absolute top-4 end-4 z-20 flex items-center gap-2">
        <LangSwitch />
        <ThemeToggle />
      </div>

      <div className="relative grid min-h-screen lg:grid-cols-[1.15fr_1fr]">
        {/* ===== Brand panel ===== */}
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
                <pre dir="ltr" className="mt-2 overflow-auto rounded-lg bg-black/40 p-2 text-[11px] text-amber-50">npm run user:create -- you@example.com sigma_admin &quot;StrongPassword!&quot; &quot;Your Name&quot;</pre>
                <p className="mt-2 text-xs text-amber-100/80">{t('auth.bootstrap.hint')}</p>
              </div>
            )}

            <form onSubmit={submit} className="mt-8 space-y-5" autoComplete="on">
              {/* Email */}
              <div>
                <label htmlFor="email" className="block text-xs font-medium text-slate-300">
                  {t('auth.emailLabel')}
                </label>
                <input
                  id="email"
                  ref={emailRef}
                  type="email"
                  autoComplete="username"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={t('auth.emailPlaceholder')}
                  className="mt-2 block w-full rounded-xl border border-slate-700 bg-slate-900/80 px-4 py-3 text-sm text-slate-100 shadow-inner shadow-black/20 transition placeholder:text-slate-500 focus:border-sky-500 focus:bg-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/60"
                  dir="ltr"
                />
              </div>

              {/* Password */}
              <div>
                <div className="flex items-baseline justify-between">
                  <label htmlFor="password" className="block text-xs font-medium text-slate-300">
                    {t('auth.passwordLabel')}
                  </label>
                  <span
                    className="text-[11px] text-slate-500 hover:text-slate-300 cursor-help"
                    title={t('auth.forgotPasswordHint')}
                  >
                    {t('auth.forgotPassword')}
                  </span>
                </div>
                <div className="relative mt-2">
                  <input
                    id="password"
                    type={reveal ? 'text' : 'password'}
                    autoComplete="current-password"
                    required
                    minLength={8}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onKeyDown={onKey}
                    onKeyUp={onKey}
                    placeholder={t('auth.passwordPlaceholder')}
                    aria-describedby={error ? 'login-error' : capsLock ? 'caps-warning' : undefined}
                    aria-invalid={error !== null}
                    className="block w-full rounded-xl border border-slate-700 bg-slate-900/80 px-4 py-3 pe-20 text-sm text-slate-100 shadow-inner shadow-black/20 transition placeholder:text-slate-500 focus:border-sky-500 focus:bg-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/60"
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
                {capsLock && (
                  <p id="caps-warning" className="mt-1.5 flex items-center gap-1 text-[11px] text-amber-300">
                    <span aria-hidden>⇧</span> {t('auth.capsLock')}
                  </p>
                )}
              </div>

              {error && <div id="login-error"><ErrorBanner message={error} /></div>}

              <Button type="submit" variant="primary" disabled={busy || !email || password.length < 8} className="w-full justify-center py-2.5 text-sm">
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

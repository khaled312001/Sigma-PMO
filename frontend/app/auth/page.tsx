'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import { useToast } from '../../components/ToastProvider';
import { api, LoginResponse, MeResponse, Role, setApiKey } from '../../lib/api';
import { ROLE_LABEL } from '../../lib/capabilities';
import { useMe } from '../../lib/me-context';
import { useI18n } from '../../lib/i18n';
import { LangSwitch } from '../../components/LangSwitch';
import { ThemeToggle } from '../../components/ThemeToggle';
import { Button, ErrorBanner } from '../../components/ui';
import {
  IconActivity,
  IconCheck,
  IconEvidence,
  IconLogIn,
  IconReview,
  IconShield,
} from '../../components/Icons';

/** The L0–L8 agent taxonomy, shown as an animated governance stack. Generic —
 *  the platform's architecture, not tied to any project. */
const LAYERS = [
  { tag: 'L0', label: 'Knowledge & Rules', accent: 'from-slate-400/60 to-slate-500/40' },
  { tag: 'L1', label: 'Data Collection', accent: 'from-sky-400/60 to-sky-500/40' },
  { tag: 'L2', label: 'Validation', accent: 'from-cyan-400/60 to-cyan-500/40' },
  { tag: 'L3', label: 'Compliance', accent: 'from-teal-400/60 to-teal-500/40' },
  { tag: 'L4', label: 'Analytics', accent: 'from-emerald-400/60 to-emerald-500/40' },
  { tag: 'L5', label: 'Risk', accent: 'from-amber-400/60 to-amber-500/40' },
  { tag: 'L6', label: 'Claims & Disputes', accent: 'from-orange-400/60 to-orange-500/40' },
  { tag: 'L7', label: 'Executive Intelligence', accent: 'from-violet-400/60 to-violet-500/40' },
  { tag: 'L8', label: 'Sigma Governance AI', accent: 'from-fuchsia-400/70 to-rose-500/50' },
];

/** The seeded role accounts — selecting one fills its email (no secrets in
 *  source; the password is still entered manually). */
const ROLE_ACCOUNTS: { role: Role; email: string }[] = [
  { role: 'sigma_admin', email: 'admin@sigma.local' },
  { role: 'sigma_reviewer', email: 'reviewer@sigma.local' },
  { role: 'client', email: 'client@sigma.ae' },
  { role: 'consultant', email: 'consultant@sigma.ae' },
  { role: 'contractor', email: 'contractor@sigma.ae' },
  { role: 'subcontractor', email: 'subcontractor@sigma.ae' },
];

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
  const [selectedRole, setSelectedRole] = useState<Role | null>(null);
  const emailRef = useRef<HTMLInputElement | null>(null);
  const passwordRef = useRef<HTMLInputElement | null>(null);

  const pickRole = (role: Role, accountEmail: string) => {
    setSelectedRole(role);
    setEmail(accountEmail);
    setError(null);
    passwordRef.current?.focus();
  };

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
      const friendly = /401|unauthor/i.test(message) ? t('auth.loginFailed') : message;
      setError(friendly);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-slate-950 text-slate-100">
      {/* ===== Animated aurora + grid backdrop ===== */}
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="animate-aurora absolute -left-1/4 -top-1/4 h-[70vh] w-[70vh] rounded-full bg-sky-500/20 blur-[120px]" />
        <div className="animate-aurora-2 absolute -right-1/4 top-1/3 h-[60vh] w-[60vh] rounded-full bg-violet-500/20 blur-[120px]" />
        <div className="animate-aurora absolute bottom-0 left-1/3 h-[50vh] w-[50vh] rounded-full bg-emerald-500/15 blur-[120px]" style={{ animationDelay: '6s' }} />
        <div
          className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage: 'linear-gradient(currentColor 1px, transparent 1px), linear-gradient(90deg, currentColor 1px, transparent 1px)',
            backgroundSize: '48px 48px',
            animation: 'grid-pan 24s linear infinite',
          }}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/40 to-transparent" />
      </div>

      {/* Sticky top-right toggles */}
      <div className="absolute top-4 end-4 z-20 flex items-center gap-2">
        <LangSwitch />
        <ThemeToggle />
      </div>

      <div className="relative grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
        {/* ===== Brand panel — animated governance OS identity ===== */}
        <section className="relative hidden flex-col justify-between overflow-hidden border-e border-white/5 p-12 lg:flex xl:p-16">
          <header className="relative z-10 flex items-center gap-3 [animation:fade-in-up_0.5s_ease-out_both]">
            <div className="animate-float-y grid h-12 w-12 place-items-center rounded-xl bg-gradient-to-br from-sky-500/40 via-sky-500/20 to-emerald-500/30 ring-1 ring-sky-400/40 shadow-lg shadow-sky-500/20">
              <IconActivity className="h-5 w-5 text-sky-100" />
            </div>
            <div>
              <p className="text-base font-semibold tracking-tight">{t('brand.name')}</p>
              <p className="text-xs text-slate-400">{t('auth.osName')}</p>
            </div>
            <span className="ms-auto inline-flex items-center gap-1 rounded-full border border-emerald-400/30 bg-emerald-500/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-300">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400" style={{ animation: 'ring-ping 2s cubic-bezier(0,0,0.2,1) infinite' }} />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
              </span>
              Official
            </span>
          </header>

          <div className="relative z-10 max-w-lg">
            <div className="mb-5 h-0.5 w-12 rounded-full bg-gradient-to-r from-sky-400 to-violet-400 [animation:fade-in-up_0.5s_ease-out_both]" style={{ animationDelay: '60ms' }} />
            <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-sky-400 [animation:fade-in-up_0.5s_ease-out_both]" style={{ animationDelay: '90ms' }}>
              {t('auth.osName')}
            </p>
            <h1 className="font-display mt-4 bg-gradient-to-br from-white via-slate-100 to-slate-400 bg-clip-text text-[2.4rem] font-semibold leading-[1.1] tracking-tight text-transparent [animation:fade-in-up_0.6s_ease-out_both]" style={{ animationDelay: '120ms' }}>
              {t('auth.heroTitle')}
            </h1>
            <p className="mt-5 text-sm leading-relaxed text-slate-400 [animation:fade-in-up_0.6s_ease-out_both]" style={{ animationDelay: '180ms' }}>
              {t('auth.heroLead')}
            </p>

            {/* Live L0→L8 governance stack */}
            <div className="mt-9 grid grid-cols-1 gap-1.5 sm:grid-cols-3">
              {LAYERS.map((l, i) => (
                <div
                  key={l.tag}
                  className="group relative overflow-hidden rounded-lg border border-white/5 bg-white/[0.03] px-2.5 py-2 [animation:layer-rise_0.5s_ease-out_both]"
                  style={{ animationDelay: `${260 + i * 55}ms` }}
                >
                  <span aria-hidden className="absolute inset-0 -skew-x-12 bg-gradient-to-r from-transparent via-white/10 to-transparent" style={{ animation: `layer-sheen 5s ease-in-out ${i * 0.4}s infinite` }} />
                  <div className="relative flex items-center gap-1.5">
                    <span className={`grid h-5 w-7 shrink-0 place-items-center rounded bg-gradient-to-br ${l.accent} font-mono text-[10px] font-bold text-white ring-1 ring-white/10`} dir="ltr">
                      {l.tag}
                    </span>
                    <span className="truncate text-[11px] text-slate-300">{l.label}</span>
                  </div>
                </div>
              ))}
            </div>

            <ul className="mt-9 space-y-3.5">
              <ValueItem delay={820} icon={<IconShield className="h-3.5 w-3.5 text-emerald-300" />}>{t('auth.valueProp.governance')}</ValueItem>
              <ValueItem delay={880} icon={<IconEvidence className="h-3.5 w-3.5 text-emerald-300" />}>{t('auth.valueProp.evidence')}</ValueItem>
              <ValueItem delay={940} icon={<IconReview className="h-3.5 w-3.5 text-emerald-300" />}>{t('auth.valueProp.fidic')}</ValueItem>
            </ul>
          </div>

          <footer className="relative z-10 space-y-2 [animation:fade-in-up_0.6s_ease-out_both]" style={{ animationDelay: '1020ms' }}>
            <div className="flex flex-wrap gap-2 text-[11px]">
              <Chip>{t('auth.standards.fidic')}</Chip>
              <Chip>{t('auth.standards.pmi')}</Chip>
              <Chip>{t('auth.standards.append')}</Chip>
              <Chip>{t('auth.standards.sha')}</Chip>
            </div>
            <div className="h-px w-full bg-gradient-to-r from-white/10 to-transparent" />
            <p className="flex items-center gap-1.5 text-[11px] text-slate-500">
              <IconShield className="h-3 w-3" /> {t('auth.footerNote')}
            </p>
          </footer>
        </section>

        {/* ===== Form panel ===== */}
        <section className="relative flex min-h-screen flex-col justify-center px-6 py-12 sm:px-10 lg:px-16">
          <div className="mx-auto w-full max-w-md [animation:fade-in-up_0.6s_ease-out_both]" style={{ animationDelay: '120ms' }}>
            {/* Mobile brand header */}
            <div className="mb-8 flex items-center gap-3 lg:hidden">
              <div className="grid h-11 w-11 place-items-center rounded-xl bg-gradient-to-br from-sky-500/40 to-emerald-500/30 ring-1 ring-sky-400/40">
                <IconActivity className="h-4 w-4 text-sky-100" />
              </div>
              <div>
                <p className="text-sm font-semibold">{t('brand.name')}</p>
                <p className="text-[11px] text-slate-400">{t('auth.osName')}</p>
              </div>
            </div>

            {/* Glass sign-in card */}
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-7 shadow-2xl shadow-black/40 backdrop-blur-xl sm:p-8">
              <h2 className="text-2xl font-semibold tracking-tight">{t('auth.title')}</h2>
              <p className="mt-2 text-sm text-slate-400">{t('auth.subtitle')}</p>

              {/* User-type selector — pick the role to sign in as (fills its email). */}
              <div className="mt-5">
                <p className="text-[11px] font-medium text-slate-400">{t('auth.signInAs')}</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {ROLE_ACCOUNTS.map(({ role, email: accEmail }) => (
                    <button
                      key={role}
                      type="button"
                      onClick={() => pickRole(role, accEmail)}
                      aria-pressed={selectedRole === role}
                      className={`rounded-full border px-2.5 py-1 text-[11px] transition ${
                        selectedRole === role
                          ? 'border-sky-400/60 bg-sky-500/15 text-sky-100 shadow-sm shadow-sky-500/20'
                          : 'border-white/10 bg-white/[0.03] text-slate-300 hover:border-slate-500 hover:text-white'
                      }`}
                    >
                      {ROLE_LABEL[role]}
                    </button>
                  ))}
                </div>
              </div>

              {bootstrap && (
                <div className="mt-6 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-100">
                  <p className="font-medium">{t('auth.bootstrap.title')}</p>
                  <p className="mt-1 text-xs text-amber-100/80">{t('auth.bootstrap.body')}</p>
                  <pre dir="ltr" className="mt-2 overflow-auto rounded-lg bg-black/40 p-2 text-[11px] text-amber-50">npm run user:create -- you@example.com sigma_admin &quot;StrongPassword!&quot; &quot;Your Name&quot;</pre>
                  <p className="mt-2 text-xs text-amber-100/80">{t('auth.bootstrap.hint')}</p>
                </div>
              )}

              <form onSubmit={submit} className="mt-7 space-y-5" autoComplete="on">
                <div>
                  <label htmlFor="email" className="block text-xs font-medium text-slate-300">{t('auth.emailLabel')}</label>
                  <input
                    id="email"
                    ref={emailRef}
                    type="email"
                    autoComplete="username"
                    required
                    value={email}
                    onChange={(e) => { setEmail(e.target.value); setSelectedRole(null); }}
                    placeholder={t('auth.emailPlaceholder')}
                    className="mt-2 block w-full rounded-xl border border-white/10 bg-slate-900/60 px-4 py-3 text-sm text-slate-100 shadow-inner shadow-black/20 transition placeholder:text-slate-500 focus:border-sky-500/70 focus:bg-slate-900/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/40"
                    dir="ltr"
                  />
                </div>

                <div>
                  <div className="flex items-baseline justify-between">
                    <label htmlFor="password" className="block text-xs font-medium text-slate-300">{t('auth.passwordLabel')}</label>
                    <span className="cursor-help text-[11px] text-slate-500 hover:text-slate-300" title={t('auth.forgotPasswordHint')}>{t('auth.forgotPassword')}</span>
                  </div>
                  <div className="relative mt-2">
                    <input
                      id="password"
                      ref={passwordRef}
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
                      className="block w-full rounded-xl border border-white/10 bg-slate-900/60 px-4 py-3 pe-20 text-sm text-slate-100 shadow-inner shadow-black/20 transition placeholder:text-slate-500 focus:border-sky-500/70 focus:bg-slate-900/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/40"
                      dir="ltr"
                    />
                    <button
                      type="button"
                      onClick={() => setReveal((r) => !r)}
                      className="absolute end-2 top-1/2 -translate-y-1/2 rounded-md border border-white/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-slate-300 transition hover:border-slate-400 hover:text-white"
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

                <Button type="submit" variant="primary" disabled={busy || !email || password.length < 8} className="group relative w-full justify-center overflow-hidden py-2.5 text-sm">
                  <span aria-hidden className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/25 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
                  {busy ? (
                    <span className="relative flex items-center gap-2">
                      <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                      {t('auth.verifying')}
                    </span>
                  ) : (
                    <span className="relative flex items-center gap-2"><IconLogIn className="h-4 w-4" /> {t('auth.submit')}</span>
                  )}
                </Button>
              </form>
            </div>

            <p className="mt-5 flex items-center justify-center gap-1.5 text-center text-[11px] text-slate-500">
              <IconCheck className="h-3 w-3 text-emerald-400/70" /> {t('auth.needHelp')}
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}

function ValueItem({ icon, children, delay = 0 }: { icon: React.ReactNode; children: React.ReactNode; delay?: number }) {
  return (
    <li className="flex items-start gap-3 [animation:fade-in-up_0.5s_ease-out_both]" style={{ animationDelay: `${delay}ms` }}>
      <div className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-md bg-emerald-500/15 ring-1 ring-emerald-500/40">{icon}</div>
      <span className="text-sm leading-relaxed text-slate-300">{children}</span>
    </li>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 font-mono text-[10px] text-slate-300 backdrop-blur-sm">
      {children}
    </span>
  );
}

'use client';

/**
 * Per-company login portal (/c/:slug). Public, fullscreen. Shows the company's
 * own branding and authenticates ONLY that company's users (the backend scopes
 * the sign-in to the slug — an account from another company is rejected even
 * with correct credentials). Reached after registration / Stripe Checkout.
 * Theme-correct (slate→warm-neutral flips; sky→crimson brand). Bilingual.
 */
import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';

import { api, setApiKey, LoginResponse, PublicCompany } from '../../../lib/api';
import { useMe } from '../../../lib/me-context';
import { useI18n } from '../../../lib/i18n';
import { LangSwitch } from '../../../components/LangSwitch';
import { ThemeToggle } from '../../../components/ThemeToggle';
import { Button, ErrorBanner } from '../../../components/ui';
import { IconLogIn } from '../../../components/Icons';

const TYPE_ICON: Record<string, string> = {
  developer_owner: '🏗️', contractor: '👷', consultant: '📐', pmo: '🗂️',
  investor: '💼', lender: '🏦', government: '🏛️', operator: '⚙️',
};

const fieldCls =
  'block w-full rounded-xl border border-slate-600/70 bg-slate-900/70 px-4 py-3 text-sm text-slate-50 shadow-inner shadow-black/20 transition placeholder:text-slate-500 hover:border-slate-500 focus:border-sky-500/80 focus:bg-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/30';

export default function CompanyLoginPage() {
  const { lang } = useI18n();
  const ar = lang === 'ar';
  const router = useRouter();
  const params = useParams();
  const search = useSearchParams();
  const { refresh } = useMe();
  const slug = String(params?.slug ?? '');
  const welcome = search.get('welcome') === '1';

  const [company, setCompany] = useState<PublicCompany | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!slug) return;
    api<PublicCompany>(`/onboarding/public/${encodeURIComponent(slug)}`)
      .then(setCompany)
      .catch(() => setNotFound(true));
  }, [slug]);

  const submit = useCallback(async () => {
    setErr(null);
    if (!email.trim() || password.length < 8) {
      setErr(ar ? 'أدخل البريد وكلمة المرور (٨ أحرف على الأقل).' : 'Enter your email and password (≥ 8 chars).');
      return;
    }
    setBusy(true);
    try {
      const res = await api<LoginResponse>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: email.trim(), password, companySlug: slug }),
      });
      setApiKey(res.apiKey);
      await refresh();
      router.push('/');
    } catch (e) { setErr((e as Error).message); setBusy(false); }
  }, [email, password, slug, ar, refresh, router]);

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-slate-950 px-6 text-slate-100">
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="animate-aurora absolute -left-1/4 -top-1/4 h-[60vh] w-[60vh] rounded-full bg-sky-500/14 blur-[120px]" />
        <div className="animate-aurora-2 absolute -right-1/4 top-1/3 h-[50vh] w-[50vh] rounded-full bg-violet-500/12 blur-[120px]" />
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/40 to-transparent" />
      </div>
      <div className="absolute top-4 end-4 z-20 flex items-center gap-2"><LangSwitch /><ThemeToggle /></div>

      <div className="relative z-10 w-full max-w-md [animation:fade-in-up_0.5s_ease-out_both]">
        {notFound ? (
          <div className="rounded-2xl border border-slate-700/60 bg-slate-900/50 p-8 text-center shadow-xl">
            <p className="text-lg font-semibold text-slate-50">{ar ? 'الشركة غير موجودة' : 'Company not found'}</p>
            <p className="mt-2 text-sm text-slate-400">{ar ? 'تحقّق من الرابط أو سجّل شركة جديدة.' : 'Check the link, or register a new company.'}</p>
            <Link href="/intro" className="mt-4 inline-block text-sm text-sky-300 hover:text-sky-200">{ar ? '→ الصفحة الرئيسية' : '→ Go to the home page'}</Link>
          </div>
        ) : (
          <>
            <div className="mb-7 text-center">
              <div className="mx-auto mb-4 grid h-16 w-16 place-items-center overflow-hidden rounded-2xl bg-white text-3xl shadow-xl ring-1 ring-white/15">
                {company ? (TYPE_ICON[company.companyType] ?? '🏢') : '·'}
              </div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-sky-400">{ar ? 'بوّابة الشركة' : 'Company portal'}</p>
              <h1 className="mt-1.5 text-2xl font-semibold tracking-tight text-slate-50">{company?.name ?? (ar ? '…' : '…')}</h1>
              <p className="mt-1 text-sm text-slate-400">{ar ? 'سجّل الدخول إلى مساحة شركتك.' : 'Sign in to your company workspace.'}</p>
            </div>

            {welcome && (
              <div className="mb-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-center text-sm text-emerald-200">
                🎉 {ar ? 'تم إنشاء شركتك! سجّل الدخول بحساب المالك للبدء.' : 'Your company is ready! Sign in with the owner account to start.'}
              </div>
            )}

            {err && <div className="mb-4"><ErrorBanner message={err} /></div>}

            <div className="space-y-4 rounded-2xl border border-slate-700/60 bg-slate-900/50 p-6 shadow-xl shadow-black/20 backdrop-blur-sm">
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-200">{ar ? 'البريد الإلكتروني' : 'Email'}</label>
                <input className={fieldCls} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" dir="ltr" autoComplete="email" autoFocus onKeyDown={(e) => { if (e.key === 'Enter') void submit(); }} />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-200">{ar ? 'كلمة المرور' : 'Password'}</label>
                <div className="relative">
                  <input className={`${fieldCls} pe-16`} type={showPw ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" dir="ltr" autoComplete="current-password" onKeyDown={(e) => { if (e.key === 'Enter') void submit(); }} />
                  <button type="button" onClick={() => setShowPw((v) => !v)} className="absolute end-2 top-1/2 -translate-y-1/2 rounded-md px-2 py-1 text-[11px] font-medium text-slate-300 transition hover:bg-slate-800 hover:text-slate-100">
                    {showPw ? (ar ? 'إخفاء' : 'Hide') : (ar ? 'إظهار' : 'Show')}
                  </button>
                </div>
              </div>
              <Button variant="primary" onClick={() => void submit()} disabled={busy} className="w-full justify-center py-3 text-sm">
                <IconLogIn className="h-4 w-4" /> {busy ? (ar ? 'جارٍ الدخول…' : 'Signing in…') : (ar ? 'تسجيل الدخول' : 'Sign in')}
              </Button>
            </div>

            <p className="mt-5 text-center text-xs text-slate-500">
              {ar ? 'تريد تسجيل شركة جديدة؟ ' : 'Want to register a new company? '}
              <Link href="/register" className="text-sky-300 hover:text-sky-200">{ar ? 'سجّل الآن' : 'Register'}</Link>
            </p>
          </>
        )}
      </div>
    </div>
  );
}

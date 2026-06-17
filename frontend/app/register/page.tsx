'use client';

/**
 * SaaS company self-registration (public, fullscreen). One focused step:
 *  pick the construction-entity type (configures the platform) + company +
 *  owner → POST /onboarding/register. Then:
 *   - billing ON  → redirect to Stripe Checkout (30-day trial, card on file).
 *   - billing OFF → redirect to the company's own login page /c/:slug.
 * Theme-correct (slate→warm-neutral flips per light/dark; sky→crimson brand).
 * Bilingual, easy-fill (labelled fields, country picker, password reveal).
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

import { api, RegisterCompanyResponse } from '../../lib/api';
import { useI18n } from '../../lib/i18n';
import { LangSwitch } from '../../components/LangSwitch';
import { ThemeToggle } from '../../components/ThemeToggle';
import { Button, ErrorBanner } from '../../components/ui';
import { IconCheck, IconSparkles } from '../../components/Icons';

interface TypeOpt { type: string; labelEn: string; labelAr: string; ownerRole: string; allowedRoles: string[] }

const TYPE_ICON: Record<string, string> = {
  developer_owner: '🏗️', contractor: '👷', consultant: '📐', pmo: '🗂️',
  investor: '💼', lender: '🏦', government: '🏛️', operator: '⚙️',
};

// Common countries (ISO-2) for the picker — GCC + Egypt + frequent partners.
const COUNTRIES: Array<{ code: string; en: string; ar: string }> = [
  { code: 'AE', en: 'United Arab Emirates', ar: 'الإمارات العربية المتحدة' },
  { code: 'SA', en: 'Saudi Arabia', ar: 'السعودية' },
  { code: 'EG', en: 'Egypt', ar: 'مصر' },
  { code: 'QA', en: 'Qatar', ar: 'قطر' },
  { code: 'KW', en: 'Kuwait', ar: 'الكويت' },
  { code: 'BH', en: 'Bahrain', ar: 'البحرين' },
  { code: 'OM', en: 'Oman', ar: 'عُمان' },
  { code: 'JO', en: 'Jordan', ar: 'الأردن' },
  { code: 'LB', en: 'Lebanon', ar: 'لبنان' },
  { code: 'IQ', en: 'Iraq', ar: 'العراق' },
  { code: 'GB', en: 'United Kingdom', ar: 'المملكة المتحدة' },
  { code: 'US', en: 'United States', ar: 'الولايات المتحدة' },
  { code: 'DE', en: 'Germany', ar: 'ألمانيا' },
  { code: 'IN', en: 'India', ar: 'الهند' },
];

/** Cryptographically-strong password (browser crypto) — mixed classes, 16 chars. */
function genStrongPassword(len = 16): string {
  const sets = ['ABCDEFGHJKLMNPQRSTUVWXYZ', 'abcdefghijkmnpqrstuvwxyz', '23456789', '!@#$%^&*?'];
  const all = sets.join('');
  const rnd = new Uint32Array(len);
  (window.crypto ?? (window as unknown as { msCrypto: Crypto }).msCrypto).getRandomValues(rnd);
  const out: string[] = [];
  // Guarantee at least one char from each class, then fill the rest.
  sets.forEach((s, i) => out.push(s[rnd[i] % s.length]));
  for (let i = sets.length; i < len; i += 1) out.push(all[rnd[i] % all.length]);
  // Shuffle so the guaranteed chars aren't always at the front.
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = rnd[i] % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out.join('');
}

const labelCls = 'mb-1.5 block text-xs font-semibold text-slate-200';
const fieldCls =
  'block w-full rounded-xl border border-slate-600/70 bg-slate-900/70 px-4 py-3 text-sm text-slate-50 shadow-inner shadow-black/20 transition placeholder:text-slate-500 hover:border-slate-500 focus:border-sky-500/80 focus:bg-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/30';

export default function RegisterPage() {
  const { lang } = useI18n();
  const ar = lang === 'ar';
  const router = useRouter();

  const [types, setTypes] = useState<TypeOpt[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [billingEnabled, setBillingEnabled] = useState<boolean | null>(null);
  const [showPw, setShowPw] = useState(false);
  const [copied, setCopied] = useState(false);

  const [companyType, setCompanyType] = useState<string>('contractor');
  const [companyName, setCompanyName] = useState('');
  const [country, setCountry] = useState('AE');
  const [ownerName, setOwnerName] = useState('');
  const [ownerEmail, setOwnerEmail] = useState('');
  const [ownerPassword, setOwnerPassword] = useState('');

  useEffect(() => {
    api<TypeOpt[]>('/onboarding/types')
      .then((tp) => { setTypes(tp); if (tp[0]) setCompanyType((c) => c || tp[0].type); })
      .catch(() => setTypes([]));
    api<{ enabled: boolean }>('/billing/config')
      .then((b) => setBillingEnabled(b.enabled))
      .catch(() => setBillingEnabled(false));
  }, []);

  const emailOk = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(ownerEmail.trim());
  const canSubmit = companyName.trim() && ownerName.trim() && emailOk && ownerPassword.length >= 8;

  const submit = useCallback(async () => {
    setErr(null);
    if (!canSubmit) {
      setErr(ar ? 'أكمل كل الحقول المطلوبة (كلمة المرور ٨ أحرف على الأقل وبريد صحيح).' : 'Complete all required fields (valid email + password ≥ 8 chars).');
      return;
    }
    setBusy(true);
    try {
      const res = await api<RegisterCompanyResponse>('/onboarding/register', {
        method: 'POST',
        body: JSON.stringify({ companyName, companyType, country, ownerEmail, ownerDisplayName: ownerName, ownerPassword }),
      });
      // Billing on → Stripe Checkout (trial); off → straight to company login.
      if (res.checkoutUrl) { window.location.href = res.checkoutUrl; return; }
      router.push(`/c/${res.company.slug}?welcome=1`);
    } catch (e) { setErr((e as Error).message); setBusy(false); }
  }, [canSubmit, ar, companyName, companyType, country, ownerEmail, ownerName, ownerPassword, router]);

  const onGenerate = useCallback(() => {
    const pw = genStrongPassword(16);
    setOwnerPassword(pw);
    setShowPw(true);
    try {
      void navigator.clipboard?.writeText(pw);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch { /* clipboard not available — the password is still filled + visible */ }
  }, []);

  const pwHint = useMemo(() => {
    if (!ownerPassword) return null;
    if (ownerPassword.length < 8) return { ok: false, msg: ar ? `${8 - ownerPassword.length} أحرف متبقية` : `${8 - ownerPassword.length} more characters` };
    return { ok: true, msg: ar ? 'كلمة مرور جيدة' : 'Looks good' };
  }, [ownerPassword, ar]);

  return (
    <div className="relative min-h-screen overflow-y-auto bg-slate-950 text-slate-100">
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="animate-aurora absolute -left-1/4 -top-1/4 h-[55vh] w-[55vh] rounded-full bg-sky-500/12 blur-[120px]" />
        <div className="animate-aurora-2 absolute -right-1/4 top-1/4 h-[45vh] w-[45vh] rounded-full bg-violet-500/10 blur-[120px]" />
      </div>
      <div className="absolute top-4 end-4 z-20 flex items-center gap-2"><LangSwitch /><ThemeToggle /></div>

      <div className="relative z-10 mx-auto w-full max-w-2xl px-5 py-12">
        <div className="mb-6 flex items-center justify-between">
          <Link href="/intro" className="text-xs text-slate-400 transition hover:text-slate-200">← {ar ? 'رجوع' : 'Back'}</Link>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-2.5 py-1 text-[11px] font-semibold text-emerald-300 ring-1 ring-emerald-500/30">
            {ar ? 'تجربة مجانية ٣٠ يومًا' : '30-day free trial'}
          </span>
        </div>

        {err && <div className="mb-4"><ErrorBanner message={err} /></div>}

        <div className="rounded-2xl border border-slate-700/60 bg-slate-900/50 p-6 shadow-xl shadow-black/20 backdrop-blur-sm sm:p-8">
          <div className="space-y-6">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-slate-50">{ar ? 'سجّل شركتك' : 'Register your company'}</h1>
              <p className="mt-1 text-sm text-slate-400">{ar ? 'اختر نوع جهتك — يضبط المنصّة لك تلقائيًا. الإعداد يستغرق دقيقة.' : 'Pick your entity type — it configures the platform for you. Takes a minute.'}</p>
            </div>

            <div>
              <p className={labelCls}>{ar ? 'نوع الجهة الإنشائية' : 'Construction-entity type'}</p>
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                {types.map((tp) => {
                  const active = companyType === tp.type;
                  return (
                    <button
                      key={tp.type}
                      type="button"
                      onClick={() => setCompanyType(tp.type)}
                      aria-pressed={active}
                      className={`group relative rounded-xl border p-3 text-center text-xs transition ${active ? 'border-sky-400/70 bg-sky-500/10 text-slate-50 shadow-[0_0_0_3px_rgba(200,16,46,0.12)]' : 'border-slate-700/70 bg-slate-900/40 text-slate-300 hover:border-slate-500 hover:text-slate-100'}`}
                    >
                      <span className="mb-1 block text-2xl">{TYPE_ICON[tp.type] ?? '🏢'}</span>
                      <span className="block leading-tight">{ar ? tp.labelAr : tp.labelEn}</span>
                      {active && <IconCheck className="absolute end-1.5 top-1.5 h-3.5 w-3.5 text-sky-400" />}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className={labelCls}>{ar ? 'اسم الشركة' : 'Company name'} <span className="text-rose-400">*</span></label>
                <input className={fieldCls} value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder={ar ? 'مثال: شركة النيل للمقاولات' : 'e.g. Nile Contracting'} dir={ar ? 'rtl' : 'ltr'} autoFocus />
              </div>
              <div>
                <label className={labelCls}>{ar ? 'الدولة' : 'Country'}</label>
                <select className={fieldCls} value={country} onChange={(e) => setCountry(e.target.value)} dir={ar ? 'rtl' : 'ltr'}>
                  {COUNTRIES.map((c) => <option key={c.code} value={c.code}>{ar ? c.ar : c.en}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>{ar ? 'اسم المالك' : 'Owner name'} <span className="text-rose-400">*</span></label>
                <input className={fieldCls} value={ownerName} onChange={(e) => setOwnerName(e.target.value)} placeholder={ar ? 'الاسم الكامل' : 'Full name'} dir={ar ? 'rtl' : 'ltr'} autoComplete="name" />
              </div>
              <div>
                <label className={labelCls}>{ar ? 'بريد المالك' : 'Owner email'} <span className="text-rose-400">*</span></label>
                <input className={`${fieldCls} ${ownerEmail && !emailOk ? 'border-rose-500/60' : ''}`} type="email" value={ownerEmail} onChange={(e) => setOwnerEmail(e.target.value)} placeholder="owner@company.com" dir="ltr" autoComplete="email" />
                {ownerEmail && !emailOk && <p className="mt-1 text-[11px] text-rose-400">{ar ? 'بريد إلكتروني غير صحيح' : 'Enter a valid email'}</p>}
              </div>
              <div className="sm:col-span-2">
                <label className={labelCls}>{ar ? 'كلمة المرور' : 'Password'} <span className="text-rose-400">*</span></label>
                <div className="relative">
                  <input className={`${fieldCls} pe-16 ${ar ? 'text-right' : ''}`} type={showPw ? 'text' : 'password'} value={ownerPassword} onChange={(e) => setOwnerPassword(e.target.value)} placeholder={ar ? '٨ أحرف على الأقل' : 'At least 8 characters'} dir="ltr" autoComplete="new-password" />
                  <button type="button" onClick={() => setShowPw((v) => !v)} className="absolute end-2 top-1/2 -translate-y-1/2 rounded-md px-2 py-1 text-[11px] font-medium text-slate-300 transition hover:bg-slate-800 hover:text-slate-100">
                    {showPw ? (ar ? 'إخفاء' : 'Hide') : (ar ? 'إظهار' : 'Show')}
                  </button>
                </div>
                <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2">
                  <p className={`text-[11px] ${pwHint ? (pwHint.ok ? 'text-emerald-400' : 'text-slate-500') : 'text-transparent'}`}>{pwHint?.msg ?? '·'}</p>
                  <button type="button" onClick={onGenerate} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-sky-300 transition hover:bg-sky-500/10 hover:text-sky-200">
                    🔐 {ar ? 'توليد كلمة مرور قوية' : 'Generate strong password'}{copied ? ` · ${ar ? 'تم النسخ' : 'copied'}` : ''}
                  </button>
                </div>
              </div>
            </div>

            {billingEnabled && (
              <div className="rounded-xl border border-slate-700/60 bg-slate-900/40 px-4 py-3 text-xs text-slate-300">
                {ar
                  ? 'الخطوة التالية: إدخال بطاقة عبر بوّابة Stripe الآمنة. تجربة مجانية ٣٠ يومًا — بدون أي خصم اليوم، ويبدأ الاشتراك تلقائيًا بعدها. يمكنك الإلغاء في أي وقت.'
                  : 'Next: enter a card on Stripe’s secure gateway. 30-day free trial — no charge today, billing starts automatically after. Cancel anytime.'}
              </div>
            )}

            <Button variant="primary" onClick={() => void submit()} disabled={busy || !canSubmit} className="w-full justify-center py-3 text-sm">
              {busy
                ? (ar ? 'جارٍ المتابعة…' : 'Continuing…')
                : billingEnabled
                  ? (<><IconSparkles className="h-4 w-4" /> {ar ? 'المتابعة إلى الدفع الآمن' : 'Continue to secure payment'}</>)
                  : (<><IconSparkles className="h-4 w-4" /> {ar ? 'إنشاء الشركة' : 'Create company'}</>)}
            </Button>

            <p className="text-center text-xs text-slate-500">
              {ar ? 'لديك حساب بالفعل؟ ' : 'Already have an account? '}
              <Link href="/auth" className="text-sky-300 hover:text-sky-200">{ar ? 'تسجيل الدخول' : 'Sign in'}</Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

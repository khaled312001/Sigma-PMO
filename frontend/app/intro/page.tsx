'use client';

/**
 * SaaS intro / first-experience splash. Public (fullscreen, no chrome). The
 * app's first door — register a company or sign in. Theme-correct (the app
 * remaps slate→warm-neutral that flips per light/dark, and sky→crimson brand);
 * mirrors the /auth page tokens so it reads well in both themes. Bilingual.
 */
import Link from 'next/link';

import { useI18n } from '../../lib/i18n';
import { LangSwitch } from '../../components/LangSwitch';
import { ThemeToggle } from '../../components/ThemeToggle';
import { Button } from '../../components/ui';
import { IconLogIn, IconShield, IconSparkles, IconEvidence } from '../../components/Icons';

export default function IntroPage() {
  const { t, lang } = useI18n();
  const ar = lang === 'ar';

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-slate-950 px-6 text-center text-slate-100">
      {/* Aurora backdrop (sky→crimson brand · violet · emerald), same as /auth. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="animate-aurora absolute -left-1/4 -top-1/4 h-[70vh] w-[70vh] rounded-full bg-sky-500/15 blur-[120px]" />
        <div className="animate-aurora-2 absolute -right-1/4 top-1/3 h-[55vh] w-[55vh] rounded-full bg-violet-500/15 blur-[120px]" />
        <div className="animate-aurora absolute bottom-0 left-1/3 h-[45vh] w-[45vh] rounded-full bg-emerald-500/12 blur-[120px]" style={{ animationDelay: '6s' }} />
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/40 to-transparent" />
      </div>

      <div className="absolute top-4 end-4 z-20 flex items-center gap-2">
        <LangSwitch />
        <ThemeToggle />
      </div>

      <div className="relative z-10 w-full max-w-2xl [animation:fade-in-up_0.6s_ease-out_both]">
        <div className="mx-auto mb-7 h-16 w-16 overflow-hidden rounded-2xl ring-1 ring-sky-400/40 shadow-xl shadow-sky-500/20">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt={t('brand.name')} className="h-full w-full object-cover" />
        </div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-sky-400">
          Sigma PMO · AI Governance OS
        </p>
        <h1 className="font-display mx-auto mt-3 max-w-xl bg-gradient-to-br from-slate-50 via-slate-200 to-slate-400 bg-clip-text text-3xl font-semibold leading-tight tracking-tight text-transparent sm:text-4xl">
          {ar ? 'منصّة حوكمة الاستثمار والتسليم للإنشاءات' : 'Investment, Delivery & Governance OS for Construction'}
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-sm leading-relaxed text-slate-400">
          {ar
            ? 'سجّل شركتك في دقائق، اختر نوع جهتك الإنشائية، وابدأ بحوكمة مشاريعك بالذكاء الاصطناعي — ثم أضِف فريقك.'
            : 'Register your company in minutes, pick your construction-entity type, and start governing your projects with AI — then add your team.'}
        </p>

        <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link href="/register" className="w-full sm:w-auto">
            <Button variant="primary" className="w-full justify-center px-8 py-3 text-sm sm:w-auto">
              <IconSparkles className="h-4 w-4" /> {ar ? 'سجّل شركتك' : 'Register your company'}
            </Button>
          </Link>
          <Link href="/auth" className="w-full sm:w-auto">
            <Button variant="ghost" className="w-full justify-center px-8 py-3 text-sm sm:w-auto">
              <IconLogIn className="h-4 w-4" /> {ar ? 'تسجيل الدخول' : 'Sign in'}
            </Button>
          </Link>
        </div>

        <div className="mx-auto mt-11 flex max-w-xl flex-wrap items-center justify-center gap-x-5 gap-y-2 text-[11px] text-slate-500">
          <span className="inline-flex items-center gap-1.5"><IconShield className="h-3.5 w-3.5 text-emerald-400/70" /> {ar ? 'حتمي أولًا' : 'Deterministic-first'}</span>
          <span className="inline-flex items-center gap-1.5"><IconEvidence className="h-3.5 w-3.5 text-emerald-400/70" /> {ar ? 'سرد بالذكاء الاصطناعي مع استشهادات' : 'AI narration with citations'}</span>
          <span className="inline-flex items-center gap-1.5"><IconShield className="h-3.5 w-3.5 text-emerald-400/70" /> {ar ? 'عزل بيانات لكل شركة' : 'Per-company data isolation'}</span>
        </div>
      </div>
    </div>
  );
}

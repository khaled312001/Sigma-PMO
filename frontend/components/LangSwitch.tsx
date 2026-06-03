'use client';

import { useI18n } from '../lib/i18n';

export function LangSwitch() {
  const { lang, toggle } = useI18n();
  const label = lang === 'ar' ? 'Switch to English' : 'تبديل إلى العربية';
  return (
    <button
      onClick={toggle}
      aria-label={label}
      title={label}
      className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-800 bg-slate-900/60 px-2.5 text-[11px] font-semibold uppercase tracking-wider text-slate-300 transition hover:border-slate-600 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/60"
    >
      <span aria-hidden>{lang === 'ar' ? 'EN' : 'ع'}</span>
    </button>
  );
}

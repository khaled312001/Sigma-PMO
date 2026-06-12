'use client';

import { useTheme } from '../lib/theme-context';
import { useI18n } from '../lib/i18n';
import { IconMoon, IconSun } from './Icons';

export function ThemeToggle() {
  const { theme, toggle } = useTheme();
  const { lang } = useI18n();
  const isDark = theme === 'dark';
  const label = isDark
    ? (lang === 'ar' ? 'تبديل للوضع الفاتح' : 'Switch to light theme')
    : (lang === 'ar' ? 'تبديل للوضع الداكن' : 'Switch to dark theme');
  return (
    <button
      onClick={toggle}
      aria-label={label}
      title={label}
      className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-800 bg-slate-900/60 text-slate-300 transition hover:border-slate-600 hover:text-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/60"
    >
      {isDark ? <IconSun className="h-4 w-4" /> : <IconMoon className="h-4 w-4" />}
    </button>
  );
}

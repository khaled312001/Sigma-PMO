'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { en, type Dictionary } from './en';
import { ar } from './ar';

export type Lang = 'en' | 'ar';

const DICTS: Record<Lang, Dictionary> = { en, ar };
const STORAGE_KEY = 'sigma_lang';

interface I18nState {
  lang: Lang;
  dir: 'ltr' | 'rtl';
  setLang: (l: Lang) => void;
  toggle: () => void;
  t: (path: string, vars?: Record<string, string | number>) => string;
}

const Ctx = createContext<I18nState | null>(null);

function readInitial(): Lang {
  if (typeof window === 'undefined') return 'en';
  const stored = window.localStorage.getItem(STORAGE_KEY) as Lang | null;
  if (stored === 'en' || stored === 'ar') return stored;
  if (typeof navigator !== 'undefined' && navigator.language?.toLowerCase().startsWith('ar')) return 'ar';
  return 'en';
}

function resolve(dict: Dictionary, path: string): string | undefined {
  const parts = path.split('.');
  let node: unknown = dict;
  for (const p of parts) {
    if (node && typeof node === 'object' && p in (node as Record<string, unknown>)) {
      node = (node as Record<string, unknown>)[p];
    } else {
      return undefined;
    }
  }
  return typeof node === 'string' ? node : undefined;
}

function interpolate(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_, k) => (k in vars ? String(vars[k]) : `{${k}}`));
}

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>('en');

  useEffect(() => {
    const next = readInitial();
    setLangState(next);
    const dir = next === 'ar' ? 'rtl' : 'ltr';
    document.documentElement.lang = next;
    document.documentElement.dir = dir;
  }, []);

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    const dir = l === 'ar' ? 'rtl' : 'ltr';
    document.documentElement.lang = l;
    document.documentElement.dir = dir;
    try { window.localStorage.setItem(STORAGE_KEY, l); } catch {}
  }, []);

  const toggle = useCallback(() => setLang(lang === 'en' ? 'ar' : 'en'), [lang, setLang]);

  const value = useMemo<I18nState>(() => {
    const dict = DICTS[lang];
    const t = (path: string, vars?: Record<string, string | number>): string => {
      const v = resolve(dict, path) ?? resolve(en, path);
      if (!v) return path;
      return interpolate(v, vars);
    };
    return { lang, dir: lang === 'ar' ? 'rtl' : 'ltr', setLang, toggle, t };
  }, [lang, setLang, toggle]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useI18n(): I18nState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useI18n must be used inside <I18nProvider>');
  return ctx;
}

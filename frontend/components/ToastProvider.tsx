'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import { IconAlertCritical, IconAlertWarning, IconCheck, IconInfo, IconX } from './Icons';

export type ToastTone = 'success' | 'error' | 'warning' | 'info';

interface Toast {
  id: number;
  tone: ToastTone;
  title: string;
  description?: string;
}

interface ToastContextValue {
  show: (toast: Omit<Toast, 'id'>) => void;
  /** Shorthand helpers. */
  success: (title: string, description?: string) => void;
  error:   (title: string, description?: string) => void;
  warning: (title: string, description?: string) => void;
  info:    (title: string, description?: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast() must be inside <ToastProvider>');
  return ctx;
}

const TONE_STYLE: Record<ToastTone, { ring: string; bg: string; icon: React.ReactNode; label: string }> = {
  success: { ring: 'ring-emerald-500/40', bg: 'bg-emerald-500/10 text-emerald-100', icon: <IconCheck className="h-4 w-4 text-emerald-300" />, label: 'Success' },
  error:   { ring: 'ring-red-500/40',     bg: 'bg-red-500/10 text-red-100',         icon: <IconAlertCritical className="h-4 w-4 text-red-300" />, label: 'Error' },
  warning: { ring: 'ring-amber-400/40',   bg: 'bg-amber-400/10 text-amber-100',     icon: <IconAlertWarning className="h-4 w-4 text-amber-200" />, label: 'Warning' },
  info:    { ring: 'ring-sky-500/40',     bg: 'bg-sky-500/10 text-sky-100',         icon: <IconInfo className="h-4 w-4 text-sky-300" />, label: 'Info' },
};

const DISMISS_AFTER_MS = 5000;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);
  const timers = useRef<Record<number, ReturnType<typeof setTimeout>>>({});

  const remove = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const t = timers.current[id];
    if (t) clearTimeout(t);
    delete timers.current[id];
  }, []);

  const show = useCallback((toast: Omit<Toast, 'id'>) => {
    const id = nextId.current++;
    setToasts((prev) => [...prev, { id, ...toast }]);
    timers.current[id] = setTimeout(() => remove(id), DISMISS_AFTER_MS);
  }, [remove]);

  useEffect(() => {
    return () => {
      Object.values(timers.current).forEach(clearTimeout);
    };
  }, []);

  const value = useMemo<ToastContextValue>(() => ({
    show,
    success: (title, description) => show({ tone: 'success', title, description }),
    error:   (title, description) => show({ tone: 'error',   title, description }),
    warning: (title, description) => show({ tone: 'warning', title, description }),
    info:    (title, description) => show({ tone: 'info',    title, description }),
  }), [show]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        aria-atomic="false"
        className="pointer-events-none fixed inset-x-0 bottom-4 z-[60] flex flex-col items-center gap-2 px-4 sm:items-end sm:px-6"
      >
        {toasts.map((toast) => {
          const t = TONE_STYLE[toast.tone];
          return (
            <div
              key={toast.id}
              role="status"
              className={`pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-lg border border-slate-800 px-3 py-2.5 text-sm shadow-xl ring-1 ${t.bg} ${t.ring}`}
            >
              <span aria-hidden className="mt-0.5">{t.icon}</span>
              <div className="min-w-0 flex-1">
                <p className="font-medium leading-tight">{toast.title}</p>
                {toast.description && <p className="mt-0.5 text-xs leading-snug opacity-90">{toast.description}</p>}
              </div>
              <button
                onClick={() => remove(toast.id)}
                aria-label="Dismiss notification"
                className="ml-1 rounded p-0.5 text-slate-300 hover:bg-black/20 hover:text-slate-50"
              >
                <IconX className="h-3.5 w-3.5" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

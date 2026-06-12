'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import { Button } from './ui';
import { IconX } from './Icons';

export interface ConfirmOptions {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
}

interface PendingConfirm extends ConfirmOptions {
  resolve: (confirmed: boolean) => void;
}

interface ConfirmContextValue {
  confirm: (options: ConfirmOptions) => Promise<boolean>;
}

const ConfirmContext = createContext<ConfirmContextValue | null>(null);

export function useConfirm(): (options: ConfirmOptions) => Promise<boolean> {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm() must be inside <ConfirmProvider>');
  return ctx.confirm;
}

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [pending, setPending] = useState<PendingConfirm | null>(null);
  const confirmButtonRef = useRef<HTMLButtonElement | null>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  // Focus management: trap focus inside, return to opener on close.
  useEffect(() => {
    if (pending) {
      previouslyFocused.current = (document.activeElement as HTMLElement | null) ?? null;
      // Defer focus so the dialog mounts first.
      setTimeout(() => confirmButtonRef.current?.focus(), 10);
      const handler = (e: KeyboardEvent) => {
        if (e.key === 'Escape') { e.preventDefault(); resolve(false); }
      };
      document.addEventListener('keydown', handler);
      return () => document.removeEventListener('keydown', handler);
    } else {
      previouslyFocused.current?.focus?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending]);

  const resolve = useCallback((confirmed: boolean) => {
    if (pending) {
      pending.resolve(confirmed);
      setPending(null);
    }
  }, [pending]);

  const confirm = useCallback((options: ConfirmOptions): Promise<boolean> => {
    return new Promise<boolean>((res) => {
      setPending({ ...options, resolve: res });
    });
  }, []);

  const value = useMemo<ConfirmContextValue>(() => ({ confirm }), [confirm]);

  return (
    <ConfirmContext.Provider value={value}>
      {children}
      {pending && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
          <div className="absolute inset-0 bg-black/70" onClick={() => resolve(false)} aria-hidden />
          <div className="relative w-full max-w-md rounded-xl border border-slate-800 bg-slate-950 p-5 shadow-2xl">
            <button
              onClick={() => resolve(false)}
              aria-label="Close dialog"
              className="absolute right-3 top-3 rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-slate-50"
            >
              <IconX className="h-4 w-4" />
            </button>
            <h2 id="confirm-title" className="pr-8 text-base font-semibold text-slate-50">{pending.title}</h2>
            {pending.description && <p className="mt-2 text-sm text-slate-300">{pending.description}</p>}
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => resolve(false)}>
                {pending.cancelLabel ?? 'Cancel'}
              </Button>
              <button
                ref={confirmButtonRef}
                onClick={() => resolve(true)}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-medium text-white transition ${
                  pending.destructive ? 'bg-red-600 hover:bg-red-500' : 'bg-sky-600 hover:bg-sky-500'
                }`}
              >
                {pending.confirmLabel ?? 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}

'use client';

import { useEffect } from 'react';

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error('UI error boundary:', error);
  }, [error]);

  return (
    <div className="grid place-items-center py-24 text-center">
      <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-rose-400">Unexpected error</p>
      <h1 className="mt-2 text-2xl font-semibold text-slate-50">Something went wrong</h1>
      <p className="mt-2 max-w-md text-sm text-slate-400">
        {error.message || 'An unexpected client error occurred. Try again, or return to the overview.'}
      </p>
      <div className="mt-6 flex gap-2">
        <button onClick={() => reset()} className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-500">
          Try again
        </button>
        <a href="/" className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-200 hover:border-slate-500">Back to Overview</a>
      </div>
    </div>
  );
}

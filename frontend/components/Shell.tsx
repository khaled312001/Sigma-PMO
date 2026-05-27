'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import { api, clearApiKey, MeResponse } from '../lib/api';
import { Sidebar } from './Sidebar';
import { ROLE_LABEL } from '../lib/capabilities';
import { Pill } from './ui';

const PROJECT_KEY = 'P-1000';

export function Shell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [me, setMe] = useState<MeResponse | null>(null);
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setMe(await api<MeResponse>('/auth/me'));
    } catch {
      setMe({ authenticated: false, bootstrapMode: false, user: null });
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const onSignOut = () => {
    clearApiKey();
    setMe({ authenticated: false, bootstrapMode: false, user: null });
    router.push('/auth');
  };

  return (
    <div className="flex min-h-screen">
      <Sidebar me={me} onSignOut={onSignOut} />
      <div className="flex min-h-screen flex-1 flex-col">
        <header className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-800/70 bg-slate-950/80 px-6 py-3 backdrop-blur">
          <div className="flex items-center gap-3 text-xs text-slate-400">
            <span className="text-slate-500">Project</span>
            <Pill tone="sky">{PROJECT_KEY} · Nile Tower</Pill>
          </div>
          <div className="flex items-center gap-2">
            {me?.bootstrapMode && <Pill tone="amber">Bootstrap mode</Pill>}
            {me?.user && <Pill tone="emerald">{ROLE_LABEL[me.user.role]}</Pill>}
          </div>
        </header>
        <main className="flex-1 px-6 py-6 sm:px-10">
          {!loaded ? (
            <div className="grid h-64 place-items-center text-sm text-slate-400">Loading workspace…</div>
          ) : (
            children
          )}
        </main>
      </div>
    </div>
  );
}

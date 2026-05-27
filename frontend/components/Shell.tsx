'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import { api, clearApiKey, MeResponse } from '../lib/api';
import { Sidebar } from './Sidebar';

/**
 * Top-level shell shared by every page: loads the current user via /auth/me
 * (or bootstrap-mode indicator), renders the role-aware sidebar, and exposes
 * the user via children — pages receive their own copy via the `useMe()`
 * helper below, but the sidebar already shows it.
 */
export function Shell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [me, setMe] = useState<MeResponse | null>(null);
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const r = await api<MeResponse>('/auth/me');
      setMe(r);
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
      <div className="flex-1">
        {!loaded ? (
          <div className="p-8 text-sm text-slate-400">Loading…</div>
        ) : (
          <div className="px-8 py-6">{children}</div>
        )}
      </div>
    </div>
  );
}

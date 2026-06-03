'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';

import { api, MeResponse } from './api';

interface MeState {
  me: MeResponse | null;
  loaded: boolean;
  refresh: () => Promise<void>;
  setMe: (m: MeResponse | null) => void;
}

const Ctx = createContext<MeState | null>(null);

export function MeProvider({ children }: { children: React.ReactNode }) {
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

  return <Ctx.Provider value={{ me, loaded, refresh, setMe }}>{children}</Ctx.Provider>;
}

export function useMe(): MeState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useMe must be used inside <MeProvider>');
  return ctx;
}

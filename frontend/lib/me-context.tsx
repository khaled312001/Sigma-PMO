'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';

import { api, MeResponse } from './api';
import { applyCapabilityMatrix, CAPABILITIES } from './capabilities';
import type { Role } from './api';

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
      const next = await api<MeResponse>('/auth/me');
      // Sync the EFFECTIVE capability matrix (admin overrides merged with
      // defaults) so the UI gates exactly as the backend enforces. Best-effort:
      // any failure leaves the hardcoded defaults in place.
      if (next.authenticated) {
        try {
          const snap = await api<{ matrix: Record<Role, (typeof CAPABILITIES)[Role]> }>('/admin/capabilities');
          if (snap?.matrix) applyCapabilityMatrix(snap.matrix);
        } catch { /* keep defaults */ }
      }
      setMe(next);
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

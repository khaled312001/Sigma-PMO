'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { api } from './api';
import { useMe } from './me-context';

export interface ProjectSummary {
  id: string;
  businessKey: string;
  name: string;
  status: string | null;
  clientName: string | null;
  dataDate: string | null;
}

interface ProjectContextValue {
  projects: ProjectSummary[];
  current: ProjectSummary | null;
  /** Sets the current project by businessKey. */
  setCurrentByKey: (businessKey: string) => void;
  refresh: () => Promise<void>;
  loading: boolean;
}

const STORAGE_KEY = 'sigma_project_key';
const ProjectContext = createContext<ProjectContextValue | null>(null);

export function useProject(): ProjectContextValue {
  const ctx = useContext(ProjectContext);
  if (!ctx) throw new Error('useProject() must be inside <ProjectProvider>');
  return ctx;
}

/** Shorthand for the current businessKey (for API calls). Defaults to 'P-1000' until projects load. */
export function useCurrentProjectKey(): string {
  const { current } = useProject();
  return current?.businessKey ?? 'P-1000';
}

function readStoredKey(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(STORAGE_KEY);
}

function writeStoredKey(key: string): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, key);
}

export function ProjectProvider({ children }: { children: React.ReactNode }) {
  const { me } = useMe();
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [currentKey, setCurrentKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const list = await api<ProjectSummary[]>('/projects');
      setProjects(list);
      const stored = readStoredKey();
      const exists = stored && list.find((p) => p.businessKey === stored);
      const next = exists ? stored : list[0]?.businessKey ?? null;
      if (next) {
        setCurrentKey(next);
        writeStoredKey(next);
      }
    } catch {
      // /projects can fail in bootstrap mode (no users / no data yet). Keep last-known.
    } finally {
      setLoading(false);
    }
  }, []);

  // Only fetch /projects once the user is authenticated; anonymous would
  // just 401 and surface a misleading "No projects ingested" pill.
  useEffect(() => {
    if (me?.user) void refresh();
    else { setProjects([]); setCurrentKey(null); }
  }, [me?.user, refresh]);

  const setCurrentByKey = useCallback((businessKey: string) => {
    setCurrentKey(businessKey);
    writeStoredKey(businessKey);
  }, []);

  const current = useMemo(
    () => projects.find((p) => p.businessKey === currentKey) ?? null,
    [projects, currentKey],
  );

  const value = useMemo<ProjectContextValue>(() => ({
    projects, current, setCurrentByKey, refresh, loading,
  }), [projects, current, setCurrentByKey, refresh, loading]);

  return <ProjectContext.Provider value={value}>{children}</ProjectContext.Provider>;
}

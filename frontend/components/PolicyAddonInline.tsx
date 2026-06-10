'use client';

/**
 * PolicyAddonInline — the "اكتب للـ AI من نفس الصفحة" widget the 2026-06-08
 * meeting asked for (00:19:40): project-scoped instructions authored
 * inline on every AI surface, never on a separate admin page.
 *
 * Collapsed by default (a slim bar with the count); expands to the bullet
 * list + add form. Writes require `canEvaluateRules` (the Consultant's
 * gate); read-only roles see the list without the form.
 */

import { useCallback, useEffect, useState } from 'react';

import { api } from '../lib/api';
import { CAPABILITIES } from '../lib/capabilities';
import { useMe } from '../lib/me-context';
import { useToast } from './ToastProvider';
import { Button, Pill } from './ui';
import { IconChevronRight, IconSparkles, IconX } from './Icons';

interface PolicyAddon {
  id: string;
  createdAt: string;
  projectBusinessKey: string;
  surface: string;
  content: string;
  authoredBy: string | null;
  authoredByRole: string | null;
  isActive: boolean;
}

export function PolicyAddonInline({
  projectKey,
  surface,
}: {
  projectKey: string;
  surface: 'planning' | 'engineering' | 'governance' | 'reports';
}) {
  const { me } = useMe();
  const toast = useToast();
  const canWrite = !!me?.user && CAPABILITIES[me.user.role].canEvaluateRules;

  const [addons, setAddons] = useState<PolicyAddon[] | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    if (!projectKey) return;
    try {
      const list = await api<PolicyAddon[]>(
        `/policy-addons?projectKey=${encodeURIComponent(projectKey)}&surface=${surface}`,
      );
      setAddons(list);
    } catch {
      setAddons([]);
    }
  }, [projectKey, surface]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const onAdd = useCallback(async () => {
    if (!draft.trim()) return;
    setBusy(true);
    try {
      await api<PolicyAddon>('/policy-addons', {
        method: 'POST',
        body: JSON.stringify({
          projectKey,
          surface,
          content: draft.trim(),
          authoredBy: me?.user?.displayName ?? null,
          authoredByRole: me?.user?.role ?? null,
        }),
      });
      setDraft('');
      await refresh();
      toast.success('Instruction saved', 'The AI on this surface now follows it for this project.');
    } catch (e) {
      toast.error('Save failed', (e as Error).message);
    } finally {
      setBusy(false);
    }
  }, [draft, projectKey, surface, me?.user, refresh, toast]);

  const onRemove = useCallback(
    async (id: string) => {
      setBusy(true);
      try {
        await api<PolicyAddon>(
          `/policy-addons/${id}?by=${encodeURIComponent(me?.user?.displayName ?? '')}`,
          { method: 'DELETE' },
        );
        await refresh();
        toast.success('Instruction removed', 'Deactivated — the audit row survives.');
      } catch (e) {
        toast.error('Remove failed', (e as Error).message);
      } finally {
        setBusy(false);
      }
    },
    [me?.user?.displayName, refresh, toast],
  );

  const count = addons?.length ?? 0;

  return (
    <div className="rounded-xl border border-violet-500/40 bg-violet-500/10">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-2 px-4 py-2.5 text-start"
        aria-expanded={expanded}
      >
        <IconChevronRight
          className={`h-3.5 w-3.5 shrink-0 text-violet-200 transition-transform duration-200 ${expanded ? 'rotate-90' : ''}`}
        />
        <IconSparkles className="h-3.5 w-3.5 text-violet-200" />
        <span className="text-xs font-semibold text-violet-50">
          Project instructions for the AI on this surface
        </span>
        <Pill tone="violet">{count}</Pill>
        <span className="ms-auto text-[10px] text-violet-200/80">
          {canWrite ? 'Consultant / PD notes — applied to every AI call here' : 'Read-only for your role'}
        </span>
      </button>

      {expanded && (
        <div className="space-y-2 border-t border-violet-500/30 px-4 py-3 animate-[fade-in-up_180ms_ease-out]">
          {addons === null ? (
            <p className="text-xs text-violet-100/80">Loading…</p>
          ) : addons.length === 0 ? (
            <p className="text-xs text-violet-100/80">
              No project-specific instructions yet. Example: «في هذا المشروع، مواد التشطيب
              الإيطالية lead-time لا يقل عن 60 يوم — راعِ ذلك في أي اقتراح».
            </p>
          ) : (
            <ul className="space-y-1.5">
              {addons.map((a, i) => (
                <li
                  key={a.id}
                  className="flex items-start gap-2 rounded-lg border border-violet-500/30 bg-slate-950/40 px-3 py-2"
                >
                  <span className="font-mono text-[10px] font-bold text-violet-300">{i + 1}.</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-slate-100" dir="auto">{a.content}</p>
                    <p className="mt-0.5 text-[10px] text-slate-400">
                      {a.authoredBy ?? 'unknown'}
                      {a.authoredByRole ? ` · ${a.authoredByRole}` : ''} ·{' '}
                      <span dir="ltr">{new Date(a.createdAt).toLocaleDateString()}</span>
                    </p>
                  </div>
                  {canWrite && (
                    <button
                      type="button"
                      onClick={() => void onRemove(a.id)}
                      disabled={busy}
                      className="rounded p-1 text-slate-400 transition hover:bg-rose-500/20 hover:text-rose-200"
                      aria-label={`Remove instruction ${i + 1}`}
                    >
                      <IconX className="h-3 w-3" />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}

          {canWrite && (
            <form
              className="flex items-stretch gap-2 pt-1"
              onSubmit={(e) => {
                e.preventDefault();
                void onAdd();
              }}
            >
              <input
                type="text"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Add an instruction for the AI on this project…"
                maxLength={2000}
                className="flex-1 rounded-lg border border-violet-500/40 bg-slate-950/60 px-3 py-1.5 text-xs text-slate-50 outline-none transition focus:border-violet-400/80"
                dir="auto"
              />
              <Button type="submit" variant="primary" size="sm" disabled={busy || !draft.trim()}>
                {busy ? 'Saving…' : 'Add'}
              </Button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}

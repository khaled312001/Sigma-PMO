'use client';

/**
 * Admin Settings — runtime-configurable platform settings.
 *
 * The current entries are:
 *  - Anthropic API key  (the AI brain of the platform; without it Claude
 *    calls fall back to deterministic-only).
 *  - Slack webhook URL  (optional outbound notification channel)
 *  - Teams webhook URL  (optional outbound notification channel)
 *  - Email SMTP URL    (optional outbound notification channel)
 *
 * Values are AES-256-GCM-encrypted server-side; the API never returns
 * the plaintext. The UI shows only `configured: true|false`, the
 * fingerprint (first 8 + last 4 chars), and the audit metadata.
 */

import { useCallback, useEffect, useState } from 'react';

import { api } from '../../../lib/api';
import { AuthGate } from '../../../components/AuthGate';
import { useMe } from '../../../lib/me-context';
import { useToast } from '../../../components/ToastProvider';
import { CAPABILITIES } from '../../../lib/capabilities';
import { Button, Card, ErrorBanner, PageHeader, Pill } from '../../../components/ui';
import { IconCheck, IconShield, IconSparkles, IconX } from '../../../components/Icons';

interface SettingDescriptor {
  settingKey: string;
  configured: boolean;
  fingerprint: string | null;
  updatedBy: string | null;
  updatedAt: string | null;
}

interface Definition {
  key: string;
  title: string;
  description: string;
  placeholder: string;
  badge?: 'critical';
  testHint?: string;
}

const DEFS: Definition[] = [
  {
    key: 'anthropic.api_key',
    title: 'Anthropic API key',
    description:
      'The Claude API key that powers every persona — Letter drafter, Monthly narrator, Clash solver, etc. Without it the platform falls back to deterministic-only output (no LLM rewriting). Get a key from console.anthropic.com.',
    placeholder: 'sk-ant-…',
    badge: 'critical',
    testHint: 'sk-ant-api03-… (96 chars typical)',
  },
  {
    key: 'integrations.slack_webhook',
    title: 'Slack webhook URL',
    description:
      'Incoming-webhook URL the platform posts alert notifications to. Optional — when blank, alerts stay in-app only.',
    placeholder: 'https://hooks.slack.com/services/T…/B…/…',
  },
  {
    key: 'integrations.teams_webhook',
    title: 'Microsoft Teams webhook URL',
    description: 'Incoming-webhook URL the platform posts alert notifications to. Optional.',
    placeholder: 'https://outlook.office.com/webhook/…',
  },
  {
    key: 'integrations.email_smtp',
    title: 'Outbound email SMTP',
    description:
      'SMTP connection URL for notifications (governance decisions, letter drafts). Format: smtps://user:pass@host:465.',
    placeholder: 'smtps://user:pass@host:465',
  },
];

export default function AdminSettingsRoute() {
  return (
    <AuthGate surface="Admin settings">
      <AdminSettingsPage />
    </AuthGate>
  );
}

function AdminSettingsPage() {
  const { me } = useMe();
  const toast = useToast();
  const canEdit = !!me?.user && CAPABILITIES[me.user.role].canEditPolicy;

  const [catalogue, setCatalogue] = useState<SettingDescriptor[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setErr(null);
    try {
      const r = await api<{ catalogue: SettingDescriptor[] }>('/admin/settings');
      setCatalogue(r.catalogue);
    } catch (e) {
      setCatalogue([]);
      setErr((e as Error).message);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const onSave = useCallback(
    async (key: string, value: string): Promise<void> => {
      try {
        await api<SettingDescriptor>(`/admin/settings/${encodeURIComponent(key)}`, {
          method: 'PUT',
          body: JSON.stringify({ value, updatedBy: me?.user?.displayName ?? null }),
        });
        toast.success('Saved', `${key} updated.`);
        await refresh();
      } catch (e) {
        toast.error('Save failed', (e as Error).message);
      }
    },
    [me?.user?.displayName, refresh, toast],
  );

  const onClear = useCallback(
    async (key: string): Promise<void> => {
      try {
        await api<SettingDescriptor>(`/admin/settings/${encodeURIComponent(key)}`, {
          method: 'DELETE',
        });
        toast.success('Cleared', `${key} reset.`);
        await refresh();
      } catch (e) {
        toast.error('Clear failed', (e as Error).message);
      }
    },
    [refresh, toast],
  );

  return (
    <div className="space-y-6 animate-[fade-in-up_240ms_ease-out]">
      <PageHeader
        eyebrow="Admin · Advanced settings"
        title="Platform Settings"
        description="Runtime-configurable secrets and integration URLs. Values are AES-256-GCM-encrypted server-side. The UI never displays the plaintext — only a fingerprint and audit metadata."
      />

      <ErrorBanner message={err} />

      {!canEdit && (
        <Card>
          <p className="text-xs text-slate-300">
            Your role does not include <code className="font-mono">canEditPolicy</code>; contact a Sigma admin to manage platform settings.
          </p>
        </Card>
      )}

      <SecurityNotice />

      <div className="grid grid-cols-1 gap-3">
        {DEFS.map((def) => {
          const state = catalogue?.find((c) => c.settingKey === def.key);
          return (
            <SettingCard
              key={def.key}
              def={def}
              state={state}
              canEdit={canEdit}
              onSave={onSave}
              onClear={onClear}
            />
          );
        })}
      </div>
    </div>
  );
}

function SecurityNotice() {
  return (
    <div className="relative overflow-hidden rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 shadow-sm">
      <div
        aria-hidden
        className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full bg-emerald-500/15 blur-2xl"
      />
      <div className="relative flex items-start gap-3">
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-emerald-500/30 ring-1 ring-emerald-400/50">
          <IconShield className="h-4 w-4 text-emerald-100" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-emerald-50">Encryption at rest</p>
          <p className="mt-1 text-xs leading-relaxed text-emerald-100">
            Every value entered below is encrypted with AES-256-GCM using a per-tenant master key derived
            from <code className="font-mono">SETTINGS_ENCRYPTION_KEY</code>. The raw plaintext never leaves
            the server — it&apos;s decrypted only when an internal service (e.g. ClaudeService) needs to
            authenticate against an external API. Read endpoints return a fingerprint + audit trail, never the value.
          </p>
        </div>
      </div>
    </div>
  );
}

function SettingCard({
  def,
  state,
  canEdit,
  onSave,
  onClear,
}: {
  def: Definition;
  state: SettingDescriptor | undefined;
  canEdit: boolean;
  onSave: (key: string, value: string) => Promise<void>;
  onClear: (key: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState<'save' | 'clear' | null>(null);

  const isConfigured = !!state?.configured;
  const wasUpdated = state?.updatedAt
    ? new Date(state.updatedAt).toLocaleString()
    : '—';

  const submit = useCallback(async () => {
    if (!value.trim()) return;
    setBusy('save');
    try {
      await onSave(def.key, value.trim());
      setEditing(false);
      setValue('');
      setShow(false);
    } finally {
      setBusy(null);
    }
  }, [def.key, value, onSave]);

  const clear = useCallback(async () => {
    setBusy('clear');
    try {
      await onClear(def.key);
      setEditing(false);
      setValue('');
    } finally {
      setBusy(null);
    }
  }, [def.key, onClear]);

  return (
    <Card
      title={def.title}
      hint={def.description}
      actions={
        <span className="flex items-center gap-2">
          {def.badge === 'critical' && <Pill tone="rose">Critical</Pill>}
          {isConfigured ? (
            <Pill tone="emerald">
              <IconCheck className="me-1 h-3 w-3" /> Configured
            </Pill>
          ) : (
            <Pill tone="amber">
              <IconX className="me-1 h-3 w-3" /> Not set
            </Pill>
          )}
        </span>
      }
    >
      {!editing ? (
        <div className="flex flex-wrap items-center gap-3 text-xs">
          {isConfigured ? (
            <>
              <div className="rounded-lg border border-slate-700 bg-slate-900/70 px-3 py-2 font-mono text-sm text-slate-50">
                {state?.fingerprint ?? '••••'}
              </div>
              <div className="min-w-0 flex-1 text-slate-300">
                Last updated by{' '}
                <span className="font-medium text-slate-100">{state?.updatedBy ?? 'unknown'}</span>
                <span className="mx-1.5 text-slate-500">·</span>
                <span dir="ltr">{wasUpdated}</span>
              </div>
            </>
          ) : (
            <p className="flex-1 text-slate-300">
              No value configured. Click <span className="font-semibold text-slate-100">Set value</span> below to add one.
            </p>
          )}
          {canEdit && (
            <div className="flex items-center gap-2">
              <Button variant="primary" size="sm" onClick={() => setEditing(true)}>
                <IconSparkles className="h-3.5 w-3.5" />
                {isConfigured ? 'Replace value' : 'Set value'}
              </Button>
              {isConfigured && (
                <Button variant="ghost" size="sm" onClick={() => void clear()} disabled={busy === 'clear'}>
                  {busy === 'clear' ? 'Clearing…' : 'Clear'}
                </Button>
              )}
            </div>
          )}
        </div>
      ) : (
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <label className="flex flex-col gap-1 text-xs">
            <span className="font-semibold uppercase tracking-[0.14em] text-slate-300">
              New value
            </span>
            <div className="flex items-stretch gap-2">
              <input
                type={show ? 'text' : 'password'}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                required
                autoFocus
                placeholder={def.placeholder}
                spellCheck={false}
                autoComplete="off"
                className="flex-1 rounded-lg border border-slate-600 bg-slate-900/70 px-3 py-2 font-mono text-sm text-slate-50 outline-none transition focus:border-sky-400/80 focus:shadow-[0_0_0_3px_rgba(56,189,248,0.15)]"
                dir="ltr"
              />
              <button
                type="button"
                onClick={() => setShow((v) => !v)}
                className="rounded-lg border border-slate-600 bg-slate-900/70 px-3 text-xs text-slate-200 transition hover:border-slate-400 hover:text-slate-50"
              >
                {show ? 'Hide' : 'Show'}
              </button>
            </div>
            {def.testHint && (
              <p className="text-[10px] text-slate-400" dir="ltr">
                Expected format: {def.testHint}
              </p>
            )}
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="submit" variant="primary" size="sm" disabled={busy === 'save' || !value.trim()}>
              {busy === 'save' ? 'Encrypting…' : 'Save (encrypt + store)'}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setEditing(false);
                setValue('');
                setShow(false);
              }}
            >
              Cancel
            </Button>
          </div>
        </form>
      )}
    </Card>
  );
}

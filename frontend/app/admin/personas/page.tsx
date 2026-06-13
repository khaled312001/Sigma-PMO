'use client';

import { useEffect, useMemo, useState } from 'react';

import { AuthGate } from '../../../components/AuthGate';
import { Button, Card, EmptyState, PageHeader, Pill } from '../../../components/ui';
import { DataTable, type Column } from '../../../components/DataTable';
import { IconX } from '../../../components/Icons';
import { useToast } from '../../../components/ToastProvider';
import { CAPABILITIES } from '../../../lib/capabilities';
import { useI18n } from '../../../lib/i18n';
import { useMe } from '../../../lib/me-context';
import {
  api,
  type PersonaLayer,
  type PersonaPatch,
  type PersonaRecord,
} from '../../../lib/api';

/**
 * /admin/personas — Persona registry browser (ADR-0010 §5).
 *
 * Surface is gated on authentication only (any role can view personas — they
 * are the system's expert voices and not a secret). The Edit affordance is
 * additionally gated on `canEditPersonas` (sigma_admin only).
 *
 * Edits round-trip through `POST /personas/:slug`, which the backend handles
 * as an append-only version bump — the prior `isCurrent` row flips off and a
 * fresh row lands at `version = prior.version + 1`. The page just refetches
 * after save.
 */
export default function PersonasAdminRoute() {
  return (
    <AuthGate surface="Personas">
      <PersonasAdmin />
    </AuthGate>
  );
}

type LayerFilter = 'all' | PersonaLayer;
const LAYER_FILTERS: LayerFilter[] = ['all', 'engineering', 'planning', 'governance', 'reports', 'simulation'];

const LAYER_TONE: Record<PersonaLayer, 'sky' | 'emerald' | 'amber' | 'violet' | 'rose'> = {
  engineering: 'sky',
  planning: 'emerald',
  governance: 'amber',
  reports: 'violet',
  simulation: 'rose',
};

function PersonasAdmin() {
  const toast = useToast();
  const { t } = useI18n();
  const { me } = useMe();
  const canEdit = !!me?.user && CAPABILITIES[me.user.role].canEditPersonas;

  const [personas, setPersonas] = useState<PersonaRecord[] | null>(null);
  const [filter, setFilter] = useState<LayerFilter>('all');
  const [selected, setSelected] = useState<PersonaRecord | null>(null);

  const reload = () => {
    api<PersonaRecord[]>('/personas')
      .then(setPersonas)
      .catch((e) => toast.error(t('admin.personas.loadFailed'), (e as Error).message));
  };

  useEffect(reload, [toast]);

  const visible = useMemo(() => {
    if (!personas) return personas;
    if (filter === 'all') return personas;
    return personas.filter((p) => normaliseLayer(p.layer) === filter);
  }, [personas, filter]);

  const columns: Column<PersonaRecord>[] = useMemo(
    () => [
      {
        key: 'businessKey',
        label: t('admin.personas.headers.slug'),
        render: (row) => <span className="font-mono text-xs text-slate-200">{row.businessKey}</span>,
      },
      {
        key: 'title',
        label: t('admin.personas.headers.title'),
        render: (row) => <span className="text-slate-100">{row.title}</span>,
      },
      {
        key: 'layer',
        label: t('admin.personas.headers.layer'),
        accessor: (row) => normaliseLayer(row.layer),
        render: (row) => <LayerPill layer={row.layer} />,
      },
      {
        key: 'version',
        label: t('admin.personas.headers.version'),
        align: 'end',
        render: (row) => <Pill tone="sky">v{row.version}</Pill>,
      },
      {
        key: 'modelTier',
        label: t('admin.personas.headers.model'),
        hideOnMobile: true,
        render: (row) => <span className="font-mono text-[11px] text-slate-300">{row.modelTier}</span>,
      },
      {
        key: 'authoredBy',
        label: t('admin.personas.headers.authoredBy'),
        hideOnMobile: true,
        render: (row) => <span className="text-xs text-slate-400">{row.authoredBy ?? t('admin.personas.modal.authoredByMissing')}</span>,
      },
    ],
    [t],
  );

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t('admin.personas.eyebrow')}
        title={t('admin.personas.title')}
        description={t('admin.personas.description')}
      />

      <Card padded={false}>
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-800/70 px-5 py-3">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
            {t('admin.personas.filterLabel')}
          </span>
          <div className="flex flex-wrap items-center gap-1" role="tablist" aria-label={t('admin.personas.filterLabel')}>
            {LAYER_FILTERS.map((layer) => (
              <LayerChip
                key={layer}
                layer={layer}
                active={filter === layer}
                onClick={() => setFilter(layer)}
                label={t(`admin.personas.layers.${layer}`)}
              />
            ))}
          </div>
        </div>

        {visible === null ? (
          <p className="px-5 py-6 text-sm text-slate-400">{t('common.loading')}</p>
        ) : visible.length === 0 ? (
          <EmptyState
            title={t('admin.personas.empty.title')}
            description={t('admin.personas.empty.description')}
          />
        ) : (
          <DataTable
            rows={visible}
            columns={columns}
            rowKey={(row) => row.id}
            onRowClick={(row) => setSelected(row)}
            density="comfortable"
            initialSort={{ key: 'businessKey', dir: 'asc' }}
            className="rounded-none border-0 bg-transparent"
          />
        )}
      </Card>

      {selected && (
        <PersonaModal
          persona={selected}
          canEdit={canEdit}
          onClose={() => setSelected(null)}
          onSaved={(updated) => {
            reload();
            setSelected(updated);
          }}
        />
      )}
    </div>
  );
}

/** Coerce a stored `layer` string (any case) to the lowercase `PersonaLayer`. */
function normaliseLayer(layer: string): PersonaLayer | string {
  const lower = (layer ?? '').toLowerCase();
  if (lower === 'engineering' || lower === 'planning' || lower === 'governance' || lower === 'reports' || lower === 'simulation') {
    return lower;
  }
  return lower;
}

function LayerPill({ layer }: { layer: string }) {
  const norm = normaliseLayer(layer);
  const tone = (LAYER_TONE as Record<string, 'sky' | 'emerald' | 'amber' | 'violet' | 'rose'>)[norm] ?? 'slate';
  const { t } = useI18n();
  const labelKey = `admin.personas.layers.${norm}`;
  const label = t(labelKey);
  return <Pill tone={tone}>{label === labelKey ? norm : label}</Pill>;
}

function LayerChip({
  layer, active, onClick, label,
}: { layer: LayerFilter; active: boolean; onClick: () => void; label: string }) {
  const tone = layer === 'all' ? 'slate' : LAYER_TONE[layer as PersonaLayer];
  const activeTone: Record<string, string> = {
    slate:   'border-slate-500/60 bg-slate-700/40 text-slate-100',
    sky:     'border-sky-500/60 bg-sky-500/15 text-sky-100',
    emerald: 'border-emerald-500/60 bg-emerald-500/15 text-emerald-100',
    amber:   'border-amber-500/60 bg-amber-500/15 text-amber-100',
    violet:  'border-violet-500/60 bg-violet-500/15 text-violet-100',
    rose:    'border-rose-500/60 bg-rose-500/15 text-rose-100',
  };
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition ${
        active
          ? activeTone[tone]
          : 'border-slate-700 text-slate-400 hover:border-slate-500 hover:text-slate-200'
      }`}
    >
      {label}
    </button>
  );
}

/** Inspect / edit a single persona. New version is created on save. */
function PersonaModal({
  persona, canEdit, onClose, onSaved,
}: {
  persona: PersonaRecord;
  canEdit: boolean;
  onClose: () => void;
  onSaved: (next: PersonaRecord) => void;
}) {
  const { t } = useI18n();
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(persona.systemPrompt);
  const [saving, setSaving] = useState(false);
  const [trackedPersonaId, setTrackedPersonaId] = useState(persona.id);

  // React 19 render-phase state sync — if the underlying persona changes
  // (post-save refetch, or selecting a different row without unmounting), drop
  // any unsaved edits and re-prime the textarea from the new system prompt.
  if (trackedPersonaId !== persona.id) {
    setTrackedPersonaId(persona.id);
    setDraft(persona.systemPrompt);
    setEditing(false);
  }

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !saving) {
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose, saving]);

  const dirty = draft !== persona.systemPrompt;

  const save = async () => {
    if (!draft.trim()) {
      toast.error(t('admin.personas.modal.saveFailed'), t('admin.personas.modal.promptRequired'));
      return;
    }
    if (!dirty) {
      toast.info(t('admin.personas.modal.unchanged'));
      return;
    }
    setSaving(true);
    try {
      const patch: PersonaPatch = {
        systemPrompt: draft,
        authoredBy: t('admin.personas.authoredByConsole'),
      };
      const next = await api<PersonaRecord>(`/personas/${encodeURIComponent(persona.businessKey)}`, {
        method: 'POST',
        body: JSON.stringify(patch),
      });
      toast.success(t('admin.personas.modal.savedToast'), t('admin.personas.modal.savedToastBody', { n: next.version }));
      onSaved(next);
    } catch (e) {
      toast.error(t('admin.personas.modal.saveFailed'), (e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="persona-modal-title"
    >
      <div className="absolute inset-0 bg-black/70" onClick={saving ? undefined : onClose} aria-hidden />
      <div className="relative flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-slate-800 bg-slate-950 shadow-2xl">
        <header className="flex items-start justify-between gap-3 border-b border-slate-800/70 px-5 py-4">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-sky-400">
              {t('admin.personas.modal.title')}
            </p>
            <h2 id="persona-modal-title" className="mt-1 truncate text-lg font-semibold text-slate-50">
              {persona.title}
            </h2>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <Pill tone="slate" className="font-mono">{persona.businessKey}</Pill>
              <LayerPill layer={persona.layer} />
              <Pill tone="sky">v{persona.version}</Pill>
              <Pill tone="slate" className="font-mono">{persona.modelTier}</Pill>
              <Pill tone="slate">T={persona.temperature.toFixed(2)}</Pill>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={saving}
            aria-label={t('admin.personas.modal.close')}
            className="shrink-0 rounded p-1 text-slate-400 transition hover:bg-slate-800 hover:text-slate-50 disabled:opacity-50"
          >
            <IconX className="h-4 w-4" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
            <Field label={t('admin.personas.modal.ownerLabel')} value={persona.ownedByRole} />
            <Field
              label={t('admin.personas.modal.authoredByLabel')}
              value={persona.authoredBy ?? t('admin.personas.modal.authoredByMissing')}
            />
          </dl>

          {persona.description && (
            <section className="mt-4">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                {t('admin.personas.modal.descriptionLabel')}
              </p>
              <p className="mt-1 whitespace-pre-wrap text-sm text-slate-300">{persona.description}</p>
            </section>
          )}

          <section className="mt-5">
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                {t('admin.personas.modal.systemPromptLabel')}
              </p>
              {!canEdit && (
                <p className="text-[11px] text-slate-500">{t('admin.personas.modal.readOnlyHint')}</p>
              )}
            </div>
            {editing ? (
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                spellCheck={false}
                aria-label={t('admin.personas.modal.systemPromptLabel')}
                className="mt-1.5 h-[44vh] w-full rounded-lg border border-slate-800 bg-black/40 p-3 font-mono text-[12px] leading-snug text-slate-200 focus:border-sky-500 focus:outline-none"
              />
            ) : (
              <pre className="mt-1.5 max-h-[44vh] overflow-auto rounded-lg border border-slate-800 bg-black/40 p-3 text-[12px] leading-relaxed text-slate-200 whitespace-pre-wrap">
                {persona.systemPrompt}
              </pre>
            )}
          </section>

          <section className="mt-5">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              {t('admin.personas.modal.rulesLabel')}
            </p>
            {persona.rules.length === 0 ? (
              <p className="mt-1.5 text-xs text-slate-500">{t('admin.personas.modal.noRules')}</p>
            ) : (
              <ul className="mt-1.5 list-disc space-y-1 ps-5 text-sm text-slate-300">
                {persona.rules.map((rule, i) => (
                  <li key={i}>{rule}</li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-800/70 px-5 py-3">
          {editing ? (
            <>
              <Button
                variant="ghost"
                size="sm"
                disabled={saving}
                onClick={() => {
                  setEditing(false);
                  setDraft(persona.systemPrompt);
                }}
              >
                {t('admin.personas.modal.cancelEdit')}
              </Button>
              <Button
                variant="success"
                size="sm"
                disabled={saving || !dirty}
                onClick={save}
              >
                {saving ? t('admin.personas.modal.saving') : t('admin.personas.modal.save')}
              </Button>
            </>
          ) : (
            <>
              <Button variant="ghost" size="sm" onClick={onClose}>
                {t('admin.personas.modal.close')}
              </Button>
              {canEdit && (
                <Button variant="primary" size="sm" onClick={() => setEditing(true)}>
                  {t('admin.personas.modal.edit')}
                </Button>
              )}
            </>
          )}
        </footer>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{label}</dt>
      <dd className="mt-0.5 text-sm text-slate-200">{value}</dd>
    </div>
  );
}

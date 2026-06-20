'use client';

import { useCallback, useEffect, useState } from 'react';

import { AuthGate } from '../../components/AuthGate';
import { useToast } from '../../components/ToastProvider';
import { useI18n } from '../../lib/i18n';
import { useCurrentProjectKey } from '../../lib/project-context';
import { api } from '../../lib/api';
import { Button, Card, EmptyState, PageHeader, Pill } from '../../components/ui';

interface Hold {
  id: string; targetTable: string; targetId: string; targetLabel: string | null; reason: string;
  matterRef: string | null; status: string; placedByEmail: string | null; createdAt: string;
}
interface Custody { id: string; targetTable: string; targetId: string; event: string; actorEmail: string | null; shaAtEvent: string | null; createdAt: string }

const RESULT_TABLES = ['evidence_room', 'evidence_item', 'claim', 'communication', 'project_record', 'quality_record', 'risk'];

export default function LegalHoldsRoute() {
  return (
    <AuthGate capability="canRead" surface="Legal Holds">
      <LegalHoldsPage />
    </AuthGate>
  );
}

function LegalHoldsPage() {
  const { lang } = useI18n();
  const ar = lang === 'ar';
  const projectKey = useCurrentProjectKey();
  const toast = useToast();
  const [holds, setHolds] = useState<Hold[]>([]);
  const [custody, setCustody] = useState<Custody[]>([]);

  const refresh = useCallback(async () => {
    try {
      const [h, c] = await Promise.all([
        api<Hold[]>(`/legal-holds?projectKey=${encodeURIComponent(projectKey)}`),
        api<Custody[]>(`/legal-holds/custody?projectKey=${encodeURIComponent(projectKey)}`),
      ]);
      setHolds(h); setCustody(c);
    } catch (e) { toast.error(ar ? 'تعذّر التحميل' : 'Failed to load', (e as Error).message); }
  }, [projectKey, toast, ar]);

  useEffect(() => { void refresh(); }, [refresh]);

  const release = async (id: string) => {
    const reason = window.prompt(ar ? 'سبب رفع الحجز؟' : 'Reason to release the hold?') ?? '';
    try { await api(`/legal-holds/${id}/release`, { method: 'POST', body: JSON.stringify({ reason }) }); toast.success(ar ? 'تم رفع الحجز' : 'Hold released'); await refresh(); }
    catch (e) { toast.error(ar ? 'فشل رفع الحجز' : 'Release failed', (e as Error).message); }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={`Legal Holds & Chain of Custody · ${projectKey}`}
        title={ar ? 'الحجز القانوني وسلسلة الحيازة' : 'Legal Holds & Chain of Custody'}
        description={ar
          ? 'الأدلة والسجلات المرتبطة بنزاع لا تُحذف نهائياً: الحجز القانوني يمنع الحذف القاسي، ورفع الحجز إجراء عالي الصلاحية ومُدقّق. وسجل الحيازة يوثّق كل حدث على كل مستند (استلام/اطّلاع/تصدير/تحقّق سلامة/حجز).'
          : 'Dispute-linked evidence and records cannot be permanently deleted: a legal hold blocks hard-deletion, and releasing one is a high-privilege, audited action. The chain-of-custody ledger records every event on each document (received / accessed / exported / integrity-verified / held).'}
      />

      <PlaceHoldForm projectKey={projectKey} tables={RESULT_TABLES} ar={ar} onDone={refresh} />

      <Card title={ar ? 'الحجوزات' : 'Holds'}>
        {holds.length === 0 ? (
          <EmptyState title={ar ? 'لا توجد حجوزات' : 'No holds'} description={ar ? 'ضع حجزاً على سجل مرتبط بنزاع لمنع حذفه.' : 'Place a hold on a dispute-linked record to prevent its deletion.'} />
        ) : (
          <div className="space-y-2">
            {holds.map((h) => (
              <div key={h.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-700/70 bg-slate-900/60 px-3 py-2">
                <Pill tone={h.status === 'active' ? 'rose' : 'slate'}>{h.status}</Pill>
                <span className="font-mono text-[11px] text-slate-400" dir="ltr">{h.targetTable}/{h.targetId.slice(0, 8)}</span>
                <span className="flex-1 text-sm text-slate-200">{h.targetLabel ?? h.reason}{h.matterRef && <span className="ms-2 text-[11px] text-sky-300">{h.matterRef}</span>}</span>
                {h.status === 'active' && <Button variant="danger" size="sm" onClick={() => release(h.id)}>{ar ? 'رفع الحجز' : 'Release'}</Button>}
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card title={ar ? 'سجل سلسلة الحيازة' : 'Chain-of-custody ledger'} hint={`${custody.length}`}>
        {custody.length === 0 ? <p className="text-sm text-slate-400">—</p> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead><tr className="border-b border-slate-800 text-[11px] uppercase tracking-wider text-slate-400">
                <th className="px-2 py-2 text-start">{ar ? 'الحدث' : 'Event'}</th>
                <th className="px-2 py-2 text-start">{ar ? 'الهدف' : 'Target'}</th>
                <th className="px-2 py-2 text-start">{ar ? 'الفاعل' : 'Actor'}</th>
                <th className="px-2 py-2 text-start">SHA-256</th>
                <th className="px-2 py-2 text-end">{ar ? 'الوقت' : 'When'}</th>
              </tr></thead>
              <tbody>
                {custody.map((c) => (
                  <tr key={c.id} className="border-b border-slate-800/60 hover:bg-slate-900/50">
                    <td className="px-2 py-2"><Pill tone={eventTone(c.event)}>{c.event}</Pill></td>
                    <td className="px-2 py-2 font-mono text-[11px] text-slate-400" dir="ltr">{c.targetTable}/{c.targetId.slice(0, 8)}</td>
                    <td className="px-2 py-2 text-[11px] text-slate-300" dir="ltr">{c.actorEmail ?? '—'}</td>
                    <td className="px-2 py-2 font-mono text-[10px] text-slate-500" dir="ltr">{c.shaAtEvent ? `${c.shaAtEvent.slice(0, 12)}…` : '—'}</td>
                    <td className="px-2 py-2 text-end font-mono text-[10px] text-slate-500" dir="ltr">{c.createdAt?.slice(0, 19).replace('T', ' ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function eventTone(e: string): 'emerald' | 'amber' | 'rose' | 'sky' | 'slate' {
  if (e === 'verified' || e === 'hold_released') return 'emerald';
  if (e === 'verify_failed' || e === 'delete_blocked' || e === 'deleted') return 'rose';
  if (e === 'hold_placed' || e === 'exported') return 'amber';
  return 'sky';
}

function PlaceHoldForm({ projectKey, tables, ar, onDone }: { projectKey: string; tables: string[]; ar: boolean; onDone: () => Promise<void> }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [targetTable, setTargetTable] = useState('claim');
  const [targetId, setTargetId] = useState('');
  const [reason, setReason] = useState('');
  const [matterRef, setMatterRef] = useState('');
  const [busy, setBusy] = useState(false);
  const field = 'mt-1 block w-full rounded-lg border border-slate-700 bg-slate-900/70 px-3 py-2 text-sm text-slate-100';

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true);
    try {
      await api('/legal-holds', { method: 'POST', body: JSON.stringify({ projectKey, targetTable, targetId, reason, matterRef: matterRef || null }) });
      toast.success(ar ? 'تم وضع الحجز' : 'Hold placed');
      setTargetId(''); setReason(''); setMatterRef(''); setOpen(false);
      await onDone();
    } catch (err) { toast.error(ar ? 'فشل وضع الحجز' : 'Place hold failed', (err as Error).message); } finally { setBusy(false); }
  };

  if (!open) return <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>{ar ? '+ وضع حجز قانوني' : '+ Place a legal hold'}</Button>;
  return (
    <Card title={ar ? 'وضع حجز قانوني' : 'Place a legal hold'}>
      <form onSubmit={submit} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="text-xs text-slate-400">{ar ? 'الجدول' : 'Table'}<select className={field} value={targetTable} onChange={(e) => setTargetTable(e.target.value)}>{tables.map((t) => <option key={t} value={t}>{t}</option>)}</select></label>
        <label className="text-xs text-slate-400">{ar ? 'معرّف السجل (id)' : 'Record id'}<input required className={field} value={targetId} onChange={(e) => setTargetId(e.target.value)} dir="ltr" placeholder="uuid" /></label>
        <label className="text-xs text-slate-400 sm:col-span-2">{ar ? 'السبب' : 'Reason'}<input required className={field} value={reason} onChange={(e) => setReason(e.target.value)} /></label>
        <label className="text-xs text-slate-400">{ar ? 'مرجع النزاع' : 'Matter ref'}<input className={field} value={matterRef} onChange={(e) => setMatterRef(e.target.value)} placeholder="DISPUTE-2026-01" dir="ltr" /></label>
        <div className="flex items-end gap-2"><Button type="submit" variant="primary" disabled={busy}>{busy ? '…' : (ar ? 'وضع الحجز' : 'Place hold')}</Button><Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>{ar ? 'إلغاء' : 'Cancel'}</Button></div>
      </form>
    </Card>
  );
}

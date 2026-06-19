'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import { useToast } from '../../components/ToastProvider';
import { api } from '../../lib/api';
import { AuthGate } from '../../components/AuthGate';
import { useI18n } from '../../lib/i18n';
import { Button, Card, EmptyState, PageHeader, Pill } from '../../components/ui';
import { IconRefresh } from '../../components/Icons';

type Status = 'sent' | 'delivered' | 'opened' | 'acknowledged' | 'accepted' | 'rejected' | 'action_completed' | 'escalated' | 'disputed';
interface Comm {
  id: string; commId: string; category: string; subject: string; body: string | null;
  senderEmail: string | null; recipientEmail: string | null; recipientCompany: string | null;
  status: Status; requiresAck: boolean; actionDueDate: string | null;
  sentAt: string | null; openedAt: string | null; openedByEmail: string | null;
  acknowledgedAt: string | null; respondedAt: string | null; responseDecision: string | null;
  escalatedAt: string | null; escalationLevel: number | null;
  overdue?: boolean; unreadHours?: number | null;
}

const CATEGORIES = ['general', 'rfi', 'ncr', 'delay-notice', 'approval-request', 'claim-notice', 'instruction', 'variation', 'daily-report', 'meeting-minutes'];
const STATUS_TONE: Record<Status, 'slate' | 'sky' | 'emerald' | 'amber' | 'rose'> = {
  sent: 'slate', delivered: 'slate', opened: 'sky', acknowledged: 'emerald',
  accepted: 'emerald', action_completed: 'emerald', rejected: 'rose', escalated: 'amber', disputed: 'rose',
};
const fmt = (s: string | null) => (s ? new Date(s).toLocaleString() : '—');

export default function CommunicationsRoute() {
  return <AuthGate capability="canRead" surface="Communications"><Communications /></AuthGate>;
}

function Communications() {
  const { lang } = useI18n();
  const isAr = lang === 'ar';
  const toast = useToast();
  const [items, setItems] = useState<Comm[]>([]);
  const [open, setOpen] = useState<Comm | null>(null);
  const [composing, setComposing] = useState(false);
  const [form, setForm] = useState({ subject: '', recipientEmail: '', recipientCompany: '', category: 'general', body: '', requiresAck: false, actionDueDate: '' });

  const refresh = useCallback(async () => {
    try { setItems(await api<Comm[]>('/communications')); }
    catch (e) { toast.error(isAr ? 'تعذّر التحميل' : 'Failed to load', (e as Error).message); }
  }, [toast, isAr]);
  useEffect(() => { void refresh(); }, [refresh]);

  const send = async () => {
    if (!form.subject.trim()) { toast.error(isAr ? 'الموضوع مطلوب' : 'Subject required'); return; }
    try {
      await api<Comm>('/communications', { method: 'POST', body: JSON.stringify({ ...form, actionDueDate: form.actionDueDate || null }) });
      toast.success(isAr ? 'تم تسجيل المراسلة' : 'Communication registered');
      setComposing(false); setForm({ subject: '', recipientEmail: '', recipientCompany: '', category: 'general', body: '', requiresAck: false, actionDueDate: '' });
      await refresh();
    } catch (e) { toast.error(isAr ? 'فشل التسجيل' : 'Failed', (e as Error).message); }
  };

  const openComm = async (c: Comm) => {
    try { const full = await api<Comm>(`/communications/${c.id}`); setOpen(full); await refresh(); }
    catch (e) { toast.error(isAr ? 'تعذّر الفتح' : 'Failed to open', (e as Error).message); }
  };
  const act = async (path: string, body?: object) => {
    if (!open) return;
    try { const full = await api<Comm>(`/communications/${open.id}/${path}`, { method: 'POST', body: body ? JSON.stringify(body) : undefined }); setOpen(full); await refresh(); toast.success(isAr ? 'تم' : 'Done'); }
    catch (e) { toast.error(isAr ? 'فشل' : 'Failed', (e as Error).message); }
  };

  const overdueCount = useMemo(() => items.filter((c) => c.overdue).length, [items]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={isAr ? 'حوكمة المراسلات' : 'Communication Governance'}
        title={isAr ? 'مراسلات المشروع وأدلّتها' : 'Project Communications & Evidence'}
        description={isAr ? 'سجل موثوق وقابل للتدقيق لكل مراسلة — والدليل الأقوى هو الفتح الموثَّق داخل سيجما بعد تسجيل الدخول، وليس إيصال القراءة العادي.' : 'A reliable, auditable record of every communication — the strongest evidence is the authenticated open inside Sigma, not a plain email read-receipt.'}
        actions={<><Button variant="ghost" size="sm" onClick={refresh}><IconRefresh className="h-3.5 w-3.5" /> {isAr ? 'تحديث' : 'Refresh'}</Button><Button variant="primary" size="sm" onClick={() => setComposing((v) => !v)}>{isAr ? 'مراسلة جديدة' : 'New communication'}</Button></>}
      />

      {overdueCount > 0 && (
        <div className="rounded-lg border border-amber-400/40 bg-amber-400/10 px-4 py-2.5 text-[12px] text-amber-100">
          ⚠ {isAr ? `${overdueCount} مراسلة لم تُفتح خلال 24 ساعة — مرشَّحة للتصعيد.` : `${overdueCount} communication(s) not opened within 24h — eligible for escalation.`}
        </div>
      )}

      {composing && (
        <Card title={isAr ? 'تسجيل مراسلة رسمية' : 'Register an official communication'}>
          <div className="grid gap-3 sm:grid-cols-2">
            <input value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} placeholder={isAr ? 'الموضوع' : 'Subject'} className="rounded-lg border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-slate-100 sm:col-span-2" />
            <input value={form.recipientEmail} onChange={(e) => setForm({ ...form, recipientEmail: e.target.value })} placeholder={isAr ? 'بريد المستلم' : 'Recipient email'} dir="ltr" className="rounded-lg border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-slate-100" />
            <input value={form.recipientCompany} onChange={(e) => setForm({ ...form, recipientCompany: e.target.value })} placeholder={isAr ? 'شركة المستلم' : 'Recipient company'} className="rounded-lg border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-slate-100" />
            <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="rounded-lg border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-slate-100">
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <input type="date" value={form.actionDueDate} onChange={(e) => setForm({ ...form, actionDueDate: e.target.value })} className="rounded-lg border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-slate-100" />
            <textarea value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} rows={3} placeholder={isAr ? 'النص' : 'Message body'} className="rounded-lg border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-slate-100 sm:col-span-2" />
          </div>
          <div className="mt-3 flex items-center justify-between">
            <label className="flex items-center gap-2 text-[12px] text-slate-300"><input type="checkbox" checked={form.requiresAck} onChange={(e) => setForm({ ...form, requiresAck: e.target.checked })} /> {isAr ? 'يتطلّب إقراراً (إشعار حرِج)' : 'Requires acknowledgement (critical notice)'}</label>
            <Button variant="primary" size="sm" onClick={send}>{isAr ? 'تسجيل وإرسال' : 'Register & send'}</Button>
          </div>
        </Card>
      )}

      {items.length === 0 ? (
        <EmptyState title={isAr ? 'لا توجد مراسلات' : 'No communications'} description={isAr ? 'سجّل مراسلة رسمية لتتبّع دليلها.' : 'Register an official communication to track its evidence.'} />
      ) : (
        <div className="space-y-2">
          {items.map((c) => (
            <button key={c.id} onClick={() => openComm(c)} className="flex w-full items-center gap-3 rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3 text-start transition hover:border-sky-400/50 hover:bg-sky-500/[0.06]">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-[10px] text-slate-500" dir="ltr">{c.commId}</span>
                  <Pill tone="slate">{c.category}</Pill>
                  <Pill tone={STATUS_TONE[c.status]}>{c.status}</Pill>
                  {c.requiresAck && <Pill tone="amber">{isAr ? 'يتطلّب إقرار' : 'ack req.'}</Pill>}
                  {c.overdue && <Pill tone="rose">{isAr ? `متأخّر ${c.unreadHours}س` : `overdue ${c.unreadHours}h`}</Pill>}
                </div>
                <p className="mt-0.5 truncate text-[13px] text-slate-100">{c.subject}</p>
                <p className="text-[10px] text-slate-500">{isAr ? 'إلى:' : 'To:'} {c.recipientEmail || c.recipientCompany || '—'} · {c.openedAt ? (isAr ? `فُتح ${fmt(c.openedAt)}` : `opened ${fmt(c.openedAt)}`) : (isAr ? 'لم يُفتح' : 'not opened')}</p>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Detail / evidence drawer */}
      {open && (
        <div className="fixed inset-0 z-40 flex justify-end bg-black/50" onClick={() => setOpen(null)}>
          <div className="h-full w-full max-w-md overflow-y-auto border-s border-white/10 bg-slate-950 p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <span className="font-mono text-[11px] text-slate-500" dir="ltr">{open.commId}</span>
              <button onClick={() => setOpen(null)} className="text-slate-400 hover:text-slate-100">✕</button>
            </div>
            <h3 className="mt-2 text-lg font-semibold text-slate-100">{open.subject}</h3>
            <div className="mt-1 flex flex-wrap gap-2"><Pill tone="slate">{open.category}</Pill><Pill tone={STATUS_TONE[open.status]}>{open.status}</Pill></div>
            {open.body && <p className="mt-3 whitespace-pre-wrap text-[13px] text-slate-300">{open.body}</p>}

            <div className="mt-4 space-y-1.5 rounded-lg border border-white/10 bg-white/[0.02] p-3 text-[11px] text-slate-300">
              <p className="font-semibold text-slate-200">{isAr ? 'سلسلة الأدلّة' : 'Evidence trail'}</p>
              <Row k={isAr ? 'من' : 'From'} v={open.senderEmail} />
              <Row k={isAr ? 'إلى' : 'To'} v={open.recipientEmail || open.recipientCompany} />
              <Row k={isAr ? 'أُرسل' : 'Sent'} v={fmt(open.sentAt)} />
              <Row k={isAr ? 'فُتح داخل سيجما (موثَّق)' : 'Opened in Sigma (authenticated)'} v={open.openedAt ? `${fmt(open.openedAt)} — ${open.openedByEmail ?? ''}` : (isAr ? 'لم يُفتح' : 'not opened')} />
              <Row k={isAr ? 'الإقرار' : 'Acknowledged'} v={fmt(open.acknowledgedAt)} />
              <Row k={isAr ? 'الرد' : 'Response'} v={open.respondedAt ? `${open.responseDecision} — ${fmt(open.respondedAt)}` : '—'} />
              {open.actionDueDate && <Row k={isAr ? 'مستحق الإجراء' : 'Action due'} v={open.actionDueDate} />}
              {open.escalatedAt && <Row k={isAr ? 'التصعيد' : 'Escalated'} v={`L${open.escalationLevel} — ${fmt(open.escalatedAt)}`} />}
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {!open.acknowledgedAt && <Button variant="primary" size="sm" onClick={() => act('acknowledge')}>{isAr ? 'إقرار بالاستلام' : 'Acknowledge'}</Button>}
              {!open.respondedAt && <><Button variant="success" size="sm" onClick={() => act('respond', { decision: 'accepted' })}>{isAr ? 'قبول' : 'Accept'}</Button>
              <Button variant="danger" size="sm" onClick={() => act('respond', { decision: 'rejected' })}>{isAr ? 'رفض' : 'Reject'}</Button></>}
              <Button variant="ghost" size="sm" onClick={() => act('escalate')}>{isAr ? 'تصعيد' : 'Escalate'}</Button>
            </div>
            <p className="mt-3 text-[10px] text-slate-500">{isAr ? 'كل حدث (فتح/إقرار/رد/تصعيد) مُسجَّل في سجل التدقيق.' : 'Every event (open / acknowledge / respond / escalate) is recorded in the audit log.'}</p>
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ k, v }: { k: string; v: string | null }) {
  return <div className="flex justify-between gap-3"><span className="text-slate-500">{k}</span><span className="text-end text-slate-200" dir="auto">{v || '—'}</span></div>;
}

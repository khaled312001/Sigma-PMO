'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import { useToast } from '../../components/ToastProvider';
import { api } from '../../lib/api';
import { AuthGate } from '../../components/AuthGate';
import { RecordActions } from '../../components/RecordActions';
import { CAPABILITIES } from '../../lib/capabilities';
import { useMe } from '../../lib/me-context';
import { useI18n } from '../../lib/i18n';
import { Button, Card, EmptyState, PageHeader, Pill } from '../../components/ui';
import { IconRefresh } from '../../components/Icons';

type Status =
  | 'sent' | 'delivered' | 'opened' | 'attachment_viewed' | 'acknowledged'
  | 'accepted' | 'rejected' | 'action_completed' | 'no_action' | 'escalated' | 'disputed';
type Criticality = 'low' | 'normal' | 'high' | 'critical';

interface Comm {
  id: string; commId: string; category: string; subject: string; body: string | null;
  criticality: Criticality; channel: string | null;
  attachments: Array<{ name: string; bytes?: number }> | null;
  senderEmail: string | null; senderRole: string | null;
  recipientEmail: string | null; recipientCompany: string | null; recipientRole: string | null;
  status: Status; requiresAck: boolean; requiresResponse: boolean;
  responsibleRole: string | null; actionDueDate: string | null; responseDueAt: string | null;
  sentAt: string | null; deliveredAt: string | null;
  openedAt: string | null; openedByEmail: string | null;
  attachmentViewedAt: string | null; attachmentViewedByEmail: string | null;
  acknowledgedAt: string | null; acknowledgedByEmail: string | null;
  respondedAt: string | null; responseDecision: string | null; reply: string | null;
  actionCompletedAt: string | null; noActionAt: string | null;
  deemedServedAt: string | null; firstAlertAt: string | null;
  disputedAt: string | null; disputedByEmail: string | null; disputeReason: string | null;
  escalatedAt: string | null; escalationLevel: number | null; escalatedToRole: string | null; escalatedToEmail: string | null;
  linkedClaimKey: string | null; linkedRecordKey: string | null;
  overdue?: boolean; unreadHours?: number | null; responseOverdue?: boolean; escalationDue?: boolean;
  alertThresholdHours?: number; policyWarnings?: string[];
}

interface AuditRow { id: string; action: string; actorEmail: string | null; createdAt: string; meta?: Record<string, unknown> | null }

const CATEGORIES = ['general', 'rfi', 'ncr', 'delay-notice', 'approval-request', 'claim-notice', 'instruction', 'variation', 'daily-report', 'meeting-minutes'];
const CRITICALITIES: Criticality[] = ['low', 'normal', 'high', 'critical'];
const STATUS_TONE: Record<Status, 'slate' | 'sky' | 'emerald' | 'amber' | 'rose' | 'violet'> = {
  sent: 'slate', delivered: 'slate', opened: 'sky', attachment_viewed: 'sky', acknowledged: 'emerald',
  accepted: 'emerald', action_completed: 'emerald', no_action: 'amber', rejected: 'rose', escalated: 'amber', disputed: 'rose',
};
const CRIT_TONE: Record<Criticality, 'slate' | 'sky' | 'amber' | 'rose'> = { low: 'slate', normal: 'sky', high: 'amber', critical: 'rose' };
const fmt = (s: string | null) => (s ? new Date(s).toLocaleString() : '—');

export default function CommunicationsRoute() {
  return <AuthGate capability="canRead" surface="Communications"><Communications /></AuthGate>;
}

function Communications() {
  const { lang } = useI18n();
  const isAr = lang === 'ar';
  const toast = useToast();
  const { me } = useMe();
  const canEvaluate = !!me?.user && CAPABILITIES[me.user.role].canEvaluateRules;

  const [items, setItems] = useState<Comm[]>([]);
  const [open, setOpen] = useState<Comm | null>(null);
  const [trail, setTrail] = useState<AuditRow[]>([]);
  const [composing, setComposing] = useState(false);
  const [fCat, setFCat] = useState('all');
  const [fStatus, setFStatus] = useState('all');
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    subject: '', recipientEmail: '', recipientCompany: '', recipientRole: '', category: 'general',
    criticality: '' as '' | Criticality, body: '', requiresAck: false, requiresResponse: false,
    actionDueDate: '', linkedClaimKey: '',
  });

  const refresh = useCallback(async () => {
    try { setItems(await api<Comm[]>('/communications')); }
    catch (e) { toast.error(isAr ? 'تعذّر التحميل' : 'Failed to load', (e as Error).message); }
  }, [toast, isAr]);
  useEffect(() => { void refresh(); }, [refresh]);

  const send = async () => {
    if (!form.subject.trim()) { toast.error(isAr ? 'الموضوع مطلوب' : 'Subject required'); return; }
    try {
      const payload = { ...form, criticality: form.criticality || undefined, actionDueDate: form.actionDueDate || null, linkedClaimKey: form.linkedClaimKey || null };
      await api<Comm>('/communications', { method: 'POST', body: JSON.stringify(payload) });
      toast.success(isAr ? 'تم تسجيل المراسلة' : 'Communication registered');
      setComposing(false);
      setForm({ subject: '', recipientEmail: '', recipientCompany: '', recipientRole: '', category: 'general', criticality: '', body: '', requiresAck: false, requiresResponse: false, actionDueDate: '', linkedClaimKey: '' });
      await refresh();
    } catch (e) { toast.error(isAr ? 'فشل التسجيل' : 'Failed', (e as Error).message); }
  };

  const openComm = async (c: Comm) => {
    try {
      const full = await api<Comm>(`/communications/${c.id}`);
      setOpen(full);
      setTrail(await api<AuditRow[]>(`/communications/${c.id}/audit`).catch(() => []));
      await refresh();
    } catch (e) { toast.error(isAr ? 'تعذّر الفتح' : 'Failed to open', (e as Error).message); }
  };
  const act = async (path: string, body?: object) => {
    if (!open) return;
    try {
      const full = await api<Comm>(`/communications/${open.id}/${path}`, { method: 'POST', body: body ? JSON.stringify(body) : undefined });
      setOpen(full);
      setTrail(await api<AuditRow[]>(`/communications/${open.id}/audit`).catch(() => []));
      await refresh();
      toast.success(isAr ? 'تم' : 'Done');
    } catch (e) { toast.error(isAr ? 'فشل' : 'Failed', (e as Error).message); }
  };
  const runAlerts = async () => {
    setBusy(true);
    try {
      const r = await api<{ scanned: number; alerted: number; escalated: number; deemed: number }>('/communications/run-alerts', { method: 'POST' });
      toast.success(isAr ? 'تم تشغيل فحص التنبيهات' : 'Alert sweep complete', isAr ? `فُحص ${r.scanned} · تنبيهات ${r.alerted} · تصعيد ${r.escalated}` : `scanned ${r.scanned} · alerted ${r.alerted} · escalated ${r.escalated}`);
      await refresh();
    } catch (e) { toast.error(isAr ? 'فشل' : 'Failed', (e as Error).message); }
    finally { setBusy(false); }
  };

  const overdueCount = useMemo(() => items.filter((c) => c.overdue).length, [items]);
  const filtered = useMemo(
    () => items.filter((c) => (fCat === 'all' || c.category === fCat) && (fStatus === 'all' || c.status === fStatus)),
    [items, fCat, fStatus],
  );

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={isAr ? 'حوكمة المراسلات' : 'Communication Governance'}
        title={isAr ? 'مراسلات المشروع وأدلّتها' : 'Project Communications & Evidence'}
        description={isAr ? 'سجل موثوق وقابل للتدقيق لكل مراسلة — والدليل الأقوى هو الفتح الموثَّق داخل سيجما بعد تسجيل الدخول، وليس إيصال القراءة العادي.' : 'A reliable, auditable record of every communication — the strongest evidence is the authenticated open inside Sigma, not a plain email read-receipt.'}
        actions={<>
          <Button variant="ghost" size="sm" onClick={refresh}><IconRefresh className="h-3.5 w-3.5" /> {isAr ? 'تحديث' : 'Refresh'}</Button>
          {canEvaluate && <Button variant="ghost" size="sm" onClick={runAlerts} disabled={busy}>{isAr ? 'تشغيل فحص التنبيهات' : 'Run alert sweep'}</Button>}
          <Button variant="primary" size="sm" onClick={() => setComposing((v) => !v)}>{isAr ? 'مراسلة جديدة' : 'New communication'}</Button>
        </>}
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
            <input value={form.recipientRole} onChange={(e) => setForm({ ...form, recipientRole: e.target.value })} placeholder={isAr ? 'دور المستلم (consultant…)' : 'Recipient role (consultant…)'} dir="ltr" className="rounded-lg border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-slate-100" />
            <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="rounded-lg border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-slate-100">
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <select value={form.criticality} onChange={(e) => setForm({ ...form, criticality: e.target.value as Criticality })} className="rounded-lg border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-slate-100">
              <option value="">{isAr ? 'الأهمية (تلقائي من القواعد)' : 'Criticality (auto from rules)'}</option>
              {CRITICALITIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <input type="date" value={form.actionDueDate} onChange={(e) => setForm({ ...form, actionDueDate: e.target.value })} className="rounded-lg border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-slate-100" />
            <input value={form.linkedClaimKey} onChange={(e) => setForm({ ...form, linkedClaimKey: e.target.value })} placeholder={isAr ? 'ربط بمطالبة/سجل (اختياري)' : 'Link to claim/record (optional)'} dir="ltr" className="rounded-lg border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-slate-100" />
            <textarea value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} rows={3} placeholder={isAr ? 'النص' : 'Message body'} className="rounded-lg border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-slate-100 sm:col-span-2" />
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-4">
              <label className="flex items-center gap-2 text-[12px] text-slate-300"><input type="checkbox" checked={form.requiresAck} onChange={(e) => setForm({ ...form, requiresAck: e.target.checked })} /> {isAr ? 'يتطلّب إقراراً' : 'Requires acknowledgement'}</label>
              <label className="flex items-center gap-2 text-[12px] text-slate-300"><input type="checkbox" checked={form.requiresResponse} onChange={(e) => setForm({ ...form, requiresResponse: e.target.checked })} /> {isAr ? 'يتطلّب رداً' : 'Requires response'}</label>
            </div>
            <Button variant="primary" size="sm" onClick={send}>{isAr ? 'تسجيل وإرسال' : 'Register & send'}</Button>
          </div>
        </Card>
      )}

      <div className="flex flex-wrap gap-2">
        <select value={fCat} onChange={(e) => setFCat(e.target.value)} className="rounded-lg border border-white/10 bg-slate-900/60 px-2.5 py-1.5 text-[12px] text-slate-200">
          <option value="all">{isAr ? 'كل التصنيفات' : 'All categories'}</option>
          {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={fStatus} onChange={(e) => setFStatus(e.target.value)} className="rounded-lg border border-white/10 bg-slate-900/60 px-2.5 py-1.5 text-[12px] text-slate-200">
          <option value="all">{isAr ? 'كل الحالات' : 'All statuses'}</option>
          {Object.keys(STATUS_TONE).map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      {filtered.length === 0 ? (
        <EmptyState title={isAr ? 'لا توجد مراسلات' : 'No communications'} description={isAr ? 'سجّل مراسلة رسمية لتتبّع دليلها.' : 'Register an official communication to track its evidence.'} />
      ) : (
        <div className="space-y-2">
          {filtered.map((c) => (
            <button key={c.id} onClick={() => openComm(c)} className="flex w-full items-center gap-3 rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3 text-start transition hover:border-sky-400/50 hover:bg-sky-500/[0.06]">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-[10px] text-slate-500" dir="ltr">{c.commId}</span>
                  <Pill tone="slate">{c.category}</Pill>
                  {c.criticality && c.criticality !== 'normal' && <Pill tone={CRIT_TONE[c.criticality]}>{c.criticality}</Pill>}
                  <Pill tone={STATUS_TONE[c.status]}>{c.status}</Pill>
                  {c.requiresAck && !c.acknowledgedAt && <Pill tone="amber">{isAr ? 'يتطلّب إقرار' : 'ack req.'}</Pill>}
                  {c.responseOverdue && <Pill tone="rose">{isAr ? 'تجاوز مهلة الرد' : 'response overdue'}</Pill>}
                  {c.overdue && <Pill tone="rose">{isAr ? `متأخّر ${c.unreadHours}س` : `overdue ${c.unreadHours}h`}</Pill>}
                  {c.deemedServedAt && <Pill tone="violet">{isAr ? 'يُعدّ مُبلَّغاً' : 'deemed served'}</Pill>}
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
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <Pill tone="slate">{open.category}</Pill>
              {open.criticality && <Pill tone={CRIT_TONE[open.criticality]}>{open.criticality}</Pill>}
              <Pill tone={STATUS_TONE[open.status]}>{open.status}</Pill>
              {open.channel && <Pill tone="sky">{open.channel}</Pill>}
              <RecordActions table="communication" id={open.id} record={open as unknown as Record<string, unknown>} fields={['subject', 'body', 'status', 'criticality']} onChanged={() => { setOpen(null); void refresh(); }} />
            </div>
            {open.body && <p className="mt-3 whitespace-pre-wrap text-[13px] text-slate-300">{open.body}</p>}

            {open.policyWarnings && open.policyWarnings.length > 0 && (
              <div className="mt-3 rounded-lg border border-amber-400/40 bg-amber-400/10 p-2.5 text-[11px] text-amber-100">
                {open.policyWarnings.map((w, i) => <p key={i}>⚠ {w}</p>)}
              </div>
            )}

            <div className="mt-4 space-y-1.5 rounded-lg border border-white/10 bg-white/[0.02] p-3 text-[11px] text-slate-300">
              <p className="font-semibold text-slate-200">{isAr ? 'سلسلة الأدلّة' : 'Evidence trail'}</p>
              <Row k={isAr ? 'من' : 'From'} v={open.senderEmail} />
              <Row k={isAr ? 'إلى' : 'To'} v={[open.recipientEmail, open.recipientCompany, open.recipientRole].filter(Boolean).join(' · ') || null} />
              <Row k={isAr ? 'الطرف المسؤول' : 'Responsible'} v={open.responsibleRole} />
              <Row k={isAr ? 'أُرسل' : 'Sent'} v={fmt(open.sentAt)} />
              <Row k={isAr ? 'سُلّم للقناة' : 'Delivered'} v={fmt(open.deliveredAt)} />
              <Row k={isAr ? 'فُتح داخل سيجما (موثَّق)' : 'Opened in Sigma (authenticated)'} v={open.openedAt ? `${fmt(open.openedAt)} — ${open.openedByEmail ?? ''}` : (isAr ? 'لم يُفتح' : 'not opened')} />
              <Row k={isAr ? 'فُتح المرفق' : 'Attachment viewed'} v={open.attachmentViewedAt ? `${fmt(open.attachmentViewedAt)} — ${open.attachmentViewedByEmail ?? ''}` : '—'} />
              <Row k={isAr ? 'الإقرار' : 'Acknowledged'} v={open.acknowledgedAt ? `${fmt(open.acknowledgedAt)} — ${open.acknowledgedByEmail ?? ''}` : '—'} />
              <Row k={isAr ? 'الرد' : 'Response'} v={open.respondedAt ? `${open.responseDecision} — ${fmt(open.respondedAt)}` : '—'} />
              {open.reply && <Row k={isAr ? 'نص الرد' : 'Reply'} v={open.reply} />}
              <Row k={isAr ? 'مهلة الرد' : 'Response due'} v={fmt(open.responseDueAt)} />
              <Row k={isAr ? 'اكتمل الإجراء' : 'Action completed'} v={fmt(open.actionCompletedAt)} />
              <Row k={isAr ? 'لا إجراء' : 'No action'} v={fmt(open.noActionAt)} />
              {open.deemedServedAt && <Row k={isAr ? 'يُعدّ مُبلَّغاً منذ' : 'Deemed served'} v={fmt(open.deemedServedAt)} />}
              {open.firstAlertAt && <Row k={isAr ? 'أول تنبيه آلي' : 'First auto-alert'} v={fmt(open.firstAlertAt)} />}
              {open.actionDueDate && <Row k={isAr ? 'مستحق الإجراء' : 'Action due'} v={open.actionDueDate} />}
              {open.escalatedAt && <Row k={isAr ? 'التصعيد' : 'Escalated'} v={`L${open.escalationLevel} → ${open.escalatedToRole ?? ''} ${open.escalatedToEmail ? `(${open.escalatedToEmail})` : ''} — ${fmt(open.escalatedAt)}`} />}
              {open.disputedAt && <Row k={isAr ? 'نزاع' : 'Disputed'} v={`${fmt(open.disputedAt)} — ${open.disputedByEmail ?? ''}${open.disputeReason ? `: ${open.disputeReason}` : ''}`} />}
              {(open.linkedClaimKey || open.linkedRecordKey) && <Row k={isAr ? 'مرتبط بـ' : 'Linked to'} v={open.linkedClaimKey || open.linkedRecordKey} />}
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {open.attachments && !open.attachmentViewedAt && <Button variant="ghost" size="sm" onClick={() => act('attachment-viewed')}>{isAr ? 'فتح المرفق' : 'View attachment'}</Button>}
              {!open.acknowledgedAt && <Button variant="primary" size="sm" onClick={() => act('acknowledge')}>{isAr ? 'إقرار بالاستلام' : 'Acknowledge'}</Button>}
              {!open.respondedAt && <><Button variant="success" size="sm" onClick={() => act('respond', { decision: 'accepted' })}>{isAr ? 'قبول' : 'Accept'}</Button>
              <Button variant="danger" size="sm" onClick={() => act('respond', { decision: 'rejected' })}>{isAr ? 'رفض' : 'Reject'}</Button></>}
              {!open.actionCompletedAt && <Button variant="ghost" size="sm" onClick={() => act('complete-action')}>{isAr ? 'اكتمل الإجراء' : 'Complete action'}</Button>}
              {!open.noActionAt && <Button variant="ghost" size="sm" onClick={() => act('no-action', { reason: window.prompt(isAr ? 'سبب عدم اتخاذ إجراء؟' : 'Reason for no action?') ?? undefined })}>{isAr ? 'لا إجراء' : 'No action'}</Button>}
              {!open.disputedAt && <Button variant="danger" size="sm" onClick={() => act('dispute', { reason: window.prompt(isAr ? 'سبب النزاع؟' : 'Dispute reason?') ?? undefined })}>{isAr ? 'نزاع' : 'Dispute'}</Button>}
              {canEvaluate && <Button variant="ghost" size="sm" onClick={() => act('escalate')}>{isAr ? 'تصعيد' : 'Escalate'}</Button>}
            </div>

            {trail.length > 0 && (
              <div className="mt-4 rounded-lg border border-white/10 bg-white/[0.02] p-3">
                <p className="text-[11px] font-semibold text-slate-200">{isAr ? 'سجل التدقيق (مرجع الأدلّة)' : 'Audit log (evidence reference)'}</p>
                <ol className="mt-2 space-y-1">
                  {trail.map((a) => (
                    <li key={a.id} className="flex justify-between gap-3 text-[10px]">
                      <span className="font-mono text-sky-300">{a.action}</span>
                      <span className="text-end text-slate-500">{a.actorEmail} · {fmt(a.createdAt)}</span>
                    </li>
                  ))}
                </ol>
              </div>
            )}
            <p className="mt-3 text-[10px] text-slate-500">{isAr ? 'كل حدث (فتح/مرفق/إقرار/رد/إجراء/تصعيد/نزاع) مُسجَّل في سجل التدقيق.' : 'Every event (open / attachment / acknowledge / respond / action / escalate / dispute) is recorded in the audit log.'}</p>
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ k, v }: { k: string; v: string | null }) {
  return <div className="flex justify-between gap-3"><span className="text-slate-500">{k}</span><span className="text-end text-slate-200" dir="auto">{v || '—'}</span></div>;
}

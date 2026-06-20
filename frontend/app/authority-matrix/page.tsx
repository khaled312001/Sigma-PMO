'use client';

import { useCallback, useEffect, useState } from 'react';

import { AuthGate } from '../../components/AuthGate';
import { useToast } from '../../components/ToastProvider';
import { useI18n } from '../../lib/i18n';
import { useCurrentProjectKey } from '../../lib/project-context';
import { api } from '../../lib/api';
import { Button, Card, EmptyState, PageHeader, Pill } from '../../components/ui';

interface AuthEntry {
  id: string; businessKey: string; party: string; personName: string; personEmail: string | null;
  title: string | null; actions: string[]; monetaryLimit: string | null; currency: string | null; status: string;
}
interface CheckResult {
  action: string; authorized: boolean; status: 'authorized' | 'unauthorized' | 'unknown';
  basis: string; contractualEffect: string | null; matchedPerson: string | null;
}

const PARTIES = ['owner', 'employer', 'contractor', 'consultant', 'engineer', 'subcontractor', 'pmo'];

export default function AuthorityMatrixRoute() {
  return (
    <AuthGate capability="canRead" surface="Contractual Authority Matrix">
      <AuthorityMatrixPage />
    </AuthGate>
  );
}

function AuthorityMatrixPage() {
  const { lang } = useI18n();
  const ar = lang === 'ar';
  const projectKey = useCurrentProjectKey();
  const toast = useToast();
  const [entries, setEntries] = useState<AuthEntry[]>([]);
  const [actions, setActions] = useState<string[]>([]);

  const refresh = useCallback(async () => {
    try {
      const [list, acts] = await Promise.all([
        api<AuthEntry[]>(`/authority-matrix?projectKey=${encodeURIComponent(projectKey)}`),
        api<{ actions: string[] }>(`/authority-matrix/actions`),
      ]);
      setEntries(list); setActions(acts.actions);
    } catch (e) { toast.error(ar ? 'تعذّر تحميل المصفوفة' : 'Failed to load matrix', (e as Error).message); }
  }, [projectKey, toast, ar]);

  useEffect(() => { void refresh(); }, [refresh]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={`Contractual Authority Matrix · ${projectKey}`}
        title={ar ? 'مصفوفة الصلاحيات التعاقدية' : 'Contractual Authority Matrix'}
        description={ar
          ? 'من يحق له تعاقدياً إصدار التعليمات، اعتماد المواد، رفض الأعمال، توقيع التقارير اليومية، اعتماد التغيير، إرسال الإشعارات، اعتماد تمديد المدة، تمثيل المالك/المقاول — مع حدود مالية وفترات صلاحية. وفحص أثر المراسلة الصادرة من شخص غير مخوّل.'
          : 'Who may contractually issue instructions, approve material, reject work, sign daily reports, approve variations, send notices, approve EOT, represent the owner/contractor — with monetary limits and validity windows. And the effect of correspondence from an unauthorized person.'}
      />

      <CheckTool projectKey={projectKey} actions={actions} ar={ar} />

      <Card title={ar ? 'الممثلون المخوّلون' : 'Authorized representatives'}>
        {entries.length === 0 ? (
          <EmptyState title={ar ? 'لا توجد قيود بعد' : 'No entries yet'} description={ar ? 'أضف الممثلين المخوّلين وصلاحياتهم لتفعيل فحص الصلاحية.' : 'Add authorized representatives and their actions to enable the authorization check.'} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead><tr className="border-b border-slate-800 text-[11px] uppercase tracking-wider text-slate-400">
                <th className="px-2 py-2 text-start">{ar ? 'الكود' : 'Key'}</th>
                <th className="px-2 py-2 text-start">{ar ? 'الشخص' : 'Person'}</th>
                <th className="px-2 py-2 text-start">{ar ? 'الطرف' : 'Party'}</th>
                <th className="px-2 py-2 text-start">{ar ? 'الصلاحيات' : 'Actions'}</th>
                <th className="px-2 py-2 text-end">{ar ? 'الحد المالي' : 'Limit'}</th>
              </tr></thead>
              <tbody>
                {entries.map((e) => (
                  <tr key={e.id} className="border-b border-slate-800/60 hover:bg-slate-900/50">
                    <td className="px-2 py-2 font-mono text-[11px] text-sky-300" dir="ltr">{e.businessKey}</td>
                    <td className="px-2 py-2"><span className="font-medium text-slate-100">{e.personName}</span>{e.personEmail && <span className="ms-1 text-[11px] text-slate-400" dir="ltr">{e.personEmail}</span>}{e.title && <span className="block text-[11px] text-slate-400">{e.title}</span>}</td>
                    <td className="px-2 py-2"><Pill tone="violet">{e.party}</Pill></td>
                    <td className="px-2 py-2"><div className="flex flex-wrap gap-1">{e.actions.map((a) => <Pill key={a} tone="slate">{a.replace(/_/g, ' ')}</Pill>)}</div></td>
                    <td className="px-2 py-2 text-end font-mono tabular-nums text-slate-300" dir="ltr">{e.monetaryLimit ? `${e.monetaryLimit} ${e.currency ?? ''}` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="mt-3"><AddEntryForm projectKey={projectKey} actions={actions} ar={ar} onDone={refresh} /></div>
      </Card>
    </div>
  );
}

function CheckTool({ projectKey, actions, ar }: { projectKey: string; actions: string[]; ar: boolean }) {
  const toast = useToast();
  const [action, setAction] = useState('issue_instruction');
  const [senderEmail, setSenderEmail] = useState('');
  const [amount, setAmount] = useState('');
  const [result, setResult] = useState<CheckResult | null>(null);
  const [busy, setBusy] = useState(false);
  const field = 'mt-1 block w-full rounded-lg border border-slate-700 bg-slate-900/70 px-3 py-2 text-sm text-slate-100';

  const run = async () => {
    setBusy(true);
    try {
      setResult(await api<CheckResult>('/authority-matrix/check', { method: 'POST', body: JSON.stringify({ projectKey, action, senderEmail: senderEmail || null, amount: amount ? Number(amount) : null }) }));
    } catch (e) { toast.error(ar ? 'فشل الفحص' : 'Check failed', (e as Error).message); } finally { setBusy(false); }
  };

  const tone = result?.status === 'authorized' ? 'emerald' : result?.status === 'unauthorized' ? 'rose' : 'amber';
  return (
    <Card title={ar ? 'فحص الصلاحية' : 'Authorization check'} hint={ar ? 'هل المُرسِل مخوّل لإصدار هذا الإجراء؟' : 'Is the sender authorized to issue this action?'}>
      <div className="grid gap-3 sm:grid-cols-4">
        <label className="text-xs text-slate-400">{ar ? 'الإجراء' : 'Action'}<select className={field} value={action} onChange={(e) => setAction(e.target.value)}>{actions.map((a) => <option key={a} value={a}>{a.replace(/_/g, ' ')}</option>)}</select></label>
        <label className="text-xs text-slate-400 sm:col-span-2">{ar ? 'بريد المُرسِل' : 'Sender email'}<input className={field} value={senderEmail} onChange={(e) => setSenderEmail(e.target.value)} placeholder="eng@consultant.com" dir="ltr" /></label>
        <label className="text-xs text-slate-400">{ar ? 'المبلغ (اختياري)' : 'Amount (opt.)'}<input type="number" className={field} value={amount} onChange={(e) => setAmount(e.target.value)} /></label>
      </div>
      <div className="mt-3"><Button variant="primary" size="sm" disabled={busy} onClick={run}>{busy ? '…' : (ar ? 'فحص' : 'Check')}</Button></div>
      {result && (
        <div className={`mt-3 rounded-lg border p-3 ${tone === 'emerald' ? 'border-emerald-500/40 bg-emerald-500/10' : tone === 'rose' ? 'border-rose-500/40 bg-rose-500/10' : 'border-amber-500/40 bg-amber-500/10'}`}>
          <div className="flex items-center gap-2"><Pill tone={tone}>{result.status}</Pill>{result.matchedPerson && <span className="text-sm text-slate-200">{result.matchedPerson}</span>}</div>
          <p className="mt-1.5 text-sm text-slate-200">{result.basis}</p>
          {result.contractualEffect && <p className="mt-1 text-xs text-amber-200">⚠ {result.contractualEffect}</p>}
        </div>
      )}
    </Card>
  );
}

function AddEntryForm({ projectKey, actions, ar, onDone }: { projectKey: string; actions: string[]; ar: boolean; onDone: () => Promise<void> }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [personName, setPersonName] = useState('');
  const [personEmail, setPersonEmail] = useState('');
  const [party, setParty] = useState('engineer');
  const [title, setTitle] = useState('');
  const [picked, setPicked] = useState<string[]>([]);
  const [monetaryLimit, setMonetaryLimit] = useState('');
  const [busy, setBusy] = useState(false);
  const field = 'mt-1 block w-full rounded-lg border border-slate-700 bg-slate-900/70 px-3 py-2 text-sm text-slate-100';

  const toggle = (a: string) => setPicked((p) => (p.includes(a) ? p.filter((x) => x !== a) : [...p, a]));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true);
    try {
      await api('/authority-matrix', { method: 'POST', body: JSON.stringify({ projectKey, personName, personEmail: personEmail || null, party, title: title || null, actions: picked, monetaryLimit: monetaryLimit ? Number(monetaryLimit) : null }) });
      toast.success(ar ? 'تمت الإضافة' : 'Entry added');
      setPersonName(''); setPersonEmail(''); setTitle(''); setPicked([]); setMonetaryLimit(''); setOpen(false);
      await onDone();
    } catch (err) { toast.error(ar ? 'فشلت الإضافة' : 'Add failed', (err as Error).message); } finally { setBusy(false); }
  };

  if (!open) return <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>{ar ? '+ إضافة ممثّل مخوّل' : '+ Add authorized representative'}</Button>;
  return (
    <form onSubmit={submit} className="grid grid-cols-1 gap-3 rounded-lg border border-slate-700/70 bg-slate-900/40 p-4 sm:grid-cols-2">
      <label className="text-xs text-slate-400">{ar ? 'الاسم' : 'Name'}<input required className={field} value={personName} onChange={(e) => setPersonName(e.target.value)} /></label>
      <label className="text-xs text-slate-400">{ar ? 'البريد' : 'Email'}<input className={field} value={personEmail} onChange={(e) => setPersonEmail(e.target.value)} dir="ltr" /></label>
      <label className="text-xs text-slate-400">{ar ? 'الطرف' : 'Party'}<select className={field} value={party} onChange={(e) => setParty(e.target.value)}>{PARTIES.map((p) => <option key={p} value={p}>{p}</option>)}</select></label>
      <label className="text-xs text-slate-400">{ar ? 'الصفة' : 'Title'}<input className={field} value={title} onChange={(e) => setTitle(e.target.value)} placeholder={ar ? 'مثال: ممثّل المالك' : "e.g. Employer's Representative"} /></label>
      <label className="text-xs text-slate-400 sm:col-span-2">{ar ? 'الحد المالي (اختياري)' : 'Monetary limit (optional)'}<input type="number" className={field} value={monetaryLimit} onChange={(e) => setMonetaryLimit(e.target.value)} /></label>
      <div className="sm:col-span-2">
        <p className="text-xs text-slate-400">{ar ? 'الصلاحيات' : 'Actions'}</p>
        <div className="mt-1 flex flex-wrap gap-1.5">
          {actions.map((a) => (
            <button key={a} type="button" onClick={() => toggle(a)} className={`rounded-full border px-2 py-1 text-[11px] ${picked.includes(a) ? 'border-sky-400 bg-sky-500/20 text-sky-100' : 'border-slate-700 text-slate-400 hover:border-slate-500'}`}>{a.replace(/_/g, ' ')}</button>
          ))}
        </div>
      </div>
      <div className="flex items-end gap-2 sm:col-span-2"><Button type="submit" variant="primary" disabled={busy || picked.length === 0}>{busy ? '…' : (ar ? 'إضافة' : 'Add')}</Button><Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>{ar ? 'إلغاء' : 'Cancel'}</Button></div>
    </form>
  );
}

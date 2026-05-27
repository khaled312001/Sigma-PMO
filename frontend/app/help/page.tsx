'use client';

import Link from 'next/link';

import { Card, PageHeader, Pill } from '../../components/ui';

const STEPS: Array<{ surface: string; title: string; description: string; href: string; tone: 'sky' | 'emerald' | 'amber' | 'violet' | 'rose' }> = [
  { surface: 'Input',    title: 'Upload a P6 / Excel / CSV file', description: 'The file is content-addressed (SHA-256), archived immutably, and pushed through the canonical ingestion pipeline. A data-confidence score is attached to every run.', href: '/input',    tone: 'sky' },
  { surface: 'Review',   title: 'Evaluate the rule engine + decide', description: 'Detect schedule slips, cost overruns, behind-plan activities, resource underuse, and stale reporting. Each finding is paired with its FIDIC mapping, escalation level, and intervention library.', href: '/review',   tone: 'emerald' },
  { surface: 'Evidence', title: 'Trace any alert back to source bytes', description: 'For any alert, view the triggering canonical row, the ingestion run, the source file (with SHA-256), and the original parsed payload (rawSource).', href: '/evidence', tone: 'violet' },
  { surface: 'Approval', title: 'Approve / Reject / Acknowledge decisions', description: 'Stakeholder actions are append-only — every action is timestamped against the actor. The latest action on a decision is its current state.', href: '/approval', tone: 'amber' },
  { surface: 'Policy',   title: 'Edit governance policy', description: 'Edit the FIDIC mapping, accountability, escalation tiers, and intervention library. Every save is a new version; prior versions are preserved.', href: '/admin/policy', tone: 'rose' },
];

export default function HelpPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Help"
        title="How to use Sigma PMO"
        description="A short tour through the five core surfaces of the platform. Each link below opens that surface in this console."
      />

      <Card title="The PMO loop">
        <ol className="space-y-3">
          {STEPS.map((s, i) => (
            <li key={s.href} className="flex gap-3 rounded-lg border border-slate-800 bg-slate-900/40 p-3">
              <div className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-slate-800 text-xs font-semibold text-slate-200">{i + 1}</div>
              <div className="flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Pill tone={s.tone}>{s.surface}</Pill>
                  <Link href={s.href} className="text-sm font-medium text-slate-100 hover:text-sky-300">{s.title} →</Link>
                </div>
                <p className="mt-1 text-xs text-slate-400">{s.description}</p>
              </div>
            </li>
          ))}
        </ol>
      </Card>

      <Card title="Bootstrap mode &amp; RBAC">
        <p className="text-sm text-slate-200">
          When no <code className="rounded bg-slate-800 px-1.5 py-0.5 text-xs">User</code> rows exist, the platform runs in <strong className="text-amber-300">bootstrap mode</strong>: every write endpoint is open so the first admin can be created.
        </p>
        <p className="mt-3 text-sm text-slate-300">Create the first admin from the backend host:</p>
        <pre className="mt-2 overflow-auto rounded-lg bg-black/40 p-3 text-[12px] leading-snug text-slate-200">
{`cd backend
npm run user:create -- you@sigma-pmo.com sigma_admin "Your Name"`}
        </pre>
        <p className="mt-3 text-sm text-slate-300">The CLI prints the raw API key <strong>once</strong>. Paste it on the <Link href="/auth" className="text-sky-300 hover:text-sky-200">sign-in page</Link>. From that moment on, RBAC enforcement applies and the sidebar surfaces filter to the user&rsquo;s role.</p>
      </Card>

      <Card title="Roles &amp; capabilities">
        <ul className="space-y-2 text-sm text-slate-200">
          <li><Pill tone="rose">Sigma Admin</Pill> &nbsp; full access including Policy &amp; Users</li>
          <li><Pill tone="rose">Sigma Reviewer</Pill> &nbsp; Review / Evidence / Approval (no policy edit)</li>
          <li><Pill tone="sky">Client</Pill> &nbsp; same as Reviewer, plus Policy editing</li>
          <li><Pill tone="emerald">Consultant</Pill> &nbsp; Input / Review / Evidence / Approval</li>
          <li><Pill tone="amber">Contractor</Pill> &nbsp; Input only</li>
        </ul>
      </Card>
    </div>
  );
}

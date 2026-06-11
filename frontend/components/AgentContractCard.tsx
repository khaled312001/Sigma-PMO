import { Card, Pill } from './ui';

/**
 * AgentContractCard — the visual embodiment of Mr. Ayham's standardized Agent
 * operating model. Renders any agent's seven-field contract (Objective /
 * Inputs / Outputs / Rule References / + the live Confidence/Escalation/Audit
 * the runtime supplies) in one uniform layout reused by every L0–L8 screen.
 */
export interface AgentDescriptor {
  agentKey: string;
  layer: string;
  objective: string;
  inputs: string[];
  outputs: string[];
  ruleReferences: string[];
  personaSlug?: string;
}

const LAYER_LABEL: Record<string, string> = {
  l0_knowledge: 'L0 · Knowledge & Rules',
  l1_data_collection: 'L1 · Data Collection',
  l2_validation: 'L2 · Validation',
  l3_compliance: 'L3 · Compliance',
  l4_analytics: 'L4 · Analytics',
  l5_risk: 'L5 · Risk',
  l6_claims: 'L6 · Claims & Disputes',
  l7_executive: 'L7 · Executive Intelligence',
  l8_sigma_governance: 'L8 · Sigma Governance AI',
};

function FieldList({ label, items, tone }: { label: string; items: string[]; tone: 'sky' | 'emerald' | 'amber' }) {
  if (!items?.length) return null;
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{label}</p>
      <ul className="mt-1 flex flex-wrap gap-1.5">
        {items.map((it, i) => (
          <li key={i}>
            <Pill tone={tone}>{it}</Pill>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function AgentContractCard({
  descriptor,
  footer,
}: {
  descriptor: AgentDescriptor;
  footer?: React.ReactNode;
}) {
  return (
    <Card>
      <div className="flex flex-wrap items-center gap-2">
        <Pill tone="violet">{LAYER_LABEL[descriptor.layer] ?? descriptor.layer}</Pill>
        <span className="font-mono text-xs text-slate-300" dir="ltr">{descriptor.agentKey}</span>
        {descriptor.personaSlug && (
          <span className="ms-auto font-mono text-[10px] text-slate-500" dir="ltr">
            persona: {descriptor.personaSlug}
          </span>
        )}
      </div>
      <p className="mt-2 text-sm text-slate-200">{descriptor.objective}</p>
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <FieldList label="Inputs" items={descriptor.inputs} tone="sky" />
        <FieldList label="Outputs" items={descriptor.outputs} tone="emerald" />
        <FieldList label="Rule references" items={descriptor.ruleReferences} tone="amber" />
      </div>
      {footer && <div className="mt-3 border-t border-slate-800 pt-3">{footer}</div>}
    </Card>
  );
}

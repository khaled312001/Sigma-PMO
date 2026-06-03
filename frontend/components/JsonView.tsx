'use client';

import { useMemo, useState } from 'react';

import { useI18n } from '../lib/i18n';
import { IconCheck, IconCopy } from './Icons';

/**
 * Read-only JSON viewer with syntax colors. Forces dir="ltr" so JSON reads
 * correctly even when the page document direction is rtl (Arabic). Lazy-
 * renders deep trees by collapsing levels past `defaultDepth`.
 *
 * Color tokens:
 *   key      → sky-300
 *   string   → emerald-300
 *   number   → amber-300
 *   boolean  → violet-300
 *   null     → slate-500 (italic)
 *   bracket  → slate-300
 *   comma    → slate-500
 */
export function JsonView({
  data,
  defaultDepth = 3,
  maxHeight = '24rem',
  title,
}: {
  data: unknown;
  defaultDepth?: number;
  maxHeight?: string;
  title?: string;
}) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);

  const serialized = useMemo(() => {
    try { return JSON.stringify(data, null, 2); } catch { return String(data); }
  }, [data]);

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(serialized);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* ignore */ }
  };

  const lineCount = (serialized.match(/\n/g)?.length ?? 0) + 1;

  return (
    <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-950/60" dir="ltr">
      <div className="flex items-center justify-between gap-2 border-b border-slate-800/70 bg-slate-900/40 px-3 py-1.5">
        <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
          {title ? <span>{title}</span> : <span>JSON</span>}
          <span className="rounded bg-slate-800/80 px-1.5 py-0.5 font-mono text-[9px] text-slate-400">
            {lineCount} {lineCount === 1 ? 'line' : 'lines'}
          </span>
        </div>
        <button
          type="button"
          onClick={onCopy}
          className="inline-flex items-center gap-1 rounded-md border border-slate-800 bg-slate-900/60 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400 transition hover:border-slate-600 hover:text-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/50"
          aria-label={copied ? 'Copied' : (t('common.refresh') /* fallback label until copy key */)}
        >
          {copied ? <IconCheck className="h-3 w-3 text-emerald-300" /> : <IconCopy className="h-3 w-3" />}
          <span>{copied ? 'Copied' : 'Copy'}</span>
        </button>
      </div>

      <div
        className="overflow-auto bg-[oklch(0.10_0.018_240)]"
        style={{ maxHeight }}
        tabIndex={0}
        role="region"
        aria-label={title ?? 'JSON content'}
      >
        <pre className="px-4 py-3 font-mono text-[11.5px] leading-[1.55] text-slate-200">
          <Node value={data} depth={0} defaultDepth={defaultDepth} isLast />
        </pre>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

type Primitive = string | number | boolean | null;

function isPrimitive(v: unknown): v is Primitive {
  return v === null || ['string', 'number', 'boolean'].includes(typeof v);
}

function Node({
  value, keyName, depth, defaultDepth, isLast,
}: {
  value: unknown;
  keyName?: string;
  depth: number;
  defaultDepth: number;
  isLast: boolean;
}) {
  if (Array.isArray(value)) return <ArrayNode arr={value} keyName={keyName} depth={depth} defaultDepth={defaultDepth} isLast={isLast} />;
  if (value && typeof value === 'object') return <ObjectNode obj={value as Record<string, unknown>} keyName={keyName} depth={depth} defaultDepth={defaultDepth} isLast={isLast} />;
  return (
    <span>
      {keyName !== undefined && <KeyLabel name={keyName} />}
      <PrimitiveValue value={value as Primitive} />
      {!isLast && <span className="text-slate-500">,</span>}
    </span>
  );
}

function ObjectNode({
  obj, keyName, depth, defaultDepth, isLast,
}: {
  obj: Record<string, unknown>;
  keyName?: string;
  depth: number;
  defaultDepth: number;
  isLast: boolean;
}) {
  const entries = Object.entries(obj);
  const [open, setOpen] = useState(depth < defaultDepth);

  if (entries.length === 0) {
    return (
      <span>
        {keyName !== undefined && <KeyLabel name={keyName} />}
        <span className="text-slate-300">{'{}'}</span>
        {!isLast && <span className="text-slate-500">,</span>}
      </span>
    );
  }

  const PAD = '  '.repeat(depth);
  const INNER_PAD = '  '.repeat(depth + 1);

  return (
    <>
      <span>
        {keyName !== undefined && <KeyLabel name={keyName} />}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-label={open ? `Collapse ${keyName ?? 'object'}` : `Expand ${keyName ?? 'object'}`}
          className="cursor-pointer text-slate-300 hover:text-white"
        >
          <span className="me-1 inline-block w-3 select-none text-center text-[9px] text-slate-500">{open ? '▼' : '▶'}</span>
          {'{'}
        </button>
        {!open && (
          <span className="text-slate-500">
            {' '}{entries.length} {entries.length === 1 ? 'key' : 'keys'} {' }'}
            {!isLast && ','}
          </span>
        )}
      </span>
      {open && (
        <>
          {entries.map(([k, v], i) => (
            <div key={k}>
              <span>{INNER_PAD}</span>
              <Node value={v} keyName={k} depth={depth + 1} defaultDepth={defaultDepth} isLast={i === entries.length - 1} />
            </div>
          ))}
          <div>
            <span>{PAD}</span>
            <span className="text-slate-300">{'}'}</span>
            {!isLast && <span className="text-slate-500">,</span>}
          </div>
        </>
      )}
    </>
  );
}

function ArrayNode({
  arr, keyName, depth, defaultDepth, isLast,
}: {
  arr: unknown[];
  keyName?: string;
  depth: number;
  defaultDepth: number;
  isLast: boolean;
}) {
  const [open, setOpen] = useState(depth < defaultDepth);

  if (arr.length === 0) {
    return (
      <span>
        {keyName !== undefined && <KeyLabel name={keyName} />}
        <span className="text-slate-300">[]</span>
        {!isLast && <span className="text-slate-500">,</span>}
      </span>
    );
  }

  // Compact one-line array of primitives — looks tidier inline.
  if (depth >= defaultDepth - 1 && arr.every(isPrimitive) && arr.length <= 8) {
    return (
      <span>
        {keyName !== undefined && <KeyLabel name={keyName} />}
        <span className="text-slate-300">[</span>
        {arr.map((v, i) => (
          <span key={i}>
            <PrimitiveValue value={v as Primitive} />
            {i < arr.length - 1 && <span className="text-slate-500">, </span>}
          </span>
        ))}
        <span className="text-slate-300">]</span>
        {!isLast && <span className="text-slate-500">,</span>}
      </span>
    );
  }

  const PAD = '  '.repeat(depth);
  const INNER_PAD = '  '.repeat(depth + 1);

  return (
    <>
      <span>
        {keyName !== undefined && <KeyLabel name={keyName} />}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-label={open ? 'Collapse array' : 'Expand array'}
          className="cursor-pointer text-slate-300 hover:text-white"
        >
          <span className="me-1 inline-block w-3 select-none text-center text-[9px] text-slate-500">{open ? '▼' : '▶'}</span>
          {'['}
        </button>
        {!open && (
          <span className="text-slate-500">
            {' '}{arr.length} {arr.length === 1 ? 'item' : 'items'} {' ]'}
            {!isLast && ','}
          </span>
        )}
      </span>
      {open && (
        <>
          {arr.map((v, i) => (
            <div key={i}>
              <span>{INNER_PAD}</span>
              <Node value={v} depth={depth + 1} defaultDepth={defaultDepth} isLast={i === arr.length - 1} />
            </div>
          ))}
          <div>
            <span>{PAD}</span>
            <span className="text-slate-300">{']'}</span>
            {!isLast && <span className="text-slate-500">,</span>}
          </div>
        </>
      )}
    </>
  );
}

function KeyLabel({ name }: { name: string }) {
  return (
    <>
      <span className="text-sky-300">{`"${name}"`}</span>
      <span className="text-slate-500">: </span>
    </>
  );
}

function PrimitiveValue({ value }: { value: Primitive }) {
  if (value === null) return <span className="italic text-slate-500">null</span>;
  if (typeof value === 'boolean') return <span className="text-violet-300">{String(value)}</span>;
  if (typeof value === 'number') return <span className="text-amber-300 tabular-nums">{value}</span>;
  // string
  return <span className="break-all text-emerald-300">{`"${value}"`}</span>;
}

'use client';

import { Fragment, ReactNode } from 'react';

/**
 * MarkdownLite — a tiny deterministic renderer for the markdown subset the
 * feasibility study engine emits: **bold**, `- ` bullet lists and GitHub-style
 * pipe tables. No external dependency, no HTML injection (text-only nodes).
 */
export function MarkdownLite({ text }: { text: string }) {
  const blocks = splitBlocks(text);
  return (
    <div className="space-y-3 text-sm leading-relaxed text-slate-200">
      {blocks.map((b, i) => {
        if (b.type === 'table') return <PipeTable key={i} rows={b.lines} />;
        if (b.type === 'list') {
          return (
            <ul key={i} className="list-disc space-y-1 ps-5">
              {b.lines.map((l, j) => <li key={j}>{inline(l.replace(/^- /, ''))}</li>)}
            </ul>
          );
        }
        return <p key={i} className="whitespace-pre-wrap">{inline(b.lines.join('\n'))}</p>;
      })}
    </div>
  );
}

interface Block { type: 'p' | 'list' | 'table'; lines: string[] }

function splitBlocks(text: string): Block[] {
  const out: Block[] = [];
  let cur: Block | null = null;
  for (const raw of text.split('\n')) {
    const line = raw.trimEnd();
    const kind: Block['type'] =
      line.startsWith('|') ? 'table' : line.startsWith('- ') ? 'list' : 'p';
    if (!line.trim()) { cur = null; continue; }
    if (!cur || cur.type !== kind) {
      cur = { type: kind, lines: [] };
      out.push(cur);
    }
    cur.lines.push(line);
  }
  return out;
}

/** Render **bold** spans inside a text run. */
function inline(text: string): ReactNode {
  const parts = text.split(/\*\*(.+?)\*\*/g);
  return parts.map((p, i) =>
    i % 2 === 1 ? <strong key={i} className="font-semibold text-slate-50">{p}</strong> : <Fragment key={i}>{p}</Fragment>,
  );
}

function PipeTable({ rows }: { rows: string[] }) {
  const parsed = rows
    .map((r) => r.replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim()))
    .filter((cells) => !cells.every((c) => /^:?-{2,}:?$/.test(c) || c === ''));
  if (!parsed.length) return null;
  const [head, ...body] = parsed;
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-700/70">
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-slate-800/80 text-start">
            {head.map((c, i) => (
              <th key={i} className="px-3 py-2 text-start font-semibold uppercase tracking-wider text-slate-300">{inline(c)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {body.map((cells, i) => (
            <tr key={i} className="border-t border-slate-800 odd:bg-slate-900/40">
              {cells.map((c, j) => (
                <td key={j} className="px-3 py-1.5 tabular-nums text-slate-200" dir="auto">{inline(c)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

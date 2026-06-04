'use client';

/**
 * Shimmer skeleton primitives. Use to reserve layout while data loads, so
 * the page doesn't jump when content arrives. Use the semantic helpers
 * (SkeletonText, SkeletonStat, SkeletonRow) rather than raw <Skeleton/>
 * when the shape is known — they encode the right widths and rhythm.
 */
export function Skeleton({
  className = '',
  width,
  height = '1em',
}: { className?: string; width?: string | number; height?: string | number }) {
  return (
    <span
      aria-hidden
      className={`inline-block animate-pulse rounded bg-slate-800/70 align-middle ${className}`}
      style={{ width, height }}
    />
  );
}

export function SkeletonText({
  lines = 3,
  className = '',
}: { lines?: number; className?: string }) {
  return (
    <div className={`space-y-2 ${className}`}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} className="block" width={i === lines - 1 ? '60%' : '100%'} height="0.9em" />
      ))}
    </div>
  );
}

export function SkeletonStat() {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
      <Skeleton width="40%" height="0.7em" />
      <div className="mt-3"><Skeleton width="2.5em" height="1.8em" /></div>
    </div>
  );
}

export function SkeletonRow({ cols = 4 }: { cols?: number }) {
  return (
    <div className="grid items-center gap-3 border-b border-slate-800/70 px-3 py-2" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
      {Array.from({ length: cols }).map((_, i) => (
        <Skeleton key={i} width={i === 0 ? '50%' : '80%'} height="0.9em" />
      ))}
    </div>
  );
}

export function SkeletonCard({ rows = 3 }: { rows?: number }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
      <div className="flex items-center justify-between">
        <Skeleton width="35%" height="1em" />
        <Skeleton width="3em" height="0.9em" />
      </div>
      <div className="mt-4 space-y-2">
        {Array.from({ length: rows }).map((_, i) => (
          <Skeleton key={i} className="block" width={i === rows - 1 ? '50%' : '100%'} height="0.8em" />
        ))}
      </div>
    </div>
  );
}

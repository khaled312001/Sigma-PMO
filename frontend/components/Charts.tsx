'use client';

/**
 * Pure-SVG chart primitives for Sigma PMO analytics surfaces.
 *
 * Why pure SVG instead of `recharts` / `chart.js`:
 *  - Zero new dependencies; ships only the JS we author.
 *  - Brand-aligned out of the box (crimson identity, neutral palette,
 *    Tajawal/Inter type) without theming overrides.
 *  - Server-renderable — the `'use client'` directive is here only because
 *    the surrounding routes are client components; the components
 *    themselves do not use any browser-only APIs.
 *  - Tiny: each chart is < 60 lines of pure presentation.
 *
 * What ships in Wave 4:
 *  - {@link KpiSparkBar}  — inline mini-bar for KPI tiles.
 *  - {@link BarChart}     — horizontal bars; alerts-by-code / severity.
 *  - {@link DonutChart}   — share-of-total ring; activity status mix.
 *  - {@link LineChart}    — single-series time line; planned vs actual.
 *  - {@link GaugeChart}   — semicircular gauge; data confidence.
 *  - {@link StackedBar}   — stacked horizontal; alert severity in one row.
 *
 * Each component accepts an explicit `width` / `height` so the parent
 * controls layout. Tooltips are CSS title attributes (no portal layer);
 * this keeps the components SSR-safe and accessible by default.
 */

import { ReactNode } from 'react';

// ── Brand palette — keep in sync with `globals.css` and `PdfRendererService` ──
export const CHART_PALETTE = {
  crimson: '#8c0f21',
  crimsonDeep: '#6b0a19',
  crimsonSoft: '#c45264',
  ink: '#14171f',
  inkMid: '#525861',
  inkSoft: '#8b919b',
  canvas: '#f7f7f9',
  border: '#dcdde3',
  emerald: '#1a805c',
  amber: '#d98610',
  rose: '#c72121',
  sky: '#1d4ed8',
} as const;

// ── KpiSparkBar — tiny inline gauge inside a KPI card ────────────────────

export interface KpiSparkBarProps {
  /** 0..1 fill ratio. Clamped. */
  value: number;
  /** Optional accent override; defaults to crimson. */
  accent?: string;
  height?: number;
}

export function KpiSparkBar({ value, accent = CHART_PALETTE.crimson, height = 4 }: KpiSparkBarProps) {
  const v = Math.max(0, Math.min(1, value));
  return (
    <div
      className="w-full overflow-hidden rounded-full"
      style={{ height, backgroundColor: CHART_PALETTE.border }}
      aria-hidden
    >
      <div style={{ width: `${v * 100}%`, height: '100%', backgroundColor: accent }} />
    </div>
  );
}

// ── BarChart — horizontal bars, labels left, values right ────────────────

export interface BarChartDatum {
  label: string;
  value: number;
  accent?: string;
}

export interface BarChartProps {
  data: BarChartDatum[];
  /** Title shown above the chart. Pass null/'' to hide. */
  title?: ReactNode;
  /** Optional caption shown above the bars (e.g. "by severity"). */
  caption?: ReactNode;
  /** Maximum value override (defaults to max of data). */
  max?: number;
  /** Row height in px. Default 28. */
  rowHeight?: number;
  /** Width of the label column in px. Default 140. */
  labelWidth?: number;
  /** Empty state message. */
  emptyLabel?: string;
  /** When true, hides the integer value on the right. */
  hideValue?: boolean;
}

export function BarChart({
  data,
  title,
  caption,
  max,
  rowHeight = 28,
  labelWidth = 140,
  emptyLabel = 'no data',
  hideValue = false,
}: BarChartProps) {
  if (!data.length) {
    return (
      <ChartFrame title={title} caption={caption}>
        <EmptyChart label={emptyLabel} />
      </ChartFrame>
    );
  }
  const m = max ?? Math.max(...data.map((d) => d.value), 1);
  return (
    <ChartFrame title={title} caption={caption}>
      <ul role="list" className="flex flex-col gap-1.5">
        {data.map((d, i) => {
          const pct = m > 0 ? Math.max(0.5, (d.value / m) * 100) : 0;
          const accent = d.accent ?? CHART_PALETTE.crimson;
          return (
            <li
              key={`${d.label}-${i}`}
              className="grid items-center gap-2"
              style={{ gridTemplateColumns: `${labelWidth}px 1fr 48px`, height: rowHeight }}
              title={`${d.label}: ${d.value}`}
            >
              <span
                className="truncate text-xs font-medium text-slate-200"
                dir="auto"
              >
                {d.label}
              </span>
              <div
                className="h-2 rounded-full"
                style={{ backgroundColor: CHART_PALETTE.border + '40' }}
              >
                <div
                  className="h-full rounded-full transition-[width]"
                  style={{ width: `${pct}%`, backgroundColor: accent }}
                />
              </div>
              {!hideValue && (
                <span className="text-right font-mono text-xs tabular-nums text-slate-100" dir="ltr">
                  {d.value}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </ChartFrame>
  );
}

// ── DonutChart — share-of-total ring with center label ───────────────────

export interface DonutDatum {
  label: string;
  value: number;
  accent?: string;
}

export interface DonutChartProps {
  data: DonutDatum[];
  title?: ReactNode;
  caption?: ReactNode;
  /** Diameter in px. Default 180. */
  size?: number;
  /** Stroke thickness in px. Default 22. */
  thickness?: number;
  /** Big text in the middle of the ring. */
  centerValue?: ReactNode;
  /** Subtext below `centerValue`. */
  centerLabel?: ReactNode;
}

export function DonutChart({
  data,
  title,
  caption,
  size = 180,
  thickness = 22,
  centerValue,
  centerLabel,
}: DonutChartProps) {
  const total = data.reduce((acc, d) => acc + d.value, 0);
  const radius = size / 2 - thickness / 2;
  const circumference = 2 * Math.PI * radius;
  const center = size / 2;

  if (total === 0) {
    return (
      <ChartFrame title={title} caption={caption}>
        <EmptyChart label="no data" height={size} />
      </ChartFrame>
    );
  }

  let cumulative = 0;
  return (
    <ChartFrame title={title} caption={caption}>
      <div className="flex flex-wrap items-center gap-5">
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          role="img"
          aria-label={typeof title === 'string' ? title : 'donut chart'}
          style={{ flexShrink: 0 }}
        >
          <circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke={CHART_PALETTE.border}
            strokeWidth={thickness}
            opacity={0.4}
          />
          {data.map((d, i) => {
            const fraction = d.value / total;
            const dasharray = `${fraction * circumference} ${circumference}`;
            const dashoffset = -cumulative * circumference;
            cumulative += fraction;
            const accent = d.accent ?? defaultAccentByIndex(i);
            return (
              <circle
                key={`${d.label}-${i}`}
                cx={center}
                cy={center}
                r={radius}
                fill="none"
                stroke={accent}
                strokeWidth={thickness}
                strokeDasharray={dasharray}
                strokeDashoffset={dashoffset}
                transform={`rotate(-90 ${center} ${center})`}
              >
                <title>{`${d.label}: ${d.value} (${(fraction * 100).toFixed(1)}%)`}</title>
              </circle>
            );
          })}
          {(centerValue !== undefined || centerLabel !== undefined) && (
            <g>
              <text
                x={center}
                y={center - 4}
                textAnchor="middle"
                fontSize={Math.round(size * 0.18)}
                fontWeight={700}
                fill={CHART_PALETTE.ink}
              >
                {centerValue}
              </text>
              <text
                x={center}
                y={center + Math.round(size * 0.14)}
                textAnchor="middle"
                fontSize={Math.round(size * 0.07)}
                fill={CHART_PALETTE.inkMid}
                style={{ letterSpacing: 1 }}
              >
                {centerLabel}
              </text>
            </g>
          )}
        </svg>

        <ul className="flex flex-col gap-1.5">
          {data.map((d, i) => {
            const accent = d.accent ?? defaultAccentByIndex(i);
            const fraction = total === 0 ? 0 : d.value / total;
            return (
              <li
                key={`${d.label}-${i}`}
                className="flex items-center gap-2 text-xs text-slate-200"
              >
                <span
                  aria-hidden
                  className="inline-block h-2.5 w-2.5 rounded-sm"
                  style={{ backgroundColor: accent }}
                />
                <span className="truncate" dir="auto">
                  {d.label}
                </span>
                <span className="ms-auto font-mono tabular-nums text-slate-100" dir="ltr">
                  {d.value}
                </span>
                <span className="font-mono text-[10px] tabular-nums text-slate-400" dir="ltr">
                  {(fraction * 100).toFixed(0)}%
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </ChartFrame>
  );
}

// ── LineChart — one or two series, fixed canvas ──────────────────────────

export interface LinePoint {
  x: number | string;
  y: number;
}

export interface LineSeries {
  label: string;
  points: LinePoint[];
  accent?: string;
  /** When true draws as dashed (use for planned vs actual). */
  dashed?: boolean;
}

export interface LineChartProps {
  series: LineSeries[];
  title?: ReactNode;
  caption?: ReactNode;
  width?: number;
  height?: number;
  /** Min/max y override; defaults derive from data. */
  yMin?: number;
  yMax?: number;
  /** Y-axis label (e.g. "% complete"). */
  yLabel?: string;
}

export function LineChart({
  series,
  title,
  caption,
  width = 480,
  height = 200,
  yMin,
  yMax,
  yLabel,
}: LineChartProps) {
  const allPoints = series.flatMap((s) => s.points);
  if (allPoints.length === 0) {
    return (
      <ChartFrame title={title} caption={caption}>
        <EmptyChart label="no data" height={height} />
      </ChartFrame>
    );
  }
  const padding = { top: 12, right: 16, bottom: 28, left: 36 };
  const innerW = width - padding.left - padding.right;
  const innerH = height - padding.top - padding.bottom;
  const minY = yMin ?? Math.min(...allPoints.map((p) => p.y));
  const maxY = yMax ?? Math.max(...allPoints.map((p) => p.y));
  const rangeY = maxY - minY || 1;
  const maxLen = Math.max(...series.map((s) => s.points.length), 1);
  const yFor = (y: number) => padding.top + innerH - ((y - minY) / rangeY) * innerH;
  const xFor = (i: number) => padding.left + (maxLen <= 1 ? innerW / 2 : (i / (maxLen - 1)) * innerW);

  return (
    <ChartFrame title={title} caption={caption}>
      <svg
        width="100%"
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={typeof title === 'string' ? title : 'line chart'}
      >
        {/* Y-axis gridlines */}
        {[0, 0.25, 0.5, 0.75, 1].map((t) => {
          const y = padding.top + innerH * (1 - t);
          return (
            <g key={t}>
              <line
                x1={padding.left}
                x2={width - padding.right}
                y1={y}
                y2={y}
                stroke={CHART_PALETTE.border}
                strokeWidth={0.5}
                opacity={0.4}
              />
              <text
                x={padding.left - 6}
                y={y + 3}
                textAnchor="end"
                fontSize={9}
                fill={CHART_PALETTE.inkSoft}
              >
                {(minY + t * rangeY).toFixed(0)}
              </text>
            </g>
          );
        })}
        {yLabel && (
          <text
            x={6}
            y={padding.top + innerH / 2}
            fontSize={9}
            fill={CHART_PALETTE.inkSoft}
            textAnchor="middle"
            transform={`rotate(-90 ${6} ${padding.top + innerH / 2})`}
          >
            {yLabel}
          </text>
        )}
        {/* Series */}
        {series.map((s, sIdx) => {
          const accent = s.accent ?? defaultAccentByIndex(sIdx);
          const path = s.points
            .map((p, i) => `${i === 0 ? 'M' : 'L'} ${xFor(i).toFixed(2)} ${yFor(p.y).toFixed(2)}`)
            .join(' ');
          return (
            <g key={s.label}>
              <path
                d={path}
                fill="none"
                stroke={accent}
                strokeWidth={2}
                strokeDasharray={s.dashed ? '4 4' : undefined}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              {s.points.map((p, i) => (
                <circle
                  key={`${s.label}-${i}`}
                  cx={xFor(i)}
                  cy={yFor(p.y)}
                  r={2.5}
                  fill={accent}
                >
                  <title>{`${s.label} · ${p.x}: ${p.y}`}</title>
                </circle>
              ))}
            </g>
          );
        })}
        {/* X labels (sparse — first / mid / last) */}
        {[0, Math.floor((maxLen - 1) / 2), maxLen - 1]
          .filter((v, i, arr) => arr.indexOf(v) === i)
          .map((i) => {
            const label = String(series[0]?.points[i]?.x ?? '');
            return (
              <text
                key={i}
                x={xFor(i)}
                y={height - padding.bottom + 16}
                textAnchor="middle"
                fontSize={9}
                fill={CHART_PALETTE.inkSoft}
              >
                {label}
              </text>
            );
          })}
      </svg>
      {series.length > 1 && (
        <ul className="mt-1 flex flex-wrap gap-3 text-[11px] text-slate-300">
          {series.map((s, i) => {
            const accent = s.accent ?? defaultAccentByIndex(i);
            return (
              <li key={s.label} className="flex items-center gap-1.5">
                <span
                  aria-hidden
                  className="inline-block h-0.5 w-4"
                  style={{ backgroundColor: accent, borderTop: s.dashed ? '1px dashed' : undefined }}
                />
                <span>{s.label}</span>
              </li>
            );
          })}
        </ul>
      )}
    </ChartFrame>
  );
}

// ── GaugeChart — semicircular needle gauge ───────────────────────────────

export interface GaugeChartProps {
  /** Current value. */
  value: number;
  /** Maximum (default 1 → percentage gauge). */
  max?: number;
  /** Width in px. Height = width / 2 + label area. */
  width?: number;
  title?: ReactNode;
  /** Big text shown inside the arc (defaults to formatted percent). */
  label?: ReactNode;
  /** Sub-label under the big text. */
  hint?: ReactNode;
}

export function GaugeChart({
  value,
  max = 1,
  width = 220,
  title,
  label,
  hint,
}: GaugeChartProps) {
  const v = Math.max(0, Math.min(max, value));
  const fraction = max === 0 ? 0 : v / max;
  const height = width / 2 + 28;
  const radius = width / 2 - 8;
  const cx = width / 2;
  const cy = width / 2;
  const startAngle = Math.PI;
  const endAngle = Math.PI - Math.PI * fraction;

  const arcPath = describeArc(cx, cy, radius, startAngle, endAngle);
  const bgPath = describeArc(cx, cy, radius, Math.PI, 0);

  const accent =
    fraction >= 0.75
      ? CHART_PALETTE.emerald
      : fraction >= 0.5
        ? CHART_PALETTE.amber
        : CHART_PALETTE.rose;

  return (
    <ChartFrame title={title}>
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img">
        <path d={bgPath} fill="none" stroke={CHART_PALETTE.border} strokeWidth={14} strokeLinecap="round" />
        <path d={arcPath} fill="none" stroke={accent} strokeWidth={14} strokeLinecap="round" />
        <text
          x={cx}
          y={cy - 4}
          textAnchor="middle"
          fontSize={Math.round(width * 0.18)}
          fontWeight={700}
          fill={CHART_PALETTE.ink}
        >
          {label ?? `${(fraction * 100).toFixed(0)}%`}
        </text>
        {hint !== undefined && (
          <text
            x={cx}
            y={cy + Math.round(width * 0.07)}
            textAnchor="middle"
            fontSize={Math.round(width * 0.06)}
            fill={CHART_PALETTE.inkMid}
          >
            {hint}
          </text>
        )}
      </svg>
    </ChartFrame>
  );
}

// ── StackedBar — one row, multiple segments ──────────────────────────────

export interface StackedSegment {
  label: string;
  value: number;
  accent?: string;
}

export interface StackedBarProps {
  data: StackedSegment[];
  title?: ReactNode;
  caption?: ReactNode;
  height?: number;
}

export function StackedBar({ data, title, caption, height = 14 }: StackedBarProps) {
  const total = data.reduce((acc, d) => acc + d.value, 0);
  if (total === 0) {
    return (
      <ChartFrame title={title} caption={caption}>
        <EmptyChart label="no data" />
      </ChartFrame>
    );
  }
  return (
    <ChartFrame title={title} caption={caption}>
      <div
        className="flex w-full overflow-hidden rounded-full"
        style={{ height, backgroundColor: CHART_PALETTE.border }}
        role="img"
        aria-label={typeof title === 'string' ? title : 'stacked bar'}
      >
        {data.map((d, i) => {
          const pct = (d.value / total) * 100;
          const accent = d.accent ?? defaultAccentByIndex(i);
          return (
            <div
              key={`${d.label}-${i}`}
              style={{ width: `${pct}%`, backgroundColor: accent }}
              title={`${d.label}: ${d.value} (${pct.toFixed(0)}%)`}
            />
          );
        })}
      </div>
      <ul className="mt-2 flex flex-wrap gap-3 text-[11px] text-slate-300">
        {data.map((d, i) => {
          const accent = d.accent ?? defaultAccentByIndex(i);
          return (
            <li key={`${d.label}-${i}`} className="flex items-center gap-1.5">
              <span
                aria-hidden
                className="inline-block h-2.5 w-2.5 rounded-sm"
                style={{ backgroundColor: accent }}
              />
              <span dir="auto">{d.label}</span>
              <span className="font-mono tabular-nums text-slate-200" dir="ltr">
                {d.value}
              </span>
            </li>
          );
        })}
      </ul>
    </ChartFrame>
  );
}

// ── Frame + helpers ──────────────────────────────────────────────────────

function ChartFrame({
  title,
  caption,
  children,
}: {
  title?: ReactNode;
  caption?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-slate-800 bg-slate-900/40 p-4">
      {(title || caption) && (
        <div className="flex items-baseline justify-between gap-2">
          {title && (
            <h4 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-200">
              {title}
            </h4>
          )}
          {caption && (
            <p className="text-[10px] uppercase tracking-[0.14em] text-slate-500">{caption}</p>
          )}
        </div>
      )}
      {children}
    </div>
  );
}

function EmptyChart({ label, height = 96 }: { label: string; height?: number }) {
  return (
    <div
      className="flex items-center justify-center rounded-lg border border-dashed border-slate-800 text-[11px] uppercase tracking-[0.14em] text-slate-500"
      style={{ height }}
    >
      {label}
    </div>
  );
}

function describeArc(cx: number, cy: number, r: number, startAngle: number, endAngle: number): string {
  const x1 = cx + r * Math.cos(startAngle);
  const y1 = cy - r * Math.sin(startAngle);
  const x2 = cx + r * Math.cos(endAngle);
  const y2 = cy - r * Math.sin(endAngle);
  const sweep = endAngle > startAngle ? 0 : 1;
  return `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${r} ${r} 0 0 ${sweep} ${x2.toFixed(2)} ${y2.toFixed(2)}`;
}

const ACCENT_CYCLE = [
  CHART_PALETTE.crimson,
  CHART_PALETTE.sky,
  CHART_PALETTE.emerald,
  CHART_PALETTE.amber,
  CHART_PALETTE.rose,
  CHART_PALETTE.crimsonSoft,
];

function defaultAccentByIndex(i: number): string {
  return ACCENT_CYCLE[i % ACCENT_CYCLE.length];
}

// Severity color map shared with the rest of the UI.
export const SEVERITY_ACCENT: Record<string, string> = {
  critical: CHART_PALETTE.rose,
  high: CHART_PALETTE.rose,
  warning: CHART_PALETTE.amber,
  medium: CHART_PALETTE.amber,
  info: CHART_PALETTE.sky,
  low: CHART_PALETTE.sky,
};

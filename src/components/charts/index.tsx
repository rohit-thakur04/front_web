"use client";

import { useState } from "react";

/**
 * Charts for the dashboard, as plain inline SVG.
 *
 * No charting library: these are four fixed forms, and a dependency would cost
 * more than it saves. Every colour comes from the --viz-* roles in globals.css,
 * which were validated against this app's own surfaces — so nothing here names
 * a hex.
 *
 * Mark specs are fixed across all four: bars capped at 24px with a 4px rounded
 * data-end and a square baseline, 2px lines, >=8px markers, a 2px surface gap
 * between touching fills, and hairline solid gridlines.
 */

const GAP = 2; // The surface gap. One consistent width, everywhere.

// ---------------------------------------------------------------------------

function Tooltip({ x, y, lines }: { x: number; y: number; lines: string[] }) {
  return (
    <div
      className="pointer-events-none absolute z-20 whitespace-nowrap rounded-lg px-2.5 py-1.5 text-xs shadow-lg"
      style={{
        left: x,
        top: y,
        transform: "translate(-50%, -115%)",
        background: "var(--viz-ink)",
        color: "var(--viz-surface)",
      }}
    >
      {lines.map((l, i) => (
        <div key={i} className={i === 0 ? "font-medium" : "opacity-75"}>
          {l}
        </div>
      ))}
    </div>
  );
}

function useTooltip() {
  const [tip, setTip] = useState<{ x: number; y: number; lines: string[] } | null>(null);
  return { tip, setTip, clear: () => setTip(null) };
}

/** Empty states say what is missing, rather than drawing an empty axis. */
function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="flex h-48 items-center justify-center text-sm"
      style={{ color: "var(--viz-muted)" }}
    >
      {children}
    </div>
  );
}

// --- Horizontal bars: magnitude across a named set -------------------------

export function BarList({
  data,
  valueLabel = (n: number) => n.toLocaleString("en-IN"),
  empty = "Nothing to show yet",
}: {
  data: { label: string; value: number; sub?: string }[];
  valueLabel?: (n: number) => string;
  empty?: string;
}) {
  const { tip, setTip, clear } = useTooltip();
  if (data.length === 0) return <Empty>{empty}</Empty>;

  const max = Math.max(...data.map((d) => d.value), 1);
  // One hue, more-is-darker. The ramp is ordinal, so it is indexed by rank
  // rather than interpolated — five discrete steps that each clear the surface.
  const ramp = ["--viz-o1", "--viz-o2", "--viz-o3", "--viz-o4", "--viz-o5"];

  return (
    <div className="relative">
      {tip && <Tooltip {...tip} />}
      <div className="space-y-3">
        {data.map((d, i) => {
          const pct = (d.value / max) * 100;
          // Rank picks the step, spread across the ramp so the darkest always
          // lands on the largest however many rows there are. Callers pass the
          // data sorted descending, so index 0 takes the darkest step.
          const rank = Math.round((i / Math.max(data.length - 1, 1)) * (ramp.length - 1));
          const hue = `var(${ramp[ramp.length - 1 - rank]})`;
          return (
            <div key={d.label}>
              <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
                <span className="truncate" style={{ color: "var(--viz-ink)" }}>
                  {d.label}
                </span>
                {/* Value at the tip, in ink — text never wears the data colour. */}
                <span
                  className="shrink-0 tabular-nums"
                  style={{ color: "var(--viz-ink-2)" }}
                >
                  {valueLabel(d.value)}
                  {d.sub && <span style={{ color: "var(--viz-muted)" }}> · {d.sub}</span>}
                </span>
              </div>
              <div
                className="h-2.5 w-full overflow-hidden rounded-full"
                style={{ background: "var(--viz-grid)" }}
                onMouseMove={(e) => {
                  const r = e.currentTarget.getBoundingClientRect();
                  const p = e.currentTarget.offsetParent?.getBoundingClientRect();
                  setTip({
                    x: e.clientX - (p?.left ?? 0),
                    y: r.top - (p?.top ?? 0),
                    lines: [d.label, `${valueLabel(d.value)}${d.sub ? ` · ${d.sub}` : ""}`],
                  });
                }}
                onMouseLeave={clear}
              >
                <div
                  className="ark-bar h-full rounded-full transition-all"
                  style={{ width: `${Math.max(pct, 1.5)}%`, background: hue }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// --- Area: a single series over time ---------------------------------------

export function AreaTrend({
  data,
  height = 160,
  empty = "No activity yet",
}: {
  data: { label: string; value: number }[];
  height?: number;
  empty?: string;
}) {
  const { tip, setTip, clear } = useTooltip();
  if (data.length < 2) return <Empty>{empty}</Empty>;

  const W = 600;
  const H = height;
  const padT = 12;
  const padB = 22;
  const max = Math.max(...data.map((d) => d.value), 1);
  const plotH = H - padT - padB;

  const x = (i: number) => (i / (data.length - 1)) * W;
  const y = (v: number) => padT + plotH - (v / max) * plotH;

  const line = data.map((d, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(d.value)}`).join(" ");
  const area = `${line} L${W},${padT + plotH} L0,${padT + plotH} Z`;

  const last = data[data.length - 1];

  return (
    <div className="relative pr-1">
      {tip && <Tooltip {...tip} />}

      {/* Endpoint marker only — a dot on every point is noise.
          It is an HTML element rather than an SVG <circle> on purpose: the plot
          uses preserveAspectRatio="none" so it fills its box, which scales x and
          y by different factors and would render a circle as an ellipse. Paths
          survive that via non-scaling-stroke; a round mark does not. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute"
        style={{
          right: 0,
          top: `${(y(last.value) / H) * 100}%`,
          transform: "translate(50%, -50%)",
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: "var(--viz-s1)",
          // The 2px surface ring keeps it legible where it meets the line.
          boxShadow: "0 0 0 2px var(--viz-surface)",
        }}
      />

      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="ark-draw w-full"
        style={{ height }}
        preserveAspectRatio="none"
        role="img"
        aria-label={`Trend, ${data.length} points, latest ${last.value}`}
      >
        {/* Hairline, solid, recessive — never dashed. */}
        {[0, 0.5, 1].map((f) => (
          <line
            key={f}
            x1={0}
            x2={W}
            y1={padT + plotH * f}
            y2={padT + plotH * f}
            stroke="var(--viz-grid)"
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
          />
        ))}

        {/* The fill is a wash, not a saturated block. */}
        <path d={area} fill="var(--viz-s1)" opacity={0.1} />
        <path
          d={line}
          fill="none"
          stroke="var(--viz-s1)"
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />

        {/* Invisible hit bands, wider than the marks, so hover is forgiving. */}
        {data.map((d, i) => (
          <rect
            key={i}
            x={x(i) - W / data.length / 2}
            y={0}
            width={W / data.length}
            height={H}
            fill="transparent"
            onMouseMove={(e) => {
              const p = (e.currentTarget.ownerSVGElement?.parentElement as HTMLElement)?.getBoundingClientRect();
              setTip({
                x: e.clientX - (p?.left ?? 0),
                y: e.clientY - (p?.top ?? 0),
                lines: [d.label, d.value.toLocaleString("en-IN")],
              });
            }}
            onMouseLeave={clear}
          />
        ))}
      </svg>

      <div
        className="mt-1 flex justify-between text-[11px] tabular-nums"
        style={{ color: "var(--viz-muted)" }}
      >
        <span>{data[0].label}</span>
        <span>{last.label}</span>
      </div>
    </div>
  );
}

// --- Stacked columns: distinct series over time ----------------------------

export interface StackSeries {
  key: string;
  label: string;
  color: string; // a --viz-* role name
}

export function StackedColumns({
  data,
  series,
  height = 180,
  empty = "No activity in this period",
}: {
  data: { label: string; values: Record<string, number> }[];
  series: StackSeries[];
  height?: number;
  empty?: string;
}) {
  const { tip, setTip, clear } = useTooltip();
  const totals = data.map((d) => series.reduce((n, s) => n + (d.values[s.key] ?? 0), 0));
  if (data.length === 0 || totals.every((t) => t === 0)) return <Empty>{empty}</Empty>;

  const max = Math.max(...totals, 1);
  const H = height;
  const band = 100 / data.length;

  return (
    <div className="relative">
      {tip && <Tooltip {...tip} />}

      {/* A legend is always present for two or more series — identity is never
          carried by colour alone. It also supplies the visible-label relief the
          validator requires for the sub-3:1 slot in light mode. */}
      <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1">
        {series.map((s) => (
          <span key={s.key} className="flex items-center gap-1.5 text-xs" style={{ color: "var(--viz-ink-2)" }}>
            <span
              className="h-2.5 w-2.5 rounded-sm"
              style={{ background: `var(${s.color})` }}
              aria-hidden="true"
            />
            {s.label}
          </span>
        ))}
      </div>

      <div className="relative flex items-end" style={{ height: H }}>
        {data.map((d, i) => {
          const total = totals[i];
          let acc = 0;
          return (
            <div
              key={i}
              className="flex h-full flex-col justify-end"
              style={{ width: `${band}%`, paddingLeft: 2, paddingRight: 2 }}
              onMouseMove={(e) => {
                const p = e.currentTarget.parentElement?.getBoundingClientRect();
                setTip({
                  x: e.clientX - (p?.left ?? 0),
                  y: e.clientY - (p?.top ?? 0),
                  lines: [
                    d.label,
                    ...series.map((s) => `${s.label}: ${d.values[s.key] ?? 0}`),
                  ],
                });
              }}
              onMouseLeave={clear}
            >
              <div className="ark-col mx-auto flex w-full max-w-6 flex-col-reverse">
                {series.map((s, si) => {
                  const v = d.values[s.key] ?? 0;
                  if (v === 0) return null;
                  const h = (v / max) * (H - 4);
                  acc += v;
                  const isTop = acc === total;
                  return (
                    <div
                      key={s.key}
                      style={{
                        height: Math.max(h, 2),
                        background: `var(${s.color})`,
                        // Square at the baseline, 4px rounded only at the top of
                        // the stack — the data-end, not every segment.
                        borderTopLeftRadius: isTop ? 4 : 0,
                        borderTopRightRadius: isTop ? 4 : 0,
                        // The surface gap does the separating, not a border.
                        marginTop: si > 0 ? GAP : 0,
                      }}
                    />
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <div
        className="mt-1.5 flex justify-between text-[11px] tabular-nums"
        style={{ color: "var(--viz-muted)" }}
      >
        <span>{data[0].label}</span>
        <span>{data[data.length - 1].label}</span>
      </div>
    </div>
  );
}

// --- Meter: one ratio against a limit --------------------------------------

export function Meter({
  label,
  value,
  total,
  hint,
}: {
  label: string;
  value: number;
  total: number;
  hint?: string;
}) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between text-sm">
        <span style={{ color: "var(--viz-ink)" }}>{label}</span>
        <span className="tabular-nums" style={{ color: "var(--viz-ink-2)" }}>
          {pct}%
          <span style={{ color: "var(--viz-muted)" }}>
            {" "}
            · {value.toLocaleString("en-IN")} of {total.toLocaleString("en-IN")}
          </span>
        </span>
      </div>
      {/* The unfilled track is a lighter step of the fill's own ramp, so the
          state reads across the whole bar rather than only where it is filled. */}
      <div className="h-2.5 w-full overflow-hidden rounded-full" style={{ background: "var(--viz-track)" }}>
        <div
          className="ark-bar h-full rounded-full transition-all"
          style={{ width: `${Math.max(pct, 1)}%`, background: "var(--viz-fill)" }}
        />
      </div>
      {hint && (
        <p className="mt-1 text-xs" style={{ color: "var(--viz-muted)" }}>
          {hint}
        </p>
      )}
    </div>
  );
}

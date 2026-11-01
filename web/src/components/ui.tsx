"use client";

import { Icon, type IconName } from "./icons";

/** Page title bar with an optional subtitle and right-aligned actions. */
export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}) {
  return (
    /* A hairline under the header, so a page reads as a titled document rather
       than a title that happens to sit above some panels. Appears on every
       screen from this one place. */
    <div className="mb-6 flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 pb-4">
      <div>
        <h1 className="text-[1.375rem] font-semibold tracking-[-0.015em]">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/** A titled band of content, used to group stat tiles by area on the dashboard. */
export function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-6">
      {/* An eyebrow rather than a third weight of bold text. The page title,
          the section and the tile labels were all competing at similar
          strength, which left nothing leading the eye. */}
      <h2 className="mb-3 text-xs font-semibold tracking-[0.06em] text-slate-500 uppercase">
        {title}
      </h2>
      {children}
    </section>
  );
}

type Tone = "blue" | "green" | "violet" | "amber" | "slate" | "rose";

const TONE: Record<Tone, { bg: string; fg: string }> = {
  blue: { bg: "bg-blue-50", fg: "text-blue-600" },
  green: { bg: "bg-emerald-50", fg: "text-emerald-600" },
  violet: { bg: "bg-violet-50", fg: "text-violet-600" },
  amber: { bg: "bg-amber-50", fg: "text-amber-600" },
  slate: { bg: "bg-slate-100", fg: "text-slate-600" },
  rose: { bg: "bg-rose-50", fg: "text-rose-600" },
};

/** KPI tile: label, tinted icon, big value, and a small status pill. */
export function StatTile({
  label,
  value,
  icon,
  tone = "blue",
  // No default: a tile only shows a pill when the caller has something real to
  // say. The old default read "in range" on every tile, implying a date filter
  // the app does not have.
  badge = "",
}: {
  label: string;
  value: string | number;
  icon: IconName;
  tone?: Tone;
  badge?: string;
}) {
  const IconEl = Icon[icon];
  const t = TONE[tone];
  return (
    <div className="group rounded-xl border border-slate-200 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition duration-200 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-[0_8px_24px_-8px_rgba(15,23,42,0.12)]">
      <div className="flex items-start justify-between">
        <span className="text-sm text-slate-500">{label}</span>
        <span
          className={`flex h-9 w-9 items-center justify-center rounded-lg transition duration-200 group-hover:scale-105 ${t.bg} ${t.fg}`}
        >
          <IconEl />
        </span>
      </div>
      <div className="mt-6 flex items-baseline gap-2">
        {/* Tabular figures, so a row of tiles lines up on the digits instead of
            jittering as the numbers change. */}
        <span className="text-[1.75rem] font-semibold tracking-[-0.02em] tabular-nums">
          {value}
        </span>
        {badge && (
          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-500">
            {badge}
          </span>
        )}
      </div>
    </div>
  );
}

/** iOS-style toggle switch matching the reference plan editor. */
export function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition duration-200 ${
        checked ? "bg-blue-600" : "bg-slate-300 hover:bg-slate-400"
      }`}
    >
      {/* Eased rather than linear: a switch that decelerates into place reads
          as a physical thing being flipped. */}
      <span
        className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition-transform duration-200 ease-out ${
          checked ? "translate-x-5" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}

/** Plain surface card used across the feature pages. */
export function Card({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)] ${className}`}
    >
      {children}
    </div>
  );
}

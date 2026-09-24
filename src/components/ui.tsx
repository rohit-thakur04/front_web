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
    <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p>}
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
      <h2 className="mb-3 text-sm font-semibold text-slate-700">{title}</h2>
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
  badge = "in range",
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
    <div className="rounded-xl border border-slate-200 bg-white p-5 transition hover:shadow-sm">
      <div className="flex items-start justify-between">
        <span className="text-sm text-slate-500">{label}</span>
        <span className={`flex h-9 w-9 items-center justify-center rounded-lg ${t.bg} ${t.fg}`}>
          <IconEl />
        </span>
      </div>
      <div className="mt-6 flex items-baseline gap-2">
        <span className="text-2xl font-semibold tracking-tight">{value}</span>
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
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition ${
        checked ? "bg-blue-600" : "bg-slate-300"
      }`}
    >
      <span
        className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition ${
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
    <div className={`rounded-xl border border-slate-200 bg-white ${className}`}>
      {children}
    </div>
  );
}

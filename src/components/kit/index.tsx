"use client";

/*
=============================================================================
ARKQUEN COMPONENT KIT
=============================================================================

The rebuild has no component layer. Every screen writes its own Tailwind
utilities, which is how twenty-three pages ended up with four button styles,
three table paddings and two definitions of a status badge — and why the look
could only ever be adjusted page by page.

This is that missing layer. It exists so a screen can express what a control
*means* ("this is the primary action", "this status is a failure") instead of
how it should look, which is the only way a design language holds together
once more than one person touches it.

Everything here draws from the tokens in globals.css and never from a raw
colour. A component that hardcodes a hex is a component that will be wrong on
one of the two themes.

Adoption is incremental on purpose. The existing pages keep working untouched;
new and reworked screens use this, and the inherited styling retreats as they
do. A single commit that rewrote every page would be impossible to review and
impossible to roll back.
*/

import type React from "react";

/* ------------------------------------------------------------------ Button */

type ButtonTone = "primary" | "neutral" | "ghost" | "danger";
type ButtonSize = "sm" | "md";

const BUTTON_TONE: Record<ButtonTone, string> = {
  /*
    One primary per screen. The inherited design uses a filled accent button
    for anything clickable, which leaves nothing marking the actual job of the
    page — the brief's point about unclear primary actions is a direct result.
  */
  primary:
    "bg-[var(--ark-primary)] text-[var(--ark-primary-ink)] border-transparent hover:bg-[var(--ark-primary-hover)]",
  neutral:
    "bg-[var(--ark-surface)] text-[var(--ark-ink)] border-[var(--ark-line-strong)] hover:bg-[var(--ark-surface-2)]",
  ghost:
    "bg-transparent text-[var(--ark-ink-2)] border-transparent hover:bg-[var(--ark-surface-2)] hover:text-[var(--ark-ink)]",
  danger:
    "bg-transparent text-[var(--ark-danger)] border-[var(--ark-line-strong)] hover:bg-[var(--ark-danger-soft)]",
};

const BUTTON_SIZE: Record<ButtonSize, string> = {
  sm: "h-[28px] px-2.5 text-[13px]",
  md: "h-[var(--ark-control-h)] px-3.5 text-sm",
};

export function Button({
  tone = "neutral",
  size = "md",
  busy = false,
  icon,
  className = "",
  children,
  ...rest
}: {
  tone?: ButtonTone;
  size?: ButtonSize;
  /** Shows a spinner and blocks input, without the label jumping width. */
  busy?: boolean;
  icon?: React.ReactNode;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...rest}
      disabled={rest.disabled || busy}
      aria-busy={busy || undefined}
      className={`inline-flex shrink-0 items-center justify-center gap-1.5 rounded-[var(--ark-r-md)] border font-medium transition-colors disabled:pointer-events-none disabled:opacity-45 ${BUTTON_TONE[tone]} ${BUTTON_SIZE[size]} ${className}`}
    >
      {busy ? <Spinner /> : icon}
      {children}
    </button>
  );
}

/** A two-thirds arc, sized to the text beside it. */
export function Spinner({ className = "" }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={`inline-block h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-[1.5px] border-current border-t-transparent ${className}`}
    />
  );
}

/* ------------------------------------------------------------------- Badge */

type BadgeTone = "ok" | "warn" | "danger" | "info" | "primary";

const BADGE_TONE: Record<BadgeTone, string> = {
  ok: "bg-[var(--ark-ok-soft)] text-[var(--ark-ok-ink)]",
  warn: "bg-[var(--ark-warn-soft)] text-[var(--ark-warn-ink)]",
  danger: "bg-[var(--ark-danger-soft)] text-[var(--ark-danger-ink)]",
  info: "bg-[var(--ark-info-soft)] text-[var(--ark-info-ink)]",
  primary: "bg-[var(--ark-primary-soft)] text-[var(--ark-primary-soft-ink)]",
};

const BADGE_DOT: Record<BadgeTone, string> = {
  ok: "bg-[var(--ark-ok)]",
  warn: "bg-[var(--ark-warn)]",
  danger: "bg-[var(--ark-danger)]",
  info: "bg-[var(--ark-ink-3)]",
  primary: "bg-[var(--ark-primary)]",
};

/**
 * A status.
 *
 * Carries a dot as well as a colour, because status that is only a colour is
 * invisible to a red-green colourblind reader — around one man in twelve, and
 * this product's status values are mostly red and green.
 */
export function Badge({
  tone = "info",
  dot = true,
  children,
}: {
  tone?: BadgeTone;
  dot?: boolean;
  children: React.ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-[var(--ark-r-sm)] px-1.5 py-0.5 text-[11px] font-medium whitespace-nowrap ${BADGE_TONE[tone]}`}
    >
      {dot && <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${BADGE_DOT[tone]}`} />}
      {children}
    </span>
  );
}

/* -------------------------------------------------------------------- Panel */

/**
 * A surface.
 *
 * Square-ish, hairline-bordered, flat at rest. The inherited look is a rounded
 * card with a drop shadow; this is the single most repeated shape in the
 * product, so it is also the most valuable one to make different.
 */
export function Panel({
  title,
  description,
  actions,
  flush = false,
  className = "",
  children,
}: {
  title?: string;
  description?: string;
  actions?: React.ReactNode;
  /** No inner padding, for a panel wrapping a table edge to edge. */
  flush?: boolean;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <section
      className={`rounded-[var(--ark-r-lg)] border border-[var(--ark-line)] bg-[var(--ark-surface)] shadow-[var(--ark-shadow-rest)] ${className}`}
    >
      {(title || actions) && (
        <header
          className={`flex flex-wrap items-center justify-between gap-2 border-b border-[var(--ark-line)] px-4 ${
            description ? "py-3" : "py-2.5"
          }`}
        >
          <div className="min-w-0">
            {title && (
              <h2 className="text-[13px] font-semibold text-[var(--ark-ink)]">{title}</h2>
            )}
            {description && (
              <p className="mt-0.5 text-xs text-[var(--ark-ink-3)]">{description}</p>
            )}
          </div>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={flush ? "" : "p-4"}>{children}</div>
    </section>
  );
}

/* --------------------------------------------------------------- EmptyState */

/**
 * An empty state that teaches.
 *
 * Four questions, in this order: what is empty, why it matters, what to do,
 * and a control that does it. The inherited empty states answer only the
 * first — "No templates here yet" — which tells somebody who has just arrived
 * nothing they did not already know.
 */
export function EmptyState({
  title,
  body,
  action,
  secondary,
  icon,
}: {
  title: string;
  body: string;
  action?: React.ReactNode;
  secondary?: React.ReactNode;
  icon?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center px-6 py-12 text-center">
      {icon && (
        <span className="mb-3 flex h-10 w-10 items-center justify-center rounded-[var(--ark-r-md)] bg-[var(--ark-surface-2)] text-[var(--ark-ink-3)]">
          {icon}
        </span>
      )}
      <p className="text-sm font-semibold text-[var(--ark-ink)]">{title}</p>
      <p className="mt-1 max-w-sm text-sm text-[var(--ark-ink-3)]">{body}</p>
      {(action || secondary) && (
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          {action}
          {secondary}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------- Table */

/*
One table pattern.

Dense rows, a quiet header, numbers in tabular figures, and the row rhythm
coming from a token rather than from whatever padding each page chose. These
tables are read down a column to find one record — scanning, not browsing — so
the inherited 56px rows cost a third of the screen for nothing.
*/

export function Table({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">{children}</table>
    </div>
  );
}

export function THead({ children }: { children: React.ReactNode }) {
  return (
    <thead>
      <tr className="border-b border-[var(--ark-line)]">{children}</tr>
    </thead>
  );
}

export function TH({
  children,
  align = "left",
  className = "",
}: {
  children?: React.ReactNode;
  align?: "left" | "right";
  className?: string;
}) {
  return (
    <th
      scope="col"
      className={`px-3 py-2 text-[11px] font-semibold tracking-[0.04em] text-[var(--ark-ink-muted)] uppercase ${
        align === "right" ? "text-right" : "text-left"
      } ${className}`}
    >
      {children}
    </th>
  );
}

export function TBody({ children }: { children: React.ReactNode }) {
  return <tbody className="divide-y divide-[var(--ark-line)]">{children}</tbody>;
}

export function TR({
  children,
  onClick,
}: {
  children: React.ReactNode;
  onClick?: () => void;
}) {
  return (
    <tr
      onClick={onClick}
      className={`h-[var(--ark-row-h)] ${
        onClick ? "cursor-pointer hover:bg-[var(--ark-surface-2)]" : ""
      }`}
    >
      {children}
    </tr>
  );
}

export function TD({
  children,
  align = "left",
  numeric = false,
  muted = false,
  className = "",
}: {
  children?: React.ReactNode;
  align?: "left" | "right";
  /** Tabular figures, so a column of numbers lines up on its digits. */
  numeric?: boolean;
  muted?: boolean;
  className?: string;
}) {
  return (
    <td
      className={`px-3 py-1.5 ${align === "right" ? "text-right" : "text-left"} ${
        numeric ? "tabular-nums" : ""
      } ${muted ? "text-[var(--ark-ink-3)]" : "text-[var(--ark-ink)]"} ${className}`}
    >
      {children}
    </td>
  );
}

/* ---------------------------------------------------------------- PageTitle */

/**
 * The page header.
 *
 * An eyebrow above the title rather than a subtitle below it: the eyebrow says
 * which area of the product this is, which is the thing a sidebar alone
 * communicates poorly once there are twenty-three screens.
 */
export function PageTitle({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        {eyebrow && (
          <p className="mb-1 text-[11px] font-semibold tracking-[0.08em] text-[var(--ark-ink-muted)] uppercase">
            {eyebrow}
          </p>
        )}
        <h1 className="text-xl font-semibold tracking-[-0.015em] text-[var(--ark-ink)]">
          {title}
        </h1>
        {description && (
          <p className="mt-1 max-w-2xl text-sm text-[var(--ark-ink-3)]">{description}</p>
        )}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/* ---------------------------------------------------------------- Skeleton */

/**
 * A loading placeholder shaped like the thing that is coming.
 *
 * Replaces "Loading…", which gives no indication of how much is on its way and
 * makes the page jump when it arrives.
 */
export function Skeleton({ className = "" }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={`block animate-pulse rounded-[var(--ark-r-sm)] bg-[var(--ark-surface-3)] ${className}`}
    />
  );
}

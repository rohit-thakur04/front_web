"use client";

import Link from "next/link";
import { Icon } from "./icons";

/**
 * The one row-action component, used by every table and card that has them.
 *
 * Before this, the same three actions were styled five different ways: blue
 * links on Sites, grey links on Contacts, outlined buttons on Workflows, a red
 * outlined button for Delete on Workflows only, and a bare "×" on board cards.
 *
 * Fixed rules, so every page behaves the same:
 *  - Icons, not words, each with a tooltip and an aria-label. An icon with no
 *    label is a guess for a first-time user, so the word is always reachable.
 *  - 32×32 minimum hit area. The old text links were small and sat close
 *    together, which is a misclick on a destructive action waiting to happen.
 *  - Neutral grey at rest; Delete turns red on hover only, so a row of actions
 *    doesn't read as a row of warnings.
 *  - Order is fixed by the caller passing them in order, and the convention is
 *    Open or Edit first, Delete last on the right.
 */

type Tone = "neutral" | "danger";

const TONE: Record<Tone, string> = {
  neutral: "text-slate-400 hover:bg-slate-100 hover:text-slate-700",
  // Red on hover only. At rest it matches its neighbours.
  danger: "text-slate-400 hover:bg-rose-50 hover:text-rose-600",
};

const BASE =
  "inline-flex h-8 w-8 items-center justify-center rounded-lg transition disabled:cursor-not-allowed disabled:opacity-40";

function content(name: "open" | "edit" | "delete") {
  if (name === "open") return <Icon.ExternalLink width={16} height={16} />;
  if (name === "edit") return <Icon.Pencil width={16} height={16} />;
  return <Icon.Trash width={16} height={16} />;
}

/** Container: keeps spacing and right-alignment identical on every page. */
export function RowActions({ children }: { children: React.ReactNode }) {
  return <div className="flex items-center justify-end gap-1">{children}</div>;
}

export function RowAction({
  action,
  label,
  onClick,
  href,
  newTab = false,
  disabled = false,
  tone,
}: {
  action: "open" | "edit" | "delete";
  /** The word — shown as the tooltip and read out as the accessible name. */
  label: string;
  onClick?: () => void;
  href?: string;
  newTab?: boolean;
  disabled?: boolean;
  /** Defaults to danger for delete, neutral otherwise. */
  tone?: Tone;
}) {
  const t = tone ?? (action === "delete" ? "danger" : "neutral");
  const cls = `${BASE} ${TONE[t]}`;

  if (href && !disabled) {
    return (
      <Link
        href={href}
        title={label}
        aria-label={label}
        className={cls}
        {...(newTab ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      >
        {content(action)}
      </Link>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className={cls}
    >
      {content(action)}
    </button>
  );
}

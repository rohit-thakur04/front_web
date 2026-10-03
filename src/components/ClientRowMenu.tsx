"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "./icons";
import type { User } from "@/lib/types";

/**
 * The per-account overflow menu on the Clients list.
 *
 * It holds the actions that are either rare or destructive. The two an admin
 * reaches for constantly — view and edit — stay as icons outside it, because
 * burying a frequent action behind two clicks to tidy a row is a bad trade.
 *
 * Destructive items sit below a divider, last, and nothing in the menu acts
 * immediately: Deactivate and Delete both open a confirmation. A menu item that
 * deletes a workspace on one click is a mis-click away from a catastrophe with
 * no undo, and this product has no undo.
 */
export function ClientRowMenu({
  user,
  onView,
  onEdit,
  onChangePlan,
  onToggleActive,
  onDelete,
}: {
  user: User;
  onView: () => void;
  onEdit: () => void;
  onChangePlan: () => void;
  onToggleActive: () => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const isClient = user.role === "client";
  const run = (fn: () => void) => () => {
    setOpen(false);
    fn();
  };

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={`More actions for ${user.name}`}
        title="More actions"
        className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
      >
        <Icon.Dots width={16} height={16} />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-30 mt-1 w-56 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-xl"
        >
          <MenuItem icon={<Icon.ExternalLink width={15} height={15} />} onClick={run(onView)}>
            View details
          </MenuItem>
          <MenuItem icon={<Icon.Pencil width={15} height={15} />} onClick={run(onEdit)}>
            Edit account
          </MenuItem>
          {isClient && (
            <MenuItem icon={<Icon.Refresh width={15} height={15} />} onClick={run(onChangePlan)}>
              Change plan
            </MenuItem>
          )}

          <div className="my-1 border-t border-slate-100" />

          {/* "Ban" in the reference. Named for what it does: the account cannot
              sign in, and nothing of theirs is touched. */}
          <MenuItem
            icon={<Icon.Shield width={15} height={15} />}
            onClick={run(onToggleActive)}
            tone="warning"
          >
            {user.disabled ? "Reactivate account" : "Deactivate account"}
          </MenuItem>
          <MenuItem
            icon={<Icon.Trash width={15} height={15} />}
            onClick={run(onDelete)}
            tone="danger"
          >
            Delete permanently
          </MenuItem>
        </div>
      )}
    </div>
  );
}

function MenuItem({
  icon,
  children,
  onClick,
  tone = "neutral",
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
  onClick: () => void;
  tone?: "neutral" | "warning" | "danger";
}) {
  const colour =
    tone === "danger"
      ? "text-rose-600 hover:bg-rose-50"
      : tone === "warning"
        ? "text-amber-700 hover:bg-amber-50"
        : "text-slate-700 hover:bg-slate-50";
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition ${colour}`}
    >
      <span className="shrink-0 opacity-70">{icon}</span>
      {children}
    </button>
  );
}

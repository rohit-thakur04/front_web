"use client";

import { useEffect, useRef, useState } from "react";

/**
 * A multi-select dropdown: a collapsed trigger that opens a panel of checkboxes.
 *
 * This exists because a native <select multiple> is genuinely unusable — it needs
 * ctrl-click on desktop and collapses to a scrolling box on mobile — while a bare
 * checkbox list isn't a dropdown at all and is indistinguishable from the palette's
 * separate Checkbox element.
 *
 * Works controlled (pass `value`) or uncontrolled (omit it), because the builder
 * preview just needs it to feel real while the public form needs the answers.
 */
export function MultiSelect({
  options,
  value,
  onChange,
  placeholder = "Select options…",
  disabled = false,
  required = false,
  name,
  className = "",
  style,
}: {
  options: string[];
  value?: string[];
  onChange?: (next: string[]) => void;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  name?: string;
  className?: string;
  style?: React.CSSProperties;
}) {
  const [internal, setInternal] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  const controlled = value !== undefined;
  const selected = controlled ? value : internal;

  // Close when the click lands anywhere else, which is what makes it behave
  // like a dropdown rather than a panel that has to be dismissed deliberately.
  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  function toggle(option: string) {
    const next = selected.includes(option)
      ? selected.filter((o) => o !== option)
      : [...selected, option];
    if (!controlled) setInternal(next);
    onChange?.(next);
  }

  // Past three, listing them all overflows the trigger on a phone.
  const label =
    selected.length === 0
      ? placeholder
      : selected.length <= 3
        ? selected.join(", ")
        : `${selected.length} selected`;

  return (
    <div ref={boxRef} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className={`flex w-full items-center justify-between gap-2 text-left ${className}`}
        style={style}
      >
        <span className={selected.length === 0 ? "truncate opacity-50" : "truncate"}>{label}</span>
        <span className="shrink-0 text-xs opacity-60">{open ? "▲" : "▼"}</span>
      </button>

      {/* A hidden mirror of the selection so the browser enforces `required` on
          this control like any native one — a custom widget is invisible to
          constraint validation otherwise. */}
      {required && (
        <input
          tabIndex={-1}
          aria-hidden="true"
          required
          value={selected.join(", ")}
          onChange={() => {}}
          // Not `hidden`: the browser refuses to focus a hidden invalid field and
          // silently drops the validation message instead of showing it.
          className="absolute left-3 bottom-0 h-0 w-0 opacity-0"
          name={name}
        />
      )}

      {open && !disabled && (
        <div className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-lg border border-slate-200 bg-white p-1 shadow-lg">
          {options.length === 0 && (
            <p className="px-2 py-1.5 text-xs text-slate-400">No options yet</p>
          )}
          {options.map((o, i) => (
            <label
              key={i}
              className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm text-slate-800 hover:bg-slate-50"
            >
              <input type="checkbox" checked={selected.includes(o)} onChange={() => toggle(o)} />
              {o}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

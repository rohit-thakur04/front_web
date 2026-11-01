"use client";

import { useEffect, useId, useRef, useState } from "react";

/*
A dropdown whose open menu can actually be styled.

A native <select> renders its option list through the operating system, and that
popup takes no CSS — no border, no radius, no shadow, no theme. So on the board
the closed control sat in a neat bordered box and the list that dropped out of
it was a bare white rectangle with nothing around it, which is what prompted
this. It is not a styling oversight; it is the one part of a form control the
page genuinely cannot reach.

So this is a button and a menu rather than a select. That buys the border, and
with it the dark theme, the focus ring and a consistent row height — but it also
means re-implementing what the browser gave for free, which is why the keyboard
behaviour below is written out rather than assumed: a dropdown that cannot be
driven from the keyboard is a worse control than an ugly one.
*/

export interface SelectOption {
  value: string;
  label: string;
  /** Groups options under a heading, as optgroup does. */
  group?: string;
}

export function Select({
  value,
  options,
  onChange,
  placeholder = "Select…",
  disabled,
  ariaLabel,
  className = "",
}: {
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  ariaLabel?: string;
  className?: string;
}) {
  /*
   * Ties the button to the menu it opens.
   *
   * A combobox without aria-controls leaves a screen reader announcing a
   * control that expands into nothing it can find — the role promises a
   * relationship the markup has not stated.
   */
  const listboxID = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);

  const selected = options.find((o) => o.value === value);

  // Close on a click anywhere else. Pointerdown rather than click, so the menu
  // is gone before the thing underneath reacts.
  useEffect(() => {
    if (!open) return;
    function onDown(e: PointerEvent) {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    }
    window.addEventListener("pointerdown", onDown);
    return () => window.removeEventListener("pointerdown", onDown);
  }, [open]);

  // Opens on the current value rather than the top, so arrowing from a chosen
  // option continues from where it is — which is what a native select does.
  function openMenu() {
    if (disabled) return;
    const i = options.findIndex((o) => o.value === value);
    setActive(i >= 0 ? i : 0);
    setOpen(true);
  }

  function choose(i: number) {
    const option = options[i];
    if (!option) return;
    onChange(option.value);
    setOpen(false);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (!open) {
      // The keys that open a native select.
      if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown") {
        e.preventDefault();
        openMenu();
      }
      return;
    }
    switch (e.key) {
      case "Escape":
        e.preventDefault();
        setOpen(false);
        break;
      case "ArrowDown":
        e.preventDefault();
        setActive((i) => Math.min(i + 1, options.length - 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        setActive((i) => Math.max(i - 1, 0));
        break;
      case "Home":
        e.preventDefault();
        setActive(0);
        break;
      case "End":
        e.preventDefault();
        setActive(options.length - 1);
        break;
      case "Enter":
      case " ":
        e.preventDefault();
        choose(active);
        break;
    }
  }

  /*
   * Group headings, worked out before rendering rather than by tracking the
   * previous row as the list is drawn.
   *
   * Mutating a variable during render is the kind of thing that works until a
   * re-render happens halfway through, and React is explicitly allowed to do
   * that — so the heading is a property of each row instead of a side effect
   * of drawing it.
   */
  const rows = options.map((option, i) => ({
    option,
    index: i,
    header:
      option.group && option.group !== options[i - 1]?.group ? option.group : null,
  }));

  return (
    <div ref={boxRef} className={`relative ${className}`}>
      <button
        type="button"
        role="combobox"
        aria-expanded={open}
        aria-controls={listboxID}
        aria-haspopup="listbox"
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : openMenu())}
        onKeyDown={onKeyDown}
        className="flex w-full items-center justify-between gap-2 rounded-[var(--ark-r-md)] border border-[var(--ark-line-strong)] bg-[var(--ark-surface)] px-3 py-1.5 text-left text-sm text-[var(--ark-ink)] transition-colors hover:border-[var(--ark-primary)] disabled:cursor-not-allowed disabled:opacity-50"
      >
        <span className={`truncate ${selected ? "" : "text-[var(--ark-ink-muted)]"}`}>
          {selected?.label ?? placeholder}
        </span>
        <span
          aria-hidden
          className={`shrink-0 text-[var(--ark-ink-muted)] transition-transform ${
            open ? "rotate-180" : ""
          }`}
        >
          ▾
        </span>
      </button>

      {open && (
        /*
          The menu, which is the whole point: a real border, the product's own
          radius, and a shadow that lifts it off whatever it covers.

          Capped and scrollable because a pipeline list grows, and a menu taller
          than the window cannot be reached at its far end.
        */
        <div
          id={listboxID}
          role="listbox"
          aria-label={ariaLabel}
          className="absolute z-50 mt-1 max-h-72 w-full min-w-max overflow-y-auto rounded-[var(--ark-r-md)] border border-[var(--ark-line-strong)] bg-[var(--ark-overlay)] py-1 shadow-[var(--ark-shadow-overlay)]"
        >
          {options.length === 0 && (
            <p className="px-3 py-2 text-sm text-[var(--ark-ink-muted)]">
              Nothing to choose from
            </p>
          )}

          {rows.map(({ option: o, index: i, header }) => (
            <div key={o.value || `blank-${i}`}>
                {header && (
                  <p className="px-3 pt-2 pb-1 text-[10px] font-semibold tracking-[0.08em] text-[var(--ark-ink-muted)] uppercase">
                    {header}
                  </p>
                )}
                <button
                  type="button"
                  role="option"
                  aria-selected={o.value === value}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => choose(i)}
                  className={`flex w-full items-center justify-between gap-3 px-3 py-1.5 text-left text-sm ${
                    i === active
                      ? "bg-[var(--ark-primary-soft)] text-[var(--ark-primary-soft-ink)]"
                      : "text-[var(--ark-ink)]"
                  }`}
                >
                  <span className="truncate">{o.label}</span>
                  {/* A tick as well as the highlight: the highlight follows the
                      cursor, so on its own it says where the pointer is rather
                      than what is chosen. */}
                  {o.value === value && (
                    <span aria-hidden className="shrink-0 text-[var(--ark-primary)]">
                      ✓
                    </span>
                  )}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

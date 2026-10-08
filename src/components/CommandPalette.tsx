"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { COMMAND_TARGETS } from "@/lib/navigation";
import type { Card } from "@/lib/types";

interface Hit {
  id: string;
  label: string;
  hint?: string;
  group: string;
  href: string;
}

/*
The command palette.

Two reasons this exists, and only one of them is navigation.

The first is that twenty-three screens is more than a sidebar can carry. The
inherited answer was to nest — a "Lead Generation" item hiding four tabs — which
means the forms editor is three clicks and no amount of sidebar design fixes it.
Typing two letters is one.

The second matters more: this is the only place in the product that searches
*across* it. Everywhere else, finding a contact means knowing which pipeline
they are in, opening that board, and scanning. A business taking a phone call
from a number they half recognise needs an answer in the time it takes to say
hello, and that is the actual job this product exists for.

Keyboard-first by construction — opened with Ctrl-K or Cmd-K, driven with
arrows and Enter, closed with Escape — and reachable by pointer from the top bar
for anyone who does not know that.
*/
export function CommandPalette() {
  const router = useRouter();
  const { isAdmin, hasFeature } = useAuth();

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [contacts, setContacts] = useState<Card[]>([]);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  /* The pages and actions this account can actually reach. Offering a locked
     screen and then bouncing somebody off it is worse than not offering it. */
  const targets = COMMAND_TARGETS.filter(
    (t) => (!t.adminOnly || isAdmin) && (!t.feature || hasFeature(t.feature)),
  );

  /** Everything the panel was holding, forgotten. */
  const reset = useCallback(() => {
    setQuery("");
    setContacts([]);
    setActive(0);
  }, []);

  const close = useCallback(() => {
    setOpen(false);
    reset();
  }, [reset]);

  /*
   * Ctrl-K and Cmd-K, plus Escape to leave.
   *
   * Every close goes through close() rather than setOpen(false). Two of them
   * did not, and since close() is the only thing that clears the query, a
   * panel dismissed with Escape kept its text — so three searches in a row
   * left the field reading "ramjiRohitaboard". Closing and clearing are one
   * action and must not be two calls a caller has to remember.
   */
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((wasOpen) => {
          if (wasOpen) reset();
          return !wasOpen;
        });
        return;
      }
      if (e.key === "Escape") close();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close, reset]);

  // Opened from the top bar as well as the keyboard.
  useEffect(() => {
    function onOpen() {
      setOpen(true);
    }
    window.addEventListener("arkquen:open-command", onOpen);
    return () => window.removeEventListener("arkquen:open-command", onOpen);
  }, []);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  /*
   * Contact search, debounced.
   *
   * 180ms: long enough that typing a name is one request rather than eight,
   * short enough that the results feel like they are keeping up. Two
   * characters minimum, because one letter matches most of the database and
   * answers nothing.
   */
  useEffect(() => {
    const term = query.trim();
    let live = true;

    // Clearing happens inside the timer with everything else, so the effect
    // body itself never sets state synchronously.
    const timer = setTimeout(async () => {
      if (term.length < 2 || !hasFeature("contacts")) {
        if (live) setContacts([]);
        return;
      }
      try {
        /*
          /contacts answers with { contacts, summary }, not a bare array.

          This asked for Card[] and then called .slice on it, which threw on
          every single search — and the catch below turned that into an empty
          result, so the panel quietly promised to search contacts and never
          did. A catch that swallows a programming error as well as a network
          one is how a broken feature looks like a working one with no matches,
          so the shape is now named explicitly rather than assumed.
        */
        const res = await api<{ contacts: Card[] }>(
          `/contacts?search=${encodeURIComponent(term)}`,
        );
        if (live) setContacts((res.contacts ?? []).slice(0, 6));
      } catch {
        // A failed search must not break navigation, which is the other half
        // of what this panel is for.
        if (live) setContacts([]);
      }
    }, 180);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [query, hasFeature]);

  const term = query.trim().toLowerCase();
  const matchedTargets = term
    ? targets.filter(
        (t) =>
          t.label.toLowerCase().includes(term) ||
          t.keywords.some((k) => k.includes(term)),
      )
    : targets.slice(0, 7);

  const hits: Hit[] = [
    ...contacts.map((c) => ({
      id: `contact-${c._id}`,
      label: c.name || "Unnamed contact",
      hint: c.phone || c.email || undefined,
      group: "Contacts",
      href: "/contacts",
    })),
    ...matchedTargets.map((t) => ({
      id: `go-${t.href}`,
      label: t.label,
      hint: t.hint,
      group: t.group,
      href: t.href,
    })),
  ];

  // Clamped rather than reset, so narrowing a search does not throw the
  // selection back to the top mid-keystroke.
  const index = Math.min(active, Math.max(hits.length - 1, 0));

  function run(hit: Hit) {
    close();
    router.push(hit.href);
  }

  function onInputKey(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, hits.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && hits[index]) {
      e.preventDefault();
      run(hits[index]);
    }
  }

  if (!open) return null;

  let lastGroup = "";

  return (
    <div
      className="fixed inset-0 z-[60] bg-black/40 px-4 pt-[12vh] backdrop-blur-sm"
      onClick={close}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Search and navigate"
        onClick={(e) => e.stopPropagation()}
        className="mx-auto w-full max-w-lg overflow-hidden rounded-[var(--ark-r-lg)] border border-[var(--ark-line)] bg-[var(--ark-overlay)] shadow-[var(--ark-shadow-overlay)]"
      >
        <div className="flex items-center gap-2 border-b border-[var(--ark-line)] px-3">
          <span aria-hidden className="text-[var(--ark-ink-muted)]">
            ⌕
          </span>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onInputKey}
            placeholder="Search contacts, or jump to a screen…"
            aria-label="Search contacts or jump to a screen"
            className="h-11 flex-1 bg-transparent text-sm text-[var(--ark-ink)] outline-none placeholder:text-[var(--ark-ink-muted)]"
          />
          <kbd className="rounded-[var(--ark-r-sm)] border border-[var(--ark-line)] px-1.5 py-0.5 text-[10px] text-[var(--ark-ink-muted)]">
            esc
          </kbd>
        </div>

        <div className="max-h-[52vh] overflow-y-auto py-1">
          {hits.length === 0 && (
            <p className="px-3 py-6 text-center text-sm text-[var(--ark-ink-3)]">
              {term.length >= 2
                ? `Nothing matches “${query.trim()}”.`
                : "Type to search."}
            </p>
          )}

          {hits.map((hit, i) => {
            const header = hit.group !== lastGroup ? hit.group : null;
            lastGroup = hit.group;
            return (
              <div key={hit.id}>
                {header && (
                  <p className="px-3 pt-2 pb-1 text-[10px] font-semibold tracking-[0.08em] text-[var(--ark-ink-muted)] uppercase">
                    {header}
                  </p>
                )}
                <button
                  onClick={() => run(hit)}
                  onMouseEnter={() => setActive(i)}
                  className={`flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm ${
                    i === index
                      ? "bg-[var(--ark-primary-soft)] text-[var(--ark-primary-soft-ink)]"
                      : "text-[var(--ark-ink)]"
                  }`}
                >
                  <span className="min-w-0 truncate font-medium">{hit.label}</span>
                  {hit.hint && (
                    <span className="shrink-0 text-xs text-[var(--ark-ink-muted)]">
                      {hit.hint}
                    </span>
                  )}
                </button>
              </div>
            );
          })}
        </div>

        <div className="flex items-center gap-3 border-t border-[var(--ark-line)] px-3 py-2 text-[11px] text-[var(--ark-ink-muted)]">
          <span>↑↓ move</span>
          <span>↵ open</span>
          <span className="ml-auto">
            {/* Named rather than left to be discovered: a shortcut nobody knows
                about is a feature nobody has. */}
            Ctrl/⌘ K anywhere
          </span>
        </div>
      </div>
    </div>
  );
}

"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

/*
In-app prompts, replacing window.prompt.

Eight places asked for a value with the browser's own dialog. That dialog says
"ark-five-ivory.vercel.app says" above whatever is being asked, which is the
chrome a phishing warning wears — it reads as the page having gone wrong rather
than as part of the product. It cannot be styled, cannot be themed, ignores the
dark mode entirely, and on a phone it covers the screen with no indication of
what it belongs to.

It is also a real defect and not only an appearance one. window.prompt blocks the
whole renderer, including React's work loop, and a QA run recorded the "+" button
on the funnel page list freezing a tab hard enough that it could not be
recovered — with the endpoint behind it working correctly when called directly.
A dialog that halts the event loop inside a React handler is the obvious
suspect.

Promise-based on purpose. The call sites were one-liners around window.prompt
and they stay one-liners, which is what makes replacing eight of them a change
worth reviewing rather than eight separate rewrites that each drift.
*/

interface AskOptions {
  /** The question. Shown as the dialog's heading. */
  title: string;
  /** The field label. Defaults to the title when omitted. */
  label?: string;
  defaultValue?: string;
  placeholder?: string;
  /** One line under the field, for a constraint or a consequence. */
  hint?: string;
  confirmLabel?: string;
  /** Blocks the confirm button while empty. True for almost everything. */
  required?: boolean;
  /**
   * Choices, when the answer is one of a known set.
   *
   * Renders a select rather than a text field. Worth having here rather than
   * as a separate dialog: asking somebody to paste an account id they first
   * have to find in a list is how a snapshot gets applied to the wrong client.
   */
  options?: { value: string; label: string }[];
  /** The field's input type, for a text answer. Defaults to text. */
  type?: "text" | "email" | "url";
}

type AskFn = (options: AskOptions) => Promise<string | null>;

const PromptContext = createContext<AskFn | null>(null);

/**
 * Asks the user for a value, resolving to null when they cancel.
 *
 * Null rather than an empty string, so "cancelled" and "left blank" stay
 * different answers — the same distinction window.prompt made, which every
 * existing call site was already written against.
 */
export function useAsk(): AskFn {
  const ask = useContext(PromptContext);
  if (!ask) {
    throw new Error("useAsk must be used inside PromptProvider");
  }
  return ask;
}

interface Pending extends AskOptions {
  resolve: (value: string | null) => void;
}

export function PromptProvider({ children }: { children: React.ReactNode }) {
  const [pending, setPending] = useState<Pending | null>(null);
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const ask = useCallback<AskFn>((options) => {
    return new Promise((resolve) => {
      setValue(options.defaultValue ?? "");
      setPending({ ...options, resolve });
    });
  }, []);

  // Focus and select, so a default value can be replaced by typing rather than
  // cleared first — which is what the browser dialog did.
  useEffect(() => {
    if (pending) inputRef.current?.select();
  }, [pending]);

  function finish(result: string | null) {
    pending?.resolve(result);
    setPending(null);
    setValue("");
  }

  const canConfirm = !pending?.required || value.trim() !== "";

  return (
    <PromptContext.Provider value={ask}>
      {children}

      {pending && (
        <div
          className="fixed inset-0 z-[70] flex items-start justify-center bg-black/40 px-4 pt-[18vh] backdrop-blur-sm"
          onClick={() => finish(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="prompt-title"
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-[var(--ark-r-lg)] border border-[var(--ark-line)] bg-[var(--ark-overlay)] p-4 shadow-[var(--ark-shadow-overlay)]"
          >
            <h2
              id="prompt-title"
              className="text-sm font-semibold text-[var(--ark-ink)]"
            >
              {pending.title}
            </h2>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (canConfirm) finish(value);
              }}
            >
              <label className="mt-3 mb-1 block text-xs font-medium text-[var(--ark-ink-2)]">
                {pending.label ?? pending.title}
              </label>
              {pending.options ? (
                <select
                  autoFocus
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") {
                      e.preventDefault();
                      finish(null);
                    }
                  }}
                  className="input"
                >
                  <option value="">— choose —</option>
                  {pending.options.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  ref={inputRef}
                  autoFocus
                  type={pending.type ?? "text"}
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  onKeyDown={(e) => {
                    // Escape cancels, as the browser dialog did. Bound here
                    // rather than on the window so it cannot fight another
                    // overlay.
                    if (e.key === "Escape") {
                      e.preventDefault();
                      finish(null);
                    }
                  }}
                  placeholder={pending.placeholder}
                  className="input"
                />
              )}
              {pending.hint && (
                <p className="mt-1.5 text-xs text-[var(--ark-ink-3)]">{pending.hint}</p>
              )}

              <div className="mt-4 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => finish(null)}
                  className="rounded-[var(--ark-r-md)] border border-[var(--ark-line-strong)] px-3 py-1.5 text-sm font-medium text-[var(--ark-ink)] transition-colors hover:bg-[var(--ark-surface-2)]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!canConfirm}
                  className="rounded-[var(--ark-r-md)] bg-[var(--ark-primary)] px-3.5 py-1.5 text-sm font-medium text-[var(--ark-primary-ink)] transition-colors hover:bg-[var(--ark-primary-hover)] disabled:opacity-45"
                >
                  {pending.confirmLabel ?? "OK"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </PromptContext.Provider>
  );
}

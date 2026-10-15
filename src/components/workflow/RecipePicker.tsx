"use client";

import { useState } from "react";
import { Badge, Button } from "@/components/kit";
import { WORKFLOW_RECIPES, type WorkflowRecipe } from "@/lib/workflowRecipes";

/*
What somebody sees instead of a blank canvas.

A workflow builder's hardest moment is the first one. Even somebody who knows
exactly what they want — "when a form comes in, message them and file them under
New" — has to turn that into a trigger, two steps and their configuration, from
a catalog listing twenty-five entry points of which two work.

So the choice is framed as an outcome rather than a mechanism, and each one
states what still needs picking before it is created. Nobody is surprised
halfway through, and the thing they land on is already the right shape.

Starting blank stays, deliberately. It is the right choice for anybody who
already knows the product, and removing it would make the recipes feel like a
cage rather than a shortcut.
*/
export function RecipePicker({
  busy,
  onPick,
  onBlank,
  onClose,
}: {
  busy: boolean;
  onPick: (recipe: WorkflowRecipe) => void;
  onBlank: () => void;
  onClose: () => void;
}) {
  const [chosen, setChosen] = useState<string>(WORKFLOW_RECIPES[0]?.key ?? "");
  const recipe = WORKFLOW_RECIPES.find((r) => r.key === chosen);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 pt-[8vh] backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Start a workflow"
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[80vh] w-full max-w-3xl flex-col overflow-hidden rounded-[var(--ark-r-lg)] border border-[var(--ark-line)] bg-[var(--ark-overlay)] shadow-[var(--ark-shadow-overlay)]"
      >
        <header className="flex items-start justify-between border-b border-[var(--ark-line)] px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-[var(--ark-ink)]">
              What should this workflow do?
            </h2>
            <p className="mt-0.5 text-sm text-[var(--ark-ink-3)]">
              Pick the closest one. Everything is editable afterwards.
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded p-1 text-[var(--ark-ink-muted)] hover:bg-[var(--ark-surface-2)]"
          >
            ✕
          </button>
        </header>

        <div className="grid flex-1 overflow-hidden sm:grid-cols-[minmax(0,1fr)_280px]">
          {/* The list of outcomes. */}
          <div className="overflow-y-auto border-[var(--ark-line)] p-2 sm:border-r">
            {WORKFLOW_RECIPES.map((r) => (
              <button
                key={r.key}
                onClick={() => setChosen(r.key)}
                className={`mb-1 w-full rounded-[var(--ark-r-md)] border p-3 text-left transition-colors ${
                  chosen === r.key
                    ? "border-[var(--ark-primary)] bg-[var(--ark-primary-soft)]"
                    : "border-transparent hover:bg-[var(--ark-surface-2)]"
                }`}
              >
                <span className="block text-[13px] font-semibold text-[var(--ark-ink)]">
                  {r.name}
                </span>
                <span className="mt-0.5 block text-xs text-[var(--ark-ink-3)]">
                  {r.summary}
                </span>
              </button>
            ))}
          </div>

          {/* What the chosen one will build, and what it still needs. */}
          <aside className="overflow-y-auto bg-[var(--ark-surface-2)] p-4">
            {recipe && (
              <>
                <p className="text-[11px] font-semibold tracking-[0.06em] text-[var(--ark-ink-muted)] uppercase">
                  Best for
                </p>
                <p className="mt-1 text-sm text-[var(--ark-ink-2)]">{recipe.bestFor}</p>

                <p className="mt-4 text-[11px] font-semibold tracking-[0.06em] text-[var(--ark-ink-muted)] uppercase">
                  The steps
                </p>
                <ol className="mt-1.5 space-y-1">
                  {recipe.steps.map((s, i) => (
                    <li key={i} className="flex gap-2 text-sm text-[var(--ark-ink-2)]">
                      <span className="text-[var(--ark-ink-muted)]">{i + 1}.</span>
                      <span>
                        {s.label}
                        {/* A branching step's two paths, so the shape is legible
                            before it is created rather than after. */}
                        {(s.yes?.length || s.no?.length) && (
                          <span className="mt-0.5 block text-xs text-[var(--ark-ink-3)]">
                            {s.yes?.map((b) => `Yes → ${b.label}`).join(", ")}
                            {s.yes?.length && s.no?.length ? " · " : ""}
                            {s.no?.map((b) => `No → ${b.label}`).join(", ")}
                          </span>
                        )}
                      </span>
                    </li>
                  ))}
                </ol>

                <p className="mt-4 text-[11px] font-semibold tracking-[0.06em] text-[var(--ark-ink-muted)] uppercase">
                  You will need to choose
                </p>
                {/* Said before creating, not discovered after. These are the
                    things only the account owner can answer. */}
                <ul className="mt-1.5 space-y-1">
                  {recipe.needs.map((n) => (
                    <li key={n}>
                      <Badge tone="warn" dot={false}>
                        {n}
                      </Badge>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </aside>
        </div>

        <footer className="flex items-center justify-between gap-2 border-t border-[var(--ark-line)] px-5 py-3">
          <Button tone="ghost" onClick={onBlank} disabled={busy}>
            Start from blank instead
          </Button>
          <Button
            tone="primary"
            busy={busy}
            disabled={!recipe}
            onClick={() => recipe && onPick(recipe)}
          >
            Create this workflow
          </Button>
        </footer>
      </div>
    </div>
  );
}

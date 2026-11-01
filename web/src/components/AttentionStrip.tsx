"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";

/**
 * What is quietly wrong in this workspace, at the top of the dashboard.
 *
 * The product already writes these warnings well — "Finished, but 1 step did not
 * run", "These keys can no longer be read" — and then files each one inside a
 * panel nobody opens. Two audits made the same point: the information exists and
 * is buried, while the dashboard above it says "Failed sends: 0 — healthy".
 *
 * It renders nothing when there is nothing wrong. A strip that is always present
 * is furniture, and furniture is not read.
 */

interface AttentionItem {
  key: string;
  severity: "error" | "warning";
  title: string;
  detail: string;
  href: string;
  count?: number;
}

export function AttentionStrip() {
  const [items, setItems] = useState<AttentionItem[]>([]);
  // Starts collapsed to one line; the detail is a click away rather than a wall.
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let live = true;
    async function run() {
      try {
        const res = await api<{ items: AttentionItem[] }>("/attention");
        if (live) setItems(res.items ?? []);
      } catch {
        // A health check that cannot load must not become the thing that is
        // wrong with the page.
      }
    }
    run();
    return () => {
      live = false;
    };
  }, []);

  if (items.length === 0) return null;

  const errors = items.filter((i) => i.severity === "error").length;
  // One red strip if anything is broken, amber if things merely went unfinished.
  const tone = errors > 0 ? ERROR : WARNING;

  return (
    <section
      aria-label="Needs attention"
      className={`mb-4 rounded-xl border ${tone.border} ${tone.bg}`}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-2.5 px-4 py-3 text-left"
      >
        <span aria-hidden="true" className={`text-base ${tone.icon}`}>
          {errors > 0 ? "▲" : "●"}
        </span>
        <span className={`text-sm font-medium ${tone.title}`}>
          {items.length === 1
            ? items[0].title
            : `${items.length} things need your attention`}
        </span>
        <span className={`ml-auto text-xs ${tone.detail}`}>
          {open ? "Hide" : "Show"}
        </span>
      </button>

      {open && (
        <ul className={`border-t ${tone.border} divide-y ${tone.divide}`}>
          {items.map((item) => (
            <li key={item.key} className="flex flex-wrap items-start gap-x-3 gap-y-1 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className={`text-sm font-medium ${tone.title}`}>{item.title}</p>
                <p className={`mt-0.5 text-sm ${tone.detail}`}>{item.detail}</p>
              </div>
              {/* Every item is one click from the place it is fixed. A warning
                  that makes you go and find the screen is a warning people learn
                  to scroll past. */}
              <Link
                href={item.href}
                className={`shrink-0 rounded-lg border bg-white px-3 py-1.5 text-sm font-medium ${tone.border} ${tone.title} hover:opacity-80`}
              >
                Fix this
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * The two tones.
 *
 * Written out as whole class names rather than built from a template string,
 * because Tailwind scans the source for literals — an interpolated class is not
 * in the output CSS and the strip would render unstyled.
 */
const ERROR = {
  border: "border-rose-200",
  bg: "bg-rose-50",
  icon: "text-rose-600",
  title: "text-rose-900",
  detail: "text-rose-800",
  divide: "divide-rose-200",
};

const WARNING = {
  border: "border-amber-200",
  bg: "bg-amber-50",
  icon: "text-amber-600",
  title: "text-amber-900",
  detail: "text-amber-800",
  divide: "divide-amber-200",
};

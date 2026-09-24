"use client";

import { useMemo, useState } from "react";
import type { CatalogGroup, CatalogItem } from "@/lib/types";

// CatalogPicker is the "Add a Trigger" / "Add an Action" dialog: a category rail,
// a searchable grid of cards, and (for actions) an Actions/Conditions tab switch.
export function CatalogPicker({
  title,
  actions,
  conditions,
  onPick,
  onClose,
}: {
  title: string;
  // For a trigger picker, pass the trigger groups as `actions` and omit conditions.
  actions: CatalogGroup[];
  conditions?: CatalogGroup[];
  onPick: (item: CatalogItem) => void;
  onClose: () => void;
}) {
  const hasTabs = !!conditions;
  const [tab, setTab] = useState<"actions" | "conditions">("actions");
  const groups = tab === "conditions" && conditions ? conditions : actions;

  const [search, setSearch] = useState("");
  const [activeGroup, setActiveGroup] = useState<string>(groups[0]?.key ?? "");

  const q = search.trim().toLowerCase();
  const filtered = useMemo(() => {
    if (!q) {
      const g = groups.find((x) => x.key === activeGroup) ?? groups[0];
      return g ? g.items : [];
    }
    // Search flattens across all groups in the active tab.
    return groups.flatMap((g) =>
      g.items.filter(
        (it) =>
          it.label.toLowerCase().includes(q) ||
          it.description.toLowerCase().includes(q) ||
          it.app.toLowerCase().includes(q),
      ),
    );
  }, [q, groups, activeGroup]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 pt-16"
      onClick={onClose}
    >
      <div
        className="w-full max-w-3xl rounded-2xl bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button onClick={onClose} className="rounded p-1 text-slate-400 hover:bg-slate-100">
            ✕
          </button>
        </div>

        <input
          autoFocus
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name, description, or app…"
          className="input mb-3"
        />

        {hasTabs && (
          <div className="mb-3 flex gap-1 border-b border-slate-200">
            {(["actions", "conditions"] as const).map((t) => (
              <button
                key={t}
                onClick={() => {
                  setTab(t);
                  setSearch("");
                  const g = t === "conditions" ? conditions! : actions;
                  setActiveGroup(g[0]?.key ?? "");
                }}
                className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium capitalize ${
                  tab === t
                    ? "border-blue-600 text-blue-700"
                    : "border-transparent text-slate-500 hover:text-slate-800"
                }`}
              >
                {t} (
                {(t === "conditions" ? conditions! : actions).reduce(
                  (n, g) => n + g.items.length,
                  0,
                )}
                )
              </button>
            ))}
          </div>
        )}

        <div className="grid max-h-[60vh] grid-cols-[180px_1fr] gap-4 overflow-hidden">
          {/* Category rail */}
          <div className="overflow-y-auto border-r border-slate-100 pr-2">
            {groups.map((g) => (
              <button
                key={g.key}
                onClick={() => {
                  setActiveGroup(g.key);
                  setSearch("");
                }}
                className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm ${
                  !q && activeGroup === g.key
                    ? "bg-blue-50 font-medium text-blue-700"
                    : "text-slate-600 hover:bg-slate-50"
                }`}
              >
                <span className="truncate">{g.label}</span>
                <span className="ml-2 text-xs text-slate-400">{g.items.length}</span>
              </button>
            ))}
          </div>

          {/* Cards */}
          <div className="grid grid-cols-1 gap-3 overflow-y-auto sm:grid-cols-2">
            {filtered.length === 0 && (
              <p className="col-span-full py-8 text-center text-sm text-slate-400">No matches.</p>
            )}
            {filtered.map((it) => (
              <button
                key={it.key}
                onClick={() => onPick(it)}
                className="flex flex-col rounded-xl border border-slate-200 p-3 text-left transition hover:border-blue-300 hover:shadow-sm"
              >
                <div className="mb-1 flex items-center gap-2">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-base">
                    {it.icon}
                  </span>
                  <span className="font-semibold">{it.label}</span>
                  {it.app && (
                    <span className="ml-auto rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">
                      {it.app}
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-500">{it.description}</p>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "./icons";
import {
  type ContactFilter,
  EMPTY_FILTER,
  type Tri,
  activeFilterCount,
  filterChips,
} from "@/lib/contactFilters";
import type { Pipeline, Stage } from "@/lib/types";

/**
 * The filter control, shared by the Contacts page and the CRM board.
 *
 * One component for both, because the change request asked for the same filter
 * on the board and on Contacts "so they behave the same". Two panels would have
 * drifted the first time either grew a field.
 *
 * The board passes `scopePipeline`, since it is already showing one pipeline and
 * a pipeline dropdown there would just be a way to empty the screen.
 */

export function FilterButton({
  filter,
  onChange,
  pipelines,
  stages,
  scopePipeline = false,
}: {
  filter: ContactFilter;
  onChange: (next: ContactFilter) => void;
  pipelines: Pipeline[];
  /** Stages available to filter by. The caller scopes them to the pipeline. */
  stages: Stage[];
  /** Hide the pipeline filter, for a page already fixed to one pipeline. */
  scopePipeline?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const count = activeFilterCount(filter);

  // Click-away and Escape. A filter panel that can only be closed by the button
  // that opened it feels stuck, and it covers the rows being filtered.
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

  const set = (p: Partial<ContactFilter>) => onChange({ ...filter, ...p });

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm transition ${
          count > 0
            ? "border-blue-300 bg-blue-50 text-blue-700"
            : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
        }`}
      >
        <Icon.Filter width={15} height={15} />
        Filter
        {count > 0 && (
          <span className="rounded-full bg-blue-600 px-1.5 text-xs font-medium text-white">
            {count}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-30 mt-2 w-80 rounded-xl border border-slate-200 bg-white p-4 shadow-xl">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold">Filter contacts</h3>
            <button
              type="button"
              onClick={() => onChange({ ...EMPTY_FILTER, search: filter.search })}
              disabled={count === 0}
              className="text-xs text-slate-500 hover:text-slate-800 disabled:opacity-40"
            >
              Clear all
            </button>
          </div>

          <div className="space-y-3">
            {!scopePipeline && (
              <Row label="Pipeline">
                <select
                  value={filter.pipelineId}
                  // Changing pipeline drops the stage: the stage that was picked
                  // belongs to the old one and would match nothing.
                  onChange={(e) => set({ pipelineId: e.target.value, stageId: "" })}
                  className={SELECT}
                >
                  <option value="">Any</option>
                  {pipelines.map((p) => (
                    <option key={p._id} value={p._id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </Row>
            )}

            <Row label="Stage">
              <select
                value={filter.stageId}
                onChange={(e) => set({ stageId: e.target.value })}
                disabled={stages.length === 0}
                className={SELECT}
              >
                <option value="">Any</option>
                {stages.map((s) => (
                  <option key={s._id} value={s._id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </Row>
            {!scopePipeline && !filter.pipelineId && (
              <p className="-mt-2 text-xs text-slate-400">
                Pick a pipeline to narrow the stage list.
              </p>
            )}

            <TriRow
              label="Email"
              value={filter.hasEmail}
              onChange={(v) => set({ hasEmail: v })}
              yes="Has one"
              no="Missing"
            />
            <TriRow
              label="Phone"
              value={filter.hasPhone}
              onChange={(v) => set({ hasPhone: v })}
              yes="Has one"
              no="Missing"
            />
            <TriRow
              label="Automation"
              value={filter.automation}
              onChange={(v) => set({ automation: v })}
              yes="Running"
              no="None"
            />

            <Row label="Value">
              <div className="flex items-center gap-1.5">
                <input
                  type="number"
                  inputMode="numeric"
                  placeholder="Min"
                  value={filter.minValue}
                  onChange={(e) => set({ minValue: e.target.value })}
                  className={NUM}
                />
                <span className="text-xs text-slate-400">to</span>
                <input
                  type="number"
                  inputMode="numeric"
                  placeholder="Max"
                  value={filter.maxValue}
                  onChange={(e) => set({ maxValue: e.target.value })}
                  className={NUM}
                />
              </div>
            </Row>

            <Row label="Added">
              <div className="flex items-center gap-1.5">
                <input
                  type="date"
                  value={filter.addedFrom}
                  onChange={(e) => set({ addedFrom: e.target.value })}
                  className={NUM}
                />
                <span className="text-xs text-slate-400">to</span>
                <input
                  type="date"
                  value={filter.addedTo}
                  onChange={(e) => set({ addedTo: e.target.value })}
                  className={NUM}
                />
              </div>
            </Row>
          </div>
        </div>
      )}
    </div>
  );
}

const SELECT =
  "w-full rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm disabled:bg-slate-50 disabled:text-slate-400";
const NUM = "w-full rounded-lg border border-slate-300 px-2 py-1 text-sm";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[72px_1fr] items-center gap-2">
      <span className="text-xs font-medium text-slate-500">{label}</span>
      {children}
    </div>
  );
}

/**
 * A three-state row: Any / yes / no.
 *
 * Three buttons rather than a checkbox, because "has no email" is a real thing
 * a client wants to find — the people they cannot email yet. A checkbox can only
 * express "has one" and "don't care".
 */
function TriRow({
  label,
  value,
  onChange,
  yes,
  no,
}: {
  label: string;
  value: Tri;
  onChange: (v: Tri) => void;
  yes: string;
  no: string;
}) {
  const opts: { v: Tri; label: string }[] = [
    { v: "", label: "Any" },
    { v: "yes", label: yes },
    { v: "no", label: no },
  ];
  return (
    <Row label={label}>
      <div className="flex gap-0.5 rounded-lg bg-slate-100 p-0.5">
        {opts.map((o) => (
          <button
            key={o.v}
            type="button"
            onClick={() => onChange(o.v)}
            className={`flex-1 rounded-md px-1.5 py-1 text-xs transition ${
              value === o.v
                ? "bg-white font-medium text-slate-900 shadow-sm"
                : "text-slate-500 hover:text-slate-800"
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </Row>
  );
}

/**
 * The active filters, above the table, each one removable.
 *
 * Without these a collapsed filter panel looks exactly like one that was never
 * opened — and the usual conclusion is that the contacts have gone missing.
 */
export function FilterChips({
  filter,
  onChange,
  pipelines,
  stages,
}: {
  filter: ContactFilter;
  onChange: (next: ContactFilter) => void;
  pipelines: Pipeline[];
  stages: Stage[];
}) {
  const names = {
    pipelines: Object.fromEntries(pipelines.map((p) => [p._id, p.name])),
    stages: Object.fromEntries(stages.map((s) => [s._id, s.name])),
  };
  const chips = filterChips(filter, names);
  if (chips.length === 0) return null;

  return (
    <div className="mb-3 flex flex-wrap items-center gap-1.5">
      {chips.map((chip) => (
        <span
          key={chip.key}
          className="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 py-0.5 pl-2.5 pr-1 text-xs text-blue-800"
        >
          {chip.label}
          <button
            type="button"
            onClick={() => onChange({ ...filter, ...chip.clear })}
            aria-label={`Remove filter: ${chip.label}`}
            title="Remove"
            className="rounded-full p-0.5 text-blue-400 transition hover:bg-blue-100 hover:text-blue-700"
          >
            <Icon.Close width={12} height={12} />
          </button>
        </span>
      ))}
      {chips.length > 1 && (
        <button
          type="button"
          onClick={() => onChange({ ...EMPTY_FILTER, search: filter.search })}
          className="ml-1 text-xs text-slate-500 hover:text-slate-800"
        >
          Clear all
        </button>
      )}
    </div>
  );
}

/** The search box, so both pages get the same placeholder and the same icon. */
export function ContactSearch({
  value,
  onChange,
  className = "w-64",
}: {
  value: string;
  onChange: (v: string) => void;
  className?: string;
}) {
  return (
    <div className={`relative ${className}`}>
      <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400">
        <Icon.Search width={15} height={15} />
      </span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Search name, phone, or email…"
        className="w-full rounded-lg border border-slate-300 py-1.5 pl-8 pr-8 text-sm"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label="Clear search"
          title="Clear"
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-slate-400 hover:text-slate-700"
        >
          <Icon.Close width={13} height={13} />
        </button>
      )}
    </div>
  );
}

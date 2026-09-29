"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { RowAction, RowActions } from "@/components/RowActions";
import { exportContacts, exportMessage } from "@/lib/contactsExport";
import {
  ContactSearch,
  FilterButton,
  FilterChips,
} from "@/components/ContactFilters";
import {
  type ContactFilter,
  DEFAULT_SORT,
  EMPTY_FILTER,
  type Sort,
  type SortKey,
  activeFilterCount,
  matchesFilter,
  sortContacts,
  summarize,
  toggleSort,
} from "@/lib/contactFilters";
import type { Contact, ContactsResponse, Pipeline, Stage } from "@/lib/types";
import { ImportDialog } from "@/components/ImportDialog";
import { CardDialog } from "@/components/CardDialog";
import { Icon } from "@/components/icons";
import { PageHeader, StatTile } from "@/components/ui";

/**
 * Filtering, sorting and selection all happen in the browser.
 *
 * The endpoint already returns the tenant's whole list, so there is nothing to
 * save by asking the server again — and filtering locally means the shared
 * predicate in contactFilters is the only definition of "has email" anywhere,
 * used identically here and on the board.
 */
export default function ContactsPage() {
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  /**
   * Stages are cached with the pipeline they belong to, and `stages` below is
   * derived from that pair.
   *
   * Storing the pipeline id alongside them is what lets the list go empty
   * without an effect writing state: when the selected pipeline no longer
   * matches what was fetched, the derived value is simply [] — and a stale
   * pipeline's stages can never be shown against a newly chosen one.
   */
  const [stageCache, setStageCache] = useState<{ pipelineId: string; stages: Stage[] }>({
    pipelineId: "",
    stages: [],
  });
  const [data, setData] = useState<ContactsResponse | null>(null);

  const [filter, setFilter] = useState<ContactFilter>(EMPTY_FILTER);
  const [sort, setSort] = useState<Sort>(DEFAULT_SORT);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const [importing, setImporting] = useState(false);
  const [editing, setEditing] = useState<Contact | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    api<Pipeline[]>("/pipelines").then(setPipelines).catch(() => {});
  }, []);

  // Fetched per pipeline, because that is the only shape the API offers and the
  // only time a stage filter means anything.
  useEffect(() => {
    const pipelineId = filter.pipelineId;
    if (!pipelineId) return;
    let live = true;
    async function run() {
      try {
        const rows = await api<Stage[]>(`/pipelines/${pipelineId}/stages`);
        if (live) setStageCache({ pipelineId, stages: rows });
      } catch {
        if (live) setStageCache({ pipelineId, stages: [] });
      }
    }
    run();
    return () => {
      live = false;
    };
  }, [filter.pipelineId]);

  const stages = stageCache.pipelineId === filter.pipelineId ? stageCache.stages : [];

  const load = useCallback(async () => {
    try {
      setData(await api<ContactsResponse>("/contacts"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load contacts");
    }
  }, []);

  useEffect(() => {
    async function run() {
      await load();
    }
    run();
  }, [load]);

  // Memoised so the identity is stable across renders; otherwise every render
  // produces a fresh array and the filter/sort below re-runs for nothing.
  const all = useMemo(() => data?.contacts ?? [], [data]);

  const rows = useMemo(
    () => sortContacts(all.filter((c) => matchesFilter(c, filter)), sort),
    [all, filter, sort],
  );

  // Recomputed from the rows on screen, so a tile can never disagree with the
  // table under it.
  const totals = useMemo(() => summarize(rows), [rows]);

  /**
   * The selection that a bulk action will actually touch.
   *
   * Intersected with the visible rows on every render rather than pruned when
   * the filter changes: selecting fifty contacts, narrowing the filter, and
   * hitting Delete must not delete the forty that are no longer on screen.
   */
  const targets = useMemo(() => rows.filter((r) => selected.has(r._id)), [rows, selected]);

  const allVisibleSelected = rows.length > 0 && targets.length === rows.length;
  const someVisibleSelected = targets.length > 0 && !allVisibleSelected;
  const filtering = activeFilterCount(filter) > 0 || filter.search.trim() !== "";

  function toggleRow(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAllVisible() {
    // Only the rows currently on screen, never the whole database.
    setSelected(allVisibleSelected ? new Set() : new Set(rows.map((r) => r._id)));
  }

  function flash(message: string) {
    setNotice(message);
    setTimeout(() => setNotice(""), 4000);
  }

  function runExport() {
    if (!rows.length) return;
    flash(exportMessage(exportContacts(rows), filtering));
  }

  async function removeOne(id: string, name: string) {
    if (!window.confirm(`Delete "${name}"?`)) return;
    try {
      await api(`/cards/${id}`, { method: "DELETE" });
      setSelected((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete contact");
    }
  }

  async function removeSelected() {
    const n = targets.length;
    if (n === 0) return;
    // The count is in the prompt because the whole risk of a bulk action is
    // being wrong about how much is selected.
    if (
      !window.confirm(
        `Delete ${n} contact${n === 1 ? "" : "s"}? This also removes their automation history and cannot be undone.`,
      )
    ) {
      return;
    }
    setDeleting(true);
    setError("");
    try {
      await api("/cards/bulk-delete", {
        method: "POST",
        body: { ids: targets.map((t) => t._id) },
      });
      setSelected(new Set());
      await load();
      flash(`Deleted ${n.toLocaleString()} contact${n === 1 ? "" : "s"}.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete the selected contacts");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="mx-auto max-w-[1400px] p-6">
      <PageHeader
        title="Contacts"
        subtitle="Every lead across your pipelines"
        actions={
          <>
            <button
              onClick={runExport}
              disabled={!rows.length}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm hover:bg-slate-50 disabled:opacity-50"
            >
              <Icon.Download width={15} height={15} />
              Export CSV
            </button>
            <button
              onClick={() => setImporting(true)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
            >
              <Icon.Upload width={15} height={15} />
              Import CSV
            </button>
          </>
        }
      />

      <div className="mb-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatTile label={filtering ? "Matching contacts" : "Total contacts"} value={totals.totalContacts} icon="Contacts" tone="violet" badge="" />
        <StatTile
          label="Total value"
          value={`₹${totals.totalValue.toLocaleString("en-IN")}`}
          icon="Money"
          tone="green"
          badge=""
        />
        <StatTile label="With email" value={totals.withEmail} icon="Mail" tone="blue" badge="" />
        <StatTile label="With phone" value={totals.withPhone} icon="Phone" tone="blue" badge="" />
        <StatTile label="Active automations" value={totals.activeAutomations} icon="Sparkle" tone="amber" badge="" />
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <ContactSearch
          value={filter.search}
          onChange={(search) => setFilter((f) => ({ ...f, search }))}
        />
        <FilterButton
          filter={filter}
          onChange={setFilter}
          pipelines={pipelines}
          stages={stages}
        />
        {filtering && (
          <span className="text-sm text-slate-500">
            {rows.length.toLocaleString()} of {all.length.toLocaleString()}
          </span>
        )}
      </div>

      <FilterChips
        filter={filter}
        onChange={setFilter}
        pipelines={pipelines}
        stages={stages}
      />

      {error && (
        <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}
      {notice && (
        <p className="mb-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          {notice}
        </p>
      )}

      {/* The bulk bar replaces nothing and hides nothing — it appears above the
          table only while a selection exists, and says how many. */}
      {targets.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-3 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2">
          <span className="text-sm font-medium text-blue-900">
            {targets.length.toLocaleString()} selected
          </span>
          <button
            onClick={() => setSelected(new Set())}
            className="text-sm text-blue-700 hover:underline"
          >
            Clear selection
          </button>
          <button
            onClick={removeSelected}
            disabled={deleting}
            className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-rose-700 disabled:opacity-60"
          >
            <Icon.Trash width={15} height={15} />
            {deleting ? "Deleting…" : `Delete ${targets.length.toLocaleString()}`}
          </button>
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="w-10 px-3 py-2">
                <input
                  type="checkbox"
                  checked={allVisibleSelected}
                  // Indeterminate is the honest state for a partial selection.
                  // A plain unchecked box next to eight ticked rows reads as a
                  // bug, and clicking it would look like it did nothing.
                  ref={(el) => {
                    if (el) el.indeterminate = someVisibleSelected;
                  }}
                  onChange={toggleAllVisible}
                  disabled={rows.length === 0}
                  aria-label={allVisibleSelected ? "Clear selection" : "Select all shown"}
                  title={allVisibleSelected ? "Clear selection" : "Select all shown"}
                  className="h-4 w-4 cursor-pointer accent-blue-600"
                />
              </th>
              <SortHeader label="Name" col="name" sort={sort} onSort={setSort} />
              <th className="px-3 py-2">Phone</th>
              <th className="px-3 py-2">Email</th>
              <SortHeader label="Value" col="value" sort={sort} onSort={setSort} />
              <SortHeader label="Pipeline" col="pipeline" sort={sort} onSort={setSort} />
              <SortHeader label="Stage" col="stage" sort={sort} onSort={setSort} />
              <SortHeader label="Added" col="added" sort={sort} onSort={setSort} />
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={9} className="px-3 py-10 text-center">
                  {all.length === 0 ? (
                    <div className="text-slate-500">
                      <p className="font-medium text-slate-700">No contacts yet</p>
                      <p className="mt-1 text-sm">
                        Import a CSV, or add a card on the board.
                      </p>
                    </div>
                  ) : (
                    <div className="text-slate-500">
                      <p className="text-sm">No contacts match these filters.</p>
                      <button
                        onClick={() => setFilter(EMPTY_FILTER)}
                        className="mt-2 text-sm text-blue-600 hover:underline"
                      >
                        Clear all filters
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            )}

            {rows.map((c) => {
              const checked = selected.has(c._id);
              return (
                <tr
                  key={c._id}
                  className={`border-b border-slate-100 last:border-0 ${
                    checked ? "bg-blue-50/60" : ""
                  }`}
                >
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleRow(c._id)}
                      aria-label={`Select ${c.name}`}
                      className="h-4 w-4 cursor-pointer accent-blue-600"
                    />
                  </td>
                  <td className="px-3 py-2 font-medium">{c.name}</td>
                  <td className="px-3 py-2 text-slate-600">{c.phone || "—"}</td>
                  <td className="px-3 py-2 text-slate-600">{c.email || "—"}</td>
                  <td className="px-3 py-2">
                    {c.value ? `₹${c.value.toLocaleString("en-IN")}` : "—"}
                  </td>
                  <td className="px-3 py-2 text-slate-600">{c.pipelineName}</td>
                  <td className="px-3 py-2 text-slate-600">{c.stageName}</td>
                  <td className="px-3 py-2 text-slate-500">
                    {new Date(c.createdAt).toLocaleDateString()}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right">
                    <RowActions>
                      <RowAction action="edit" label="Edit" onClick={() => setEditing(c)} />
                      <RowAction
                        action="delete"
                        label="Delete"
                        onClick={() => removeOne(c._id, c.name)}
                      />
                    </RowActions>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {importing && (
        <ImportDialog
          pipelines={pipelines}
          onClose={() => setImporting(false)}
          onDone={async () => {
            setImporting(false);
            await load();
          }}
        />
      )}

      {editing && (
        <CardDialog
          stageId={editing.stageId}
          card={editing}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await load();
          }}
          onError={setError}
        />
      )}
    </div>
  );
}

/**
 * A clickable column header.
 *
 * The arrow only appears on the active column. Showing a faint arrow on every
 * sortable header is the common alternative, and it makes the one that is
 * actually in force hard to find.
 */
function SortHeader({
  label,
  col,
  sort,
  onSort,
}: {
  label: string;
  col: SortKey;
  sort: Sort;
  onSort: (s: Sort) => void;
}) {
  const active = sort.key === col;
  return (
    // aria-sort belongs on the header cell, not the button inside it: the cell
    // is the columnheader, and a button does not support the attribute.
    <th
      className="px-3 py-2"
      aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}
    >
      <button
        type="button"
        onClick={() => onSort(toggleSort(sort, col))}
        className={`inline-flex items-center gap-1 uppercase transition hover:text-slate-800 ${
          active ? "font-semibold text-slate-800" : ""
        }`}
      >
        {label}
        <span className={active ? "" : "opacity-0"} aria-hidden="true">
          {sort.dir === "asc" ? "↑" : "↓"}
        </span>
      </button>
    </th>
  );
}

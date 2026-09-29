"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import type { BoardAutomation, BoardResponse, Pipeline, Stage } from "@/lib/types";
import { Board } from "@/components/Board";
import { Icon } from "@/components/icons";
import { ImportDialog } from "@/components/ImportDialog";
import {
  ContactSearch,
  FilterButton,
  FilterChips,
} from "@/components/ContactFilters";
import {
  type ContactFilter,
  EMPTY_FILTER,
  activeFilterCount,
  matchesFilter,
} from "@/lib/contactFilters";
import { boardRows } from "@/lib/boardRows";
import { exportContacts, exportMessage } from "@/lib/contactsExport";

const POLL_MS = 15_000;

export default function BoardPage() {
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [board, setBoard] = useState<BoardResponse | null>(null);
  /**
   * Automation state lives here, not in Board.
   *
   * The toolbar filters on "automation running", and the export writes the rows
   * the filter left — both need it. Keeping one copy on the page means the
   * badges on the cards and the rows in the file agree by construction.
   */
  const [automation, setAutomation] = useState<BoardAutomation | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [filter, setFilter] = useState<ContactFilter>(EMPTY_FILTER);
  const [importing, setImporting] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    async function load() {
      try {
        const list = await api<Pipeline[]>("/pipelines");
        setPipelines(list);
        if (list.length > 0) setActiveId((prev) => prev ?? list[0]._id);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not load pipelines");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const loadBoard = useCallback(async (pipelineId: string) => {
    const data = await api<BoardResponse>(`/pipelines/${pipelineId}`);
    setBoard(data);
  }, []);

  useEffect(() => {
    if (!activeId) return;
    async function run() {
      try {
        await loadBoard(activeId!);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not load board");
      }
    }
    run();
  }, [activeId, loadBoard]);

  const loadAutomation = useCallback(async () => {
    if (!activeId) return;
    try {
      setAutomation(await api<BoardAutomation>(`/automation/board/${activeId}`));
    } catch {
      // The badges are supplementary; a hiccup here shouldn't disrupt the board.
    }
  }, [activeId]);

  // Poll so badges advance as the cron sends, without a manual refresh.
  useEffect(() => {
    async function run() {
      await loadAutomation();
    }
    run();
    const id = setInterval(run, POLL_MS);
    return () => clearInterval(id);
  }, [loadAutomation]);

  // A pipeline's own stages, for the stage filter. The board already has them.
  const stages: Stage[] = board?.stages ?? [];

  const filtering =
    activeFilterCount(filter) > 0 || filter.search.trim() !== "";

  /** The rows the export writes: every card on the board, minus the filtered. */
  const visibleRows = useMemo(() => {
    if (!board) return [];
    const rows = boardRows(board, automation);
    return filtering ? rows.filter((r) => matchesFilter(r, filter)) : rows;
  }, [board, automation, filter, filtering]);

  // Switching pipeline drops the stage filter: the stage belonged to the old one.
  function selectPipeline(id: string) {
    setActiveId(id);
    setFilter((f) => ({ ...f, stageId: "" }));
  }

  function flash(message: string) {
    setNotice(message);
    setTimeout(() => setNotice(""), 4000);
  }

  function runExport() {
    if (!board || visibleRows.length === 0) return;
    // Named after the pipeline, so a folder of exports stays legible.
    flash(exportMessage(exportContacts(visibleRows, board.pipeline.name), filtering));
  }

  async function createPipeline() {
    const name = window.prompt("Pipeline name");
    if (!name?.trim()) return;
    try {
      const created = await api<Pipeline>("/pipelines", {
        method: "POST",
        body: { name: name.trim() },
      });
      setPipelines((prev) => [...prev, created]);
      selectPipeline(created._id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create pipeline");
    }
  }

  async function deletePipeline() {
    if (!activeId || !board) return;
    if (
      !window.confirm(
        `Delete "${board.pipeline.name}"? Its stages and cards will be deleted too.`,
      )
    )
      return;

    try {
      await api(`/pipelines/${activeId}`, { method: "DELETE" });
      const remaining = pipelines.filter((p) => p._id !== activeId);
      setPipelines(remaining);
      setBoard(null);
      setActiveId(remaining[0]?._id ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete pipeline");
    }
  }

  if (loading) {
    return <p className="p-6 text-sm text-slate-500">Loading…</p>;
  }

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col">
      {/* Two groups in one bar: what board you are looking at on the left, what
          you are doing to it on the right. Delete pipeline is pushed away from
          Import — it is the only destructive control here and should not sit
          next to the one that adds rows. */}
      <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 bg-white px-4 py-3">
        <div className="flex items-center gap-2">
          <select
            value={activeId ?? ""}
            onChange={(e) => selectPipeline(e.target.value)}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
          >
            {pipelines.length === 0 && <option value="">No pipelines yet</option>}
            {pipelines.map((p) => (
              <option key={p._id} value={p._id}>
                {p.name}
              </option>
            ))}
          </select>

          <button
            onClick={createPipeline}
            className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800"
          >
            + New pipeline
          </button>
        </div>

        {board && (
          <>
            <div className="ml-auto flex flex-wrap items-center gap-2">
              <ContactSearch
                value={filter.search}
                onChange={(search) => setFilter((f) => ({ ...f, search }))}
                className="w-56"
              />
              <FilterButton
                filter={filter}
                onChange={setFilter}
                pipelines={pipelines}
                stages={stages}
                // The board already is one pipeline; a pipeline filter here
                // would only be a way to empty the screen.
                scopePipeline
              />
              <button
                onClick={runExport}
                disabled={visibleRows.length === 0}
                title="Export the cards currently shown"
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm hover:bg-slate-50 disabled:opacity-50"
              >
                <Icon.Download width={15} height={15} />
                Export CSV
              </button>
              <button
                onClick={() => setImporting(true)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm hover:bg-slate-50"
              >
                <Icon.Upload width={15} height={15} />
                Import CSV
              </button>
            </div>

            <div className="ml-4 border-l border-slate-200 pl-4">
              <button
                onClick={deletePipeline}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50"
              >
                Delete pipeline
              </button>
            </div>
          </>
        )}
      </div>

      {(error || notice || filtering) && (
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 bg-white px-4 py-2">
          {filtering && (
            <>
              <FilterChips
                filter={filter}
                onChange={setFilter}
                pipelines={pipelines}
                stages={stages}
              />
              <span className="text-xs text-slate-500">
                {visibleRows.length.toLocaleString()} card
                {visibleRows.length === 1 ? "" : "s"} shown — drag is off until you
                clear the filter.
              </span>
            </>
          )}
          {error && <span className="text-sm text-red-600">{error}</span>}
          {notice && <span className="text-sm text-emerald-700">{notice}</span>}
        </div>
      )}

      {!activeId && <NoPipelines onCreate={createPipeline} />}

      {activeId && board && (
        <Board
          board={board}
          setBoard={setBoard}
          reload={() => loadBoard(activeId)}
          onError={setError}
          automation={automation}
          reloadAutomation={loadAutomation}
          filter={filter}
          filtering={filtering}
        />
      )}

      {importing && board && (
        <ImportDialog
          pipelines={pipelines}
          lockedPipelineId={board.pipeline._id}
          onClose={() => setImporting(false)}
          onDone={async () => {
            setImporting(false);
            await loadBoard(board.pipeline._id);
            await loadAutomation();
          }}
        />
      )}
    </div>
  );
}

/** Empty state for a workspace with no pipeline.
 *
 *  The previous version was one line of grey text centred in a full-height dark
 *  area, which reads as broken rather than empty. The height is capped rather
 *  than stretched to the viewport, and ghost columns sit behind the card so the
 *  shape of a pipeline is legible before one exists. */
function NoPipelines({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="relative mx-4 mb-6 overflow-hidden rounded-xl border border-dashed border-slate-300">
      {/* Ghost columns: decoration that explains the layout, so aria-hidden. */}
      <div aria-hidden="true" className="flex gap-3 p-4 opacity-40">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="w-72 shrink-0 rounded-xl bg-slate-100" style={{ height: 150 }}>
            <div className="h-1 rounded-t-xl bg-slate-300" />
            <div className="space-y-2 p-2">
              <div className="h-8 rounded-lg bg-white" />
              <div className="h-8 rounded-lg bg-white" />
            </div>
          </div>
        ))}
      </div>

      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div className="max-w-sm rounded-xl border border-slate-200 bg-white p-6 text-center shadow-sm">
          <span className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
            <Icon.Board />
          </span>
          <p className="text-base font-semibold">No pipelines yet</p>
          <p className="mx-auto mt-1 max-w-xs text-sm text-slate-500">
            A pipeline is a set of stages your contacts move through, from first
            contact to closed.
          </p>
          <button
            onClick={onCreate}
            className="mt-4 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Create pipeline
          </button>
        </div>
      </div>
    </div>
  );
}

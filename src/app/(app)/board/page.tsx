"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { BoardResponse, Pipeline } from "@/lib/types";
import { Board } from "@/components/Board";
import { Icon } from "@/components/icons";

export default function BoardPage() {
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [board, setBoard] = useState<BoardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

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

  async function createPipeline() {
    const name = window.prompt("Pipeline name");
    if (!name?.trim()) return;
    try {
      const created = await api<Pipeline>("/pipelines", {
        method: "POST",
        body: { name: name.trim() },
      });
      setPipelines((prev) => [...prev, created]);
      setActiveId(created._id);
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
      <div className="flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-3">
        <select
          value={activeId ?? ""}
          onChange={(e) => setActiveId(e.target.value)}
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

        {board && (
          <button
            onClick={deletePipeline}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50"
          >
            Delete pipeline
          </button>
        )}

        {error && <span className="text-sm text-red-600">{error}</span>}
      </div>

      {!activeId && <NoPipelines onCreate={createPipeline} />}

      {activeId && board && (
        <Board
          board={board}
          setBoard={setBoard}
          reload={() => loadBoard(activeId)}
          onError={setError}
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

"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { BoardResponse, Pipeline } from "@/lib/types";
import { Board } from "@/components/Board";

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

      {!activeId && (
        <div className="flex flex-1 items-center justify-center text-sm text-slate-500">
          Create a pipeline to get started.
        </div>
      )}

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

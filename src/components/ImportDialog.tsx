"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { mapRows, parseCSV, type ParseResult } from "@/lib/csv";
import type { ImportResult, Pipeline, Stage } from "@/lib/types";

interface Props {
  pipelines: Pipeline[];
  onClose: () => void;
  onDone: () => void;
}

// Rows are uploaded in batches so we can show real progress and stay under the
// server's per-request cap. The overall file cap is generous because batching
// keeps each request small.
const MAX_ROWS = 50000;
const BATCH_SIZE = 200;

interface Progress {
  done: number;
  total: number;
  created: number;
  skipped: number;
  failed: number;
}

export function ImportDialog({ pipelines, onClose, onDone }: Props) {
  const [pipelineId, setPipelineId] = useState(pipelines[0]?._id ?? "");
  const [stages, setStages] = useState<Stage[]>([]);
  const [stageId, setStageId] = useState("");

  const [parsed, setParsed] = useState<ParseResult | null>(null);
  const [fileName, setFileName] = useState("");

  // Defaults to false on purpose: importing 500 rows with automation on would
  // fire 500 Day-1 emails. It has to be a deliberate choice.
  const [startAutomation, setStartAutomation] = useState(false);

  const [result, setResult] = useState<ImportResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [error, setError] = useState("");

  // Set when the user asks to stop; the batch loop checks it between batches.
  const cancelledRef = useRef(false);

  useEffect(() => {
    if (!pipelineId) return;
    api<Stage[]>(`/pipelines/${pipelineId}/stages`)
      .then((list) => {
        setStages(list);
        setStageId(list[0]?._id ?? "");
      })
      .catch(() => {});
  }, [pipelineId]);

  async function onFile(file: File) {
    setFileName(file.name);
    setError("");
    setResult(null);
    try {
      // Parsing happens here in the browser; the server only ever sees JSON rows.
      const text = await file.text();
      setParsed(mapRows(parseCSV(text)));
    } catch {
      setError("Could not read that file");
    }
  }

  async function submit() {
    if (!parsed?.rows.length || !stageId) return;
    if (parsed.rows.length > MAX_ROWS) {
      setError(`That file has ${parsed.rows.length} rows; the limit is ${MAX_ROWS}.`);
      return;
    }

    const rows = parsed.rows;
    const total = rows.length;

    setBusy(true);
    setError("");
    cancelledRef.current = false;

    // Running totals across batches. The server dedupes each batch against what's
    // already in the pipeline, so counts stay correct as we go.
    const acc = { created: 0, skipped: 0, failed: 0, errors: [] as ImportResult["errors"] };
    setProgress({ done: 0, total, created: 0, skipped: 0, failed: 0 });

    try {
      for (let start = 0; start < total; start += BATCH_SIZE) {
        if (cancelledRef.current) break;

        const chunk = rows.slice(start, start + BATCH_SIZE);
        const res = await api<ImportResult>("/contacts/import", {
          method: "POST",
          body: { pipelineId, stageId, rows: chunk, startAutomation },
        });

        acc.created += res.created;
        acc.skipped += res.skipped;
        acc.failed += res.failed;
        // The server numbers rows within each batch; shift them back to the row
        // number in the original file so the error list stays meaningful.
        acc.errors.push(...res.errors.map((e) => ({ row: e.row + start, message: e.message })));

        setProgress({
          done: Math.min(start + chunk.length, total),
          total,
          created: acc.created,
          skipped: acc.skipped,
          failed: acc.failed,
        });
      }

      setResult({
        created: acc.created,
        skipped: acc.skipped,
        failed: acc.failed,
        errors: acc.errors,
      });
    } catch (e) {
      setError(
        (e instanceof Error ? e.message : "Import failed") +
          ` (imported ${acc.created} before the error)`,
      );
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-5 shadow-xl">
        <h2 className="mb-3 text-base font-semibold">Import contacts from CSV</h2>

        {result ? (
          <div className="space-y-3">
            <div className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
              Created {result.created} · Skipped {result.skipped} (duplicate email) ·
              Failed {result.failed}
            </div>

            {result.errors.length > 0 && (
              <div className="max-h-40 overflow-y-auto rounded-lg border border-slate-200 text-sm">
                {result.errors.map((e) => (
                  <p key={e.row} className="border-b border-slate-100 px-3 py-1.5 last:border-0">
                    <span className="font-medium">Row {e.row}:</span> {e.message}
                  </p>
                ))}
              </div>
            )}

            <button
              onClick={onDone}
              className="w-full rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800"
            >
              Done
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-sm font-medium">Pipeline</label>
                <select
                  value={pipelineId}
                  onChange={(e) => setPipelineId(e.target.value)}
                  className="input"
                >
                  {pipelines.map((p) => (
                    <option key={p._id} value={p._id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium">Stage</label>
                <select
                  value={stageId}
                  onChange={(e) => setStageId(e.target.value)}
                  className="input"
                >
                  {stages.map((s) => (
                    <option key={s._id} value={s._id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium">CSV file</label>
              <input
                type="file"
                accept=".csv,text/csv"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) onFile(f);
                }}
                className="text-sm"
              />
              <p className="mt-1 text-xs text-slate-500">
                Needs a <code>name</code> column. <code>phone</code>,{" "}
                <code>email</code>, and <code>value</code> are optional.
              </p>
            </div>

            {parsed && (
              <div className="rounded-lg bg-slate-50 px-3 py-2 text-sm">
                <p className="font-medium">{fileName}</p>
                <p className="text-slate-600">
                  {parsed.rows.length} row(s) ready
                  {parsed.duplicatesInFile > 0 &&
                    ` · ${parsed.duplicatesInFile} duplicate(s) in file skipped`}
                  {parsed.errors.length > 0 && ` · ${parsed.errors.length} row(s) with problems`}
                </p>

                {parsed.errors.length > 0 && (
                  <div className="mt-1 max-h-24 overflow-y-auto text-xs text-red-700">
                    {parsed.errors.map((e) => (
                      <p key={e.row}>
                        Row {e.row}: {e.message}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            )}

            <label className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3">
              <input
                type="checkbox"
                checked={startAutomation}
                onChange={(e) => setStartAutomation(e.target.checked)}
                className="mt-0.5"
              />
              <span className="text-sm">
                <span className="font-medium">Start email automation for imported contacts</span>
                <span className="mt-0.5 block text-xs text-amber-800">
                  Off by default. Turning this on sends the stage&apos;s Day 1 email
                  to every imported contact immediately — {parsed?.rows.length ?? 0}{" "}
                  email(s).
                </span>
              </span>
            </label>

            {error && (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
            )}

            {/* Live progress while batches upload. */}
            {progress && (
              <div className="space-y-1.5 rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium">
                    Importing… {progress.done.toLocaleString()} of{" "}
                    {progress.total.toLocaleString()} rows
                  </span>
                  <span className="text-slate-500">
                    {Math.round((progress.done / progress.total) * 100)}%
                  </span>
                </div>
                <div
                  className="h-2 w-full overflow-hidden rounded-full bg-slate-200"
                  role="progressbar"
                  aria-valuenow={progress.done}
                  aria-valuemin={0}
                  aria-valuemax={progress.total}
                >
                  <div
                    className="h-full rounded-full bg-blue-600 transition-all duration-200"
                    style={{ width: `${(progress.done / progress.total) * 100}%` }}
                  />
                </div>
                <p className="text-xs text-slate-500">
                  Created {progress.created.toLocaleString()} · Skipped{" "}
                  {progress.skipped.toLocaleString()} · Failed {progress.failed.toLocaleString()}
                </p>
              </div>
            )}

            <div className="flex justify-end gap-2">
              {busy ? (
                <button
                  onClick={() => {
                    cancelledRef.current = true;
                  }}
                  className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50"
                >
                  Stop
                </button>
              ) : (
                <button
                  onClick={onClose}
                  className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50"
                >
                  Cancel
                </button>
              )}
              <button
                onClick={submit}
                disabled={busy || !parsed?.rows.length || !stageId}
                className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
              >
                {busy ? "Importing…" : `Import ${parsed?.rows.length ?? 0} contact(s)`}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

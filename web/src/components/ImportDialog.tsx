"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/api";
import {
  detectMapping,
  mapRows,
  parseCSV,
  UNMAPPED,
  type ColumnMapping,
  type ParseResult,
} from "@/lib/csv";
import type { ImportResult, Pipeline, Stage } from "@/lib/types";

interface Props {
  pipelines: Pipeline[];
  onClose: () => void;
  onDone: () => void;
  /**
   * Fixes the target pipeline, for the board — it is already showing one, and
   * importing into a different one from there would be a surprise.
   */
  lockedPipelineId?: string;
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

export function ImportDialog({ pipelines, onClose, onDone, lockedPipelineId }: Props) {
  const [pipelineId, setPipelineId] = useState(
    lockedPipelineId ?? pipelines[0]?._id ?? "",
  );
  const [stages, setStages] = useState<Stage[]>([]);
  const [stageId, setStageId] = useState("");

  const [parsed, setParsed] = useState<ParseResult | null>(null);
  const [fileName, setFileName] = useState("");
  /*
   * The raw grid and the column mapping are kept so the mapping can be changed
   * after the file is read.
   *
   * This is what makes an export from another product importable at all. The
   * previous version guessed the columns from the header and refused the file
   * when it guessed wrong — which, for somebody migrating off a competitor, is
   * where the migration stopped.
   */
  const [grid, setGrid] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<ColumnMapping | null>(null);
  // Highlights the drop target while a file is over it, so the box confirms it
  // will accept the drop before the mouse is released.
  const [dragging, setDragging] = useState(false);

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
      const rows = parseCSV(text);
      const detected = detectMapping(rows[0] ?? []);
      setGrid(rows);
      setMapping(detected);
      setParsed(mapRows(rows, detected));
    } catch {
      setError("Could not read that file");
    }
  }

  /*
   * Re-reads the file whenever the mapping changes, so the counts, the errors
   * and the duplicate tally shown below always describe the mapping on screen
   * rather than the one it was opened with.
   */
  function remap(next: ColumnMapping) {
    setMapping(next);
    setParsed(mapRows(grid, next));
  }

  /** The file's own header labels, for the mapping dropdowns. */
  const headers = useMemo(
    () => (grid[0] ?? []).map((h, i) => h.trim() || `Column ${i + 1}`),
    [grid],
  );

  /*
   * Columns the mapping does not use.
   *
   * Named rather than ignored in silence: an export carries things this product
   * has nowhere to put, and somebody migrating needs to know what is being left
   * behind before they delete the file they exported from.
   */
  const ignoredColumns = useMemo(() => {
    if (!mapping) return [];
    const used = new Set(Object.values(mapping).filter((i) => i !== UNMAPPED));
    return headers.filter((_, i) => !used.has(i));
  }, [headers, mapping]);

  /**
   * Stage names from the file, matched to this pipeline's stages.
   *
   * Case- and space-insensitive, because the Stage column is usually hand-edited
   * in a spreadsheet: "qualified " and "Qualified" are the same stage to
   * everyone except a strict comparison.
   */
  const stageByName = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of stages) map.set(s.name.trim().toLowerCase(), s._id);
    return map;
  }, [stages]);

  /** Rows whose Stage cell names no stage of this pipeline. */
  const unmatchedStages = useMemo(() => {
    if (!parsed?.hasStageColumn) return [];
    const missing = new Set<string>();
    for (const r of parsed.rows) {
      const key = r.stageName?.trim().toLowerCase();
      if (key && !stageByName.has(key)) missing.add(r.stageName!.trim());
    }
    return [...missing];
  }, [parsed, stageByName]);

  async function submit() {
    if (!parsed?.rows.length || !stageId) return;
    if (parsed.rows.length > MAX_ROWS) {
      setError(`That file has ${parsed.rows.length} rows; the limit is ${MAX_ROWS}.`);
      return;
    }

    // Each row carries its own stage where the file named one this pipeline has.
    // Everything else is left to the default stage chosen above, which is what
    // the server falls back to.
    const rows = parsed.rows.map((r) => {
      const resolved = r.stageName ? stageByName.get(r.stageName.trim().toLowerCase()) : undefined;
      return resolved ? { ...r, stageId: resolved } : r;
    });
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
              Created {result.created} · Skipped {result.skipped} (duplicate
              email or phone) · Failed {result.failed}
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
                {lockedPipelineId ? (
                  <p className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-sm text-slate-700">
                    {pipelines.find((p) => p._id === lockedPipelineId)?.name ?? "This pipeline"}
                  </p>
                ) : (
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
                )}
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium">
                  {parsed?.hasStageColumn ? "Default stage" : "Stage"}
                </label>
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
                {parsed?.hasStageColumn && (
                  <p className="mt-1 text-xs text-slate-500">
                    Used only for rows whose Stage column is blank or unrecognised.
                  </p>
                )}
              </div>
            </div>

            <div>
              {/* A heading, not a second label: the box below already labels
                  the input, and two labels on one control get announced
                  together as one run-on name. */}
              <p className="mb-1 text-sm font-medium">CSV file</p>

              {/*
                A bordered target rather than a bare file input.

                The native control renders a small "Choose File" button with no
                boundary around it, sitting in whitespace — so the one thing
                this dialog needs somebody to do was the hardest thing on it to
                find. The whole box is now the control: it is a label wrapping
                the input, so clicking anywhere in it opens the picker with no
                JavaScript involved, and dropping a file on it works too since
                a box this shape invites that.

                The input stays in the DOM and only visually hidden, so it keeps
                its keyboard focus and its accessible name. focus-within puts
                the ring on the box, because the element being focused is the
                one nobody can see.
              */}
              <label
                htmlFor="import-file"
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragging(false);
                  const f = e.dataTransfer.files?.[0];
                  if (f) onFile(f);
                }}
                className={`flex cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed px-4 py-5 text-center transition-colors focus-within:border-blue-500 focus-within:ring-[3px] focus-within:ring-blue-500/20 ${
                  dragging
                    ? "border-blue-500 bg-blue-50"
                    : fileName
                      ? "border-emerald-300 bg-emerald-50/40 hover:border-emerald-400"
                      : "border-slate-300 bg-slate-50 hover:border-slate-400 hover:bg-slate-100"
                }`}
              >
                <input
                  id="import-file"
                  type="file"
                  accept=".csv,text/csv"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) onFile(f);
                  }}
                  className="sr-only"
                />

                {fileName ? (
                  <>
                    <span className="text-sm font-medium text-emerald-800">
                      ✓ {fileName}
                    </span>
                    <span className="text-xs text-slate-500">
                      Click to choose a different file
                    </span>
                  </>
                ) : (
                  <>
                    <span className="text-sm font-medium text-slate-700">
                      Click to choose a CSV file
                    </span>
                    <span className="text-xs text-slate-500">or drag one here</span>
                  </>
                )}
              </label>

              <p className="mt-1.5 text-xs text-slate-500">
                A CSV exported from any CRM or WhatsApp tool. Columns are matched
                automatically where the names are recognisable, and you can
                correct them below.
              </p>
            </div>

            {/* Column mapping. Shown as soon as a file is read, because the one
                thing somebody migrating needs is to see that their columns were
                understood — and to fix it when they were not. */}
            {mapping && headers.length > 0 && (
              <div className="rounded-lg border border-slate-200 p-3">
                <p className="mb-2 text-sm font-medium">Match your columns</p>
                <div className="space-y-2">
                  {(
                    [
                      ["name", "Name", true],
                      ["lastName", "Last name", false],
                      ["phone", "Phone", false],
                      ["email", "Email", false],
                      ["value", "Value", false],
                      ["stage", "Stage", false],
                    ] as [keyof ColumnMapping, string, boolean][]
                  ).map(([field, label, required]) => (
                    <div key={field} className="flex items-center gap-2">
                      <label className="w-24 shrink-0 text-sm text-slate-600">
                        {label}
                        {required && <span className="text-rose-500"> *</span>}
                      </label>
                      <select
                        value={mapping[field]}
                        onChange={(e) =>
                          remap({ ...mapping, [field]: Number(e.target.value) })
                        }
                        className="input min-w-0 flex-1"
                      >
                        <option value={UNMAPPED}>
                          {field === "name" ? "— choose a column —" : "— not imported —"}
                        </option>
                        {headers.map((h, i) => (
                          <option key={i} value={i}>
                            {h}
                          </option>
                        ))}
                      </select>
                      {/* The first data row, so the choice can be checked
                          against real content rather than a header name. */}
                      {mapping[field] !== UNMAPPED && grid[1] && (
                        <span
                          className="w-28 shrink-0 truncate text-xs text-slate-400"
                          title={grid[1][mapping[field]] ?? ""}
                        >
                          {grid[1][mapping[field]] || "—"}
                        </span>
                      )}
                    </div>
                  ))}
                </div>

                <p className="mt-2 text-xs text-slate-500">
                  Last name is joined onto the name, so an export that splits them
                  imports as one contact.
                </p>

                {ignoredColumns.length > 0 && (
                  <p className="mt-1.5 text-xs text-amber-700">
                    Not imported: {ignoredColumns.join(", ")}. This product has
                    nowhere to put them yet.
                  </p>
                )}
              </div>
            )}

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

            {unmatchedStages.length > 0 && (
              // Named explicitly rather than counted, because the usual cause is
              // a renamed stage or a typo, and both are fixable in seconds once
              // you can see which word did not match.
              <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                No stage in this pipeline is called{" "}
                <span className="font-medium">{unmatchedStages.join(", ")}</span>.
                Rows with those stages go to{" "}
                <span className="font-medium">
                  {stages.find((s) => s._id === stageId)?.name ?? "the default stage"}
                </span>
                .
              </p>
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

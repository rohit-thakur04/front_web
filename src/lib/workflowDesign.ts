import type { Workflow } from "./types";

/** JSON with object keys sorted, so key order never reads as a change. */
export function stableStringify(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(",")}]`;
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o)
      .filter((k) => o[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stableStringify(o[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(v ?? null);
}

/**
 * The part of a workflow a save changes, as a comparable string. The builder
 * is "unsaved" only when this differs from the last saved copy.
 */
export function designOf(wf: Workflow): string {
  const s = wf.settings;
  return stableStringify({
    name: wf.name,
    trigger: wf.trigger,
    triggerConfig: wf.triggerConfig ?? {},
    steps: wf.steps ?? [],
    settings: {
      timeZone: s?.timeZone ?? "",
      allowReentry: s?.allowReentry ?? false,
      reentryWaitHours: s?.reentryWaitHours ?? 0,
      enableAt: s?.enableAt ?? null,
      disableAt: s?.disableAt ?? null,
    },
    exitGoals: wf.exitGoals ?? [],
  });
}

export function downloadJSON(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ApiError, api } from "@/lib/api";
import type {
  CatalogItem,
  CustomField,
  EmailTemplate,
  ExitGoal,
  Form,
  MetaPageForms,
  Pipeline,
  PublishProblem,
  Stage,
  User,
  WabaTemplate,
  WebhookCapture,
  Workflow,
  WorkflowCatalog,
  WorkflowSettings,
  WorkflowStep,
  WorkflowVersion,
} from "@/lib/types";
import { CatalogPicker } from "@/components/workflow/CatalogPicker";
import { RunAnalytics, RunLogs } from "@/components/logs/RunLogs";
import { Toggle } from "@/components/ui";
import { designOf, downloadJSON } from "@/lib/workflowDesign";
import {
  ROOT,
  insertIntoContainer,
  containerId,
  findStep,
  removeStep,
  updateStep,
} from "@/lib/workflowTree";

function genId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return "s_" + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

type Tab = "builder" | "settings" | "logs" | "analytics";

export default function WorkflowBuilderPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [wf, setWf] = useState<Workflow | null>(null);
  const [catalog, setCatalog] = useState<WorkflowCatalog | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  /*
   * "Unsaved" is a comparison with what was last saved, not a flag set by
   * every edit. Opening a step and closing it, or picking the value a field
   * already had, used to mark the workflow unsaved and offer to republish it.
   */
  const [savedDesign, setSavedDesign] = useState("");
  const dirty = wf ? designOf(wf) !== savedDesign : false;
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<Tab>("builder");
  const [menuOpen, setMenuOpen] = useState(false);
  const [showVersions, setShowVersions] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [customFields, setCustomFields] = useState<CustomField[]>([]);
  // The owner's saved email templates, for the Send Email step's picker.
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);

  // Picker: either choosing the trigger, or adding a step to a container.
  const [picker, setPicker] = useState<{
    mode: "trigger" | "step";
    container?: string;
    /** Position within the container. Undefined appends, as it always did. */
    index?: number;
  } | null>(
    null,
  );
  // Config panel selection: the trigger, or a step by id.
  const [selected, setSelected] = useState<{ kind: "trigger" | "step"; id?: string } | null>(null);
  /*
   * What the trigger and the actions need to offer a choice.
   *
   * A workflow is built out of this account's own forms, pipelines and stages,
   * and without them the builder can only offer free-text ids — which is what
   * made it feel like a developer tool rather than a product.
   */
  const [forms, setForms] = useState<Form[]>([]);
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [stages, setStages] = useState<Stage[]>([]);
  /*
   * The team, for the Assign and Notify steps.
   *
   * /staff is client-only, so a staff member building a workflow gets a 403
   * here. That is correct — they cannot manage the team — and it must not stop
   * them editing anything else, so the list simply comes back empty and those
   * two steps say why.
   */
  const [staff, setStaff] = useState<User[]>([]);

  useEffect(() => {
    async function run() {
      try {
        const [w, c] = await Promise.all([
          api<Workflow>(`/workflows/${id}`),
          api<WorkflowCatalog>("/workflows/catalog"),
        ]);
        setWf(w);
        setSavedDesign(designOf(w));
        setCatalog(c);
        api<CustomField[]>("/custom-fields").then(setCustomFields).catch(() => setCustomFields([]));
        // Templates are a nice-to-have for the Send Email picker; a missing
        // "email" feature shouldn't break the builder.
        try {
          setTemplates(await api<EmailTemplate[]>("/templates"));
        } catch {
          setTemplates([]);
        }
        /*
         * Each in its own try: a plan without forms must not stop somebody
         * configuring a stage move, and the builder has to open even when one
         * of these is unavailable.
         */
        try {
          setForms(await api<Form[]>("/forms"));
        } catch {
          setForms([]);
        }
        try {
          setStaff(await api<User[]>("/staff"));
        } catch {
          setStaff([]);
        }
        try {
          const list = await api<Pipeline[]>("/pipelines");
          setPipelines(list);
          // Every stage across every pipeline, so the Move to Stage picker can
          // group them without a request per pipeline as the user browses.
          const all = await Promise.all(
            list.map((pl) =>
              api<Stage[]>(`/pipelines/${pl._id}/stages`).catch(() => [] as Stage[]),
            ),
          );
          setStages(all.flat());
        } catch {
          setPipelines([]);
          setStages([]);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not load workflow");
      } finally {
        setLoading(false);
      }
    }
    run();
  }, [id]);

  // Flat lookup of catalog entries, for labels/icons on nodes.
  const itemByKey = useMemo(() => {
    const m: Record<string, CatalogItem> = {};
    if (catalog) {
      for (const groups of [catalog.triggers, catalog.actions, catalog.conditions]) {
        for (const g of groups) for (const it of g.items) m[it.key] = it;
      }
    }
    return m;
  }, [catalog]);

  function patch(next: Partial<Workflow>) {
    setWf((prev) => (prev ? { ...prev, ...next } : prev));
  }

  // Closing the tab with unsaved changes asks first.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menuOpen) return;
    const close = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [menuOpen]);

  async function clone() {
    setMenuOpen(false);
    try {
      const copy = await api<Workflow>(`/workflows/${id}/clone`, { method: "POST" });
      router.push(`/workflows/${copy._id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not copy the workflow");
    }
  }

  function exportJSON() {
    setMenuOpen(false);
    if (!wf) return;
    const { name, trigger, triggerConfig, steps, settings, exitGoals } = wf;
    downloadJSON(`${name.replace(/[^\w-]+/g, "_") || "workflow"}.json`, {
      name, trigger, triggerConfig, steps, settings, exitGoals,
    });
  }

  function onPick(item: CatalogItem) {
    if (!wf || !picker) return;
    if (picker.mode === "trigger") {
      patch({ trigger: item.key, triggerConfig: {} });
      setSelected({ kind: "trigger" });
    } else {
      const step: WorkflowStep = {
        id: genId(),
        kind: item.kind ?? "action",
        type: item.key,
        label: item.label,
        config: {},
        // Only forking steps (If/Else) get Yes/No branches.
        ...(item.branches ? { yes: [], no: [] } : {}),
      };
      patch({
        steps: insertIntoContainer(wf.steps, picker.container ?? ROOT, step, picker.index),
      });
      setSelected({ kind: "step", id: step.id });
    }
    setPicker(null);
  }

  function clearTrigger() {
    patch({ trigger: "", triggerConfig: {} });
    if (selected?.kind === "trigger") setSelected(null);
  }

  function deleteStep(stepId: string) {
    if (!wf) return;
    patch({ steps: removeStep(wf.steps, stepId) });
    if (selected?.kind === "step" && selected.id === stepId) setSelected(null);
  }

  function editStep(stepId: string, p: Partial<WorkflowStep>) {
    if (!wf) return;
    patch({ steps: updateStep(wf.steps, stepId, p) });
  }

  // Delete / Backspace removes the selected trigger or step — but only when
  // you're not typing in a form field (label, subject, dropdown, etc.).
  useEffect(() => {
    if (!selected) return;
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Delete" && e.key !== "Backspace") return;
      const el = document.activeElement as HTMLElement | null;
      if (
        el &&
        (el.tagName === "INPUT" ||
          el.tagName === "TEXTAREA" ||
          el.tagName === "SELECT" ||
          el.isContentEditable)
      ) {
        return;
      }
      e.preventDefault();
      if (!selected) return;
      if (selected.kind === "trigger") {
        setWf((prev) => (prev ? { ...prev, trigger: "", triggerConfig: {} } : prev));
        setSelected(null);
      } else if (selected.kind === "step" && selected.id) {
        const sid = selected.id;
        setWf((prev) => (prev ? { ...prev, steps: removeStep(prev.steps, sid) } : prev));
        setSelected(null);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected]);

  // Why a publish was refused, listed under the top bar until it is fixed.
  const [blockers, setBlockers] = useState<PublishProblem[]>([]);

  async function save(nextStatus?: "draft" | "published"): Promise<boolean> {
    if (!wf) return false;
    setSaving(true);
    setError("");
    setNotice("");
    setBlockers([]);
    const goingLive = (nextStatus ?? wf.status) === "published";
    try {
      const body = {
        name: wf.name,
        status: nextStatus ?? wf.status,
        trigger: wf.trigger,
        triggerConfig: wf.triggerConfig,
        steps: wf.steps,
        settings: wf.settings ?? DEFAULT_SETTINGS,
        exitGoals: wf.exitGoals ?? [],
      };
      const saved = await api<Workflow>(`/workflows/${id}`, { method: "PUT", body });
      setWf(saved);
      setSavedDesign(designOf(saved));
      /*
       * Asked once, at publish: a drip that waits more than two days with no
       * exit goal keeps messaging people who already bought or replied.
       */
      if (goingLive && totalWaitHours(saved.steps) > 48 && (saved.exitGoals ?? []).length === 0) {
        setNotice(
          "This workflow waits more than 2 days. Add an exit goal in Settings (for example, tagged Purchased) so it stops for people who are done.",
        );
      }
      return true;
    } catch (e) {
      // 422 is the pre-flight refusal: the server lists what is unconfigured
      // rather than publishing something that would silently do nothing.
      if (e instanceof ApiError && e.status === 422 && Array.isArray(e.detail?.problems)) {
        setBlockers(e.detail.problems as PublishProblem[]);
      }
      setError(e instanceof Error ? e.message : "Could not save");
      return false;
    } finally {
      setSaving(false);
    }
  }

  function leave() {
    if (dirty) setLeaving(true);
    else router.push("/workflows");
  }

  if (loading) return <p className="p-6 text-sm text-slate-500">Loading…</p>;
  if (!wf || !catalog) return <p className="p-6 text-sm text-rose-600">{error || "Not found"}</p>;

  const triggerItem = wf.trigger ? itemByKey[wf.trigger] : null;
  const selectedStep =
    selected?.kind === "step" && selected.id ? findStep(wf.steps, selected.id) : null;

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col">
      {/* Top bar */}
      <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 bg-white px-4 py-2.5">
        <button onClick={leave} aria-label="Back to workflows" className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100">
          ←
        </button>
        <input
          value={wf.name}
          onChange={(e) => patch({ name: e.target.value })}
          aria-label="Workflow name"
          className="max-w-xs rounded-lg border border-transparent px-2 py-1 text-lg font-semibold hover:border-slate-200 focus:border-slate-300 focus:outline-none"
        />
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-medium ${
            wf.status === "published" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"
          }`}
        >
          {wf.status === "published" ? "Live" : wf.status === "paused" ? "Paused" : "Draft"}
        </span>
        <span className="text-xs text-slate-400" title="Every save is kept in Version history">
          v{wf.version ?? 1} · {countSteps(wf.steps)} step{countSteps(wf.steps) === 1 ? "" : "s"}
          {(wf.exitGoals ?? []).length > 0 && ` · ${(wf.exitGoals ?? []).length} exit goal${(wf.exitGoals ?? []).length === 1 ? "" : "s"}`}
        </span>
        {dirty && <span className="text-xs font-medium text-amber-600">Unsaved changes</span>}

        <div className="ml-auto flex items-center gap-2">
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setMenuOpen((o) => !o)}
              aria-expanded={menuOpen}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50"
            >
              More ▾
            </button>
            {menuOpen && (
              <div role="menu" className="ark-pop absolute right-0 z-30 mt-1 w-52 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-xl">
                <MenuItem onClick={() => { setMenuOpen(false); setShowVersions(true); }}>Version history</MenuItem>
                <MenuItem onClick={clone}>Make a copy</MenuItem>
                <MenuItem onClick={exportJSON}>Export as file</MenuItem>
              </div>
            )}
          </div>
          <button
            onClick={() => save(wf.status === "published" ? "draft" : "published")}
            disabled={saving}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50 disabled:opacity-50"
          >
            {wf.status === "published" ? "Unpublish" : "Publish"}
          </button>
          <button
            onClick={() => save()}
            disabled={saving || !dirty}
            title={wf.status === "published" ? "Saving a live workflow updates it straight away" : undefined}
            className="rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? "Saving…" : wf.status === "published" ? "Save & update live" : "Save"}
          </button>
        </div>
      </div>

      <nav className="flex gap-1 border-b border-slate-200 bg-white px-4" aria-label="Workflow sections">
        {(
          [
            ["builder", "Builder"],
            ["settings", "Settings"],
            ["logs", "Execution logs"],
            ["analytics", "Analytics"],
          ] as [Tab, string][]
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            aria-current={tab === key ? "page" : undefined}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${
              tab === key ? "border-[var(--ark-primary)] text-slate-900" : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            {label}
            {key === "settings" && (wf.exitGoals ?? []).length === 0 && totalWaitHours(wf.steps) > 48 && (
              <span className="ml-1 text-amber-600" title="No exit goal on a long workflow">●</span>
            )}
          </button>
        ))}
      </nav>

      {error && blockers.length === 0 && (
        <p className="border-b border-rose-100 bg-rose-50 px-4 py-2 text-sm text-rose-700">{error}</p>
      )}
      {notice && (
        <p className="flex items-center gap-2 border-b border-amber-100 bg-amber-50 px-4 py-2 text-sm text-amber-800">
          {notice}
          <button className="underline" onClick={() => { setTab("settings"); setNotice(""); }}>Add one</button>
        </p>
      )}

      {/* Shown instead of the generic error when the publish was refused: the
          whole point is the list, not the sentence. Every problem appears at
          once, because fixing them one publish attempt at a time is the slow
          way to learn the same thing. */}
      {blockers.length > 0 && (
        <div className="border-b border-amber-200 bg-amber-50 px-4 py-2.5">
          <div className="flex items-start gap-2">
            <span aria-hidden="true" className="mt-0.5 text-amber-600">▲</span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-amber-900">
                Not published — {blockers.length} thing
                {blockers.length === 1 ? "" : "s"} to fix first
              </p>
              <ul className="mt-1 space-y-0.5">
                {blockers.map((b, i) => (
                  <li key={b.stepId || i} className="text-sm text-amber-800">
                    {b.label && <span className="font-medium">{b.label}: </span>}
                    {b.reason}
                  </li>
                ))}
              </ul>
              <p className="mt-1 text-xs text-amber-700">
                Your changes were not saved. Fix these and publish again, or press
                Save to keep it as a draft.
              </p>
            </div>
            <button
              onClick={() => setBlockers([])}
              aria-label="Dismiss"
              title="Dismiss"
              className="rounded p-1 text-amber-500 hover:bg-amber-100 hover:text-amber-800"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {tab === "settings" && (
        <div className="flex-1 overflow-auto bg-slate-50 p-6">
          <WorkflowSettingsPanel
            settings={wf.settings ?? DEFAULT_SETTINGS}
            goals={wf.exitGoals ?? []}
            customFields={customFields}
            onSettings={(s) => patch({ settings: s })}
            onGoals={(g) => patch({ exitGoals: g })}
          />
        </div>
      )}
      {tab === "logs" && (
        <div className="flex-1 overflow-auto bg-slate-50 p-6">
          <RunLogs workflowId={id} />
        </div>
      )}
      {tab === "analytics" && (
        <div className="flex-1 overflow-auto bg-slate-50 p-6">
          <RunAnalytics workflowId={id} />
        </div>
      )}

      <div className={`flex flex-1 overflow-hidden ${tab === "builder" ? "" : "hidden"}`}>
        {/* Canvas */}
        <div className="flex-1 overflow-auto bg-slate-50 p-8">
          <div className="mx-auto flex w-full max-w-xl flex-col items-center">
            {/* Trigger block */}
            <div className="w-full rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                Trigger
              </p>
              {triggerItem ? (
                <div
                  className={`flex w-full items-center gap-2 rounded-lg border px-3 py-2 ${
                    selected?.kind === "trigger" ? "border-blue-300 bg-blue-50" : "border-slate-200"
                  }`}
                >
                  <button
                    onClick={() => setSelected({ kind: "trigger" })}
                    className="flex flex-1 items-center gap-2 text-left"
                  >
                    <span className="text-lg">{triggerItem.icon}</span>
                    <span className="font-medium">{triggerItem.label}</span>
                  </button>
                  <button
                    onClick={() => setPicker({ mode: "trigger" })}
                    className="rounded px-2 py-1 text-xs text-slate-400 hover:bg-white hover:text-slate-700"
                  >
                    Change
                  </button>
                  <button
                    onClick={clearTrigger}
                    className="rounded p-1 text-slate-300 hover:text-rose-600"
                    title="Remove trigger"
                  >
                    ✕
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setPicker({ mode: "trigger" })}
                  className="w-full rounded-lg border border-dashed border-slate-300 px-3 py-3 text-sm text-slate-500 hover:bg-slate-50"
                >
                  + Add a Trigger
                </button>
              )}
            </div>

            {/* Steps stay visible even without a trigger, so removing a trigger
                doesn't hide the flow you've built. */}
            <StepTree
              steps={wf.steps}
              container={ROOT}
              itemByKey={itemByKey}
              templates={templates}
              selectedId={selected?.kind === "step" ? selected.id : undefined}
              onSelect={(sid) => setSelected({ kind: "step", id: sid })}
              onDelete={deleteStep}
              onAdd={(c, index) => setPicker({ mode: "step", container: c, index })}
            />
          </div>
        </div>

        {/* Config panel */}
        {selected && (
          <div className="w-96 shrink-0 overflow-y-auto border-l border-slate-200 bg-white p-5">
            {selected.kind === "trigger" && triggerItem ? (
              <TriggerConfig
                item={triggerItem}
                config={wf.triggerConfig ?? {}}
                forms={forms}
                pipelines={pipelines}
                stages={stages}
                staff={staff}
                webhookUrl={wf.webhookUrl}
                workflowId={id}
                customFields={customFields}
                onConfig={(next) =>
                  patch({ triggerConfig: { ...(wf.triggerConfig ?? {}), ...next } })
                }
                onChangeTrigger={() => setPicker({ mode: "trigger" })}
                onRemove={clearTrigger}
                onClose={() => setSelected(null)}
              />
            ) : selectedStep ? (
              <StepConfig
                step={selectedStep}
                item={itemByKey[selectedStep.type]}
                templates={templates}
                pipelines={pipelines}
                stages={stages}
                staff={staff}
                customFields={customFields}
                onChange={(p) => editStep(selectedStep.id, p)}
                onClose={() => setSelected(null)}
              />
            ) : null}
          </div>
        )}
      </div>

      {showVersions && (
        <VersionsDrawer
          workflowId={id}
          current={wf.version ?? 1}
          dirty={dirty}
          onRestored={(w) => {
            setWf(w);
            setSavedDesign(designOf(w));
            setShowVersions(false);
          }}
          onClose={() => setShowVersions(false)}
        />
      )}

      {leaving && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div role="dialog" aria-label="Unsaved changes" className="w-full max-w-sm rounded-xl bg-white p-5 shadow-[var(--ark-shadow-overlay)]">
            <h2 className="mb-2 text-lg font-semibold">You have unsaved changes</h2>
            <p className="mb-4 text-sm text-slate-600">
              {wf.status === "published"
                ? "Saving updates the live workflow. Contacts already in it continue on the new version."
                : "Save them before leaving, or discard them."}
            </p>
            <div className="flex flex-col gap-2">
              <button
                disabled={saving}
                onClick={async () => {
                  if (await save()) router.push("/workflows");
                  else setLeaving(false);
                }}
                className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
              >
                {wf.status === "published" ? "Save and update live" : "Save and leave"}
              </button>
              <button onClick={() => router.push("/workflows")} className="rounded-lg border border-rose-300 px-3 py-2 text-sm text-rose-700 hover:bg-rose-50">
                Discard and leave
              </button>
              <button onClick={() => setLeaving(false)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50">
                Keep editing
              </button>
            </div>
          </div>
        </div>
      )}

      {picker && catalog && (
        <CatalogPicker
          title={picker.mode === "trigger" ? "Add a Trigger" : "Add an Action"}
          actions={picker.mode === "trigger" ? catalog.triggers : catalog.actions}
          conditions={picker.mode === "step" ? catalog.conditions : undefined}
          onPick={onPick}
          onClose={() => setPicker(null)}
        />
      )}
    </div>
  );
}

// --- Flow rendering -------------------------------------------------------

function Connector() {
  return <div className="my-1 h-6 w-px bg-slate-300" />;
}

/**
 * The line between two steps, with a "+" sitting on it.
 *
 * Hidden until the connector is hovered, because a workflow of a dozen steps with
 * a permanent button in every gap reads as a form rather than a sequence. Three
 * exceptions to that, all deliberate:
 *
 *  - It appears on keyboard focus, so it is reachable by tabbing rather than
 *    being a mouse-only feature.
 *  - It is always visible where the device has no hover at all, since on a phone
 *    an element that only exists on hover does not exist.
 *  - The hit area is the full width of the connector, not the 20px circle, so
 *    the gap is forgiving to aim at.
 */
function InsertConnector({
  onInsert,
  label,
}: {
  onInsert: () => void;
  label: string;
}) {
  return (
    <div className="group relative flex h-7 w-full items-center justify-center">
      <div
        aria-hidden="true"
        className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-slate-300"
      />
      <button
        type="button"
        onClick={onInsert}
        title={label}
        aria-label={label}
        className="relative z-10 flex h-5 w-5 items-center justify-center rounded-full border border-slate-300 bg-white text-xs leading-none text-slate-400 opacity-0 shadow-sm transition hover:border-blue-400 hover:text-blue-600 focus-visible:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-60"
      >
        +
      </button>
    </div>
  );
}

function StepTree({
  steps,
  container,
  itemByKey,
  templates,
  selectedId,
  onSelect,
  onDelete,
  onAdd,
}: {
  steps: WorkflowStep[];
  container: string;
  itemByKey: Record<string, CatalogItem>;
  templates: EmailTemplate[];
  selectedId?: string;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onAdd: (container: string, index?: number) => void;
}) {
  return (
    <div className="flex w-full flex-col items-center">
      {steps.map((s, i) => {
        const branches = itemByKey[s.type]?.branches;
        return (
          <div key={s.id} className="flex w-full flex-col items-center">
            {/* The line above each step doubles as an insert point, so a step
                can be added between two existing ones. Appending was the only
                option before, which meant deleting the tail and rebuilding it. */}
            <InsertConnector
              label={`Insert a step before ${s.label || "this step"}`}
              onInsert={() => onAdd(container, i)}
            />
            <StepNode
              step={s}
              item={itemByKey[s.type]}
              templates={templates}
              selected={selectedId === s.id}
              onSelect={() => onSelect(s.id)}
              onDelete={() => onDelete(s.id)}
            />

            {branches && (
              <div className="mt-2 grid w-full grid-cols-2 gap-3">
                <BranchColumn label="Yes" tone="emerald">
                  <StepTree
                    steps={s.yes ?? []}
                    container={containerId(s.id, "yes")}
                    itemByKey={itemByKey}
                    templates={templates}
                    selectedId={selectedId}
                    onSelect={onSelect}
                    onDelete={onDelete}
                    onAdd={onAdd}
                  />
                  <AddButton onClick={() => onAdd(containerId(s.id, "yes"))} />
                </BranchColumn>
                <BranchColumn label="No" tone="rose">
                  <StepTree
                    steps={s.no ?? []}
                    container={containerId(s.id, "no")}
                    itemByKey={itemByKey}
                    templates={templates}
                    selectedId={selectedId}
                    onSelect={onSelect}
                    onDelete={onDelete}
                    onAdd={onAdd}
                  />
                  <AddButton onClick={() => onAdd(containerId(s.id, "no"))} />
                </BranchColumn>
              </div>
            )}
          </div>
        );
      })}

      {/* Add button for this container (hidden inside condition branches, which
          render their own add button below the branch steps). No index: this one
          appends, which is what the end of a sequence means. */}
      {!container.includes(":") && (
        <>
          <Connector />
          <AddButton onClick={() => onAdd(container)} />
        </>
      )}
    </div>
  );
}

function BranchColumn({
  label,
  tone,
  children,
}: {
  label: string;
  tone: "emerald" | "rose";
  children: React.ReactNode;
}) {
  const color =
    tone === "emerald" ? "text-emerald-600 border-emerald-200" : "text-rose-600 border-rose-200";
  return (
    <div className={`flex flex-col items-center rounded-xl border border-dashed ${color} p-2`}>
      <span className={`mb-1 text-xs font-semibold ${color.split(" ")[0]}`}>{label}</span>
      {children}
    </div>
  );
}

const KIND_LABEL: Record<string, string> = {
  action: "Action",
  condition: "Condition",
  delay: "Delay",
};

function StepNode({
  step,
  item,
  templates,
  selected,
  onSelect,
  onDelete,
}: {
  step: WorkflowStep;
  item?: CatalogItem;
  templates: EmailTemplate[];
  selected: boolean;
  onSelect: () => void;
  onDelete: () => void;
}) {
  const summary = summaryFor(step, templates);
  return (
    <div
      onClick={onSelect}
      className={`flex w-full max-w-sm cursor-pointer items-center gap-3 rounded-xl border bg-white px-3 py-2.5 shadow-sm transition ${
        selected ? "border-blue-400 ring-1 ring-blue-200" : "border-slate-200 hover:border-slate-300"
      }`}
    >
      <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-lg">
        {item?.icon ?? "•"}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{step.label}</p>
        <p className="truncate text-xs text-slate-400">
          {KIND_LABEL[step.kind] ?? "Action"} · {summary || "not configured"}
        </p>
      </div>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        className="text-slate-300 hover:text-rose-600"
        title="Delete step"
      >
        ✕
      </button>
    </div>
  );
}

function AddButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-500 shadow-sm hover:border-blue-400 hover:text-blue-600"
      title="Add step"
    >
      +
    </button>
  );
}

// --- Config panels --------------------------------------------------------

/*
The triggers the engine actually enrols on.

Kept beside the builder rather than inferred from the catalog, because the
catalog lists every trigger the product intends to have and the engine
implements two. A builder that presents twenty-five entry points and silently
runs two is the single most misleading thing in this screen.
*/
function TriggerConfig({
  item,
  config,
  forms,
  pipelines,
  stages,
  staff,
  webhookUrl,
  workflowId,
  customFields,
  onConfig,
  onChangeTrigger,
  onRemove,
  onClose,
}: {
  item: CatalogItem;
  config: Record<string, unknown>;
  forms: Form[];
  pipelines: Pipeline[];
  stages: Stage[];
  staff: User[];
  webhookUrl?: string;
  workflowId: string;
  customFields: CustomField[];
  onConfig: (patch: Record<string, unknown>) => void;
  onChangeTrigger: () => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  const str = (key: string) => (typeof config[key] === "string" ? (config[key] as string) : "");
  const formId = str("formId");
  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-lg">{item.icon}</span>
          <h3 className="font-semibold">{item.label}</h3>
        </div>
        <button onClick={onClose} className="rounded p-1 text-slate-400 hover:bg-slate-100">
          ✕
        </button>
      </div>
      <p className="mb-3 text-sm text-slate-500">{item.description}</p>

      {/* Which form. The whole reason somebody picks this trigger rather than
          Contact Created is that they want follow-up for one particular form. */}
      {item.key === "form_submitted" && (
        <div className="mb-4">
          <label className="mb-1 block text-sm font-medium">Which form?</label>
          <select
            className="input"
            value={formId}
            onChange={(e) => onConfig({ formId: e.target.value })}
          >
            <option value="">Any form</option>
            {forms.map((f) => (
              <option key={f._id} value={f._id}>
                {f.name}
                {f.status !== "published" ? " (draft)" : ""}
              </option>
            ))}
          </select>
          <p className="mt-1.5 text-xs text-slate-500">
            {formId
              ? "Runs only for this form. Other forms do not start this workflow."
              : "Runs for every form in this account."}
          </p>
          {/* A draft form accepts nothing, so a workflow pointed at one will
              never run. Said here rather than left to be discovered. */}
          {formId && forms.find((f) => f._id === formId)?.status !== "published" && (
            <p className="mt-1.5 rounded-lg bg-amber-50 px-2.5 py-1.5 text-xs text-amber-800">
              That form is a draft, so nobody can submit it yet and this workflow
              will not run until it is published.
            </p>
          )}
        </div>
      )}

      {/* Which move. Both left blank means any move between any two stages,
          which is what somebody who skipped these options meant. */}
      {item.key === "stage_changed" && (
        <div className="mb-4 space-y-3">
          <TriggerField label="From stage" hint="Leave blank to run whichever stage they came from.">
            <StagePicker
              value={str("fromStageId")}
              pipelines={pipelines}
              stages={stages}
              anyLabel="Any stage"
              onChange={(v) => onConfig({ fromStageId: v })}
            />
          </TriggerField>
          <TriggerField label="To stage" hint="Leave blank to run whichever stage they moved into.">
            <StagePicker
              value={str("toStageId")}
              pipelines={pipelines}
              stages={stages}
              anyLabel="Any stage"
              onChange={(v) => onConfig({ toStageId: v })}
            />
          </TriggerField>
        </div>
      )}

      {/* Won and Lost read the marking on a stage rather than its name, so the
          builder has to say where that marking is set — and say plainly when
          nothing carries it, because then this trigger can never run. */}
      {(item.key === "deal_won" || item.key === "deal_lost") && (
        <WonLostNote
          kind={item.key === "deal_won" ? "won" : "lost"}
          stages={stages}
        />
      )}

      {item.key === "pipeline_changed" && (
        <div className="mb-4">
          <TriggerField label="Moved into which pipeline?" hint="Leave blank for any pipeline.">
            <select
              className="input"
              value={str("toPipelineId")}
              onChange={(e) => onConfig({ toPipelineId: e.target.value })}
            >
              <option value="">Any pipeline</option>
              {pipelines.map((pl) => (
                <option key={pl._id} value={pl._id}>
                  {pl.name}
                </option>
              ))}
            </select>
          </TriggerField>
        </div>
      )}

      {item.key === "deal_value_changed" && (
        <div className="mb-4">
          <TriggerField label="Which direction?">
            <select
              className="input"
              value={str("direction") || "any"}
              onChange={(e) => onConfig({ direction: e.target.value })}
            >
              <option value="any">Up or down</option>
              <option value="increase">Only when it goes up</option>
              <option value="decrease">Only when it goes down</option>
            </select>
          </TriggerField>
        </div>
      )}

      {item.key === "contact_updated" && (
        <div className="mb-4">
          <TriggerField
            label="Which field?"
            hint="Leave blank to run whenever anything on the contact changes."
          >
            <select
              className="input"
              value={str("field")}
              onChange={(e) => onConfig({ field: e.target.value })}
            >
              <option value="">Any field</option>
              <option value="name">Name</option>
              <option value="email">Email</option>
              <option value="phone">Phone</option>
              <option value="value">Deal value</option>
              <option value="tags">Tags</option>
              <option value="assignedTo">Assigned team member</option>
              <option value="dnd">Do Not Disturb</option>
            </select>
          </TriggerField>
        </div>
      )}

      {(item.key === "contact_tagged" || item.key === "contact_untagged") && (
        <div className="mb-4">
          <TriggerField label="Which tag?" hint="Leave blank to run for any tag.">
            <input
              className="input"
              value={str("tag")}
              placeholder="Any tag"
              onChange={(e) => onConfig({ tag: e.target.value })}
            />
          </TriggerField>
        </div>
      )}

      {item.key === "contact_assigned" && (
        <div className="mb-4">
          <TriggerField label="Assigned to whom?" hint="Leave blank for anyone on the team.">
            <StaffPicker
              value={str("userId")}
              staff={staff}
              anyLabel="Anyone"
              onChange={(v) => onConfig({ userId: v })}
            />
          </TriggerField>
        </div>
      )}

      {item.key === "dnd_changed" && (
        <div className="mb-4">
          <TriggerField label="Which change?">
            <select
              className="input"
              value={str("state") || "any"}
              onChange={(e) => onConfig({ state: e.target.value })}
            >
              <option value="any">Either way</option>
              <option value="on">Only when they ask not to be contacted</option>
              <option value="off">Only when they are contactable again</option>
            </select>
          </TriggerField>
        </div>
      )}

      {item.key === "deal_stale" && (
        <div className="mb-4 space-y-3">
          <TriggerField label="Quiet for how many days?">
            <input
              className="input"
              type="number"
              min={1}
              value={str("days") || "7"}
              onChange={(e) => onConfig({ days: e.target.value })}
            />
          </TriggerField>
          <TriggerField label="Only in one stage?" hint="Leave blank to watch the whole account.">
            <StagePicker
              value={str("stageId")}
              pipelines={pipelines}
              stages={stages}
              anyLabel="Every stage"
              onChange={(v) => onConfig({ stageId: v })}
            />
          </TriggerField>
          <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
            Checked once a day at 9am. Each contact enters this workflow once — it
            will not re-enrol them every morning.
          </p>
        </div>
      )}

      {item.key === "meta_lead_form" && (
        <MetaLeadOptions
          pageId={str("pageId")}
          formId={str("metaFormId")}
          stageId={str("stageId")}
          pipelines={pipelines}
          stages={stages}
          onConfig={onConfig}
        />
      )}

      {item.key === "webhook_in" && (
        <div className="mb-4 space-y-3">
          <WebhookAddress url={webhookUrl} />
          <TriggerField
            label="Where should new contacts land?"
            hint="Used only when a call is about somebody not already on file."
          >
            <StagePicker
              value={str("stageId")}
              pipelines={pipelines}
              stages={stages}
              anyLabel="First stage of the first pipeline"
              onChange={(v) => onConfig({ stageId: v })}
            />
          </TriggerField>
          <TriggerField
            label="Thank-you page (for website forms)"
            hint="Where a visitor goes after sending a form on your own landing page. Leave blank for a simple built-in thank-you page."
          >
            <input
              className="input"
              type="url"
              value={str("redirectUrl")}
              placeholder="https://yoursite.com/thank-you"
              onChange={(e) => onConfig({ redirectUrl: e.target.value })}
            />
          </TriggerField>
          <WebhookMapping
            workflowId={workflowId}
            url={webhookUrl}
            mapping={(config.mapping as Record<string, string>) ?? {}}
            customFields={customFields}
            onMapping={(m) => onConfig({ mapping: m })}
          />
          {webhookUrl && <LandingFormSnippet url={webhookUrl} />}
          <details className="rounded-lg border border-slate-200 p-3">
            <summary className="cursor-pointer text-sm font-medium">Advanced: only some calls</summary>
            <div className="mt-3 space-y-3">
              <TriggerField label="Source App" hint="Run only when the call sends _source_app with this value. Leave blank for any.">
                <input className="input" value={str("sourceApp")} placeholder="e.g. zoom" onChange={(e) => onConfig({ sourceApp: e.target.value })} />
              </TriggerField>
              <TriggerField label="Event Type" hint="Run only when the call sends _event_type with this value. Leave blank for any.">
                <input className="input" value={str("eventType")} placeholder="e.g. registration" onChange={(e) => onConfig({ eventType: e.target.value })} />
              </TriggerField>
            </div>
          </details>
        </div>
      )}

      {item.key === "message_received" && (
        <div className="mb-4 space-y-3">
          <TriggerField label="Only when the message contains" hint="Leave blank to run for every message. Not case-sensitive.">
            <input className="input" value={str("keyword")} placeholder="e.g. price" onChange={(e) => onConfig({ keyword: e.target.value })} />
          </TriggerField>
          <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
            The message is available as <code>{"{{variables.reply}}"}</code>. Messages reach this app once your WhatsApp
            webhook is set up: see the WhatsApp page.
          </p>
        </div>
      )}

      <div className="flex gap-2">
        <button
          onClick={onChangeTrigger}
          className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50"
        >
          Change trigger
        </button>
        <button
          onClick={onRemove}
          className="flex-1 rounded-lg border border-rose-300 px-3 py-2 text-sm text-rose-600 hover:bg-rose-50"
        >
          Remove trigger
        </button>
      </div>
    </div>
  );
}

// The Meta Lead Form trigger's options, read from the client's connected Pages.
function MetaLeadOptions({
  pageId,
  formId,
  stageId,
  pipelines,
  stages,
  onConfig,
}: {
  pageId: string;
  formId: string;
  stageId: string;
  pipelines: Pipeline[];
  stages: Stage[];
  onConfig: (patch: Record<string, unknown>) => void;
}) {
  const [pages, setPages] = useState<MetaPageForms[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let live = true;
    api<MetaPageForms[]>("/meta/forms")
      .then((p) => {
        if (live) setPages(p);
      })
      .catch((e) => {
        if (live) setError(e instanceof Error ? e.message : "Could not load your Pages");
      });
    return () => {
      live = false;
    };
  }, []);

  if (error) {
    return <p className="mb-4 rounded-lg bg-rose-50 px-2.5 py-1.5 text-xs text-rose-700">{error}</p>;
  }
  if (!pages) return <p className="mb-4 text-sm text-slate-500">Loading your Pages…</p>;
  if (pages.length === 0) {
    return (
      <p className="mb-4 rounded-lg bg-amber-50 px-2.5 py-1.5 text-xs text-amber-800">
        No Facebook Page is connected, so this workflow will not run.{" "}
        <Link href="/settings/app-store" className="underline">
          Connect one in the App Store
        </Link>
        .
      </p>
    );
  }

  const page = pages.find((p) => p.pageId === pageId);
  return (
    <div className="mb-4 space-y-3">
      <TriggerField label="Which Page?" hint="Leave blank to run for every connected Page.">
        <select
          className="input"
          value={pageId}
          // A form belongs to one Page, so changing the Page clears it.
          onChange={(e) => onConfig({ pageId: e.target.value, metaFormId: "" })}
        >
          <option value="">Any Page</option>
          {pages.map((p) => (
            <option key={p.pageId} value={p.pageId}>
              {p.pageName}
            </option>
          ))}
        </select>
      </TriggerField>
      {page && (
        <TriggerField label="Which form?" hint="Leave blank to run for every form on this Page.">
          <select
            className="input"
            value={formId}
            onChange={(e) => onConfig({ metaFormId: e.target.value })}
          >
            <option value="">Any form</option>
            {page.forms.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
                {f.status !== "ACTIVE" ? ` (${f.status.toLowerCase()})` : ""}
              </option>
            ))}
          </select>
        </TriggerField>
      )}
      {page?.error && (
        <p className="rounded-lg bg-amber-50 px-2.5 py-1.5 text-xs text-amber-800">
          Could not list this Page&apos;s forms: {page.error}
        </p>
      )}
      <TriggerField
        label="Where should new contacts land?"
        hint="Used only when the lead is not already on file."
      >
        <StagePicker
          value={stageId}
          pipelines={pipelines}
          stages={stages}
          anyLabel="First stage of the first pipeline"
          onChange={(v) => onConfig({ stageId: v })}
        />
      </TriggerField>
    </div>
  );
}

/*
A labelled control with the sentence that says what leaving it blank does.

The hint is not decoration. Every filter in this builder treats "unset" as
"any", and that is the opposite of what people assume about a dropdown they did
not touch — without the line underneath, somebody picks Stage Changed, leaves
both stage boxes alone, and expects nothing to happen.
*/
function TriggerField({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium">{label}</label>
      {children}
      {hint && <p className="mt-1.5 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

/*
One stage picker, used by every trigger and step that needs one.

Grouped by pipeline because stage names repeat across them — two pipelines both
having a "New" column is normal, and a flat list of them is unusable.
*/
function StagePicker({
  value,
  pipelines,
  stages,
  anyLabel,
  onChange,
}: {
  value: string;
  pipelines: Pipeline[];
  stages: Stage[];
  anyLabel: string;
  onChange: (value: string) => void;
}) {
  return (
    <select className="input" value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{anyLabel}</option>
      {pipelines.map((pl) => (
        <optgroup key={pl._id} label={pl.name}>
          {stages
            .filter((st) => st.pipelineId === pl._id)
            .map((st) => (
              <option key={st._id} value={st._id}>
                {st.name}
                {st.kind === "won" ? " (Won)" : st.kind === "lost" ? " (Lost)" : ""}
              </option>
            ))}
        </optgroup>
      ))}
    </select>
  );
}

/*
The team picker.

Says why it is empty rather than showing a dropdown with nothing in it. There
are two quite different reasons — a one-person account, and a staff member who
is not allowed to read the team list — and neither is a bug to go looking for.
*/
function StaffPicker({
  value,
  staff,
  anyLabel,
  onChange,
}: {
  value: string;
  staff: User[];
  anyLabel: string;
  onChange: (value: string) => void;
}) {
  if (staff.length === 0) {
    return (
      <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
        No team members to choose from. Add them in Settings → Staff. If you are
        signed in as staff yourself, only the account owner can see this list.
      </p>
    );
  }
  return (
    <select className="input" value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{anyLabel}</option>
      {staff.map((u) => (
        <option key={u._id} value={u._id}>
          {u.name || u.email}
        </option>
      ))}
    </select>
  );
}

/*
Reports whether Deal Won or Deal Lost can ever fire.

The trigger reads a marking on the stage, not its name, so an account whose
"Closed - Won" column is unmarked gets a workflow that looks finished and never
runs. That is the exact failure this whole piece of work was about, so it is
caught here, at the moment somebody picks the trigger, rather than left for them
to discover.
*/
function WonLostNote({ kind, stages }: { kind: "won" | "lost"; stages: Stage[] }) {
  const marked = stages.filter((st) => st.kind === kind);
  const word = kind === "won" ? "Won" : "Lost";

  if (marked.length === 0) {
    return (
      <p className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
        No stage is marked as {word} yet, so this trigger will never run. Open a
        column&apos;s menu on the Board and set its outcome to {word}.
      </p>
    );
  }
  return (
    <p className="mb-4 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
      Runs when a contact reaches any stage marked as <b>{word}</b>:{" "}
      {marked.map((st) => st.name).join(", ")}.
    </p>
  );
}

/*
The inbound webhook address, with a copy button.

Shown as a credential, because that is what it is: anyone holding this URL can
create contacts in this account. It appears only once the workflow has been
saved with the trigger, since the address is derived from the workflow's id.
*/
function WebhookAddress({ url }: { url?: string }) {
  const [copied, setCopied] = useState(false);

  if (!url) {
    return (
      <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
        Save this workflow to get its webhook address.
      </p>
    );
  }

  return (
    <div>
      <label className="mb-1 block text-sm font-medium">Your webhook address</label>
      <div className="flex gap-2">
        <input readOnly value={url} className="input flex-1 font-mono text-xs" />
        <button
          type="button"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(url);
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            } catch {
              // Clipboard access can be refused; the field is selectable, so
              // there is still a way to get the value.
              setCopied(false);
            }
          }}
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium hover:bg-slate-50"
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <p className="mt-1.5 text-xs text-slate-500">
        POST JSON here, or point a form on your own website at it. It reads{" "}
        <code>name</code>, <code>email</code>, <code>phone</code>, <code>value</code>{" "}
        and <code>tags</code>; any other field is saved on the contact. A contact
        already on file is matched by email or phone rather than duplicated.
      </p>
      <p className="mt-1.5 rounded-lg bg-amber-50 px-2.5 py-1.5 text-xs text-amber-800">
        Anyone with this address can add contacts to your account. In a website
        form it is public, like any contact form, so spam is held back by a
        hidden trap field and a per-visitor limit. While the workflow is a draft,
        calls are only recorded as a test; it runs once published.
      </p>
    </div>
  );
}

// A ready-made form for a client's own landing page, posting to the webhook.
function LandingFormSnippet({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  const snippet = `<form action="${url}" method="POST">
  <input name="name" placeholder="Your name" required>
  <input name="email" type="email" placeholder="Email">
  <input name="phone" type="tel" placeholder="Phone">
  <textarea name="message" placeholder="How can we help?"></textarea>
  <!-- Leave this hidden and empty: it catches spam bots. -->
  <input name="_gotcha" style="display:none" tabindex="-1" autocomplete="off">
  <button type="submit">Send</button>
</form>`;

  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <label className="text-sm font-medium">Form for your website</label>
        <button
          type="button"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(snippet);
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            } catch {
              setCopied(false);
            }
          }}
          className="rounded-lg border border-slate-300 px-3 py-1 text-xs font-medium hover:bg-slate-50"
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="max-h-48 overflow-auto rounded-lg bg-slate-50 p-2.5 text-[11px] leading-relaxed whitespace-pre-wrap break-all text-slate-700">
        {snippet}
      </pre>
      <p className="mt-1.5 text-xs text-slate-500">
        Paste it into your page, or point your existing form&apos;s action at the
        address above with <code>method=&quot;POST&quot;</code>. Add any fields you
        like; campaign links with <code>utm_source</code> are recorded too when
        passed as hidden fields.
      </p>
    </div>
  );
}

const DELAY_PRESETS = [
  { label: "1 hour", amount: "1", unit: "hours" },
  { label: "1 day", amount: "1", unit: "days" },
  { label: "3 days", amount: "3", unit: "days" },
  { label: "1 week", amount: "7", unit: "days" },
  { label: "2 weeks", amount: "14", unit: "days" },
];

// StepConfig renders a small, type-aware form. `config` values are stored loosely.
function StepConfig({
  step,
  item,
  templates,
  pipelines,
  stages,
  staff,
  customFields,
  onChange,
  onClose,
}: {
  step: WorkflowStep;
  item?: CatalogItem;
  templates: EmailTemplate[];
  pipelines: Pipeline[];
  stages: Stage[];
  staff: User[];
  customFields: CustomField[];
  onChange: (patch: Partial<WorkflowStep>) => void;
  onClose: () => void;
}) {
  const cfg = step.config ?? {};
  const set = (key: string, value: unknown) => onChange({ config: { ...cfg, [key]: value } });
  const setMany = (obj: Record<string, unknown>) => onChange({ config: { ...cfg, ...obj } });
  const str = (key: string) => (typeof cfg[key] === "string" ? (cfg[key] as string) : "");

  /*
   * The step's own kind is checked as well as the catalog's.
   *
   * Steps saved before the timing steps were named properly carry type "delay",
   * which is no longer a catalog key — so `item` is undefined for them and this
   * panel would fall through to the Notes box, losing the duration fields on
   * every wait in every existing workflow. The engine has the same fallback for
   * the same reason: it decides a step is a delay from its kind, not its name.
   */
  const isDelay = item?.kind === "delay" || step.kind === "delay";
  const emailMode = str("mode") || (templates.length ? "template" : "custom");
  /*
   * Every step now has a form of its own, so the Notes fallback below should
   * never render.
   *
   * It stays because the catalog and this file can still drift — a new step
   * added to one and not the other — and a notes box is a far better landing
   * than a blank panel with no explanation. The list is every key in
   * SupportedSteps on the server, which is the thing it has to track.
   */
  const hasDedicated =
    isDelay ||
    [
      "send_email",
      "send_whatsapp",
      "internal_notify",
      "add_tag",
      "remove_tag",
      "update_field",
      "assign_user",
      "set_dnd",
      "move_stage",
      "update_deal_value",
      "webhook_out",
      "if_else",
      "split",
      "filter",
      "goal_exit",
      "end_workflow",
      "waba_window",
    ].includes(step.type);

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-lg">{item?.icon ?? "•"}</span>
          <div>
            <h3 className="font-semibold leading-tight">{item?.label ?? step.type}</h3>
            <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
              {KIND_LABEL[step.kind] ?? "Action"}
              {item?.app ? ` · ${item.app}` : ""}
            </p>
          </div>
        </div>
        <button onClick={onClose} className="rounded p-1 text-slate-400 hover:bg-slate-100">
          ✕
        </button>
      </div>

      <label className="mb-1 block text-sm font-medium">Step label</label>
      <input
        className="input mb-4"
        value={step.label}
        onChange={(e) => onChange({ label: e.target.value })}
      />

      <div className="space-y-3">
        {step.type === "move_stage" && (
          <>
            <Field label="Move the contact to">
              <select
                className="input"
                value={str("stageId")}
                onChange={(e) => {
                  const stage = stages.find((x) => x._id === e.target.value);
                  // The pipeline is stored alongside so the summary can name it
                  // without a lookup, and so a stage deleted later still leaves
                  // a readable record of what the step meant.
                  setMany({
                    stageId: e.target.value,
                    stageName: stage?.name ?? "",
                    pipelineId: stage?.pipelineId ?? "",
                  });
                }}
              >
                <option value="">Select a stage…</option>
                {/* Grouped by pipeline, because stage names repeat across them
                    — two pipelines both having "New" is normal, and a flat list
                    of them is unusable. */}
                {pipelines.map((pl) => (
                  <optgroup key={pl._id} label={pl.name}>
                    {stages
                      .filter((st) => st.pipelineId === pl._id)
                      .map((st) => (
                        <option key={st._id} value={st._id}>
                          {st.name}
                        </option>
                      ))}
                  </optgroup>
                ))}
              </select>
            </Field>
            <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
              {/* The consequence nobody expects, and the one that sends email.
                  Said here because it is the difference between this step being
                  a filing action and a sending one. */}
              Moving a contact stops the follow-up of the stage it leaves and
              starts the follow-up of the stage it enters — including that
              stage&apos;s Day 1 email, if it has one.
            </p>
            {stages.length === 0 && (
              <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                This account has no pipeline stages yet. Create a pipeline on the
                Board first.
              </p>
            )}
          </>
        )}

        {step.type === "send_email" && (
          <>
            {/* Use an existing template, or write custom content. */}
            <div className="grid grid-cols-2 gap-1 rounded-lg bg-slate-100 p-1 text-sm">
              <button
                type="button"
                onClick={() => set("mode", "template")}
                className={`rounded-md py-1.5 font-medium ${emailMode === "template" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}`}
              >
                Use template
              </button>
              <button
                type="button"
                onClick={() => set("mode", "custom")}
                className={`rounded-md py-1.5 font-medium ${emailMode === "custom" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}`}
              >
                Custom content
              </button>
            </div>

            {emailMode === "template" ? (
              templates.length ? (
                <Field label="Email template">
                  <select
                    className="input"
                    value={str("templateId")}
                    onChange={(e) => {
                      const t = templates.find((x) => x._id === e.target.value);
                      setMany({
                        templateId: e.target.value,
                        templateName: t?.name ?? "",
                        templateSubject: t?.subject ?? "",
                      });
                    }}
                  >
                    <option value="">Select a template…</option>
                    {templates.map((t) => (
                      <option key={t._id} value={t._id}>
                        {t.name}
                        {t.subject ? ` — ${t.subject}` : ""}
                      </option>
                    ))}
                  </select>
                </Field>
              ) : (
                <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  No email templates yet. Create one in <span className="font-medium">Email Templates</span>,
                  or switch to Custom content.
                </p>
              )
            ) : (
              <>
                <Field label="Subject">
                  <input className="input" value={str("subject")} onChange={(e) => set("subject", e.target.value)} placeholder="e.g. Welcome {{contact.first_name}}" />
                </Field>
                <Field label="Body">
                  <textarea className="input min-h-28" value={str("body")} onChange={(e) => set("body", e.target.value)} placeholder="Message… use {{contact.first_name}} variables" />
                </Field>
              </>
            )}
          </>
        )}

        {step.type === "internal_notify" && (
          <>
            <Field label="Who should be told?">
              <StaffPicker
                value={str("userId")}
                staff={staff}
                anyLabel="Choose a team member…"
                onChange={(v) => set("userId", v)}
              />
            </Field>
            {/* An address as well as a staff picker, because the person who
                should hear about a new lead is not always somebody with a
                login — an agency's account manager, an accountant. */}
            <Field label="…or an email address">
              <input
                className="input"
                value={str("email")}
                placeholder="someone@yourbusiness.com"
                onChange={(e) => set("email", e.target.value)}
              />
            </Field>
            <Field label="Subject">
              <input
                className="input"
                value={str("subject")}
                placeholder="New lead from the website"
                onChange={(e) => set("subject", e.target.value)}
              />
            </Field>
            <Field label="Anything to add">
              <textarea
                className="input min-h-20"
                value={str("message")}
                placeholder="Optional. The contact's name, phone, email and stage are always included."
                onChange={(e) => set("message", e.target.value)}
              />
            </Field>
            <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
              Sent from your own email connection, so it arrives with your domain
              rather than from a stranger.
            </p>
          </>
        )}

        {step.type === "assign_user" && (
          <Field label="Assign the contact to">
            <StaffPicker
              value={str("userId")}
              staff={staff}
              anyLabel="Choose a team member…"
              onChange={(v) => set("userId", v)}
            />
          </Field>
        )}

        {step.type === "set_dnd" && (
          <>
            <Field label="Do Not Disturb">
              <select
                className="input"
                value={str("state") || "on"}
                onChange={(e) => set("state", e.target.value)}
              >
                <option value="on">Turn on — stop messaging this contact</option>
                <option value="off">Turn off — they can be messaged again</option>
              </select>
            </Field>
            <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
              Stops every automated email and WhatsApp message to this contact,
              from every workflow and every stage sequence. You can still message
              them by hand.
            </p>
          </>
        )}

        {step.type === "update_deal_value" && (
          <>
            <Field label="How should the value change?">
              <select
                className="input"
                value={str("mode") || "set"}
                onChange={(e) => set("mode", e.target.value)}
              >
                <option value="set">Set it to this amount</option>
                <option value="add">Add this amount to what is already there</option>
              </select>
            </Field>
            <Field label="Amount">
              <input
                className="input"
                type="number"
                value={str("amount")}
                onChange={(e) => set("amount", e.target.value)}
              />
            </Field>
          </>
        )}

        {step.type === "webhook_out" && (
          <>
            <Field label="URL">
              <input
                className="input font-mono text-xs"
                value={str("url")}
                placeholder="https://example.com/hooks/lead"
                onChange={(e) => set("url", e.target.value)}
              />
            </Field>
            <Field label="Shared secret (optional)">
              <input
                className="input font-mono text-xs"
                value={str("secret")}
                placeholder="Sent as the X-Arkquen-Secret header"
                onChange={(e) => set("secret", e.target.value)}
              />
            </Field>
            <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
              POSTs the contact as JSON: name, email, phone, value, tags, stage
              and pipeline. Must be a public address — private and internal
              addresses are refused.
            </p>
          </>
        )}

        {step.type === "send_whatsapp" && (
          <WabaTemplatePicker
            templateId={str("templateId")}
            variables={Array.isArray(cfg.variables) ? (cfg.variables as string[]) : []}
            customFields={customFields}
            onSelect={(id, name, language) =>
              setMany({ templateId: id, templateName: name, templateLanguage: language, variables: [] })
            }
            onVariables={(v) => set("variables", v)}
          />
        )}

        {(step.type === "add_tag" || step.type === "remove_tag") && (
          <Field label="Tag">
            <input className="input" value={str("tag")} onChange={(e) => set("tag", e.target.value)} placeholder="e.g. hot-lead" />
          </Field>
        )}

        {step.type === "end_workflow" && (
          <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
            The contact leaves the workflow here. Nothing after this step runs for them, and the run shows as Exited early.
          </p>
        )}

        {step.type === "waba_window" && (
          <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
            <span className="font-medium text-emerald-600">Yes</span> if the contact sent you a WhatsApp message in the
            last 24 hours: inside that window Meta allows any message and replies are free.{" "}
            <span className="font-medium text-rose-600">No</span> otherwise, when only an approved template can be sent.
            Needs your WhatsApp webhook set up (WhatsApp page).
          </p>
        )}

        {step.type === "wait_reply" && (
          <>
            <Field label="Wait at most (hours)">
              <input className="input" type="number" min={1} value={str("timeoutHours") || "24"} onChange={(e) => set("timeoutHours", e.target.value)} />
            </Field>
            <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
              Continues as soon as the contact replies on WhatsApp, or when the time runs out. Add an If / Else on
              &quot;Replied on WhatsApp&quot; next to treat the two differently. The reply text is{" "}
              <code>{"{{variables.reply}}"}</code>.
            </p>
          </>
        )}

        {step.type === "update_field" && (
          <>
            {/* A list rather than a text box. The engine only writes the fields
                a contact actually has, so a typed field name was a step that
                looked configured and did nothing. */}
            <Field label="Field">
              <select
                className="input"
                value={str("field")}
                onChange={(e) => set("field", e.target.value)}
              >
                <option value="">Choose a field…</option>
                <option value="name">Name</option>
                <option value="email">Email</option>
                <option value="phone">Phone</option>
                <option value="value">Deal value</option>
                {customFields.length > 0 && (
                  <optgroup label="Custom fields">
                    {customFields.map((f) => (
                      <option key={f.key} value={`custom.${f.key}`}>{f.label}</option>
                    ))}
                  </optgroup>
                )}
              </select>
            </Field>
            <Field label="Value">
              <input
                className="input"
                value={str("value")}
                placeholder="Text, or {{variables.city}} from a webhook"
                onChange={(e) => set("value", e.target.value)}
              />
            </Field>
            <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
              Use <code>{"{{variables.name}}"}</code> to copy a value the trigger brought in. Need another field?{" "}
              <Link href="/settings/fields" className="underline">Add a custom field</Link>. To label a contact,
              use Add Tag.
            </p>
          </>
        )}

        {/* Waiting until a named moment, rather than for a duration. */}
        {step.type === "wait_until" && (
          <>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Date">
                <input
                  className="input"
                  type="date"
                  value={str("date")}
                  onChange={(e) => set("date", e.target.value)}
                />
              </Field>
              <Field label="Time">
                <input
                  className="input"
                  type="time"
                  value={str("time") || "09:00"}
                  onChange={(e) => set("time", e.target.value)}
                />
              </Field>
            </div>
            <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
              Indian time. If the date has already passed, the workflow carries
              straight on rather than waiting a year.
            </p>
          </>
        )}

        {step.type === "business_hours" && (
          <>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Day starts">
                <input
                  className="input"
                  type="number"
                  min={0}
                  max={23}
                  value={str("startHour") || "9"}
                  onChange={(e) => set("startHour", e.target.value)}
                />
              </Field>
              <Field label="Day ends">
                <input
                  className="input"
                  type="number"
                  min={1}
                  max={24}
                  value={str("endHour") || "18"}
                  onChange={(e) => set("endHour", e.target.value)}
                />
              </Field>
            </div>
            <Field label="Weekends">
              <select
                className="input"
                value={str("weekends") || "skip"}
                onChange={(e) => set("weekends", e.target.value)}
              >
                <option value="skip">Skip Saturday and Sunday</option>
                <option value="include">Weekends count as working days</option>
              </select>
            </Field>
            <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
              Hours are on a 24-hour clock, Indian time. Inside these hours the
              workflow carries straight on — it only pauses when it is outside
              them.
            </p>
          </>
        )}

        {/* The plain duration wait. Wait Until and Business Hours are delays
            too but mean something else entirely, so they are excluded. */}
        {isDelay && step.type !== "wait_until" && step.type !== "business_hours" && step.type !== "wait_reply" && (
          <>
            <div>
              <p className="mb-1.5 text-sm font-medium">Quick presets</p>
              <div className="flex flex-wrap gap-1.5">
                {DELAY_PRESETS.map((p) => {
                  const active = str("amount") === p.amount && (str("unit") || "hours") === p.unit;
                  return (
                    <button
                      key={p.label}
                      type="button"
                      onClick={() => setMany({ amount: p.amount, unit: p.unit })}
                      className={`rounded-full border px-3 py-1 text-xs font-medium ${
                        active ? "border-blue-500 bg-blue-600 text-white" : "border-slate-300 text-slate-600 hover:bg-slate-50"
                      }`}
                    >
                      {p.label}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Amount">
                <input className="input" type="number" min={0} value={str("amount")} onChange={(e) => set("amount", e.target.value)} />
              </Field>
              <Field label="Unit">
                <select className="input" value={str("unit") || "hours"} onChange={(e) => set("unit", e.target.value)}>
                  <option value="minutes">Minutes</option>
                  <option value="hours">Hours</option>
                  <option value="days">Days</option>
                  <option value="weeks">Weeks</option>
                </select>
              </Field>
            </div>
            <div>
              <label className="flex items-center gap-2 text-sm font-medium">
                <input
                  type="checkbox"
                  checked={!!str("windowStart")}
                  onChange={(e) =>
                    e.target.checked ? setMany({ windowStart: "10:00", windowEnd: "18:00" }) : setMany({ windowStart: "", windowEnd: "" })
                  }
                />
                Then only between certain times
              </label>
              {str("windowStart") && (
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <Field label="From">
                    <input className="input" type="time" value={str("windowStart")} onChange={(e) => set("windowStart", e.target.value)} />
                  </Field>
                  <Field label="To">
                    <input className="input" type="time" value={str("windowEnd")} onChange={(e) => set("windowEnd", e.target.value)} />
                  </Field>
                </div>
              )}
            </div>
            <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
              {str("windowStart")
                ? `Waits ${durationLabel(str("amount") || "1", str("unit") || "hours")}, then sends at the next ${str("windowStart")}–${str("windowEnd")} in the workflow's time zone (Settings).`
                : "The workflow pauses here and resumes after the wait period."}
            </p>
          </>
        )}

        {step.type === "split" && (
          <>
            <Field label="Percentage down the Yes path">
              <input
                className="input"
                type="number"
                min={1}
                max={99}
                value={str("percent") || "50"}
                onChange={(e) => set("percent", e.target.value)}
              />
            </Field>
            <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
              Each contact is decided independently when they reach this step, so
              the split comes out near your percentage over a few hundred people
              rather than exactly on every one.
            </p>
          </>
        )}

        {/* One condition form for the three steps that ask a question. They
            differ only in what happens with the answer, which the note below
            spells out — the fields themselves are identical, and three copies
            of them is three places for the field list to drift. */}
        {(step.type === "if_else" || step.type === "filter" || step.type === "goal_exit") && (
          <>
            <Field label="Ask about">
              <select
                className="input"
                value={fieldSelectValue(str("field"))}
                onChange={(e) =>
                  e.target.value === "replied"
                    ? setMany({ field: "replied", operator: "equals", value: "yes" })
                    : set("field", e.target.value)
                }
              >
                <FieldOptions customFields={customFields} />
              </select>
            </Field>
            {str("field").startsWith("var.") && (
              <Field label="Webhook field name">
                <input
                  className="input font-mono text-xs"
                  placeholder="e.g. city or utm_source"
                  value={str("field").slice(4)}
                  onChange={(e) => set("field", "var." + e.target.value.trim())}
                />
              </Field>
            )}
            <div className="grid grid-cols-2 gap-2">
              <Field label="Test">
                <select
                  className="input"
                  value={str("operator") || "equals"}
                  onChange={(e) => set("operator", e.target.value)}
                >
                  <OperatorOptions field={str("field")} />
                </select>
              </Field>
              <Field label="Value">
                {str("field") === "replied" ? (
                  <select className="input" value={str("value") || "yes"} onChange={(e) => set("value", e.target.value)}>
                    <option value="yes">Replied</option>
                    <option value="no">Did not reply</option>
                  </select>
                ) : str("field") === "stage" ? (
                  <StagePicker
                    value={str("value")}
                    pipelines={pipelines}
                    stages={stages}
                    anyLabel="Choose a stage…"
                    onChange={(v) => set("value", v)}
                  />
                ) : str("field") === "assigned" ? (
                  <StaffPicker
                    value={str("value")}
                    staff={staff}
                    anyLabel="Choose a team member…"
                    onChange={(v) => set("value", v)}
                  />
                ) : str("field") === "dnd" ? (
                  <select
                    className="input"
                    value={str("value") || "true"}
                    onChange={(e) => set("value", e.target.value)}
                  >
                    <option value="true">Is on Do Not Disturb</option>
                    <option value="false">Is not on Do Not Disturb</option>
                  </select>
                ) : (
                  <input
                    className="input"
                    value={str("value")}
                    onChange={(e) => set("value", e.target.value)}
                  />
                )}
              </Field>
            </div>
            <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
              {step.type === "if_else" ? (
                <>
                  Matching contacts follow the{" "}
                  <span className="font-medium text-emerald-600">Yes</span> branch;
                  everyone else follows{" "}
                  <span className="font-medium text-rose-600">No</span>.
                </>
              ) : step.type === "filter" ? (
                "Only matching contacts carry on. Everyone else stops here — the rest of the workflow does not run for them."
              ) : (
                "Matching contacts stop here, having reached the goal. Everyone else carries on to the next step."
              )}
            </p>
          </>
        )}

        {/* Generic fallback for steps without a dedicated form. */}
        {!hasDedicated && (
          <Field label="Notes">
            <textarea
              className="input min-h-20"
              value={str("notes")}
              onChange={(e) => set("notes", e.target.value)}
              placeholder="Describe what this step should do."
            />
          </Field>
        )}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium">{label}</label>
      {children}
    </div>
  );
}

const DEFAULT_SETTINGS: WorkflowSettings = {
  timeZone: "",
  allowReentry: false,
  reentryWaitHours: 0,
  enableAt: null,
  disableAt: null,
};

const TIME_ZONES = [
  ["Asia/Kolkata", "India (IST)"],
  ["Asia/Dubai", "Dubai (GST)"],
  ["Asia/Singapore", "Singapore"],
  ["Europe/London", "London"],
  ["Europe/Berlin", "Central Europe"],
  ["America/New_York", "New York"],
  ["America/Los_Angeles", "Los Angeles"],
  ["Australia/Sydney", "Sydney"],
  ["UTC", "UTC"],
];

function MenuItem({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button role="menuitem" onClick={onClick} className="block w-full px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50">
      {children}
    </button>
  );
}

function countSteps(steps: WorkflowStep[]): number {
  return steps.reduce((n, s) => n + 1 + countSteps(s.yes ?? []) + countSteps(s.no ?? []), 0);
}

// The longest stretch of waiting a contact can sit through, in hours.
function totalWaitHours(steps: WorkflowStep[]): number {
  let total = 0;
  for (const s of steps) {
    const c = s.config ?? {};
    if (s.type === "wait_delay" || s.type === "delay" || s.type === "wait") {
      const n = Number(c.amount) || 1;
      const unit = String(c.unit || "hours");
      total += n * (unit === "minutes" ? 1 / 60 : unit === "days" ? 24 : unit === "weeks" ? 168 : 1);
    } else if (s.type === "wait_reply") {
      total += Number(c.timeoutHours) || 24;
    }
    if (s.yes || s.no) total += Math.max(totalWaitHours(s.yes ?? []), totalWaitHours(s.no ?? []));
  }
  return total;
}

// ISO <-> the value a datetime-local input wants, in the viewer's time.
function toLocalInput(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
const fromLocalInput = (v: string) => (v ? new Date(v).toISOString() : null);

/*
The Settings tab: when the workflow runs, who may go through it again, and the
exit goals that stop it early for people who are done.
*/
function WorkflowSettingsPanel({
  settings,
  goals,
  customFields,
  onSettings,
  onGoals,
}: {
  settings: WorkflowSettings;
  goals: ExitGoal[];
  customFields: CustomField[];
  onSettings: (s: WorkflowSettings) => void;
  onGoals: (g: ExitGoal[]) => void;
}) {
  const set = (p: Partial<WorkflowSettings>) => onSettings({ ...settings, ...p });
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <SettingsCard title="Exit goals" hint="The moment one of these is true, the contact leaves this workflow, even in the middle of a wait. Use it so people who bought or replied stop getting the drip.">
        {goals.length === 0 && (
          <p className="mb-3 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">No exit goals. Contacts go through every step.</p>
        )}
        <ul className="space-y-2">
          {goals.map((g, i) => (
            <li key={i} className="flex flex-wrap items-start gap-2 rounded-lg border border-slate-200 p-2">
              <span className="pt-2 text-xs font-medium text-slate-500">Stop when</span>
              <ConditionFields
                field={g.field}
                operator={g.operator}
                value={g.value}
                customFields={customFields}
                onChange={(p) => onGoals(goals.map((x, j) => (j === i ? { ...x, ...p } : x)))}
              />
              <button onClick={() => onGoals(goals.filter((_, j) => j !== i))} aria-label="Remove goal" className="ml-auto rounded p-2 text-slate-400 hover:text-rose-600">✕</button>
            </li>
          ))}
        </ul>
        <div className="mt-3 flex flex-wrap gap-2">
          <button onClick={() => onGoals([...goals, { field: "tag", operator: "equals", value: "" }])} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50">
            + Contact gets a tag
          </button>
          <button onClick={() => onGoals([...goals, { field: "replied", operator: "equals", value: "yes" }])} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50">
            + Contact replies on WhatsApp
          </button>
          <button onClick={() => onGoals([...goals, { field: "", operator: "equals", value: "" }])} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50">
            + Other condition
          </button>
        </div>
      </SettingsCard>

      <SettingsCard title="Time zone" hint="Waits, time windows and business hours use this. A step can still name its own.">
        <select className="input" value={settings.timeZone || "Asia/Kolkata"} onChange={(e) => set({ timeZone: e.target.value })}>
          {TIME_ZONES.map(([z, label]) => (
            <option key={z} value={z}>{label}</option>
          ))}
        </select>
      </SettingsCard>

      <SettingsCard title="Re-entry" hint="Whether a contact who already went through can go through again when the trigger fires again.">
        <div className="flex items-center gap-3">
          <Toggle checked={settings.allowReentry} onChange={(v) => set({ allowReentry: v })} label="Allow re-entry" />
          <span className="text-sm">{settings.allowReentry ? "Contacts can enter again" : "Each contact goes through once"}</span>
        </div>
        {settings.allowReentry && (
          <label className="mt-3 block text-sm">
            Wait before they can re-enter (hours)
            <input
              type="number"
              min={0}
              className="input mt-1 w-40"
              value={settings.reentryWaitHours || ""}
              placeholder="No wait"
              onChange={(e) => set({ reentryWaitHours: Math.max(0, Number(e.target.value) || 0) })}
            />
          </label>
        )}
        <p className="mt-2 text-xs text-slate-500">
          A contact already in the workflow is never entered twice at once. Every skipped entry is in the logs with the reason.
        </p>
      </SettingsCard>

      <SettingsCard title="Enrolment window" hint="Only enrol contacts between these times. Leave blank for always. Contacts already inside carry on.">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm">
            Start enrolling
            <input type="datetime-local" className="input mt-1" value={toLocalInput(settings.enableAt)} onChange={(e) => set({ enableAt: fromLocalInput(e.target.value) })} />
          </label>
          <label className="text-sm">
            Stop enrolling
            <input type="datetime-local" className="input mt-1" value={toLocalInput(settings.disableAt)} onChange={(e) => set({ disableAt: fromLocalInput(e.target.value) })} />
          </label>
        </div>
      </SettingsCard>
      <p className="text-center text-xs text-slate-500">Press Save to apply these settings.</p>
    </div>
  );
}

function SettingsCard({ title, hint, children }: { title: string; hint: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <h2 className="font-semibold">{title}</h2>
      <p className="mb-3 text-sm text-slate-500">{hint}</p>
      {children}
    </section>
  );
}

/*
What a condition can ask about: the contact's own fields, custom fields, a
value the trigger carried (a webhook field), and whether they replied.
Shared by If / Else, filters and exit goals so the list cannot drift.
*/
function FieldOptions({ customFields }: { customFields: CustomField[] }) {
  return (
    <>
      <option value="">Choose…</option>
      <optgroup label="Contact">
        <option value="tag">Tag</option>
        <option value="name">Name</option>
        <option value="email">Email</option>
        <option value="phone">Phone</option>
        <option value="value">Deal value</option>
        <option value="stage">Stage</option>
        <option value="dnd">Do Not Disturb</option>
        <option value="assigned">Assigned team member</option>
      </optgroup>
      {customFields.length > 0 && (
        <optgroup label="Custom fields">
          {customFields.map((f) => (
            <option key={f.key} value={`custom.${f.key}`}>{f.label}</option>
          ))}
        </optgroup>
      )}
      <optgroup label="This run">
        <option value="replied">Replied on WhatsApp</option>
        <option value="var.">A webhook / trigger value…</option>
      </optgroup>
    </>
  );
}

const fieldSelectValue = (field: string) => (field.startsWith("var.") ? "var." : field);

function OperatorOptions({ field }: { field: string }) {
  if (field === "tag")
    return (
      <>
        <option value="equals">Has this tag</option>
        <option value="not_equals">Does not have this tag</option>
        <option value="exists">Has any tag</option>
      </>
    );
  if (field === "replied")
    return (
      <>
        <option value="equals">Is</option>
      </>
    );
  return (
    <>
      <option value="equals">Equals</option>
      <option value="not_equals">Does not equal</option>
      <option value="contains">Contains</option>
      <option value="not_contains">Does not contain</option>
      <option value="greater">Greater than</option>
      <option value="less">Less than</option>
      <option value="exists">Is set</option>
      <option value="not_exists">Is empty</option>
    </>
  );
}

// A compact field / test / value row, for exit goals.
function ConditionFields({
  field,
  operator,
  value,
  customFields,
  onChange,
}: {
  field: string;
  operator: string;
  value: string;
  customFields: CustomField[];
  onChange: (p: Partial<ExitGoal>) => void;
}) {
  return (
    <div className="flex flex-1 flex-wrap gap-2">
      <select className="input w-44" value={fieldSelectValue(field)} onChange={(e) => onChange({ field: e.target.value, value: e.target.value === "replied" ? "yes" : value })}>
        <FieldOptions customFields={customFields} />
      </select>
      {field.startsWith("var.") && (
        <input className="input w-32 font-mono text-xs" placeholder="field_name" value={field.slice(4)} onChange={(e) => onChange({ field: "var." + e.target.value.trim() })} />
      )}
      <select className="input w-40" value={operator || "equals"} onChange={(e) => onChange({ operator: e.target.value })}>
        <OperatorOptions field={field} />
      </select>
      {field === "replied" ? (
        <select className="input w-32" value={value || "yes"} onChange={(e) => onChange({ value: e.target.value })}>
          <option value="yes">Replied</option>
          <option value="no">Did not reply</option>
        </select>
      ) : !["exists", "not_exists"].includes(operator) ? (
        <input className="input w-36" placeholder={field === "tag" ? "e.g. Purchased" : "Value"} value={value} onChange={(e) => onChange({ value: e.target.value })} />
      ) : null}
    </div>
  );
}

// Every save of this workflow, with a way back to any of them.
function VersionsDrawer({
  workflowId,
  current,
  dirty,
  onRestored,
  onClose,
}: {
  workflowId: string;
  current: number;
  dirty: boolean;
  onRestored: (w: Workflow) => void;
  onClose: () => void;
}) {
  const [versions, setVersions] = useState<WorkflowVersion[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api<WorkflowVersion[]>(`/workflows/${workflowId}/versions`)
      .then(setVersions)
      .catch((e) => setError(e instanceof Error ? e.message : "Could not load the history"));
  }, [workflowId]);

  async function restore(v: number) {
    const msg = dirty
      ? `Restore version ${v}? Your unsaved changes will be lost.`
      : `Restore version ${v}? It becomes the newest version; nothing is deleted.`;
    if (!confirm(msg)) return;
    try {
      onRestored(await api<Workflow>(`/workflows/${workflowId}/versions/${v}/restore`, { method: "POST" }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not restore");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30" onClick={onClose}>
      <aside onClick={(e) => e.stopPropagation()} className="ark-pop h-full w-full max-w-md overflow-y-auto bg-white p-5 shadow-[var(--ark-shadow-overlay)]">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Version history</h2>
          <button onClick={onClose} aria-label="Close" className="rounded p-1 text-slate-400 hover:bg-slate-100">✕</button>
        </div>
        <p className="mb-3 text-sm text-slate-500">Every save is kept. Restoring makes an old version the newest; contacts waiting in a live workflow continue on it.</p>
        {error && <p className="mb-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
        {!versions && !error && <p className="text-sm text-slate-500">Loading…</p>}
        {versions?.length === 0 && <p className="text-sm text-slate-500">No saved versions yet.</p>}
        <ul className="divide-y divide-slate-100">
          {versions?.map((v) => (
            <li key={v._id} className="flex items-center gap-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">
                  Version {v.version} {v.version === current && <span className="ml-1 rounded bg-emerald-50 px-1.5 py-0.5 text-xs text-emerald-700">current</span>}
                </p>
                <p className="text-xs text-slate-500">
                  {new Date(v.savedAt).toLocaleString()} · {v.savedBy || "someone"} · {countSteps(v.steps ?? [])} steps · {v.status === "published" ? "live" : v.status}
                </p>
              </div>
              {v.version !== current && (
                <button onClick={() => restore(v.version)} className="rounded-lg border border-slate-300 px-2.5 py-1 text-xs hover:bg-slate-50">Restore</button>
              )}
            </li>
          ))}
        </ul>
      </aside>
    </div>
  );
}

const MAP_TARGETS = [
  ["", "Automatic"],
  ["name", "Name"],
  ["email", "Email"],
  ["phone", "Phone"],
  ["value", "Deal value"],
  ["tags", "Tags"],
  ["skip", "Don't save"],
];

/*
Step 2 and 3 of setting up a webhook: send a test, see every field that
arrived, and say where each one goes. Every field is also a variable,
{{variables.key}}, whatever it is mapped to.
*/
function WebhookMapping({
  workflowId,
  url,
  mapping,
  customFields,
  onMapping,
}: {
  workflowId: string;
  url?: string;
  mapping: Record<string, string>;
  customFields: CustomField[];
  onMapping: (m: Record<string, string>) => void;
}) {
  const [capture, setCapture] = useState<WebhookCapture | null>(null);
  const [checking, setChecking] = useState(false);

  async function check() {
    setChecking(true);
    try {
      setCapture(await api<WebhookCapture>(`/workflows/${workflowId}/capture`));
    } catch {
      setCapture({ fields: [] });
    } finally {
      setChecking(false);
    }
  }
  useEffect(() => {
    api<WebhookCapture>(`/workflows/${workflowId}/capture`).then(setCapture).catch(() => setCapture({ fields: [] }));
  }, [workflowId]);

  const varKey = (k: string) => k.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
  const curl = url
    ? `curl -X POST "${url}" -H "Content-Type: application/json" -d '{"name":"Test Lead","email":"test@example.com","phone":"9876543210","city":"Pune"}'`
    : "";

  return (
    <div className="rounded-lg border border-slate-200 p-3">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-sm font-medium">Fields received</p>
        <button onClick={check} disabled={checking} className="rounded-lg border border-slate-300 px-2.5 py-1 text-xs hover:bg-slate-50">
          {checking ? "Checking…" : "Check for a test"}
        </button>
      </div>
      {!capture || capture.fields.length === 0 ? (
        <div className="space-y-2 text-xs text-slate-600">
          <p>Send one test call to the address above (a draft workflow just records it), then press Check for a test.</p>
          {curl && (
            <pre className="overflow-x-auto rounded bg-slate-50 p-2 text-[11px] whitespace-pre-wrap break-all">{curl}</pre>
          )}
        </div>
      ) : (
        <>
          <p className="mb-2 text-xs text-slate-500">
            Last test {capture.receivedAt ? new Date(capture.receivedAt).toLocaleString() : ""}. Choose where each field goes; Automatic recognises name, email and phone by their usual names.
          </p>
          <ul className="space-y-1.5">
            {capture.fields.map((f) => (
              <li key={f.key} className="grid grid-cols-[1fr_auto] items-center gap-2">
                <div className="min-w-0">
                  <p className="truncate font-mono text-xs">{f.key}</p>
                  <p className="truncate text-xs text-slate-500" title={f.value}>
                    {f.value || "(empty)"} · <span className="font-mono">{`{{variables.${varKey(f.key)}}}`}</span>
                  </p>
                </div>
                <select
                  className="input w-36 py-1 text-xs"
                  value={mapping[f.key] ?? ""}
                  onChange={(e) => {
                    const next = { ...mapping };
                    if (e.target.value) next[f.key] = e.target.value;
                    else delete next[f.key];
                    onMapping(next);
                  }}
                >
                  {MAP_TARGETS.map(([v, l]) => (
                    <option key={v} value={v}>{l}</option>
                  ))}
                  {customFields.length > 0 && (
                    <optgroup label="Custom field">
                      {customFields.map((cf) => (
                        <option key={cf.key} value={`custom:${cf.key}`}>{cf.label}</option>
                      ))}
                    </optgroup>
                  )}
                </select>
              </li>
            ))}
          </ul>
          {customFields.length === 0 && (
            <p className="mt-2 text-xs text-slate-500">
              To keep a field like City on the contact, add it in{" "}
              <Link href="/settings/fields" className="underline">Settings → Custom Fields</Link>.
            </p>
          )}
        </>
      )}
    </div>
  );
}


// WabaTemplatePicker loads the tenant's WhatsApp templates and lets the step
// choose an APPROVED one — cold WhatsApp sends must use an approved template.
function WabaTemplatePicker({
  templateId,
  variables,
  customFields,
  onSelect,
  onVariables,
}: {
  templateId: string;
  variables: string[];
  customFields: CustomField[];
  onSelect: (id: string, name: string, language: string) => void;
  onVariables: (v: string[]) => void;
}) {
  const [all, setAll] = useState<WabaTemplate[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    async function run() {
      try {
        const list = await api<WabaTemplate[]>("/waba");
        if (alive) setAll(list);
      } catch {
        if (alive) setAll([]);
      } finally {
        if (alive) setLoading(false);
      }
    }
    run();
    return () => {
      alive = false;
    };
  }, []);

  const approved = all.filter((t) => t.status === "APPROVED");

  if (loading) return <p className="text-xs text-slate-400">Loading templates…</p>;

  if (approved.length === 0) {
    return (
      <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
        No <span className="font-medium">approved</span> WhatsApp templates yet. Create one in{" "}
        <span className="font-medium">WhatsApp Templates</span> and submit it for approval — only
        approved templates can be sent.
      </p>
    );
  }

  return (
    <Field label="WhatsApp template">
      <select
        className="input"
        value={templateId}
        onChange={(e) => {
          const t = approved.find((x) => x._id === e.target.value);
          onSelect(e.target.value, t?.name ?? "", t?.language ?? "");
        }}
      >
        <option value="">Select a template…</option>
        {approved.map((t) => (
          <option key={t._id} value={t._id}>
            {t.name} ({t.language})
          </option>
        ))}
      </select>
      <WabaVariables
        template={approved.find((t) => t._id === templateId)}
        variables={variables}
        customFields={customFields}
        onVariables={onVariables}
      />
    </Field>
  );
}

const SAMPLE_CONTACT: Record<string, string> = { name: "Asha Rao", email: "asha@example.com", phone: "+91 98765 43210", pipelineName: "Sales" };

/*
Fill each {{1}}, {{2}}... of the template, with a preview of the message as a
contact would see it. A slot left on "Template default" uses the mapping saved
on the template itself.
*/
function WabaVariables({
  template,
  variables,
  customFields,
  onVariables,
}: {
  template?: WabaTemplate;
  variables: string[];
  customFields: CustomField[];
  onVariables: (v: string[]) => void;
}) {
  if (!template) return null;
  const count = Math.max(0, ...Array.from(template.body.matchAll(/\{\{\s*(\d+)\s*\}\}/g), (m) => Number(m[1])));
  const slot = (i: number) => variables[i] ?? "";
  const setSlot = (i: number, v: string) => {
    const next = Array.from({ length: count }, (_, j) => slot(j));
    next[i] = v;
    onVariables(next);
  };
  const sample = (src: string, i: number) => {
    const cut = src.indexOf(":");
    const kind = cut < 0 ? src : src.slice(0, cut);
    const arg = cut < 0 ? "" : src.slice(cut + 1);
    if (kind === "text") return arg || `value ${i + 1}`;
    if (kind === "custom") return `[${customFields.find((f) => f.key === arg)?.label ?? arg}]`;
    if (kind === "var") return `[${arg || "webhook field"}]`;
    return SAMPLE_CONTACT[kind] ?? template.variableSamples?.[i] ?? `value ${i + 1}`;
  };
  const preview = template.body.replace(/\{\{\s*(\d+)\s*\}\}/g, (_, n) => sample(slot(Number(n) - 1), Number(n) - 1));

  return (
    <div className="mt-3 space-y-2">
      {count > 0 && <p className="text-sm font-medium">Fill the variables</p>}
      {Array.from({ length: count }, (_, i) => {
        const src = slot(i);
        const kind = src.split(":")[0];
        return (
          <div key={i} className="grid grid-cols-[auto_1fr] items-center gap-2">
            <span className="w-10 font-mono text-xs text-slate-500">{`{{${i + 1}}}`}</span>
            <div className="flex gap-1.5">
              <select
                className="input py-1 text-xs"
                value={kind === "custom" || kind === "var" || kind === "text" ? (kind === "custom" ? src : kind) : src}
                onChange={(e) => setSlot(i, e.target.value === "var" ? "var:" : e.target.value === "text" ? "text:" : e.target.value)}
              >
                <option value="">Template default</option>
                <option value="name">Contact name</option>
                <option value="phone">Contact phone</option>
                <option value="email">Contact email</option>
                <option value="pipelineName">Pipeline name</option>
                {customFields.map((f) => (
                  <option key={f.key} value={`custom:${f.key}`}>{f.label}</option>
                ))}
                <option value="var">Webhook field…</option>
                <option value="text">Fixed text…</option>
              </select>
              {(kind === "var" || kind === "text") && (
                <input
                  className="input py-1 text-xs"
                  placeholder={kind === "var" ? "field name, e.g. city" : "Text"}
                  value={src.slice(kind.length + 1)}
                  onChange={(e) => setSlot(i, `${kind}:${e.target.value}`)}
                />
              )}
            </div>
          </div>
        );
      })}
      <div className="rounded-xl bg-[#e7ddd3] p-3 dark:bg-slate-800">
        <div className="max-w-[90%] rounded-lg rounded-tl-none bg-white px-3 py-2 text-sm shadow-sm dark:bg-slate-700">
          {template.headerType === "TEXT" && template.headerText && <p className="mb-1 font-semibold">{template.headerText}</p>}
          <p className="whitespace-pre-wrap">{preview}</p>
          {template.footer && <p className="mt-1 text-xs text-slate-400">{template.footer}</p>}
        </div>
        <p className="mt-1.5 text-[11px] text-slate-600 dark:text-slate-300">Preview with a sample contact. Sent to the contact&apos;s phone.</p>
      </div>
    </div>
  );
}

// summaryFor builds the one-line description shown under a node's title.
function summaryFor(step: WorkflowStep, templates: EmailTemplate[]): string {
  const c = step.config ?? {};
  const s = (k: string) => (typeof c[k] === "string" ? (c[k] as string) : "");
  switch (step.type) {
    case "send_email": {
      if (s("mode") !== "custom" && s("templateId")) {
        const name = s("templateName") || templates.find((t) => t._id === s("templateId"))?.name;
        return name ? `Template: ${name}` : "";
      }
      return s("subject") || (s("body") ? "Custom email" : "");
    }
    case "send_whatsapp":
      return s("templateName") ? `Template: ${s("templateName")}` : "";
    case "send_sms":
      return s("message") ? "Message set" : "";
    case "add_tag":
    case "remove_tag":
      return s("tag");
    case "update_field":
      return s("field") ? `${s("field")} = ${s("value")}` : "";
    case "if_else":
    case "filter":
    case "goal_exit":
      if (s("field") === "replied") return s("value") === "no" ? "did not reply" : "replied on WhatsApp";
      return s("field") ? `${s("field").replace(/^custom\.|^var\./, "")} ${(s("operator") || "equals").replace("_", " ")} ${s("value")}`.trim() : "";
    case "end_workflow":
      return "ends the run";
    case "waba_window":
      return "messaged in the last 24h?";
    case "wait_reply":
      return `up to ${s("timeoutHours") || "24"} hours`;
    default:
      // Delay/timing steps store amount + unit.
      if (s("amount") && s("unit")) {
        const d = durationLabel(s("amount"), s("unit"));
        return s("windowStart") ? `${d}, then ${s("windowStart")}–${s("windowEnd")}` : d;
      }
      return s("notes") ? "configured" : "";
  }
}

/**
 * A duration in words, with the unit made singular where it should be.
 *
 * The step card read "Delay · 1 days". Small, but it is on the canvas of the
 * feature the product is sold on, and that is the kind of detail that makes
 * software look unfinished.
 */
function durationLabel(amount: string, unit: string): string {
  const n = Number(amount);
  if (!Number.isFinite(n)) return `${amount} ${unit}`;
  const singular = unit.replace(/s$/, "");
  return `${amount} ${n === 1 ? singular : unit}`;
}

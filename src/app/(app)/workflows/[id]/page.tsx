"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ApiError, api } from "@/lib/api";
import type {
  CatalogItem,
  EmailTemplate,
  PublishProblem,
  WabaTemplate,
  Workflow,
  WorkflowActivity,
  WorkflowCatalog,
  WorkflowStep,
} from "@/lib/types";
import { CatalogPicker } from "@/components/workflow/CatalogPicker";
import {
  ROOT,
  addToContainer,
  containerId,
  findStep,
  removeStep,
  updateStep,
} from "@/lib/workflowTree";

function genId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return "s_" + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export default function WorkflowBuilderPage() {
  const { id } = useParams<{ id: string }>();

  const [wf, setWf] = useState<Workflow | null>(null);
  const [catalog, setCatalog] = useState<WorkflowCatalog | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  // The owner's saved email templates, for the Send Email step's picker.
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);

  // Picker: either choosing the trigger, or adding a step to a container.
  const [picker, setPicker] = useState<{ mode: "trigger" | "step"; container?: string } | null>(
    null,
  );
  // Config panel selection: the trigger, or a step by id.
  const [selected, setSelected] = useState<{ kind: "trigger" | "step"; id?: string } | null>(null);
  const [showActivity, setShowActivity] = useState(false);

  useEffect(() => {
    async function run() {
      try {
        const [w, c] = await Promise.all([
          api<Workflow>(`/workflows/${id}`),
          api<WorkflowCatalog>("/workflows/catalog"),
        ]);
        setWf(w);
        setCatalog(c);
        // Templates are a nice-to-have for the Send Email picker; a missing
        // "email" feature shouldn't break the builder.
        try {
          setTemplates(await api<EmailTemplate[]>("/templates"));
        } catch {
          setTemplates([]);
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
    setDirty(true);
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
      patch({ steps: addToContainer(wf.steps, picker.container ?? ROOT, step) });
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
        setDirty(true);
        setSelected(null);
      } else if (selected.kind === "step" && selected.id) {
        const sid = selected.id;
        setWf((prev) => (prev ? { ...prev, steps: removeStep(prev.steps, sid) } : prev));
        setDirty(true);
        setSelected(null);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected]);

  // Why a publish was refused, listed under the top bar until it is fixed.
  const [blockers, setBlockers] = useState<PublishProblem[]>([]);

  async function save(nextStatus?: "draft" | "published") {
    if (!wf) return;
    setSaving(true);
    setError("");
    setBlockers([]);
    try {
      const body = {
        name: wf.name,
        status: nextStatus ?? wf.status,
        trigger: wf.trigger,
        triggerConfig: wf.triggerConfig,
        steps: wf.steps,
      };
      const saved = await api<Workflow>(`/workflows/${id}`, { method: "PUT", body });
      setWf(saved);
      setDirty(false);
    } catch (e) {
      // 422 is the pre-flight refusal: the server lists what is unconfigured
      // rather than publishing something that would silently do nothing.
      if (e instanceof ApiError && e.status === 422 && Array.isArray(e.detail?.problems)) {
        setBlockers(e.detail.problems as PublishProblem[]);
      }
      setError(e instanceof Error ? e.message : "Could not save");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p className="p-6 text-sm text-slate-500">Loading…</p>;
  if (!wf || !catalog) return <p className="p-6 text-sm text-rose-600">{error || "Not found"}</p>;

  const triggerItem = wf.trigger ? itemByKey[wf.trigger] : null;
  const selectedStep =
    selected?.kind === "step" && selected.id ? findStep(wf.steps, selected.id) : null;

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col">
      {/* Top bar */}
      <div className="flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-2.5">
        <Link href="/workflows" className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100">
          ←
        </Link>
        <input
          value={wf.name}
          onChange={(e) => patch({ name: e.target.value })}
          className="max-w-xs rounded-lg border border-transparent px-2 py-1 text-lg font-semibold hover:border-slate-200 focus:border-slate-300 focus:outline-none"
        />
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-medium ${
            wf.status === "published" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"
          }`}
        >
          {wf.status}
        </span>
        {dirty && <span className="text-xs text-amber-600">Unsaved</span>}
        {selected && (
          <span className="hidden text-xs text-slate-400 sm:inline">
            Press <kbd className="rounded border border-slate-300 px-1">Del</kbd> to remove selected
          </span>
        )}

        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => setShowActivity(true)}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50"
          >
            Activity
          </button>
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
            className="rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>

      {error && blockers.length === 0 && (
        <p className="border-b border-rose-100 bg-rose-50 px-4 py-2 text-sm text-rose-700">{error}</p>
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

      <div className="flex flex-1 overflow-hidden">
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
              onAdd={(c) => setPicker({ mode: "step", container: c })}
            />
          </div>
        </div>

        {/* Config panel */}
        {selected && (
          <div className="w-96 shrink-0 overflow-y-auto border-l border-slate-200 bg-white p-5">
            {selected.kind === "trigger" && triggerItem ? (
              <TriggerConfig
                item={triggerItem}
                onChangeTrigger={() => setPicker({ mode: "trigger" })}
                onRemove={clearTrigger}
                onClose={() => setSelected(null)}
              />
            ) : selectedStep ? (
              <StepConfig
                step={selectedStep}
                item={itemByKey[selectedStep.type]}
                templates={templates}
                onChange={(p) => editStep(selectedStep.id, p)}
                onClose={() => setSelected(null)}
              />
            ) : null}
          </div>
        )}
      </div>

      {showActivity && <ActivityDrawer workflowId={id} onClose={() => setShowActivity(false)} />}

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
  onAdd: (container: string) => void;
}) {
  return (
    <div className="flex w-full flex-col items-center">
      {steps.map((s) => {
        const branches = itemByKey[s.type]?.branches;
        return (
          <div key={s.id} className="flex w-full flex-col items-center">
            <Connector />
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
          render their own add button below the branch steps). */}
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

function TriggerConfig({
  item,
  onChangeTrigger,
  onRemove,
  onClose,
}: {
  item: CatalogItem;
  onChangeTrigger: () => void;
  onRemove: () => void;
  onClose: () => void;
}) {
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
      <p className="mb-4 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
        This is the entry point of the workflow. Trigger-specific filters will be configurable when
        live execution is wired.
      </p>

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
  onChange,
  onClose,
}: {
  step: WorkflowStep;
  item?: CatalogItem;
  templates: EmailTemplate[];
  onChange: (patch: Partial<WorkflowStep>) => void;
  onClose: () => void;
}) {
  const cfg = step.config ?? {};
  const set = (key: string, value: unknown) => onChange({ config: { ...cfg, [key]: value } });
  const setMany = (obj: Record<string, unknown>) => onChange({ config: { ...cfg, ...obj } });
  const str = (key: string) => (typeof cfg[key] === "string" ? (cfg[key] as string) : "");

  const isDelay = item?.kind === "delay";
  const emailMode = str("mode") || (templates.length ? "template" : "custom");
  const hasDedicated =
    isDelay ||
    ["send_email", "send_sms", "send_whatsapp", "add_tag", "remove_tag", "update_field", "if_else"].includes(
      step.type,
    );

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

        {step.type === "send_sms" && (
          <Field label="Message">
            <textarea className="input min-h-24" value={str("message")} onChange={(e) => set("message", e.target.value)} />
          </Field>
        )}

        {step.type === "send_whatsapp" && (
          <WabaTemplatePicker
            templateId={str("templateId")}
            onSelect={(id, name, language) =>
              setMany({ templateId: id, templateName: name, templateLanguage: language })
            }
          />
        )}

        {(step.type === "add_tag" || step.type === "remove_tag") && (
          <Field label="Tag">
            <input className="input" value={str("tag")} onChange={(e) => set("tag", e.target.value)} placeholder="e.g. hot-lead" />
          </Field>
        )}

        {step.type === "update_field" && (
          <>
            <Field label="Field">
              <input className="input" value={str("field")} onChange={(e) => set("field", e.target.value)} placeholder="e.g. status" />
            </Field>
            <Field label="Value">
              <input className="input" value={str("value")} onChange={(e) => set("value", e.target.value)} />
            </Field>
          </>
        )}

        {/* Any delay/timing step gets the duration UI with quick presets. */}
        {isDelay && (
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
            <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
              The workflow pauses here and resumes after the wait period.
            </p>
          </>
        )}

        {step.type === "if_else" && (
          <>
            <Field label="Field">
              <input className="input" value={str("field")} onChange={(e) => set("field", e.target.value)} placeholder="e.g. tag, stage, value" />
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Operator">
                <select className="input" value={str("operator") || "equals"} onChange={(e) => set("operator", e.target.value)}>
                  <option value="equals">Equals</option>
                  <option value="not_equals">Not equals</option>
                  <option value="contains">Contains</option>
                  <option value="greater">Greater than</option>
                  <option value="less">Less than</option>
                  <option value="exists">Exists</option>
                </select>
              </Field>
              <Field label="Value">
                <input className="input" value={str("value")} onChange={(e) => set("value", e.target.value)} />
              </Field>
            </div>
            <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
              Matching contacts follow the <span className="font-medium text-emerald-600">Yes</span>{" "}
              branch; everyone else follows <span className="font-medium text-rose-600">No</span>.
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

// Colors + icons for each activity action.
/*
 * Every state gets its own glyph, not just its own colour.
 *
 * A skipped send used to carry the same ✉ or ◆ as a successful one and differed
 * only in hue, so a dry-run notice read as an ordinary informational line. The
 * glyph now says what happened before colour is considered at all — which is
 * also the only version that works for a colour-blind reader.
 */
const ACTIVITY_STYLE: Record<string, { icon: string; cls: string }> = {
  enrolled: { icon: "→", cls: "text-slate-600" },
  email_sent: { icon: "✉", cls: "text-emerald-600" },
  email_failed: { icon: "✕", cls: "text-rose-600" },
  email_skipped: { icon: "▲", cls: "text-amber-600" },
  whatsapp_sent: { icon: "◆", cls: "text-emerald-600" },
  whatsapp_failed: { icon: "✕", cls: "text-rose-600" },
  whatsapp_skipped: { icon: "▲", cls: "text-amber-600" },
  delay: { icon: "⏱", cls: "text-slate-500" },
  branch: { icon: "⑃", cls: "text-blue-600" },
  completed: { icon: "✓", cls: "text-emerald-700" },
  // A run that finished with steps that never ran is not a success. It used to
  // show the same green tick as a clean run, which is how you demo a WhatsApp
  // workflow that has never sent a message and see nothing but ticks.
  completed_with_issues: { icon: "▲", cls: "text-amber-700" },
  failed: { icon: "✕", cls: "text-rose-600" },
  skipped: { icon: "▲", cls: "text-amber-600" },
};

// ActivityDrawer shows the recent run timeline for this workflow: which contacts
// entered it and what happened to them (sent/skipped/failed/waiting/done).
function ActivityDrawer({ workflowId, onClose }: { workflowId: string; onClose: () => void }) {
  const [events, setEvents] = useState<WorkflowActivity[] | null>(null);
  const [error, setError] = useState("");

  async function load() {
    setError("");
    try {
      setEvents(await api<WorkflowActivity[]>(`/workflows/${workflowId}/activity`));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load activity");
      setEvents([]);
    }
  }

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const list = await api<WorkflowActivity[]>(`/workflows/${workflowId}/activity`);
        if (alive) setEvents(list);
      } catch (e) {
        if (alive) {
          setError(e instanceof Error ? e.message : "Could not load activity");
          setEvents([]);
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, [workflowId]);

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex h-full w-full max-w-md flex-col bg-white shadow-xl"
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <div>
            <h3 className="font-semibold">Activity</h3>
            <p className="text-xs text-slate-400">Recent runs for this workflow</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={load}
              className="rounded-lg border border-slate-300 px-2.5 py-1 text-xs hover:bg-slate-50"
            >
              ↻ Refresh
            </button>
            <button onClick={onClose} className="rounded p-1 text-slate-400 hover:bg-slate-100">
              ✕
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {error && (
            <p className="mb-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>
          )}
          {events === null ? (
            <p className="text-sm text-slate-500">Loading…</p>
          ) : events.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
              No activity yet. Publish the workflow and create a contact to see runs here.
            </div>
          ) : (
            <ul className="space-y-3">
              {events.map((ev) => {
                const style = ACTIVITY_STYLE[ev.action] ?? { icon: "•", cls: "text-slate-500" };
                return (
                  <li key={ev._id} className="flex gap-3">
                    <span className={`mt-0.5 text-sm ${style.cls}`}>{style.icon}</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm">
                        <span className="font-medium">{ev.contact || "Contact"}</span>{" "}
                        <span className="text-slate-500">· {ev.detail}</span>
                      </p>
                      <p className="text-xs text-slate-400">
                        {new Date(ev.createdAt).toLocaleString()}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

// WabaTemplatePicker loads the tenant's WhatsApp templates and lets the step
// choose an APPROVED one — cold WhatsApp sends must use an approved template.
function WabaTemplatePicker({
  templateId,
  onSelect,
}: {
  templateId: string;
  onSelect: (id: string, name: string, language: string) => void;
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
      <p className="mt-1 text-xs text-slate-400">
        Sent to the contact&apos;s phone. Variables are filled from the contact automatically.
      </p>
    </Field>
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
      return s("field") ? `${s("field")} ${s("operator") || "equals"} ${s("value")}`.trim() : "";
    default:
      // Delay/timing steps store amount + unit.
      if (s("amount") && s("unit")) return `${s("amount")} ${s("unit")}`;
      return s("notes") ? "configured" : "";
  }
}

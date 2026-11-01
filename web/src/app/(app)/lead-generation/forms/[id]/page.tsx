"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  DragDropContext,
  Draggable,
  type DropResult,
} from "@hello-pangea/dnd";
import { StrictModeDroppable } from "@/components/StrictModeDroppable";
import { api } from "@/lib/api";
import { MultiSelect } from "@/components/leadgen/MultiSelect";
import { PHONE_PATTERN, PHONE_TITLE, sanitizePhoneInput } from "@/lib/phone";
import { DEFAULT_HTML_BLOCK, isContentField } from "@/lib/formFields";
import type {
  Form,
  FormCatalog,
  FormElement,
  FormField,
  FormStyles,
  FormTheme,
  Pipeline,
  Stage,
} from "@/lib/types";

function genId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return "f_" + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function makeField(el: FormElement): FormField {
  return {
    id: genId(),
    type: el.key,
    label: el.label,
    placeholder: el.placeholder,
    required: false,
    options: el.hasOptions ? ["Option 1", "Option 2"] : undefined,
    // Seeded rather than empty: a block dropped onto the canvas has to show
    // something, or it reads as a bug.
    html: el.content ? DEFAULT_HTML_BLOCK : undefined,
  };
}

// Resolve a style value, falling back when a color is "auto" (empty).
function effective(styles: FormStyles) {
  return {
    page: styles.pageBackground || "#ffffff",
    card: styles.formCard || "#ffffff",
    text: styles.textColor || "#0f172a",
    inputBg: styles.inputBackground || "#ffffff",
    inputText: styles.inputText || "#0f172a",
    button: styles.buttonBackground || "#2563eb",
    buttonText: styles.buttonText || "#ffffff",
    radius: styles.cornerRadius ?? 8,
  };
}

export default function FormBuilderPage() {
  /*
   * Where submissions go.
   *
   * The Form model has carried a destination all along and resolveTargetStage
   * reads it, but nothing could write one — so every form delivered to the
   * first pipeline's first stage with no way to choose, which is exactly the
   * "I cannot get these contacts into my pipeline" problem.
   */
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [stages, setStages] = useState<Stage[]>([]);

  const { id } = useParams<{ id: string }>();

  const [form, setForm] = useState<Form | null>(null);
  const [catalog, setCatalog] = useState<FormCatalog | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const [preview, setPreview] = useState(false);
  const [share, setShare] = useState(false);
  const [rightTab, setRightTab] = useState<"customize" | "themes">("customize");

  useEffect(() => {
    async function loadDestinations() {
      try {
        const list = await api<Pipeline[]>("/pipelines");
        setPipelines(list);
        const all = await Promise.all(
          list.map((pl) =>
            api<Stage[]>(`/pipelines/${pl._id}/stages`).catch(() => [] as Stage[]),
          ),
        );
        setStages(all.flat());
      } catch {
        // A plan without pipelines still has a usable form builder; the picker
        // simply says there is nowhere to deliver to yet.
        setPipelines([]);
        setStages([]);
      }
    }
    void loadDestinations();
  }, []);

  useEffect(() => {
    async function run() {
      try {
        const [f, c] = await Promise.all([
          api<Form>(`/forms/${id}`),
          api<FormCatalog>("/forms/catalog"),
        ]);
        setForm(f);
        setCatalog(c);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not load form");
      } finally {
        setLoading(false);
      }
    }
    run();
  }, [id]);

  // Flattened palette, so a DnD source index maps back to an element.
  const flatElements = useMemo<FormElement[]>(
    () => (catalog ? catalog.elements.flatMap((g) => g.items) : []),
    [catalog],
  );

  function patch(next: Partial<Form>) {
    setForm((prev) => (prev ? { ...prev, ...next } : prev));
    setDirty(true);
  }

  function setFields(fields: FormField[]) {
    patch({ fields });
  }

  function addField(el: FormElement) {
    if (!form) return;
    const field = makeField(el);
    setFields([...form.fields, field]);
    setSelectedId(field.id);
  }

  function editField(fieldId: string, p: Partial<FormField>) {
    if (!form) return;
    setFields(form.fields.map((f) => (f.id === fieldId ? { ...f, ...p } : f)));
  }

  function deleteField(fieldId: string) {
    if (!form) return;
    setFields(form.fields.filter((f) => f.id !== fieldId));
    if (selectedId === fieldId) setSelectedId(null);
  }

  function onDragEnd(result: DropResult) {
    if (!form) return;
    const { source, destination } = result;
    if (!destination) return;

    if (source.droppableId === "palette") {
      if (destination.droppableId !== "canvas") return;
      const el = flatElements[source.index];
      if (!el) return;
      const field = makeField(el);
      const next = [...form.fields];
      next.splice(destination.index, 0, field);
      setFields(next);
      setSelectedId(field.id);
      return;
    }
    if (source.droppableId === "canvas" && destination.droppableId === "canvas") {
      const next = [...form.fields];
      const [moved] = next.splice(source.index, 1);
      next.splice(destination.index, 0, moved);
      setFields(next);
    }
  }

  function applyTheme(theme: FormTheme) {
    if (!form) return;
    // Apply the preset's colors but keep the user's radius + submit label.
    patch({
      theme: theme.key,
      styles: {
        ...theme.styles,
        cornerRadius: form.styles.cornerRadius,
        submitLabel: form.styles.submitLabel,
      },
    });
  }

  async function save(nextStatus?: "draft" | "published") {
    if (!form) return;
    setSaving(true);
    setError("");
    try {
      const saved = await api<Form>(`/forms/${id}`, {
        method: "PUT",
        body: {
          name: form.name,
          status: nextStatus ?? form.status,
          fields: form.fields,
          styles: form.styles,
          theme: form.theme,
          layout: form.layout ?? "classic",
          // Only the stage; the server derives the pipeline from it.
          stageId: form.stageId ?? "",
        },
      });
      setForm(saved);
      setDirty(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p className="p-6 text-sm text-slate-500">Loading…</p>;
  if (!form || !catalog)
    return <p className="p-6 text-sm text-rose-600">{error || "Not found"}</p>;

  const selectedField = selectedId ? form.fields.find((f) => f.id === selectedId) ?? null : null;
  const eff = effective(form.styles);

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col">
      {/* Top bar */}
      <div className="flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-2.5">
        <Link href="/lead-generation" className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100">
          ←
        </Link>
        <input
          value={form.name}
          onChange={(e) => patch({ name: e.target.value })}
          className="max-w-xs rounded-lg border border-transparent px-2 py-1 text-base font-semibold hover:border-slate-200 focus:border-slate-300 focus:outline-none"
        />
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-medium ${
            form.status === "published" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"
          }`}
        >
          {form.status}
        </span>
        {dirty && <span className="text-xs text-amber-600">Unsaved</span>}

        <div className="ml-auto flex items-center gap-2">
          {/* Device toggle (affects canvas width only) */}
          <div className="flex overflow-hidden rounded-lg border border-slate-300">
            <button
              onClick={() => setDevice("desktop")}
              className={`px-2 py-1.5 text-sm ${device === "desktop" ? "bg-slate-900 text-white" : "hover:bg-slate-50"}`}
              title="Desktop"
            >
              🖥
            </button>
            <button
              onClick={() => setDevice("mobile")}
              className={`px-2 py-1.5 text-sm ${device === "mobile" ? "bg-slate-900 text-white" : "hover:bg-slate-50"}`}
              title="Mobile"
            >
              📱
            </button>
          </div>
          <button
            onClick={() => setPreview(true)}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50"
          >
            👁 Preview
          </button>
          {/* Only a published form has a working link — an unpublished one
              resolves to "not available", so offering the link would mislead. */}
          {form.status === "published" && (
            <button
              onClick={() => setShare(true)}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50"
            >
              🔗 Share
            </button>
          )}
          <button
            onClick={() => save(form.status === "published" ? "draft" : "published")}
            disabled={saving}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50 disabled:opacity-50"
          >
            {form.status === "published" ? "Unpublish" : "Publish"}
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

      {error && (
        <p className="border-b border-rose-100 bg-rose-50 px-4 py-2 text-sm text-rose-700">{error}</p>
      )}

      <DragDropContext onDragEnd={onDragEnd}>
        <div className="flex flex-1 overflow-hidden">
          {/* Palette */}
          <div className="w-64 shrink-0 overflow-y-auto border-r border-slate-200 bg-white p-4">
            <h2 className="mb-1 text-sm font-semibold">Form Element</h2>
            <p className="mb-3 text-xs text-slate-400">Drag onto the canvas, or click to add.</p>
            <PaletteList groups={catalog.elements} onClickItem={addField} />
          </div>

          {/* Canvas */}
          <div className="flex-1 overflow-auto p-8" style={{ background: eff.page }}>
            <div className={`mx-auto ${device === "mobile" ? "max-w-sm" : "max-w-2xl"}`}>
              <StrictModeDroppable droppableId="canvas">
                {(provided, snapshot) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    className={`rounded-2xl border p-6 shadow-sm transition ${
                      snapshot.isDraggingOver ? "border-blue-400 ring-2 ring-blue-100" : "border-slate-200"
                    }`}
                    style={{ background: eff.card, color: eff.text, borderRadius: eff.radius + 8 }}
                  >
                    {form.fields.length === 0 && !snapshot.isDraggingOver && (
                      <div className="mb-4 rounded-xl border-2 border-dashed border-slate-300 py-12 text-center text-sm text-slate-400">
                        Drag elements here to build your form
                      </div>
                    )}

                    {form.fields.map((field, i) => (
                      <Draggable key={field.id} draggableId={field.id} index={i}>
                        {(dp, ds) => (
                          <div
                            ref={dp.innerRef}
                            {...dp.draggableProps}
                            onClick={() => setSelectedId(field.id)}
                            className={`group relative mb-3 rounded-lg border p-3 transition ${
                              selectedId === field.id
                                ? "border-blue-400 ring-1 ring-blue-200"
                                : "border-transparent hover:border-slate-200"
                            } ${ds.isDragging ? "bg-white shadow-lg" : ""}`}
                          >
                            <div className="mb-1 flex items-center gap-2">
                              <span
                                {...dp.dragHandleProps}
                                className="cursor-grab text-slate-300 hover:text-slate-500"
                                title="Drag to reorder"
                              >
                                ⠿
                              </span>
                              <label className="text-sm font-medium">
                                {field.label}
                                {field.required && <span className="text-rose-500"> *</span>}
                              </label>
                              {isContentField(field) && (
                                // Named on the canvas only. The live form shows
                                // the markup alone, with no label above it.
                                <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-500">
                                  Content
                                </span>
                              )}
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  deleteField(field.id);
                                }}
                                className="ml-auto text-slate-300 opacity-0 hover:text-rose-600 group-hover:opacity-100"
                                title="Remove field"
                              >
                                ✕
                              </button>
                            </div>
                            <FieldPreview field={field} eff={eff} />
                          </div>
                        )}
                      </Draggable>
                    ))}
                    {provided.placeholder}

                    {/* Persistent submit button */}
                    <button
                      type="button"
                      className="mt-2 w-full py-3 text-sm font-semibold uppercase tracking-wide"
                      style={{
                        background: eff.button,
                        color: eff.buttonText,
                        borderRadius: eff.radius,
                      }}
                    >
                      {form.styles.submitLabel || "Submit"}
                    </button>
                  </div>
                )}
              </StrictModeDroppable>
            </div>
          </div>

          {/* Right panel */}
          <div className="w-80 shrink-0 overflow-y-auto border-l border-slate-200 bg-white p-5">
            {selectedField ? (
              <FieldSettings
                field={selectedField}
                onChange={(p) => editField(selectedField.id, p)}
                onClose={() => setSelectedId(null)}
              />
            ) : (
              <StylePanel
                styles={form.styles}
                themes={catalog.themes}
                activeTheme={form.theme}
                layout={form.layout ?? "classic"}
                stageId={form.stageId ?? ""}
                pipelines={pipelines}
                stages={stages}
                tab={rightTab}
                onTab={setRightTab}
                onChange={(styles) => patch({ styles })}
                onTheme={applyTheme}
                onLayout={(layout) => patch({ layout })}
                onStage={(stageId) => patch({ stageId: stageId || null })}
              />
            )}
          </div>
        </div>
      </DragDropContext>

      {preview && (
        <PreviewOverlay form={form} onClose={() => setPreview(false)} />
      )}

      {share && form && (
        <ShareOverlay form={form} onClose={() => setShare(false)} />
      )}
    </div>
  );
}

// --- Palette --------------------------------------------------------------

function PaletteList({
  groups,
  onClickItem,
}: {
  groups: FormCatalog["elements"];
  onClickItem: (el: FormElement) => void;
}) {
  // A single palette Droppable spans every group so DnD indices stay contiguous.
  // Precompute each element's flat index (no render-time counter mutation).
  const flatIndex = new Map<string, number>();
  groups.flatMap((g) => g.items).forEach((it, i) => flatIndex.set(it.key, i));
  return (
    <StrictModeDroppable
      droppableId="palette"
      isDropDisabled
      renderClone={(provided, _snapshot, rubric) => {
        const all = groups.flatMap((g) => g.items);
        const el = all[rubric.source.index];
        return (
          <div
            ref={provided.innerRef}
            {...provided.draggableProps}
            {...provided.dragHandleProps}
            className="flex w-40 items-center gap-2 rounded-lg border border-blue-300 bg-white px-3 py-2 text-sm shadow-lg"
          >
            <span>{el?.icon}</span>
            <span className="font-medium">{el?.label}</span>
          </div>
        );
      }}
    >
      {(provided) => (
        <div ref={provided.innerRef} {...provided.droppableProps}>
          {groups.map((group) => (
            <div key={group.key} className="mb-4">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                {group.label}
              </p>
              <div className="grid grid-cols-3 gap-2">
                {group.items.map((item) => {
                  const i = flatIndex.get(item.key) ?? 0;
                  return (
                    <Draggable key={item.key} draggableId={`pal-${item.key}`} index={i}>
                      {(dp, ds) => (
                        <button
                          ref={dp.innerRef}
                          {...dp.draggableProps}
                          {...dp.dragHandleProps}
                          onClick={() => onClickItem(item)}
                          className={`flex flex-col items-center gap-1 rounded-lg border bg-white px-1 py-3 text-center text-[11px] font-medium transition hover:border-blue-400 hover:bg-blue-50 ${
                            ds.isDragging ? "border-blue-400 shadow-lg" : "border-slate-200"
                          }`}
                        >
                          <span className="text-lg">{item.icon}</span>
                          <span className="leading-tight text-slate-600">{item.label}</span>
                        </button>
                      )}
                    </Draggable>
                  );
                })}
              </div>
            </div>
          ))}
          {provided.placeholder}
        </div>
      )}
    </StrictModeDroppable>
  );
}

// --- Field preview (canvas) ----------------------------------------------

function FieldPreview({
  field,
  eff,
  interactive = false,
}: {
  field: FormField;
  eff: ReturnType<typeof effective>;
  // Canvas passes false: controls are disabled AND click-through, so clicking a
  // field selects it instead of getting swallowed by the control. Preview passes
  // true: controls are real and usable (dropdowns open, options selectable).
  interactive?: boolean;
}) {
  const inputStyle = {
    background: eff.inputBg,
    color: eff.inputText,
    borderRadius: eff.radius,
  } as const;
  const dis = !interactive;
  // A disabled control swallows the click, so on the canvas we let it pass
  // through to the row's onClick that selects the field.
  const base = `w-full border border-slate-300 px-3 py-2 text-sm${dis ? " pointer-events-none" : ""}`;
  const rowCls = `space-y-1.5${dis ? " pointer-events-none" : ""}`;
  const options = field.options ?? [];

  // Constraints only apply to a live form. On the canvas every control is
  // disabled, and a disabled control is exempt from validation anyway.
  const req = interactive && field.required;

  switch (field.type) {
    case "html":
      // dangerouslySetInnerHTML is safe here on the sanitize-on-write invariant:
      // the server runs models.SanitizeHTML on every save, so anything loaded
      // from the API is already filtered. The only unfiltered case is the live
      // unsaved edit, where the author and the viewer are the same person.
      return (
        <div
          className={dis ? "pointer-events-none" : undefined}
          dangerouslySetInnerHTML={{ __html: field.html ?? "" }}
        />
      );
    case "multi_line":
      return <textarea disabled={dis} required={req} placeholder={field.placeholder} className={`${base} min-h-20`} style={inputStyle} />;
    case "dob":
      return <input disabled={dis} required={req} type="date" className={base} style={inputStyle} />;
    case "email":
      // type="email" is validated natively by the browser.
      return (
        <input
          disabled={dis}
          required={req}
          type="email"
          inputMode="email"
          autoComplete="email"
          placeholder={field.placeholder}
          className={base}
          style={inputStyle}
        />
      );
    case "phone":
      // type="tel" has NO native validation — phone formats vary too much
      // worldwide — so onInput filters the keystroke and pattern is the backstop
      // for paste and autofill. inputMode brings up the numeric keypad, which
      // matters more than either for most people filling this in.
      return (
        <input
          disabled={dis}
          required={req}
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          onInput={(e) => {
            const el = e.currentTarget;
            const clean = sanitizePhoneInput(el.value);
            if (clean !== el.value) el.value = clean;
          }}
          pattern={PHONE_PATTERN}
          title={PHONE_TITLE}
          placeholder={field.placeholder}
          className={base}
          style={inputStyle}
        />
      );
    case "single_dropdown":
      return (
        <select disabled={dis} required={req} defaultValue="" className={base} style={inputStyle}>
          <option value="" disabled>
            {field.placeholder || "Select an option…"}
          </option>
          {options.map((o, i) => (
            <option key={i} value={o}>
              {o}
            </option>
          ))}
        </select>
      );
    case "multi_dropdown":
      // A real dropdown, not a checkbox list: the palette's separate Checkbox
      // element already renders one of those, and two elements that look
      // identical are two elements nobody can tell apart.
      return (
        <MultiSelect
          options={options}
          disabled={dis}
          required={req}
          placeholder={field.placeholder || "Select options…"}
          className={base}
          style={inputStyle}
        />
      );
    case "checkbox":
      return (
        <div className={rowCls}>
          {options.map((o, i) => (
            <label key={i} className="flex items-center gap-2 text-sm">
              <input type="checkbox" disabled={dis} /> {o}
            </label>
          ))}
          {options.length === 0 && <p className="text-xs text-slate-400">No options yet</p>}
        </div>
      );
    case "radio":
      return (
        <div className={rowCls}>
          {options.map((o, i) => (
            <label key={i} className="flex items-center gap-2 text-sm">
              <input type="radio" disabled={dis} name={field.id} /> {o}
            </label>
          ))}
          {options.length === 0 && <p className="text-xs text-slate-400">No options yet</p>}
        </div>
      );
    default:
      return <input disabled={dis} required={req} placeholder={field.placeholder} className={base} style={inputStyle} />;
  }
}


// --- Field settings (right panel) ----------------------------------------

function FieldSettings({
  field,
  onChange,
  onClose,
}: {
  field: FormField;
  onChange: (p: Partial<FormField>) => void;
  onClose: () => void;
}) {
  const hasOptions = field.options != null;
  const opts = field.options ?? [];
  // Single dropdown uses the placeholder as its "Select an option…" prompt, so
  // allow editing it even though it's a choice field.
  const showPlaceholder =
    field.type === "single_dropdown" || (!hasOptions && field.type !== "dob");
  // A content block asks nothing, so placeholder, required and options are all
  // meaningless for it. Showing them greyed out would still invite the question.
  const isContent = isContentField(field);

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h3 className="font-semibold">Field settings</h3>
        <button onClick={onClose} className="rounded p-1 text-slate-400 hover:bg-slate-100" title="Back to styles">
          ✕
        </button>
      </div>

      <div className="space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium">
            {isContent ? "Block name" : "Label"}
          </label>
          <input className="input" value={field.label} onChange={(e) => onChange({ label: e.target.value })} />
          {isContent && (
            <p className="mt-1 text-xs text-slate-500">
              Shown on the canvas only, so you can tell your blocks apart. It is
              not rendered on the live form.
            </p>
          )}
        </div>

        {isContent && (
          <div>
            <label className="mb-1 block text-sm font-medium">HTML</label>
            <textarea
              value={field.html ?? ""}
              onChange={(e) => onChange({ html: e.target.value })}
              spellCheck={false}
              rows={10}
              className="w-full resize-y rounded-lg border border-slate-300 px-2 py-1.5 font-mono text-xs outline-none focus:border-blue-400"
            />
            <p className="mt-1 text-xs text-slate-500">
              Text, headings, lists, links, images and tables are kept. Scripts,
              styles, iframes and extra form inputs are stripped when you save —
              this HTML is served on a public page, so it has to be safe to show
              to a stranger.
            </p>
          </div>
        )}

        {!isContent && showPlaceholder && (
          <div>
            <label className="mb-1 block text-sm font-medium">Placeholder</label>
            <input
              className="input"
              value={field.placeholder}
              onChange={(e) => onChange({ placeholder: e.target.value })}
            />
          </div>
        )}

        {!isContent && (
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={field.required}
              onChange={(e) => onChange({ required: e.target.checked })}
            />
            Required field
          </label>
        )}

        {hasOptions && (
          <div>
            <label className="mb-1 block text-sm font-medium">Options</label>
            <div className="space-y-2">
              {opts.map((o, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    className="input"
                    value={o}
                    onChange={(e) => {
                      const next = [...opts];
                      next[i] = e.target.value;
                      onChange({ options: next });
                    }}
                  />
                  <button
                    onClick={() => onChange({ options: opts.filter((_, j) => j !== i) })}
                    className="shrink-0 rounded p-1 text-slate-400 hover:text-rose-600"
                    title="Remove option"
                  >
                    ✕
                  </button>
                </div>
              ))}
              <button
                onClick={() => onChange({ options: [...opts, `Option ${opts.length + 1}`] })}
                className="text-sm text-blue-600 hover:underline"
              >
                + Add option
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// --- Style / theme panel --------------------------------------------------

function StylePanel({
  styles,
  themes,
  activeTheme,
  layout,
  stageId,
  pipelines,
  stages,
  tab,
  onTab,
  onChange,
  onTheme,
  onLayout,
  onStage,
}: {
  styles: FormStyles;
  themes: FormTheme[];
  activeTheme: string;
  layout: "classic" | "stepped";
  stageId: string;
  pipelines: Pipeline[];
  stages: Stage[];
  tab: "customize" | "themes";
  onTab: (t: "customize" | "themes") => void;
  onChange: (styles: FormStyles) => void;
  onTheme: (t: FormTheme) => void;
  onLayout: (l: "classic" | "stepped") => void;
  onStage: (stageId: string) => void;
}) {
  const set = (p: Partial<FormStyles>) => onChange({ ...styles, ...p });

  return (
    <div>
      <h3 className="mb-3 font-semibold">Styles &amp; Options</h3>

      {/*
        Where submissions go.

        First, because it is the only setting that decides whether a lead
        reaches the business at all. A form with the wrong destination still
        looks perfect and still says thank you.
      */}
      <div className="mb-4">
        <p className="mb-1.5 text-sm font-medium">Send submissions to</p>
        <select
          value={stageId}
          onChange={(e) => onStage(e.target.value)}
          className="input"
        >
          <option value="">First pipeline, first stage</option>
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
        <p className="mt-1.5 text-xs text-slate-500">
          {stageId
            ? "Every submission becomes a contact in this stage, and starts that stage's follow-up."
            : "Submissions land in whichever pipeline you made first. Choose a stage to be sure."}
        </p>
        {pipelines.length === 0 && (
          <p className="mt-1.5 rounded-lg bg-amber-50 px-2.5 py-1.5 text-xs text-amber-800">
            {/* The case where submissions are stored and no contact is created
                at all — which otherwise only appears in a server log. */}
            This account has no pipeline yet, so submissions are saved but no
            contact is created. Create a pipeline on the Board first.
          </p>
        )}
      </div>

      {/* Layout sits above the style tabs because it is not styling: it
          changes how the form is answered, not how it looks. */}
      <div className="mb-4">
        <p className="mb-1.5 text-sm font-medium">Layout</p>
        <div className="space-y-1.5">
          {(
            [
              ["classic", "All questions on one page", "Everything visible at once. Best for two or three short fields."],
              ["stepped", "One question at a time", "A progress bar and a Next button. Gets finished far more often on a phone."],
            ] as const
          ).map(([key, label, blurb]) => (
            <label
              key={key}
              className={`flex cursor-pointer items-start gap-2 rounded-lg border p-2.5 transition ${
                layout === key
                  ? "border-blue-500 ring-1 ring-blue-200"
                  : "border-slate-200 hover:border-slate-300"
              }`}
            >
              <input
                type="radio"
                name="form-layout"
                checked={layout === key}
                onChange={() => onLayout(key)}
                className="mt-0.5"
              />
              <span className="text-sm">
                <span className="font-medium">{label}</span>
                <span className="mt-0.5 block text-xs text-slate-500">{blurb}</span>
              </span>
            </label>
          ))}
        </div>
        <p className="mt-1.5 text-xs text-slate-500">
          {/* Said plainly because it is the question somebody asks before
              changing it on a form that is already collecting leads. */}
          Switching this does not change the questions or anything already
          collected.
        </p>
      </div>
      <div className="mb-4 grid grid-cols-2 gap-1 rounded-lg bg-slate-100 p-1 text-sm">
        <button
          onClick={() => onTab("customize")}
          className={`rounded-md py-1.5 font-medium ${tab === "customize" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}`}
        >
          Customize
        </button>
        <button
          onClick={() => onTab("themes")}
          className={`rounded-md py-1.5 font-medium ${tab === "themes" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}`}
        >
          Themes
        </button>
      </div>

      {tab === "customize" ? (
        <div className="space-y-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Basics</p>
          <ColorRow label="Page Background" value={styles.pageBackground} fallback="#ffffff" onChange={(v) => set({ pageBackground: v })} />
          <ColorRow label="Form Card" value={styles.formCard} fallback="#ffffff" onChange={(v) => set({ formCard: v })} />
          <ColorRow label="Text Colour" value={styles.textColor} fallback="#0f172a" onChange={(v) => set({ textColor: v })} />
          <ColorRow label="Input Background" value={styles.inputBackground} fallback="#ffffff" onChange={(v) => set({ inputBackground: v })} />
          <ColorRow label="Input Text" value={styles.inputText} fallback="#0f172a" onChange={(v) => set({ inputText: v })} />
          <ColorRow label="Button Background" value={styles.buttonBackground} fallback="#2563eb" onChange={(v) => set({ buttonBackground: v })} />
          <ColorRow label="Button Text" value={styles.buttonText} fallback="#ffffff" onChange={(v) => set({ buttonText: v })} />

          <div>
            <label className="mb-1 block text-sm font-medium">Corner Radius — all (px)</label>
            <input
              type="number"
              min={0}
              max={60}
              className="input"
              value={styles.cornerRadius}
              onChange={(e) => set({ cornerRadius: Number(e.target.value) || 0 })}
            />
            <p className="mt-1 text-xs text-slate-400">Sets card, input, and button corners together.</p>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">Submit Button Label</label>
            <input className="input" value={styles.submitLabel} onChange={(e) => set({ submitLabel: e.target.value })} />
          </div>
        </div>
      ) : (
        <div>
          <p className="mb-3 text-sm text-slate-500">Choose a theme preset to quickly style your form.</p>
          <div className="grid grid-cols-2 gap-3">
            {themes.map((t) => (
              <button
                key={t.key}
                onClick={() => onTheme(t)}
                className={`rounded-xl border p-3 text-left transition ${
                  activeTheme === t.key ? "border-blue-500 ring-1 ring-blue-200" : "border-slate-200 hover:border-slate-300"
                }`}
              >
                <div className="mb-2 flex gap-1">
                  {t.swatch.map((c, i) => (
                    <span key={i} className="h-5 w-5 rounded-full border border-slate-200" style={{ background: c }} />
                  ))}
                </div>
                <span className="text-sm font-medium">
                  {t.label}
                  {activeTheme === t.key && " ✓"}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// A color swatch + hex input. Empty value shows "auto" and uses the fallback.
function ColorRow({
  label,
  value,
  fallback,
  onChange,
}: {
  label: string;
  value: string;
  fallback: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium">{label}</label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={value || fallback}
          onChange={(e) => onChange(e.target.value)}
          className="h-8 w-10 shrink-0 cursor-pointer rounded border border-slate-300 bg-white p-0.5"
        />
        <input
          className="input"
          value={value}
          placeholder="auto"
          onChange={(e) => onChange(e.target.value)}
        />
      </div>
    </div>
  );
}

// --- Preview overlay ------------------------------------------------------

function PreviewOverlay({ form, onClose }: { form: Form; onClose: () => void }) {
  const eff = effective(form.styles);
  const [submitted, setSubmitted] = useState(false);

  // A <form> is what makes the browser enforce required and pattern: a bare
  // button outside one does nothing at all, which is why the old preview
  // accepted anything and gave no feedback. Submission is simulated on purpose —
  // a preview must not create a real lead.
  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitted(true);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6" onClick={onClose}>
      <div className="max-h-full w-full max-w-lg overflow-auto rounded-2xl p-8" style={{ background: eff.page }} onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex justify-end">
          <button onClick={onClose} className="rounded-lg bg-white/80 px-3 py-1 text-sm hover:bg-white">
            Close preview ✕
          </button>
        </div>
        <div
          className="p-6 shadow-lg"
          style={{ background: eff.card, color: eff.text, borderRadius: eff.radius + 8 }}
        >
          <form onSubmit={onSubmit} noValidate={false}>
            {form.fields.map((field) => (
              <div key={field.id} className="mb-3">
                {!isContentField(field) && (
                  <label className="mb-1 block text-sm font-medium">
                    {field.label}
                    {field.required && <span className="text-rose-500"> *</span>}
                  </label>
                )}
                <FieldPreview field={field} eff={eff} interactive />
              </div>
            ))}
            <button
              type="submit"
              className="mt-2 w-full py-3 text-sm font-semibold uppercase tracking-wide"
              style={{ background: eff.button, color: eff.buttonText, borderRadius: eff.radius }}
            >
              {form.styles.submitLabel || "Submit"}
            </button>
          </form>

          {submitted && (
            <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
              Looks good — every field passed validation. This is a preview, so
              nothing was saved.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// --- Share overlay --------------------------------------------------------

// The public link points at the WEB app, not the API: /form/<id> is a Next.js
// page. (Short links are the opposite — those are a Go route on the API host.)
function publicFormURL(id: string) {
  if (typeof window === "undefined") return "";
  return `${window.location.origin}/form/${id}`;
}

function ShareOverlay({ form, onClose }: { form: Form; onClose: () => void }) {
  const [copied, setCopied] = useState("");
  const url = publicFormURL(form._id);
  const embed = `<iframe src="${url}" width="100%" height="600" frameborder="0" style="border:none;"></iframe>`;

  async function copy(text: string, which: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(which);
      setTimeout(() => setCopied(""), 1500);
    } catch {
      // Clipboard needs a secure context; both values are selectable by hand.
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 pt-24" onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Share this form</h2>
          <button onClick={onClose} className="rounded p-1 text-slate-400 hover:bg-slate-100">
            ✕
          </button>
        </div>

        {/*
          A draft form's public URL returns 404, by design — an unpublished
          form must not be readable by strangers.

          But it was handed out here with nothing saying so, which is a trap
          rather than a safeguard: somebody copies this link, puts it on a live
          site or a WhatsApp broadcast, and every visitor gets a 404 while the
          builder shows a perfectly healthy form. No lead is created and nothing
          anywhere reports a problem, because from the server's point of view
          none of this is an error.

          The product knew the status all along; it simply never mentioned it at
          the one moment it mattered.
        */}
        {form.status !== "published" && (
          <div className="mb-4 rounded-lg bg-amber-50 px-3 py-2.5 text-sm text-amber-900">
            <strong className="font-medium">This form is a draft.</strong> The link
            below will show a “not found” page to anyone who opens it, and no
            lead will be created. Publish the form first — then this link starts
            working immediately, with no need to share it again.
          </div>
        )}

        <label className="mb-1 block text-sm font-medium">Public URL</label>
        <div className="flex gap-2">
          <input readOnly value={url} className="input font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />
          <button
            onClick={() => copy(url, "url")}
            className="shrink-0 rounded-lg border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50"
          >
            {copied === "url" ? "Copied ✓" : "Copy"}
          </button>
        </div>
        <p className="mt-1 text-xs text-slate-500">
          Anyone with this link can fill the form — no account needed. Each submission
          becomes a contact in your pipeline and starts any workflow with a Contact
          Created trigger.
        </p>

        <label className="mb-1 mt-4 block text-sm font-medium">Embed on your own page</label>
        <div className="flex gap-2">
          <textarea
            readOnly
            value={embed}
            rows={3}
            className="input font-mono text-xs"
            onFocus={(e) => e.currentTarget.select()}
          />
          <button
            onClick={() => copy(embed, "embed")}
            className="h-fit shrink-0 rounded-lg border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50"
          >
            {copied === "embed" ? "Copied ✓" : "Copy"}
          </button>
        </div>
        <p className="mt-1 text-xs text-slate-500">
          Paste this into any HTML page to show the form inline.
        </p>
      </div>
    </div>
  );
}

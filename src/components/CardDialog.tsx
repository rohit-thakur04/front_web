"use client";

import { useEffect, useState } from "react";
import { ContactSubmissions } from "@/components/ContactSubmissions";
import { api } from "@/lib/api";
import { PHONE_PATTERN, PHONE_TITLE, sanitizePhoneInput } from "@/lib/phone";
import type { Card, Pipeline, Stage } from "@/lib/types";

interface Props {
  /** Where a new contact lands when the caller already knows the stage. */
  stageId: string;
  card?: Card;
  /**
   * Stages this contact can be moved to, when the caller knows them.
   *
   * Optional, because not every caller does — the dropdown simply does not
   * appear without them. Where it is passed, it is the only way to change a
   * contact's stage without dragging.
   */
  stages?: Stage[];
  /**
   * Pipelines to choose from, for a caller that is not scoped to one.
   *
   * The Contacts page spans every pipeline, so "Add contact" there has to ask
   * which one — a contact cannot exist outside a stage. Passing this makes the
   * dialog fetch the chosen pipeline's stages itself.
   */
  pipelines?: Pipeline[];
  onClose: () => void;
  onSaved: () => void;
  onError: (message: string) => void;
}

export function CardDialog({
  stageId,
  card,
  stages,
  pipelines,
  onClose,
  onSaved,
  onError,
}: Props) {
  const [name, setName] = useState(card?.name ?? "");
  const [phone, setPhone] = useState(card?.phone ?? "");
  const [email, setEmail] = useState(card?.email ?? "");
  const [value, setValue] = useState(String(card?.value ?? ""));
  const [targetStage, setTargetStage] = useState(card?.stageId ?? stageId);
  const [saving, setSaving] = useState(false);

  /*
   * Creating a contact normally starts the stage's follow-up sequence and fires
   * the Contact Created workflow trigger, which means an email goes out at once.
   *
   * On by default, because that is what adding a lead is usually for and what
   * every existing caller already does. Offered as a choice because the one
   * thing worse than an unexpected email is being told it is about to happen and
   * given no way to stop it — the CSV importer makes the same offer, for the
   * same reason.
   */
  const [startAutomation, setStartAutomation] = useState(true);

  // Only meaningful while creating: an existing contact is already in a pipeline.
  const choosePipeline = !card && Boolean(pipelines?.length);
  const [pipelineId, setPipelineId] = useState(pipelines?.[0]?._id ?? "");

  /*
   * Stages for the chosen pipeline, cached with the pipeline they belong to.
   *
   * Storing the id alongside them is what lets the list go empty without an
   * effect writing state, and guarantees a previous pipeline's stages can never
   * be shown — or saved into — against a newly chosen one.
   */
  const [stageCache, setStageCache] = useState<{ pipelineId: string; stages: Stage[] }>({
    pipelineId: "",
    stages: [],
  });

  useEffect(() => {
    if (!choosePipeline || !pipelineId) return;
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
  }, [choosePipeline, pipelineId]);

  const fetched = stageCache.pipelineId === pipelineId ? stageCache.stages : [];
  const stageOptions = choosePipeline ? fetched : (stages ?? []);

  /*
   * Keeps the selected stage inside the selected pipeline.
   *
   * Derived rather than synced by an effect: when the pipeline changes, the old
   * stage id is simply no longer in the list, so the first stage of the new one
   * is used. An effect doing the same job would write state on every pipeline
   * change and could be read, for one render, in the inconsistent state between.
   */
  const effectiveStage =
    choosePipeline && !stageOptions.some((s) => s._id === targetStage)
      ? (stageOptions[0]?._id ?? "")
      : targetStage;

  /*
   * Escape closes it.
   *
   * A QA pass found this was not a dialog at all: no role, no aria-modal, and no
   * keyboard dismissal. A screen reader announced it as ordinary page content,
   * and a keyboard user had to tab to Cancel to get out of it.
   */
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const stageChanged = Boolean(card) && effectiveStage !== card?.stageId;
  const needsStage = choosePipeline && !effectiveStage;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || needsStage) return;

    setSaving(true);
    const body = {
      name: name.trim(),
      phone: phone.trim(),
      email: email.trim(),
      value: Number(value) || 0,
    };

    try {
      if (card) {
        await api(`/cards/${card._id}`, { method: "PUT", body });
        /*
         * The move is a second call because it is a different operation: it
         * stops the old stage's email sequence and starts the new one, which
         * editing a phone number must never do. Sent after the field edit so a
         * rejected value cannot leave the contact moved but unedited.
         *
         * cardIds is omitted deliberately — the server only reorders the
         * destination column when given an explicit order, and this dialog does
         * not know one. The card lands in the column and keeps its position.
         */
        if (stageChanged) {
          await api(`/cards/${card._id}/move`, {
            method: "PUT",
            body: { stageId: effectiveStage },
          });
        }
      } else {
        await api("/cards", {
          method: "POST",
          body: { ...body, stageId: effectiveStage, startAutomation },
        });
      }
      onSaved();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Could not save card");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
      onClick={onClose}
    >
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="card-dialog-title"
        onClick={(e) => e.stopPropagation()}
        onSubmit={save}
        // Wider only when editing, where the submission history needs room for a
        // label and a value side by side. Add contact keeps its original width.
        className={`max-h-[90vh] w-full space-y-3 overflow-y-auto rounded-xl bg-white p-5 shadow-xl ${
          card ? "max-w-md" : "max-w-sm"
        }`}
      >
        <h2 id="card-dialog-title" className="text-base font-semibold">
          {card ? "Edit contact" : "Add contact"}
        </h2>

        <div>
          <label className="mb-1 block text-sm font-medium" htmlFor="card-name">
            Name *
          </label>
          <input
            id="card-name"
            required
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium" htmlFor="card-phone">
            Phone
          </label>
          <input
            id="card-phone"
            type="tel"
            inputMode="tel"
            pattern={PHONE_PATTERN}
            title={PHONE_TITLE}
            value={phone}
            // The same rule the public form applies, and the one the API now
            // enforces on this path too. Filtering as it is typed is what stops
            // a save being rejected for a reason the field never mentioned.
            onChange={(e) => setPhone(sanitizePhoneInput(e.target.value))}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium" htmlFor="card-email">
            Email
          </label>
          <input
            id="card-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          {!card && !email.trim() && (
            <p className="mt-1 text-xs text-amber-700">
              Without an email address, this contact can&apos;t receive the stage&apos;s
              nurture sequence.
            </p>
          )}
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium" htmlFor="card-value">
            Value (₹)
          </label>
          <input
            id="card-value"
            type="number"
            min="0"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </div>

        {/* A contact cannot exist outside a stage, so a page that spans every
            pipeline has to ask which one before it can create anything. */}
        {choosePipeline && (
          <div>
            <label className="mb-1 block text-sm font-medium" htmlFor="card-pipeline">
              Pipeline *
            </label>
            <select
              id="card-pipeline"
              value={pipelineId}
              onChange={(e) => setPipelineId(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              {pipelines?.map((p) => (
                <option key={p._id} value={p._id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Dragging was the only way to change a stage, which leaves no way at
            all on a phone — where dragging a card across columns is the hardest
            gesture the product asks for. */}
        {stageOptions.length > 0 && (
          <div>
            <label className="mb-1 block text-sm font-medium" htmlFor="card-stage">
              Stage {choosePipeline && "*"}
            </label>
            <select
              id="card-stage"
              value={effectiveStage}
              onChange={(e) => setTargetStage(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              {stageOptions.map((s) => (
                <option key={s._id} value={s._id}>
                  {s.name}
                </option>
              ))}
            </select>
            {stageChanged && (
              // Said plainly, because it is the part nobody expects: a stage
              // move is also a change to which emails this person receives.
              <p className="mt-1 text-xs text-amber-700">
                Moving stage stops this contact&apos;s current follow-up sequence
                and starts the new stage&apos;s.
              </p>
            )}
          </div>
        )}

        {needsStage && (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
            This pipeline has no stages yet. Add a column to it on the Board
            first — a contact has to live in one.
          </p>
        )}

        {/* Only on create: this is what the save is about to set off, and the
            importer offers the same choice for the same reason. */}
        {!card && (
          <label className="flex items-start gap-2 rounded-lg border border-slate-200 p-3">
            <input
              type="checkbox"
              checked={startAutomation}
              onChange={(e) => setStartAutomation(e.target.checked)}
              className="mt-0.5"
            />
            <span className="text-sm">
              <span className="font-medium">Start the follow-up sequence</span>
              <span className="mt-0.5 block text-xs text-slate-500">
                Sends this stage&apos;s Day 1 email straight away and runs any
                workflow that triggers on a new contact. Turn off to add them
                quietly.
              </span>
            </span>
          </label>
        )}

        {/* Only when editing: a contact being created has no history yet. */}
        {card && <ContactSubmissions cardId={card._id} />}

        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving || !name.trim() || needsStage}
            className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? "Saving…" : card ? "Save" : "Add contact"}
          </button>
        </div>
      </form>
    </div>
  );
}

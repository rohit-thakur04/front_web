"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { PHONE_PATTERN, sanitizePhoneInput } from "@/lib/phone";
import type { Card, Stage } from "@/lib/types";

interface Props {
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
  onClose: () => void;
  onSaved: () => void;
  onError: (message: string) => void;
}

export function CardDialog({
  stageId,
  card,
  stages,
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

  const panel = useRef<HTMLFormElement>(null);

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

  const stageChanged = Boolean(card) && targetStage !== card?.stageId;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;

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
            body: { stageId: targetStage },
          });
        }
      } else {
        // Creating a card enters it into the stage's sequence, so the Day 1
        // email goes out immediately.
        await api("/cards", { method: "POST", body: { ...body, stageId: targetStage } });
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
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="card-dialog-title"
        onClick={(e) => e.stopPropagation()}
        onSubmit={save}
        className="w-full max-w-sm space-y-3 rounded-xl bg-white p-5 shadow-xl"
      >
        <h2 id="card-dialog-title" className="text-base font-semibold">
          {card ? "Edit contact" : "New contact"}
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
            title="Digits only, optionally starting with + — spaces, hyphens and brackets are fine."
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

        {/* Dragging was the only way to change a stage, which leaves no way at
            all on a phone — where dragging a card across columns is the hardest
            gesture the product asks for. */}
        {stages && stages.length > 0 && (
          <div>
            <label className="mb-1 block text-sm font-medium" htmlFor="card-stage">
              Stage
            </label>
            <select
              id="card-stage"
              value={targetStage}
              onChange={(e) => setTargetStage(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              {stages.map((s) => (
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
            disabled={saving || !name.trim()}
            className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </form>
    </div>
  );
}

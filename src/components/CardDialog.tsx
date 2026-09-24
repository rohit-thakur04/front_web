"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import type { Card } from "@/lib/types";

interface Props {
  stageId: string;
  card?: Card;
  onClose: () => void;
  onSaved: () => void;
  onError: (message: string) => void;
}

export function CardDialog({ stageId, card, onClose, onSaved, onError }: Props) {
  const [name, setName] = useState(card?.name ?? "");
  const [phone, setPhone] = useState(card?.phone ?? "");
  const [email, setEmail] = useState(card?.email ?? "");
  const [value, setValue] = useState(String(card?.value ?? ""));
  const [saving, setSaving] = useState(false);

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
      } else {
        // Creating a card enters it into the stage's sequence, so the Day 1
        // email goes out immediately.
        await api("/cards", { method: "POST", body: { ...body, stageId } });
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
        onClick={(e) => e.stopPropagation()}
        onSubmit={save}
        className="w-full max-w-sm space-y-3 rounded-xl bg-white p-5 shadow-xl"
      >
        <h2 className="text-base font-semibold">
          {card ? "Edit contact" : "New contact"}
        </h2>

        <div>
          <label className="mb-1 block text-sm font-medium">Name *</label>
          <input
            required
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">Phone</label>
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">Email</label>
          <input
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
          <label className="mb-1 block text-sm font-medium">Value (₹)</label>
          <input
            type="number"
            min="0"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </div>

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
            disabled={saving}
            className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </form>
    </div>
  );
}

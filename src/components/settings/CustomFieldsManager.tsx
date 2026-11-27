"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { CustomField } from "@/lib/types";

// Settings → Custom Fields: a tenant's own contact fields.
export function CustomFieldsManager() {
  const [fields, setFields] = useState<CustomField[] | null>(null);
  const [label, setLabel] = useState("");
  const [type, setType] = useState<CustomField["type"]>("text");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<CustomField[]>("/custom-fields")
      .then(setFields)
      .catch((e) => setError(e instanceof Error ? e.message : "Could not load fields"));
  }, []);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const f = await api<CustomField>("/custom-fields", { method: "POST", body: { label, type } });
      setFields((prev) => [...(prev ?? []), f]);
      setLabel("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add the field");
    } finally {
      setBusy(false);
    }
  }

  async function remove(f: CustomField) {
    if (!confirm(`Delete "${f.label}"? Its value is removed from every contact, and workflow steps using it stop working.`)) return;
    try {
      await api(`/custom-fields/${f._id}`, { method: "DELETE" });
      setFields((prev) => (prev ?? []).filter((x) => x._id !== f._id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete the field");
    }
  }

  return (
    <div className="max-w-2xl space-y-4">
      <form onSubmit={add} className="flex flex-wrap items-end gap-2 rounded-xl border border-slate-200 bg-white p-4">
        <label className="flex-1 text-sm">
          Field name
          <input className="input mt-1 w-full" required maxLength={60} placeholder="e.g. City" value={label} onChange={(e) => setLabel(e.target.value)} />
        </label>
        <label className="text-sm">
          Type
          <select className="input mt-1" value={type} onChange={(e) => setType(e.target.value as CustomField["type"])}>
            <option value="text">Text</option>
            <option value="number">Number</option>
            <option value="date">Date</option>
          </select>
        </label>
        <button disabled={busy} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
          Add field
        </button>
      </form>
      {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
      <div className="rounded-xl border border-slate-200 bg-white">
        {fields === null ? (
          <p className="p-4 text-sm text-slate-500">Loading…</p>
        ) : fields.length === 0 ? (
          <p className="p-6 text-center text-sm text-slate-500">
            No custom fields yet. Add one to keep things like City or Budget on each contact.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {fields.map((f) => (
              <li key={f._id} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{f.label}</p>
                  <p className="text-xs text-slate-500">
                    {f.type} · in emails and messages as <code>{`{{contact.${f.key}}}`}</code>
                  </p>
                </div>
                <button onClick={() => remove(f)} className="rounded-lg px-2 py-1 text-sm text-slate-400 hover:bg-rose-50 hover:text-rose-600">
                  Delete
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <p className="text-xs text-slate-500">
        Fill them on a contact&apos;s page, map webhook fields to them, set them with a workflow&apos;s Update Field step,
        and ask about them in If / Else.
      </p>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { User } from "@/lib/types";

/**
 * Deleting an account and its entire workspace.
 *
 * The only irreversible action an admin has. Settings → Deleted Items is not
 * built and nothing in this product has an undo, so the confirmation is the
 * whole safety story.
 *
 * It asks for the email to be typed rather than offering an OK button. A native
 * confirm() is dismissed by reflex; typing an address is a deliberate act that
 * also forces a second look at which account is about to go. The server requires
 * the same string, so a scripted caller has to name its target too.
 */
export function ClientDeleteDialog({
  user,
  onClose,
  onDeleted,
}: {
  user: User;
  onClose: () => void;
  onDeleted: (recordsRemoved: number) => void;
}) {
  const [typed, setTyped] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !deleting) onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, deleting]);

  // Case-insensitive, because an email is. A rejection over capitalisation
  // teaches nothing about whether the right account was chosen.
  const matches = typed.trim().toLowerCase() === user.email.toLowerCase();

  async function remove(e: React.FormEvent) {
    e.preventDefault();
    if (!matches) return;

    setDeleting(true);
    setError("");
    try {
      const res = await api<{ recordsRemoved: number }>(`/auth/users/${user._id}`, {
        method: "DELETE",
        body: { confirm: typed.trim() },
      });
      onDeleted(res.recordsRemoved ?? 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete the account");
      setDeleting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={() => !deleting && onClose()}
    >
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="client-delete-title"
        onClick={(e) => e.stopPropagation()}
        onSubmit={remove}
        className="w-full max-w-md space-y-3 rounded-xl bg-white p-5 shadow-xl"
      >
        <h2 id="client-delete-title" className="text-base font-semibold text-rose-700">
          Delete {user.name}?
        </h2>

        {/* Named specifically. "This cannot be undone" is a phrase people have
            learned to scroll past; a list of what disappears is not. */}
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-800">
          <p className="font-medium">This deletes their whole workspace.</p>
          <p className="mt-1">
            {user.role === "client"
              ? "Their contacts, pipelines, workflows, forms, funnels, email templates, automation history and any staff accounts under them all go with it."
              : "Their account and anything they own goes with it."}
          </p>
          <p className="mt-1">
            There is no undo and no backup inside the product. Deactivating
            instead blocks sign-in and keeps everything.
          </p>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium" htmlFor="confirm-email">
            Type <span className="font-mono text-slate-700">{user.email}</span> to confirm
          </label>
          <input
            id="confirm-email"
            autoFocus
            autoComplete="off"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder={user.email}
            className="input"
          />
        </div>

        {error && (
          <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            disabled={deleting}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!matches || deleting}
            className="rounded-lg bg-rose-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-rose-700 disabled:opacity-50"
          >
            {deleting ? "Deleting…" : "Delete permanently"}
          </button>
        </div>
      </form>
    </div>
  );
}

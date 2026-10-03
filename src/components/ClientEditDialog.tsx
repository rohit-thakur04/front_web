"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { Plan, User } from "@/lib/types";

/**
 * Editing an account after it was created.
 *
 * The API has had PATCH /auth/users/:id since the workflow allowance shipped,
 * but nothing ever called it — so a typo in a client's name, or a plan assigned
 * to the wrong account, meant recreating the account and handing out a new
 * password.
 *
 * Only what an admin should be able to change is here. Email is the login
 * identity and changing it silently locks someone out of an account they can
 * still see; role is the authorisation boundary. Both are shown read-only rather
 * than hidden, so it is clear they exist and are fixed.
 */
export function ClientEditDialog({
  user,
  plans,
  onClose,
  onSaved,
}: {
  user: User;
  plans: Plan[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(user.name);
  const [planId, setPlanId] = useState(user.planId ?? "");
  const [workflowLimit, setWorkflowLimit] = useState(
    user.workflowLimit ? String(user.workflowLimit) : "",
  );
  const [disabled, setDisabled] = useState(Boolean(user.disabled));
  // Blank means "leave it alone" — an edit should not require knowing the
  // current password, and must not quietly reset it either.
  const [password, setPassword] = useState("");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const isClient = user.role === "client";

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;

    setSaving(true);
    setError("");
    try {
      /*
       * Only what changed is sent.
       *
       * Every field on the endpoint is optional, and omitting one leaves it
       * untouched — so a rename cannot also clear a plan, and the plan and
       * allowance are never sent at all for an admin account, where they would
       * be rejected.
       */
      const body: Record<string, unknown> = { name: name.trim(), disabled };
      if (isClient) {
        body.planId = planId;
        body.workflowLimit = Number(workflowLimit) || 0;
      }
      if (password.trim()) body.password = password;

      await api(`/auth/users/${user._id}`, { method: "PATCH", body });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save changes");
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
        aria-labelledby="client-edit-title"
        onClick={(e) => e.stopPropagation()}
        onSubmit={save}
        className="max-h-[90vh] w-full max-w-md space-y-3 overflow-y-auto rounded-xl bg-white p-5 shadow-xl"
      >
        <h2 id="client-edit-title" className="text-base font-semibold">
          Edit account
        </h2>

        {/* Fixed, and shown so. Hiding them would read as the product having
            forgotten them rather than having decided. */}
        <div className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
          <p>
            <span className="font-medium text-slate-700">{user.email}</span> ·{" "}
            {user.role}
          </p>
          <p className="mt-0.5">
            Email and role can&apos;t be changed. Email is the login itself, and
            role decides what the account can reach.
          </p>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium" htmlFor="client-name">
            Name *
          </label>
          <input
            id="client-name"
            required
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="input"
          />
        </div>

        {isClient && (
          <>
            <div>
              <label className="mb-1 block text-sm font-medium" htmlFor="client-plan">
                Plan
              </label>
              <select
                id="client-plan"
                value={planId}
                onChange={(e) => setPlanId(e.target.value)}
                className="input"
              >
                <option value="">No plan — full access</option>
                {plans.map((p) => (
                  <option key={p._id} value={p._id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-slate-500">
                A plan decides which features this client sees and how much they
                can create. No plan means everything, uncapped.
              </p>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium" htmlFor="client-workflows">
                Workflow limit
              </label>
              <input
                id="client-workflows"
                type="number"
                min={0}
                value={workflowLimit}
                onChange={(e) => setWorkflowLimit(e.target.value)}
                placeholder="0"
                className="input"
              />
              <p className="mt-1 text-xs text-slate-500">
                0 means unlimited. Lowering it below what they already have stops
                new ones; it never deletes existing workflows.
              </p>
            </div>
          </>
        )}

        <div>
          <label className="mb-1 block text-sm font-medium" htmlFor="client-password">
            Reset password
          </label>
          <input
            id="client-password"
            type="text"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Leave blank to keep the current one"
            autoComplete="new-password"
            className="input"
          />
          <p className="mt-1 text-xs text-slate-500">
            At least 8 characters. They are signed out of nothing — an existing
            session keeps working until it expires.
          </p>
        </div>

        <label className="flex items-start gap-2 rounded-lg border border-slate-200 p-3">
          <input
            type="checkbox"
            checked={!disabled}
            onChange={(e) => setDisabled(!e.target.checked)}
            className="mt-0.5"
          />
          <span className="text-sm">
            <span className="font-medium">Account is active</span>
            <span className="mt-0.5 block text-xs text-slate-500">
              Turning this off blocks sign-in without deleting anything. Their
              contacts, pipelines and workflows are untouched.
            </span>
          </span>
        </label>

        {error && (
          <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>
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
            {saving ? "Saving…" : "Save changes"}
          </button>
        </div>
      </form>
    </div>
  );
}

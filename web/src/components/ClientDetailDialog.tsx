"use client";

import { useEffect } from "react";
import type { Plan, User } from "@/lib/types";

/**
 * Everything the platform knows about one account, in one place.
 *
 * The list row has to stay scannable, so it carries the four things an admin
 * compares across accounts. This carries the rest — the dates, the entitlements,
 * the identifiers — for when the question is about one account rather than all
 * of them.
 *
 * Read-only on purpose. Looking something up should never be one stray keystroke
 * from changing it; Edit is a deliberate second step.
 */
export function ClientDetailDialog({
  user,
  plans,
  onClose,
  onEdit,
}: {
  user: User;
  plans: Plan[];
  onClose: () => void;
  onEdit: () => void;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const plan = user.planId ? plans.find((p) => p._id === user.planId) : null;
  const limits = plan?.limits;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="client-detail-title"
        onClick={(e) => e.stopPropagation()}
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-5 shadow-xl"
      >
        <div className="mb-4 flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-blue-50 text-base font-semibold text-blue-700">
            {user.name.trim().charAt(0).toUpperCase() || "?"}
          </span>
          <div className="min-w-0 flex-1">
            <h2 id="client-detail-title" className="text-base font-semibold">
              {user.name}
            </h2>
            <p className="truncate text-sm text-slate-500">{user.email}</p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"
          >
            ✕
          </button>
        </div>

        <dl className="space-y-0.5 rounded-lg border border-slate-200">
          <Row label="Role" value={user.role} />
          <Row label="Phone" value={user.phone || "—"} />
          <Row
            label="Status"
            value={user.disabled ? "Deactivated — cannot sign in" : "Active"}
          />
          <Row label="Created" value={new Date(user.createdAt).toLocaleString()} />
          <Row
            label="Last signed in"
            value={
              user.lastLoginAt
                ? new Date(user.lastLoginAt).toLocaleString()
                : "Never — the password may not have reached them"
            }
          />
          <Row label="Account reference" value={"A" + user._id.slice(-5).toUpperCase()} mono />
        </dl>

        {user.role === "client" && (
          <>
            <h3 className="mb-1.5 mt-4 text-sm font-semibold">Entitlements</h3>
            <dl className="space-y-0.5 rounded-lg border border-slate-200">
              <Row label="Plan" value={plan?.name ?? "No plan — every feature, no limits"} />
              <Row
                label="Workflows"
                value={user.workflowLimit ? `${user.workflowLimit} maximum` : "Unlimited"}
              />
              {limits && (
                <>
                  <Row label="Contacts" value={quota(limits.maxContacts)} />
                  <Row label="Pipelines" value={quota(limits.maxPipelines)} />
                  <Row label="Email templates" value={quota(limits.maxTemplates)} />
                  <Row label="Staff members" value={quota(limits.maxStaff)} />
                </>
              )}
            </dl>
            {/* The reference design showed billing state here — start date,
                renewal, overdue. There is no subscription record in this product,
                so there is nothing truthful to put in its place. Saying so beats
                an empty panel that looks like a loading failure. */}
            <p className="mt-2 text-xs text-slate-400">
              Billing dates aren&apos;t tracked yet, so there is no start or
              renewal to show.
            </p>
          </>
        )}

        <div className="mt-4 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50"
          >
            Close
          </button>
          <button
            onClick={onEdit}
            className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
          >
            Edit account
          </button>
        </div>
      </div>
    </div>
  );
}

// quota renders a plan limit, spelling out the convention rather than showing a
// bare 0, which reads as "none allowed" and means the exact opposite.
function quota(max: number): string {
  return max > 0 ? `${max.toLocaleString()} maximum` : "Unlimited";
}

function Row({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-3 border-b border-slate-100 px-3 py-2 last:border-0">
      <dt className="w-36 shrink-0 text-xs uppercase tracking-wide text-slate-400">
        {label}
      </dt>
      <dd className={`min-w-0 flex-1 text-sm text-slate-700 ${mono ? "font-mono" : ""}`}>
        {value}
      </dd>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { RowAction, RowActions } from "@/components/RowActions";
import { ClientEditDialog } from "@/components/ClientEditDialog";
import { ClientRowMenu } from "@/components/ClientRowMenu";
import { ClientDetailDialog } from "@/components/ClientDetailDialog";
import { ClientDeleteDialog } from "@/components/ClientDeleteDialog";
import { Icon } from "@/components/icons";
import { useAuth } from "@/lib/auth";
import type { Plan, Role, User } from "@/lib/types";
import { PageHeader, StatTile } from "@/components/ui";

/** Generates a readable but strong password for a new account. */
function generatePassword(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%";
  const bytes = new Uint32Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

export default function ClientsPage() {
  const { isAdmin, loading } = useAuth();
  const router = useRouter();

  const [users, setUsers] = useState<User[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState("");

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>("client");
  const [planId, setPlanId] = useState("");
  // Kept as a string so the field can be cleared while typing; parsed on submit.
  const [workflowLimit, setWorkflowLimit] = useState("");
  const [plans, setPlans] = useState<Plan[]>([]);
  const [saving, setSaving] = useState(false);

  // Credentials are shown once after creation; the hash can never be read back.
  const [created, setCreated] = useState<{ email: string; password: string } | null>(null);
  // The account being edited, or null when the dialog is closed.
  const [editing, setEditing] = useState<User | null>(null);
  const [viewing, setViewing] = useState<User | null>(null);
  const [deleting, setDeleting] = useState<User | null>(null);
  const [notice, setNotice] = useState("");

  // Route guard. The API enforces admin independently — this only keeps a
  // non-admin from seeing a broken page.
  useEffect(() => {
    if (!loading && !isAdmin) router.replace("/dashboard");
  }, [loading, isAdmin, router]);

  async function load() {
    try {
      setUsers(await api<User[]>("/auth/users"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load accounts");
    }
  }

  useEffect(() => {
    async function run() {
      if (!isAdmin) return;
      await load();
      // Plans populate the "Plan" dropdown in the create form.
      try {
        setPlans(await api<Plan[]>("/plans"));
      } catch {
        // Non-fatal: the form falls back to "no plan (full access)".
      }
    }
    run();
  }, [isAdmin]);

  /*
   * Deactivate or reactivate, straight from the row menu.
   *
   * Confirmed first, because it takes someone's access away and the menu it is
   * launched from is one slip of the mouse wide. Reactivating is harmless, so it
   * goes through without asking.
   */
  async function toggleActive(u: User) {
    const turningOff = !u.disabled;
    if (
      turningOff &&
      !window.confirm(
        `Deactivate ${u.name}? They won't be able to sign in. Nothing of theirs is deleted.`,
      )
    ) {
      return;
    }
    try {
      await api(`/auth/users/${u._id}`, {
        method: "PATCH",
        body: { disabled: turningOff },
      });
      await load();
      flash(turningOff ? `${u.name} can no longer sign in.` : `${u.name} is active again.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update the account");
    }
  }

  function flash(message: string) {
    setNotice(message);
    setTimeout(() => setNotice(""), 4000);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      await api<User>("/auth/users", {
        method: "POST",
        // planId only applies to clients; the server ignores it for admins.
        body: {
          name,
          email,
          password,
          role,
          planId: role === "client" ? planId : "",
          // 0 means unlimited; the server ignores the field for admins.
          workflowLimit: role === "client" ? Number(workflowLimit) || 0 : 0,
        },
      });
      setCreated({ email, password });
      setShowForm(false);
      setName("");
      setEmail("");
      setPassword("");
      setRole("client");
      setPlanId("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create account");
    } finally {
      setSaving(false);
    }
  }

  if (loading || !isAdmin) return null;

  const admins = users.filter((u) => u.role === "admin").length;

  return (
    <div className="mx-auto max-w-[1000px] p-6">
      <PageHeader
        title="Clients"
        subtitle="Accounts with access to this workspace"
        actions={
          <button
            onClick={() => {
              setShowForm((s) => !s);
              setCreated(null);
            }}
            className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
          >
            {showForm ? "Cancel" : "+ Add Client"}
          </button>
        }
      />

      <div className="mb-4 grid gap-4 sm:grid-cols-3">
        <StatTile label="Total accounts" value={users.length} icon="Contacts" tone="blue" badge="" />
        <StatTile label="Admins" value={admins} icon="Shield" tone="amber" badge="" />
        <StatTile label="Clients" value={users.length - admins} icon="UserPlus" tone="green" badge="" />
      </div>

      {error && (
        <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}

      {created && (
        <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3">
          <p className="text-sm font-medium text-emerald-900">
            Account created. Copy these credentials now — the password can&apos;t be
            shown again.
          </p>
          <div className="mt-2 space-y-1 font-mono text-sm">
            <p>
              <span className="text-slate-500">email:</span> {created.email}
            </p>
            <p>
              <span className="text-slate-500">password:</span> {created.password}
            </p>
          </div>
          <button
            onClick={() =>
              navigator.clipboard.writeText(
                `email: ${created.email}\npassword: ${created.password}`,
              )
            }
            className="mt-2 rounded-lg border border-emerald-300 px-2 py-1 text-xs hover:bg-emerald-100"
          >
            Copy
          </button>
        </div>
      )}

      {showForm && (
        <form
          onSubmit={submit}
          className="mb-4 grid gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-2"
        >
          <div>
            <label className="mb-1 block text-sm font-medium">Name *</label>
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="input"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">Email *</label>
            <input
              required
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="input"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">Password *</label>
            <div className="flex gap-2">
              <input
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input"
              />
              <button
                type="button"
                onClick={() => setPassword(generatePassword())}
                className="whitespace-nowrap rounded-lg border border-slate-300 px-2 text-xs hover:bg-slate-50"
              >
                Generate
              </button>
            </div>
            <p className="mt-1 text-xs text-slate-500">At least 8 characters.</p>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">Role *</label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as Role)}
              className="input"
            >
              <option value="client">client</option>
              <option value="admin">admin</option>
            </select>
          </div>

          {/* Plan selection applies only to clients — admins are never gated. */}
          {role === "client" && (
            <div>
              <label className="mb-1 block text-sm font-medium">Plan</label>
              <select
                value={planId}
                onChange={(e) => setPlanId(e.target.value)}
                className="input"
              >
                <option value="">No plan — full access</option>
                {plans.map((p) => (
                  <option key={p._id} value={p._id}>
                    {p.name} ({Object.values(p.features ?? {}).filter(Boolean).length} features)
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-slate-500">
                The plan decides which sections this client can access.{" "}
                {plans.length === 0 && (
                  <a href="/plans" className="text-blue-600 hover:underline">
                    Create a plan first
                  </a>
                )}
              </p>
            </div>
          )}

          {/* A workflow allowance is a per-client cap, independent of the plan. */}
          {role === "client" && (
            <div>
              <label className="mb-1 block text-sm font-medium">Workflow limit</label>
              <input
                type="number"
                min={0}
                value={workflowLimit}
                onChange={(e) => setWorkflowLimit(e.target.value)}
                placeholder="0"
                className="input"
              />
              <p className="mt-1 text-xs text-slate-500">
                How many workflows this client may create. Leave at 0 for unlimited.
              </p>
            </div>
          )}

          <div className="sm:col-span-2">
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? "Creating…" : "Create account"}
            </button>
          </div>
        </form>
      )}

      {notice && (
        <p className="mb-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          {notice}
        </p>
      )}

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="w-10 px-3 py-2">#</th>
              <th className="px-3 py-2">Account</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Plan</th>
              <th className="px-3 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u, i) => (
              <tr key={u._id} className="border-b border-slate-100 align-top last:border-0">
                <td className="px-3 py-3 text-slate-400">{i + 1}</td>

                {/* Name, how to reach them, and the reference an admin quotes
                    back on a support thread — one cell, because they are read
                    together. */}
                <td className="px-3 py-3">
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-50 text-sm font-semibold text-blue-700">
                      {initial(u.name)}
                    </span>
                    <div className="min-w-0">
                      <p className="font-medium">{u.name}</p>
                      <p className="truncate text-xs text-slate-500">{u.email}</p>
                      {u.phone && <p className="text-xs text-slate-500">{u.phone}</p>}
                      <CopyableCode value={accountCode(u._id)} />
                    </div>
                  </div>
                </td>

                <td className="px-3 py-3">
                  <StatusPill user={u} />
                  <p className="mt-1 text-xs text-slate-400">
                    Created {new Date(u.createdAt).toLocaleDateString()}
                  </p>
                  {/* Only shown once it exists. "Last login: never" on an
                      account made this morning is noise, not information. */}
                  {u.lastLoginAt && (
                    <p className="text-xs text-slate-400">
                      Last login {new Date(u.lastLoginAt).toLocaleDateString()}
                    </p>
                  )}
                </td>

                <td className="px-3 py-3">
                  {u.role === "admin" ? (
                    <span className="text-slate-400">— full access</span>
                  ) : u.planId ? (
                    <>
                      <p className="text-slate-700">
                        {plans.find((p) => p._id === u.planId)?.name ?? "unknown plan"}
                      </p>
                      <p className="mt-0.5 text-xs text-slate-400">
                        {u.workflowLimit
                          ? `${u.workflowLimit} workflows`
                          : "Unlimited workflows"}
                      </p>
                    </>
                  ) : (
                    <>
                      <span className="text-slate-400">no plan</span>
                      {/* Worth saying: an unassigned account is not restricted,
                          it is unrestricted, which is the opposite of what "no
                          plan" sounds like. */}
                      <p className="mt-0.5 text-xs text-amber-600">
                        Every feature, no limits
                      </p>
                    </>
                  )}
                </td>

                <td className="px-3 py-3">
                  <div className="flex items-center justify-end gap-1">
                    <RowActions>
                      <RowAction action="open" label="View details" onClick={() => setViewing(u)} />
                      <RowAction action="edit" label="Edit account" onClick={() => setEditing(u)} />
                    </RowActions>
                    <ClientRowMenu
                      user={u}
                      onView={() => setViewing(u)}
                      onEdit={() => setEditing(u)}
                      onChangePlan={() => setEditing(u)}
                      onToggleActive={() => toggleActive(u)}
                      onDelete={() => setDeleting(u)}
                    />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {viewing && (
        <ClientDetailDialog
          user={viewing}
          plans={plans}
          onClose={() => setViewing(null)}
          onEdit={() => {
            setEditing(viewing);
            setViewing(null);
          }}
        />
      )}

      {deleting && (
        <ClientDeleteDialog
          user={deleting}
          onClose={() => setDeleting(null)}
          onDeleted={async (removed) => {
            setDeleting(null);
            await load();
            flash(`Account deleted, along with ${removed.toLocaleString()} of their records.`);
          }}
        />
      )}

      {editing && (
        <ClientEditDialog
          user={editing}
          plans={plans}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await load();
          }}
        />
      )}
    </div>
  );
}

/** The initial shown in the avatar. Falls back so a blank name is still a circle. */
function initial(name: string): string {
  return name.trim().charAt(0).toUpperCase() || "?";
}

/**
 * A short, stable reference for an account.
 *
 * Derived from the id's last characters rather than stored, so it needs no
 * migration and cannot drift from the record. It exists to be quoted — read down
 * a phone line, pasted into a support thread — which is why it is six characters
 * and not a 24-character ObjectID.
 *
 * It is a convenience, never an identifier: everything the app does still goes
 * through the real id.
 */
function accountCode(id: string): string {
  return "A" + id.slice(-5).toUpperCase();
}

/** The code, with a one-click copy — because the point of it is being quoted. */
function CopyableCode({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          // Clipboard refused (no permission, insecure origin). The code is on
          // screen either way, so there is nothing to recover from.
        }
      }}
      title="Copy account reference"
      className="mt-1 inline-flex items-center gap-1 rounded text-xs text-slate-400 transition hover:text-slate-700"
    >
      <span className="font-mono">{value}</span>
      {copied ? <span className="text-emerald-600">copied</span> : <Icon.Copy width={12} height={12} />}
    </button>
  );
}

/**
 * Whether this account can currently be used.
 *
 * The reference design showed Active / Overdue, which is billing state. There is
 * no subscription record in this product — no start date, no renewal, no payment
 * — so reporting "Overdue" would be inventing a fact. This reports the one thing
 * that is true and does matter: whether they can sign in.
 */
function StatusPill({ user }: { user: User }) {
  if (user.disabled) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
        <Icon.Ban width={13} height={13} />
        Deactivated
      </span>
    );
  }
  if (!user.lastLoginAt) {
    // Distinct from Active on purpose: an account created weeks ago that has
    // never been used is usually a password that was never passed on.
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
        <Icon.Clock width={13} height={13} />
        Never signed in
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
      <Icon.CheckCircle width={13} height={13} />
      Active
    </span>
  );
}

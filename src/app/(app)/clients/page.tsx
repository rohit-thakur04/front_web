"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { RowAction, RowActions } from "@/components/RowActions";
import { ClientEditDialog } from "@/components/ClientEditDialog";
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

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Email</th>
              <th className="px-3 py-2">Role</th>
              <th className="px-3 py-2">Plan</th>
              <th className="px-3 py-2">Created</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u._id} className="border-b border-slate-100 last:border-0">
                <td className="px-3 py-2 font-medium">
                  {u.name}
                  {u.disabled && (
                    // Worth seeing in the list: a deactivated account looks
                    // identical to an active one otherwise, and the usual
                    // question about it is "why can't they log in?".
                    <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-500">
                      inactive
                    </span>
                  )}
                </td>
                <td className="px-3 py-2 text-slate-600">{u.email}</td>
                <td className="px-3 py-2">
                  <span
                    className={`rounded px-1.5 py-0.5 text-xs font-medium ${
                      u.role === "admin"
                        ? "bg-amber-100 text-amber-800"
                        : "bg-slate-100 text-slate-700"
                    }`}
                  >
                    {u.role}
                  </span>
                </td>
                <td className="px-3 py-2 text-slate-600">
                  {u.role === "admin" ? (
                    <span className="text-slate-400">— full</span>
                  ) : u.planId ? (
                    plans.find((p) => p._id === u.planId)?.name ?? "unknown"
                  ) : (
                    <span className="text-slate-400">no plan</span>
                  )}
                </td>
                <td className="px-3 py-2 text-slate-500">
                  {new Date(u.createdAt).toLocaleDateString()}
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-right">
                  <RowActions>
                    <RowAction action="edit" label="Edit account" onClick={() => setEditing(u)} />
                  </RowActions>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

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

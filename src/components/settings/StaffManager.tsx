"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Toggle } from "@/components/ui";
import { Icon } from "@/components/icons";
import { RowAction, RowActions } from "@/components/RowActions";
import { RolesManager } from "./RolesManager";
import { roleLevelLabel } from "@/lib/types";
import type {
  FeatureGroup,
  StaffMember,
  StaffPermissionCatalog,
  StaffRole,
} from "@/lib/types";

// A staff account belongs to one client and can only ever see that client's
// data (enforced server-side). This screen lets a client create staff with their
// own login pin and grant each of them a subset of the client's own features.
export function StaffManager() {
  const { user } = useAuth();
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [roles, setRoles] = useState<StaffRole[]>([]);
  const [catalog, setCatalog] = useState<StaffPermissionCatalog | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  // "members" lists staff; "roles" manages reusable roles.
  const [view, setView] = useState<"members" | "roles">("members");
  // Set when arriving from a role's member count on the Roles tab, so "3 members"
  // is a link to those three rather than a number you then have to go and find.
  const [roleFilter, setRoleFilter] = useState<string | null>(null);
  // null = list view; otherwise the staff being edited, or {} for a new member.
  const [editing, setEditing] = useState<StaffMember | Record<string, never> | null>(null);

  async function load() {
    try {
      const [list, cat, roleList] = await Promise.all([
        api<StaffMember[]>("/staff"),
        api<StaffPermissionCatalog>("/staff/permissions"),
        api<StaffRole[]>("/roles"),
      ]);
      setStaff(list);
      setCatalog(cat);
      setRoles(roleList);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load staff");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    async function run() {
      // Only clients have staff data; for anyone else just clear the spinner.
      if (user?.role === "client") await load();
      else setLoading(false);
    }
    run();
  }, [user?.role]);

  // Only account owners manage staff. Admins and staff can reach the tile but
  // not the data (the API is client-only), so show an honest notice instead.
  if (user && user.role !== "client") {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 p-12 text-center">
        <p className="text-base font-semibold">Staff is managed by the account owner</p>
        <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">
          {user.role === "staff"
            ? "Your access is set by the account owner who created your login."
            : "Staff belong to a client account. Open the client from Clients to see who has access."}
        </p>
        {/* A way onward, not just an explanation. An admin arriving here wanted
            to manage somebody's access, and Clients is where that starts. */}
        {user.role === "admin" && (
          <Link
            href="/clients"
            className="mt-4 inline-block rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium hover:bg-slate-50"
          >
            Go to Clients
          </Link>
        )}
      </div>
    );
  }

  if (loading) return <p className="p-6 text-sm text-slate-500">Loading…</p>;

  if (editing !== null && catalog) {
    return (
      <StaffForm
        catalog={catalog}
        roles={roles}
        member={"_id" in editing ? (editing as StaffMember) : null}
        onCancel={() => setEditing(null)}
        onSaved={async () => {
          setEditing(null);
          await load();
        }}
      />
    );
  }

  async function toggleActive(member: StaffMember) {
    try {
      await api(`/staff/${member._id}`, {
        method: "PUT",
        body: {
          name: member.name,
          email: member.email,
          phone: member.phone ?? "",
          permissions: member.permissions ?? [],
          roleId: member.roleId ?? "",
          disabled: !member.disabled,
        },
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update staff");
    }
  }

  async function remove(member: StaffMember) {
    if (!window.confirm(`Remove ${member.name}? Their login stops working immediately.`)) return;
    try {
      await api(`/staff/${member._id}`, { method: "DELETE" });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not remove staff");
    }
  }

  const roleName = (id?: string | null) =>
    id ? roles.find((r) => r._id === id)?.name ?? null : null;

  return (
    <div>
      {/* Tabs and the primary action share one row. Add Member used to sit on a
          line of its own above an empty box; once there are members it belongs
          here, beside the tabs, where every other page keeps its primary action. */}
      <div className="mb-5 flex items-end justify-between gap-4 border-b border-slate-200">
        <div className="flex gap-1">
          {(["members", "roles"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setView(t)}
              className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium capitalize transition ${
                view === t
                  ? "border-blue-600 text-blue-700"
                  : "border-transparent text-slate-500 hover:text-slate-800"
              }`}
            >
              {t}
              {t === "members" && staff.length > 0 && (
                <span className="ml-1.5 text-xs font-normal text-slate-400">
                  {staff.length}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Hidden while the list is empty: there the button lives inside the
            empty-state card, as its single obvious next step. */}
        {view === "members" && staff.length > 0 && (
          <button
            onClick={() => setEditing({})}
            className="mb-2 rounded-lg bg-blue-600 px-3.5 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
          >
            + Add Member
          </button>
        )}
      </div>

      {view === "roles" ? (
        <RolesManager
          staff={staff}
          onShowMembers={(roleId) => {
            setRoleFilter(roleId);
            setView("members");
          }}
        />
      ) : (
        <MembersList
          staff={staff}
          roles={roles}
          roleName={roleName}
          error={error}
          roleFilter={roleFilter}
          onClearRoleFilter={() => setRoleFilter(null)}
          onAdd={() => setEditing({})}
          onEdit={(m) => setEditing(m)}
          onToggleActive={toggleActive}
          onRemove={remove}
        />
      )}
    </div>
  );
}

function MembersList({
  staff,
  roles,
  roleName,
  error,
  roleFilter,
  onClearRoleFilter,
  onAdd,
  onEdit,
  onToggleActive,
  onRemove,
}: {
  staff: StaffMember[];
  roles: StaffRole[];
  roleName: (id?: string | null) => string | null;
  error: string;
  roleFilter: string | null;
  onClearRoleFilter: () => void;
  onAdd: () => void;
  onEdit: (m: StaffMember) => void;
  onToggleActive: (m: StaffMember) => void;
  onRemove: (m: StaffMember) => void;
}) {
  const rows = roleFilter ? staff.filter((m) => m.roleId === roleFilter) : staff;

  if (staff.length === 0) {
    return (
      <>
        {error && (
          <p className="mb-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>
        )}
        <EmptyStaff onAdd={onAdd} />
      </>
    );
  }

  return (
    <div>
      {/* The "N members. Each staff logs in with their own pin..." line is gone.
          The count sits on the tab, and the explanation lives in the empty state
          where it is actually needed — the page used to say the same thing three
          times over. */}
      {error && (
        <p className="mb-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>
      )}

      {roleFilter && (
        <div className="mb-3 flex items-center gap-2 text-sm">
          <span className="rounded-full border border-blue-200 bg-blue-50 px-2.5 py-0.5 text-xs text-blue-800">
            Role: {roles.find((r) => r._id === roleFilter)?.name ?? "selected"}
          </span>
          <button
            onClick={onClearRoleFilter}
            className="text-xs text-slate-500 hover:text-slate-800"
          >
            Show all members
          </button>
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-400">
              <th className="px-4 py-3 font-semibold">Name</th>
              <th className="px-4 py-3 font-semibold">Email</th>
              <th className="px-4 py-3 font-semibold">Role</th>
              <th className="px-4 py-3 font-semibold">Last login</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              <th className="px-4 py-3 text-right font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-sm text-slate-500">
                  No members have this role yet.
                </td>
              </tr>
            )}
            {rows.map((m) => (
              <tr key={m._id} className="border-b border-slate-50 last:border-0">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-600">
                      {initials(m.name)}
                    </span>
                    <span className="font-medium">{m.name}</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-slate-500">{m.email}</td>
                <td className="px-4 py-3 text-slate-500">
                  {roleName(m.roleId) ? (
                    <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
                      {roleName(m.roleId)}
                    </span>
                  ) : m.permissions?.length ? (
                    `${m.permissions.length} feature${m.permissions.length === 1 ? "" : "s"}`
                  ) : (
                    "No access"
                  )}
                </td>
                <td className="px-4 py-3 text-slate-500">
                  {m.lastLoginAt ? (
                    <span title={new Date(m.lastLoginAt).toLocaleString()}>
                      {sinceLogin(m.lastLoginAt)}
                    </span>
                  ) : (
                    // Called out rather than left blank: an account created weeks
                    // ago that has never signed in is usually a pin that was never
                    // passed on, and that is worth noticing.
                    <span className="text-amber-600">Never</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      m.disabled
                        ? "bg-slate-100 text-slate-500"
                        : "bg-emerald-50 text-emerald-700"
                    }`}
                  >
                    {m.disabled ? "inactive" : "active"}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-2">
                    <Toggle
                      checked={!m.disabled}
                      onChange={() => onToggleActive(m)}
                      label="Active"
                    />
                    <RowActions>
                      <RowAction action="edit" label="Edit" onClick={() => onEdit(m)} />
                      <RowAction action="delete" label="Remove" onClick={() => onRemove(m)} />
                    </RowActions>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/**
 * The empty state, and the only place the explanation lives now.
 *
 * Built to match the board's no-pipelines card from U2 — icon, one-line heading,
 * one line of help, one primary action — so the two read as the same product
 * rather than as two different ideas of an empty page.
 */
function EmptyStaff({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 p-12 text-center">
      <span className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
        <Icon.Users width={22} height={22} />
      </span>
      <p className="text-base font-semibold">No staff yet</p>
      <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">
        Each member signs in with their own email and a 6-digit pin that you set,
        and sees only your workspace — and only the features you grant them.
      </p>
      <button
        onClick={onAdd}
        className="mt-4 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
      >
        + Add Member
      </button>
      {/* Stated plainly because there is no invite link: the owner chooses the pin
          and passes it on. Leaving that implicit had people waiting for an email
          that is never sent. */}
      <p className="mx-auto mt-3 max-w-md text-xs text-slate-400">
        There is no invitation email. You choose the pin here and give it to them
        yourself.
      </p>
    </div>
  );
}

/** A relative "last login", short enough for a table cell. */
function sinceLogin(iso: string): string {
  const then = new Date(iso).getTime();
  const mins = Math.round((Date.now() - then) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

function StaffForm({
  catalog,
  roles,
  member,
  onCancel,
  onSaved,
}: {
  catalog: StaffPermissionCatalog;
  roles: StaffRole[];
  member: StaffMember | null;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const isEdit = member !== null;
  const [first, last] = splitName(member?.name ?? "");

  const [firstName, setFirstName] = useState(first);
  const [lastName, setLastName] = useState(last);
  const [email, setEmail] = useState(member?.email ?? "");
  const [phone, setPhone] = useState(member?.phone ?? "");
  const [pin, setPin] = useState("");
  const [roleId, setRoleId] = useState(member?.roleId ?? "");
  const [granted, setGranted] = useState<Set<string>>(new Set(member?.permissions ?? []));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Roles ordered most senior first, for the assignment dropdown.
  const sortedRoles = useMemo(
    () => [...roles].sort((a, b) => a.level - b.level || a.name.localeCompare(b.name)),
    [roles],
  );
  const selectedRole = roles.find((r) => r._id === roleId) ?? null;

  // Only features the client itself has are grantable; hide the rest entirely so
  // a client never toggles something its own plan doesn't include.
  const available = useMemo(() => new Set(catalog.available), [catalog.available]);
  const visibleGroups = useMemo(
    () =>
      catalog.groups
        .map((g) => ({ ...g, features: g.features.filter((f) => available.has(f.key)) }))
        .filter((g) => g.features.length > 0),
    [catalog.groups, available],
  );
  const allKeys = useMemo(
    () => visibleGroups.flatMap((g) => g.features.map((f) => f.key)),
    [visibleGroups],
  );
  const allSelected = allKeys.length > 0 && allKeys.every((k) => granted.has(k));

  function toggle(key: string) {
    setGranted((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function toggleGroup(group: FeatureGroup, on: boolean) {
    setGranted((prev) => {
      const next = new Set(prev);
      for (const f of group.features) {
        if (on) next.add(f.key);
        else next.delete(f.key);
      }
      return next;
    });
  }

  function toggleAll(on: boolean) {
    setGranted(on ? new Set(allKeys) : new Set());
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    const name = [firstName.trim(), lastName.trim()].filter(Boolean).join(" ");
    if (!name) return setError("First name is required");
    if (!email.trim()) return setError("Email is required");
    if (!isEdit && !/^\d{6}$/.test(pin)) return setError("Login pin must be exactly 6 digits");
    if (isEdit && pin && !/^\d{6}$/.test(pin)) return setError("Login pin must be exactly 6 digits");

    setSaving(true);
    try {
      const body = {
        name,
        email: email.trim(),
        phone: phone.trim(),
        pin: pin || undefined,
        permissions: [...granted],
        roleId,
        disabled: member?.disabled ?? false,
      };
      if (isEdit) await api(`/staff/${member._id}`, { method: "PUT", body });
      else await api("/staff", { method: "POST", body });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save staff member");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-6">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-slate-300 px-2.5 py-1 text-sm hover:bg-slate-50"
        >
          ← Back
        </button>
        <h2 className="text-lg font-semibold">
          {isEdit ? `Edit ${member.name}` : "New Staff Member"}
        </h2>
      </div>

      {/* Personal information */}
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <p className="mb-4 text-xs font-semibold uppercase tracking-wide text-slate-400">
          Personal Information
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="First Name" required>
            <input className="input" value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="e.g., Sarah" />
          </Field>
          <Field label="Last Name">
            <input className="input" value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="e.g., Miller" />
          </Field>
          <Field
            label="Email"
            required
            hint={isEdit ? "Email can't be changed after creation." : "Used together with the login pin to sign in."}
          >
            <input
              className="input"
              type="email"
              value={email}
              disabled={isEdit}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="e.g., sarah@company.com"
            />
          </Field>
          <Field label="Phone">
            <input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+91" />
          </Field>
          <Field
            label={isEdit ? "Reset Login Pin" : "Login Pin"}
            required={!isEdit}
            hint={isEdit ? "Leave blank to keep the current pin." : "Exactly 6 digits. Staff use this to log in."}
          >
            <input
              className="input font-mono"
              inputMode="numeric"
              maxLength={6}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
              placeholder="Exactly 6 digits (numeric only)"
            />
          </Field>
        </div>
      </div>

      {/* Organization — role assignment */}
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <p className="mb-4 text-xs font-semibold uppercase tracking-wide text-slate-400">
          Organization
        </p>
        <Field
          label="Role"
          hint={
            selectedRole
              ? `Grants the "${selectedRole.name}" role's permissions (${roleLevelLabel(selectedRole.level)}) as a baseline. The checkboxes below add extra access on top.`
              : "Optional. Assign a role to give this member a baseline permission set. Manage roles in the Roles tab."
          }
        >
          <select className="input" value={roleId} onChange={(e) => setRoleId(e.target.value)}>
            <option value="">No role — custom permissions only</option>
            {sortedRoles.map((r) => (
              <option key={r._id} value={r._id}>
                {r.name} · {roleLevelLabel(r.level)} (L{r.level})
              </option>
            ))}
          </select>
        </Field>
      </div>

      {/* Permissions */}
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Extra Permissions
            </p>
            <p className="mt-0.5 text-sm text-slate-500">
              Added on top of any role. They can never access more than your plan includes.
            </p>
          </div>
          <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
            <input type="checkbox" checked={allSelected} onChange={(e) => toggleAll(e.target.checked)} />
            Select all
          </label>
        </div>

        {visibleGroups.length === 0 ? (
          <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-500">
            Your plan has no delegatable features yet.
          </p>
        ) : (
          <div className="space-y-3">
            {visibleGroups.map((g) => {
              const groupKeys = g.features.map((f) => f.key);
              const groupAll = groupKeys.every((k) => granted.has(k));
              return (
                <div key={g.key} className="rounded-lg border border-slate-200">
                  <div className="flex items-center justify-between px-4 py-2.5">
                    <span className="font-medium">{g.label}</span>
                    <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-500">
                      <input
                        type="checkbox"
                        checked={groupAll}
                        onChange={(e) => toggleGroup(g, e.target.checked)}
                      />
                      All
                    </label>
                  </div>
                  <div className="grid gap-x-6 gap-y-2 border-t border-slate-100 px-4 py-3 sm:grid-cols-2 lg:grid-cols-3">
                    {g.features.map((f) => (
                      <label key={f.key} className="flex cursor-pointer items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={granted.has(f.key)}
                          onChange={() => toggle(f.key)}
                        />
                        {f.label}
                      </label>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}

      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? "Saving…" : isEdit ? "Save Changes" : "Create Staff"}
        </button>
      </div>
    </form>
  );
}

function Field({
  label,
  required,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium">
        {label} {required && <span className="text-rose-500">*</span>}
      </label>
      {children}
      {hint && <p className="mt-1 text-xs text-slate-400">{hint}</p>}
    </div>
  );
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function splitName(name: string): [string, string] {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return ["", ""];
  return [parts[0], parts.slice(1).join(" ")];
}

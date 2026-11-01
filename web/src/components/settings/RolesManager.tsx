"use client";

import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import {
  ROLE_LEVELS,
  roleLevelLabel,
  type FeatureGroup,
  type StaffMember,
  type StaffPermissionCatalog,
  type StaffRole,
} from "@/lib/types";

// Roles are reusable permission sets at a hierarchy level. A client creates roles
// here, edits each role's permissions, then assigns a role to staff members as
// their baseline access.
export function RolesManager({
  staff,
  onShowMembers,
}: {
  /** Passed down rather than fetched again: the Staff tab already has the list. */
  staff: StaffMember[];
  /** Switches to the Members tab filtered to this role. */
  onShowMembers: (roleId: string) => void;
}) {
  const [roles, setRoles] = useState<StaffRole[]>([]);
  const [catalog, setCatalog] = useState<StaffPermissionCatalog | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Create form.
  const [newName, setNewName] = useState("");
  const [newLevel, setNewLevel] = useState(5);
  const [creating, setCreating] = useState(false);

  async function load() {
    try {
      const [list, cat] = await Promise.all([
        api<StaffRole[]>("/roles"),
        api<StaffPermissionCatalog>("/staff/permissions"),
      ]);
      setRoles(list);
      setCatalog(cat);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load roles");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    async function run() {
      await load();
    }
    run();
  }, []);

  const selected = roles.find((r) => r._id === selectedId) ?? null;

  /**
   * How many staff hold each role.
   *
   * Counted from the member list rather than asked of the server, because the
   * Staff tab has already loaded it and a second endpoint would be a second
   * thing that can disagree.
   */
  const memberCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const m of staff) {
      if (m.roleId) counts.set(m.roleId, (counts.get(m.roleId) ?? 0) + 1);
    }
    return counts;
  }, [staff]);

  // Group roles by level for the "Organization Roles" list.
  const grouped = useMemo(() => {
    const byLevel = new Map<number, StaffRole[]>();
    for (const r of roles) {
      const arr = byLevel.get(r.level) ?? [];
      arr.push(r);
      byLevel.set(r.level, arr);
    }
    return ROLE_LEVELS.map((l) => ({ ...l, roles: byLevel.get(l.level) ?? [] })).filter(
      (g) => g.roles.length > 0,
    );
  }, [roles]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    setCreating(true);
    setError("");
    try {
      const role = await api<StaffRole>("/roles", {
        method: "POST",
        body: { name: newName.trim(), level: newLevel, permissions: [] },
      });
      setNewName("");
      await load();
      setSelectedId(role._id); // Jump straight to editing its permissions.
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create role");
    } finally {
      setCreating(false);
    }
  }

  async function remove(role: StaffRole) {
    if (!window.confirm(`Delete the "${role.name}" role? Staff keep their own direct permissions.`))
      return;
    try {
      await api(`/roles/${role._id}`, { method: "DELETE" });
      if (selectedId === role._id) setSelectedId(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete role");
    }
  }

  if (loading) return <p className="p-6 text-sm text-slate-500">Loading…</p>;

  return (
    <div>
      <p className="mb-4 text-sm text-slate-500">
        Baseline access for every staff member based on their job function. Create a role, set its
        permissions, then assign it to staff.
      </p>

      {error && (
        <p className="mb-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>
      )}

      {/* Create New Role */}
      <form
        onSubmit={create}
        className="mb-6 rounded-xl border border-slate-200 bg-slate-50 p-4"
      >
        <p className="mb-3 font-semibold">Create New Role</p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            className="input flex-1"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="e.g. Sales Manager"
          />
          <select
            className="input sm:w-52"
            value={newLevel}
            onChange={(e) => setNewLevel(Number(e.target.value))}
          >
            {ROLE_LEVELS.map((l) => (
              <option key={l.level} value={l.level}>
                {l.label} (L{l.level})
              </option>
            ))}
          </select>
          <button
            type="submit"
            disabled={creating || !newName.trim()}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {creating ? "Creating…" : "+ Create"}
          </button>
        </div>
      </form>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,340px)_1fr]">
        {/* Organization Roles list */}
        <div>
          <p className="mb-3 text-sm font-semibold text-slate-700">Organization Roles</p>
          {grouped.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
              No roles yet. Create your first role above.
            </div>
          ) : (
            <div className="space-y-4">
              {grouped.map((g) => (
                <div key={g.level}>
                  <div className="mb-2 flex items-center gap-2">
                    <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
                      L{g.level} · {g.label}
                    </span>
                    <span className="text-xs text-slate-400">{g.roles.length}</span>
                  </div>
                  <div className="space-y-2">
                    {g.roles.map((r) => {
                      const active = r._id === selectedId;
                      return (
                        <button
                          key={r._id}
                          onClick={() => setSelectedId(r._id)}
                          className={`flex w-full items-center justify-between rounded-lg border px-3 py-2.5 text-left transition ${
                            active
                              ? "border-blue-300 bg-blue-50"
                              : "border-slate-200 bg-white hover:bg-slate-50"
                          }`}
                        >
                          <div className="min-w-0">
                            <p className="font-medium">{r.name}</p>
                            {/* What the role actually grants, in words. A bare
                                feature count says nothing about whether this is
                                the role that can see billing. */}
                            <p className="truncate text-xs text-slate-400">
                              {permissionSummary(r, catalog)}
                              {r.isSystem && " · System"}
                            </p>
                            <p className="mt-0.5 text-xs">
                              {(memberCounts.get(r._id) ?? 0) === 0 ? (
                                <span className="text-slate-400">No members</span>
                              ) : (
                                <span
                                  role="button"
                                  tabIndex={0}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onShowMembers(r._id);
                                  }}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") {
                                      e.stopPropagation();
                                      onShowMembers(r._id);
                                    }
                                  }}
                                  className="cursor-pointer text-blue-600 hover:underline"
                                >
                                  {memberCounts.get(r._id)}{" "}
                                  {memberCounts.get(r._id) === 1 ? "member" : "members"}
                                </span>
                              )}
                            </p>
                          </div>
                          {!r.isSystem && (
                            <span
                              role="button"
                              tabIndex={0}
                              onClick={(e) => {
                                e.stopPropagation();
                                remove(r);
                              }}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.stopPropagation();
                                  remove(r);
                                }
                              }}
                              className="rounded px-2 py-1 text-xs text-rose-600 hover:bg-rose-50"
                            >
                              Delete
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Permission editor */}
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          {selected && catalog ? (
            <RolePermissionEditor
              key={selected._id}
              role={selected}
              catalog={catalog}
              onSaved={async () => {
                await load();
              }}
            />
          ) : (
            <div className="flex h-full min-h-[240px] flex-col items-center justify-center text-center text-slate-400">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
                <path d="M12 3l7 3v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z" />
              </svg>
              <p className="mt-3 text-sm">Select a role to edit permissions</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * A short, readable description of what a role grants.
 *
 * Names the feature groups rather than listing every key: "CRM, Lead Generation
 * +2" tells you the shape of the role at a glance, which is what the list is for.
 * The editor beside it is where the exact keys belong.
 */
function permissionSummary(
  role: StaffRole,
  catalog: StaffPermissionCatalog | null,
): string {
  if (role.permissions.length === 0) return "No access";
  if (!catalog) {
    return `${role.permissions.length} feature${role.permissions.length === 1 ? "" : "s"}`;
  }

  const granted = new Set(role.permissions);
  const groups = catalog.groups
    .filter((g) => g.features.some((f) => granted.has(f.key)))
    .map((g) => g.label);

  if (groups.length === 0) {
    return `${role.permissions.length} feature${role.permissions.length === 1 ? "" : "s"}`;
  }
  const shown = groups.slice(0, 2).join(", ");
  return groups.length > 2 ? `${shown} +${groups.length - 2}` : shown;
}

function RolePermissionEditor({
  role,
  catalog,
  onSaved,
}: {
  role: StaffRole;
  catalog: StaffPermissionCatalog;
  onSaved: () => void;
}) {
  const [name, setName] = useState(role.name);
  const [level, setLevel] = useState(role.level);
  const [granted, setGranted] = useState<Set<string>>(new Set(role.permissions));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

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

  async function save() {
    setSaving(true);
    setError("");
    try {
      await api(`/roles/${role._id}`, {
        method: "PUT",
        body: { name: name.trim() || role.name, level, permissions: [...granted] },
      });
      await onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save role");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <input
          className="input flex-1"
          value={name}
          disabled={role.isSystem}
          onChange={(e) => setName(e.target.value)}
        />
        <select
          className="input sm:w-44"
          value={level}
          disabled={role.isSystem}
          onChange={(e) => setLevel(Number(e.target.value))}
        >
          {ROLE_LEVELS.map((l) => (
            <option key={l.level} value={l.level}>
              {l.label} (L{l.level})
            </option>
          ))}
        </select>
      </div>

      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm font-semibold text-slate-700">
          Permissions{" "}
          <span className="font-normal text-slate-400">· {roleLevelLabel(level)}</span>
        </p>
        <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
          <input
            type="checkbox"
            checked={allSelected}
            onChange={(e) => setGranted(e.target.checked ? new Set(allKeys) : new Set())}
          />
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
            const groupAll = g.features.every((f) => granted.has(f.key));
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
                <div className="grid gap-x-6 gap-y-2 border-t border-slate-100 px-4 py-3 sm:grid-cols-2">
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

      {error && <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}

      <div className="mt-4 flex justify-end">
        <button
          onClick={save}
          disabled={saving}
          className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save Role"}
        </button>
      </div>
    </div>
  );
}

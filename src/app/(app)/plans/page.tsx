"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { Plan } from "@/lib/types";
import { PageHeader, StatTile } from "@/components/ui";
import { PlanEditor } from "@/components/PlanEditor";

export default function PlansPage() {
  const { isAdmin, loading } = useAuth();
  const router = useRouter();

  const [plans, setPlans] = useState<Plan[]>([]);
  const [editing, setEditing] = useState<Plan | "new" | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!loading && !isAdmin) router.replace("/dashboard");
  }, [loading, isAdmin, router]);

  async function load() {
    try {
      setPlans(await api<Plan[]>("/plans"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load plans");
    }
  }

  useEffect(() => {
    async function run() {
      if (isAdmin) await load();
    }
    run();
  }, [isAdmin]);

  async function remove(p: Plan) {
    if (!window.confirm(`Delete plan "${p.name}"? Clients on it will fall back to full access.`))
      return;
    try {
      await api(`/plans/${p._id}`, { method: "DELETE" });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete plan");
    }
  }

  if (loading || !isAdmin) return null;

  const enabledCount = (p: Plan) => Object.values(p.features ?? {}).filter(Boolean).length;
  const activeCycles = (p: Plan) => (p.pricing?.cycles ?? []).filter((c) => c.active).length;
  const cheapest = (p: Plan) => {
    const prices = (p.pricing?.cycles ?? []).filter((c) => c.active && c.price > 0).map((c) => c.price);
    return prices.length ? Math.min(...prices) : 0;
  };

  return (
    <div className="mx-auto max-w-[1100px] p-6">
      <PageHeader
        title="Plans"
        subtitle="Reusable entitlement plans you assign to clients"
        actions={
          <button
            onClick={() => setEditing("new")}
            className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
          >
            + New Plan
          </button>
        }
      />

      <div className="mb-4 grid gap-4 sm:grid-cols-3">
        <StatTile label="Plans" value={plans.length} icon="Layers" tone="blue" badge="" />
        <StatTile
          label="Cheapest active price"
          value={
            plans.length
              ? `₹${Math.min(...plans.map((p) => cheapest(p) || Infinity)).toLocaleString("en-IN")}`
              : "—"
          }
          icon="Money"
          tone="green"
          badge=""
        />
        <StatTile
          label="Most generous plan"
          value={plans.length ? Math.max(...plans.map(enabledCount)) + " features" : "—"}
          icon="Sparkle"
          tone="violet"
          badge=""
        />
      </div>

      {error && (
        <p className="mb-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>
      )}

      {plans.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 p-10 text-center">
          <p className="text-sm text-slate-500">
            No plans yet. Create one, then assign it when you add a client.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {plans.map((p) => (
            <div key={p._id} className="flex flex-col rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex items-start justify-between">
                <h3 className="text-base font-semibold">{p.name}</h3>
                {p.limits?.whiteLabel && (
                  <span className="rounded bg-violet-50 px-1.5 py-0.5 text-[11px] font-medium text-violet-700">
                    white label
                  </span>
                )}
              </div>

              <div className="mt-1 text-2xl font-semibold">
                {cheapest(p) > 0 ? (
                  <>
                    ₹{cheapest(p).toLocaleString("en-IN")}
                    <span className="text-sm font-normal text-slate-400"> / cycle from</span>
                  </>
                ) : (
                  <span className="text-slate-400">Free</span>
                )}
              </div>

              <div className="mt-3 flex flex-wrap gap-1.5 text-xs text-slate-500">
                <span className="rounded bg-slate-100 px-1.5 py-0.5">
                  {enabledCount(p)} features
                </span>
                <span className="rounded bg-slate-100 px-1.5 py-0.5">
                  {activeCycles(p)} cycles
                </span>
                {p.tax?.apply && (
                  <span className="rounded bg-slate-100 px-1.5 py-0.5">GST {p.tax.ratePct}%</span>
                )}
              </div>

              <div className="mt-4 flex gap-2 border-t border-slate-100 pt-3">
                <button
                  onClick={() => setEditing(p)}
                  className="flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50"
                >
                  Edit
                </button>
                <button
                  onClick={() => remove(p)}
                  className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-rose-600 hover:bg-rose-50"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <PlanEditor
          plan={editing === "new" ? undefined : editing}
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

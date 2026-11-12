"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { PublicShell } from "@/components/PublicShell";

interface PublicPlan {
  _id: string;
  name: string;
  gstApplies: boolean;
  gstRatePct: number;
  cycles: { key: string; label: string; amountMinor: number; months: number }[];
}

interface CashfreeSDK {
  checkout: (opts: { paymentSessionId: string; redirectTarget: string }) => Promise<unknown>;
}
declare global {
  interface Window {
    Cashfree?: (opts: { mode: string }) => CashfreeSDK;
  }
}

const rupees = (minor: number) =>
  "₹" + (minor / 100).toLocaleString("en-IN", { minimumFractionDigits: minor % 100 ? 2 : 0 });

// Cashfree's checkout script, loaded only when someone actually pays.
function loadCashfree(): Promise<void> {
  if (window.Cashfree) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://sdk.cashfree.com/js/v3/cashfree.js";
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Could not load the payment page. Check your connection."));
    document.head.appendChild(s);
  });
}

export default function PricingPage() {
  const [plans, setPlans] = useState<PublicPlan[] | null>(null);
  const [enabled, setEnabled] = useState(true);
  const [choice, setChoice] = useState<{ plan: PublicPlan; cycle: string } | null>(null);
  const [form, setForm] = useState({ name: "", email: "", phone: "", gstin: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api<{ enabled: boolean; plans: PublicPlan[] }>("/public/plans")
      .then((r) => {
        setPlans(r.plans);
        setEnabled(r.enabled);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Could not load plans"));
  }, []);

  async function pay(e: React.FormEvent) {
    e.preventDefault();
    if (!choice) return;
    setBusy(true);
    setError("");
    try {
      const res = await api<{ paymentSessionId: string; mode: string }>("/public/checkout", {
        method: "POST",
        body: { planId: choice.plan._id, cycle: choice.cycle, ...form },
      });
      await loadCashfree();
      await window.Cashfree!({ mode: res.mode }).checkout({
        paymentSessionId: res.paymentSessionId,
        redirectTarget: "_self",
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Payment could not be started");
      setBusy(false);
    }
  }

  const cycle = choice?.plan.cycles.find((c) => c.key === choice.cycle);

  return (
    <PublicShell
      title="Choose your plan"
      subtitle="Pay once for the period you choose. Your account is ready as soon as payment clears."
      wide
    >
      {!enabled && (
        <p className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Online payment is not available yet. Please contact us to get started.
        </p>
      )}
      {!plans && !error && <p className="text-sm text-slate-500">Loading plans…</p>}
      {plans && plans.length === 0 && (
        <p className="text-sm text-slate-500">No plans are on sale right now. Please contact us.</p>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        {plans?.map((p) => (
          <div key={p._id} className="rounded-xl border border-slate-200 bg-white p-5">
            <p className="text-lg font-semibold">{p.name}</p>
            <div className="mt-3 space-y-2">
              {p.cycles.map((c) => {
                const on = choice?.plan._id === p._id && choice.cycle === c.key;
                return (
                  <button
                    key={c.key}
                    type="button"
                    onClick={() => setChoice({ plan: p, cycle: c.key })}
                    aria-pressed={on}
                    className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-sm ${
                      on ? "border-[var(--ark-primary)] bg-[var(--ark-primary-soft)]" : "border-slate-200 hover:bg-slate-50"
                    }`}
                  >
                    <span>{c.label}</span>
                    <span className="font-semibold tabular-nums">{rupees(c.amountMinor)}</span>
                  </button>
                );
              })}
            </div>
            {p.gstApplies && (
              <p className="mt-2 text-xs text-slate-500">Includes {p.gstRatePct}% GST</p>
            )}
          </div>
        ))}
      </div>

      {choice && cycle && (
        <form onSubmit={pay} className="mt-8 max-w-md space-y-4 rounded-xl border border-slate-200 bg-white p-5">
          <p className="text-sm">
            <b>{choice.plan.name}</b>, {cycle.label}: <b>{rupees(cycle.amountMinor)}</b>
          </p>
          <label className="block text-sm font-medium">
            Your name
            <input className="input mt-1" required autoComplete="name" value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </label>
          <label className="block text-sm font-medium">
            Email
            <input className="input mt-1" type="email" required autoComplete="email" value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })} />
            <span className="mt-1 block text-xs font-normal text-slate-500">
              Your sign-in, and where we send the link to set your password.
            </span>
          </label>
          <label className="block text-sm font-medium">
            Mobile number
            <input className="input mt-1" type="tel" required autoComplete="tel" placeholder="9876543210"
              value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            <span className="mt-1 block text-xs font-normal text-slate-500">
              Needed by the payment gateway. Start with + for a number outside India.
            </span>
          </label>
          <label className="block text-sm font-medium">
            GSTIN <span className="font-normal text-slate-500">(optional, for a business invoice)</span>
            <input className="input mt-1 uppercase" maxLength={15} value={form.gstin}
              onChange={(e) => setForm({ ...form, gstin: e.target.value })} />
          </label>
          {error && <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
          <button
            type="submit"
            disabled={busy || !enabled}
            className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {busy ? "Opening payment…" : `Pay ${rupees(cycle.amountMinor)}`}
          </button>
        </form>
      )}
      {!choice && error && <p className="mt-4 text-sm text-rose-700">{error}</p>}

      <p className="mt-8 text-sm text-slate-500">
        Already have an account? <Link href="/login" className="underline">Sign in</Link>
      </p>
    </PublicShell>
  );
}

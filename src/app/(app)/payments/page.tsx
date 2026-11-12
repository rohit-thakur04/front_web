"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { PageHeader } from "@/components/ui";
import type { PaymentOrder } from "@/lib/types";

const STATUS: Record<PaymentOrder["status"], { label: string; cls: string }> = {
  provisioned: { label: "Account created", cls: "bg-emerald-50 text-emerald-700" },
  paid: { label: "Paid, creating account", cls: "bg-blue-50 text-blue-700" },
  pending: { label: "Awaiting payment", cls: "bg-slate-100 text-slate-600" },
  failed: { label: "Failed", cls: "bg-slate-100 text-slate-600" },
  abandoned: { label: "Abandoned", cls: "bg-slate-100 text-slate-600" },
  refunded: { label: "Refunded", cls: "bg-amber-50 text-amber-800" },
  flagged: { label: "Needs review", cls: "bg-rose-50 text-rose-700" },
};

const rupees = (minor: number) => "₹" + (minor / 100).toLocaleString("en-IN", { minimumFractionDigits: 2 });

// Plan purchases made through the pricing page. Read-only: refunds and
// corrections are done in the Cashfree dashboard.
export default function PaymentsPage() {
  const [data, setData] = useState<{ configured: boolean; mode: string; orders: PaymentOrder[] } | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api<{ configured: boolean; mode: string; orders: PaymentOrder[] }>("/admin/payments")
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : "Could not load payments"));
  }, []);

  const flagged = data?.orders.filter((o) => o.status === "flagged").length ?? 0;

  return (
    <div className="p-6">
      <PageHeader
        title="Payments"
        subtitle={data ? `Plan purchases from the pricing page · Cashfree ${data.mode}` : undefined}
      />
      {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
      {data && !data.configured && (
        <p className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Cashfree is not set up on the server (CASHFREE_APP_ID and CASHFREE_SECRET_KEY), so the
          pricing page cannot take payments.
        </p>
      )}
      {flagged > 0 && (
        <p className="mb-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800">
          {flagged} payment{flagged === 1 ? " needs" : "s need"} a person: see the reason on each row.
        </p>
      )}
      {data && data.orders.length === 0 && <p className="text-sm text-slate-500">No purchases yet.</p>}
      {data && data.orders.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
                <th className="px-3 py-2">When</th>
                <th className="px-3 py-2">Customer</th>
                <th className="px-3 py-2">Plan</th>
                <th className="px-3 py-2 text-right">Amount</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Reference</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.orders.map((o) => (
                <tr key={o._id}>
                  <td className="px-3 py-2 whitespace-nowrap text-slate-500">{new Date(o.createdAt).toLocaleString()}</td>
                  <td className="px-3 py-2">
                    {o.name}
                    <span className="block text-xs text-slate-500">{o.email} · {o.phone}{o.gstin ? ` · ${o.gstin}` : ""}</span>
                  </td>
                  <td className="px-3 py-2">{o.planName}<span className="block text-xs text-slate-500">{o.cycleName}</span></td>
                  <td className="px-3 py-2 text-right tabular-nums">{rupees(o.amountMinor)}</td>
                  <td className="px-3 py-2">
                    <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${STATUS[o.status]?.cls ?? ""}`}>
                      {STATUS[o.status]?.label ?? o.status}
                    </span>
                    {o.note && <span className="mt-1 block max-w-xs text-xs text-slate-500">{o.note}</span>}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-slate-500">{o.providerOrderId}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

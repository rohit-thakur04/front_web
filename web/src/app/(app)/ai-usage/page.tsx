"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { PageHeader } from "@/components/ui";
import { Panel, Table, THead, TH, TBody, TR, TD } from "@/components/kit";

interface TenantRow {
  tenantId: string;
  name: string;
  email: string;
  plan: string;
  messages: number;
  tokens: number;
  costUsd: number;
  messagePct: number;
  tokenPct: number;
  budgetPct: number;
  entitled: boolean;
  subscriptionStatus: string;
}

interface Analytics {
  totals: { entitledTenants: number; activeTenants: number; messages: number; tokens: number; costUsd: number };
  byPlan: { plan: string; enabled: boolean; tenants: number; activeTenants: number; messages: number; tokens: number; costUsd: number }[];
  topTenants: TenantRow[];
  nearLimit: TenantRow[];
  byModel: { model: string; provider: string; messages: number; inputTokens: number; outputTokens: number; costUsd: number }[];
  recentChanges: { _id: string; actorEmail: string; action: string; targetName: string; at: string }[];
  pendingUpgradeRequests: number;
  providersConfigured: string;
}

interface UpgradeRequest {
  _id: string;
  tenantName: string;
  tenantEmail: string;
  message: string;
  status: string;
  createdAt: string;
}

const num = (n: number) => n.toLocaleString("en-IN");
const usd = (n: number) => `$${n.toFixed(n < 1 ? 4 : 2)}`;
const pct = (n: number) => (n < 0 ? "—" : `${Math.round(n)}%`);
const ACTIONS: Record<string, string> = {
  "plan.chatbot.updated": "changed chatbot settings on plan",
  "plan.deleted": "deleted plan",
  "client.subscription.updated": "changed the subscription of",
};

/*
 * The Super Admin's view of the AI assistant across every client, for each
 * client's current billing period. Entitlements are changed on the Plans page
 * (AI Chatbot tab) and per client on the Clients page; every such change is
 * listed here.
 */
export default function AIUsagePage() {
  const [data, setData] = useState<Analytics | null>(null);
  const [requests, setRequests] = useState<UpgradeRequest[]>([]);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const [a, r] = await Promise.all([
        api<Analytics>("/admin/assistant/analytics"),
        api<UpgradeRequest[]>("/admin/upgrade-requests?status=pending"),
      ]);
      setData(a);
      setRequests(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load AI usage");
    }
  }, []);

  // Matches the other admin pages: the async work is wrapped so the effect
  // body itself doesn't set state synchronously.
  useEffect(() => {
    async function run() {
      await load();
    }
    run();
  }, [load]);

  async function close(r: UpgradeRequest, status: "resolved" | "dismissed") {
    try {
      await api(`/admin/upgrade-requests/${r._id}`, { method: "PATCH", body: { status } });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update the request");
    }
  }

  if (error) return <p className="p-6 text-sm text-rose-600">{error}</p>;
  if (!data) return <p className="p-6 text-sm text-slate-500">Loading…</p>;
  const t = data.totals;

  return (
    <div className="space-y-5 p-6">
      <PageHeader
        title="AI Usage"
        subtitle="Chatbot access, usage and estimated provider cost for each client's current billing period."
      />
      {!data.providersConfigured && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          No AI provider key is set on the server, so the assistant can&apos;t answer anyone. Set
          CHATBOT_ANTHROPIC_API_KEY (or the OpenAI / Gemini one) in the API&apos;s environment.
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-5">
        {(
          [
            ["Clients with access", num(t.entitledTenants)],
            ["Active this period", num(t.activeTenants)],
            ["Messages", num(t.messages)],
            ["Tokens", num(t.tokens)],
            ["Estimated cost", usd(t.costUsd)],
          ] as const
        ).map(([label, value]) => (
          <div key={label} className="rounded-xl border border-slate-200 bg-white p-4">
            <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
            <p className="mt-1 text-xl font-semibold tabular-nums">{value}</p>
          </div>
        ))}
      </div>

      <Panel title={`Upgrade requests (${requests.length})`} description="Grant one by changing the client's plan on the Clients page, then mark it resolved." flush>
        {requests.length === 0 ? (
          <p className="px-4 py-5 text-sm text-slate-500">No pending requests.</p>
        ) : (
          <Table>
            <THead><TH>Client</TH><TH>Requested</TH><TH align="right">Actions</TH></THead>
            <TBody>
              {requests.map((r) => (
                <TR key={r._id}>
                  <TD>{r.tenantName}<span className="block text-xs text-slate-500">{r.tenantEmail}</span></TD>
                  <TD muted>{new Date(r.createdAt).toLocaleDateString("en-IN")}</TD>
                  <TD align="right">
                    <Link href="/clients" className="mr-3 text-xs font-medium text-blue-600">Change plan</Link>
                    <button onClick={() => close(r, "resolved")} className="mr-2 text-xs font-medium text-emerald-700">Resolved</button>
                    <button onClick={() => close(r, "dismissed")} className="text-xs text-slate-500">Dismiss</button>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Panel>

      <Panel title="Approaching limits" description="Clients at 80% or more of any monthly cap." flush>
        <TenantTable rows={data.nearLimit} empty="Nobody is close to a limit." />
      </Panel>

      <Panel title="Highest usage" flush>
        <TenantTable rows={data.topTenants} empty="No usage yet this period." />
      </Panel>

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title="By plan" flush>
          <Table>
            <THead><TH>Plan</TH><TH align="right">Clients</TH><TH align="right">Active</TH><TH align="right">Messages</TH><TH align="right">Cost</TH></THead>
            <TBody>
              {data.byPlan.map((p) => (
                <TR key={p.plan}>
                  <TD>{p.plan}{!p.enabled && <span className="ml-1 text-xs text-slate-400">(chatbot off)</span>}</TD>
                  <TD align="right" numeric>{p.tenants}</TD>
                  <TD align="right" numeric>{p.activeTenants}</TD>
                  <TD align="right" numeric>{num(p.messages)}</TD>
                  <TD align="right" numeric>{usd(p.costUsd)}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Panel>

        <Panel title="By model" description={data.providersConfigured ? `Keys set: ${data.providersConfigured}` : undefined} flush>
          {data.byModel.length === 0 ? (
            <p className="px-4 py-5 text-sm text-slate-500">No usage yet this period.</p>
          ) : (
            <Table>
              <THead><TH>Model</TH><TH align="right">Messages</TH><TH align="right">Tokens in / out</TH><TH align="right">Cost</TH></THead>
              <TBody>
                {data.byModel.map((m) => (
                  <TR key={m.model}>
                    <TD>{m.model}</TD>
                    <TD align="right" numeric>{num(m.messages)}</TD>
                    <TD align="right" numeric>{num(m.inputTokens)} / {num(m.outputTokens)}</TD>
                    <TD align="right" numeric>{usd(m.costUsd)}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </Panel>
      </div>

      <Panel title="Entitlement changes" description="Every change to a plan's chatbot settings or a client's subscription." flush>
        {data.recentChanges.length === 0 ? (
          <p className="px-4 py-5 text-sm text-slate-500">No changes recorded yet.</p>
        ) : (
          <ul className="divide-y divide-slate-100 text-sm">
            {data.recentChanges.map((c) => (
              <li key={c._id} className="px-4 py-2.5">
                <span className="font-medium">{c.actorEmail || "An admin"}</span>{" "}
                {ACTIONS[c.action] ?? c.action} <span className="font-medium">{c.targetName}</span>
                <span className="ml-2 text-xs text-slate-500">{new Date(c.at).toLocaleString("en-IN")}</span>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <p className="text-xs text-slate-500">
        Costs are estimates from published per-token prices; your provider invoice is the actual figure.
      </p>
    </div>
  );
}

function TenantTable({ rows, empty }: { rows: TenantRow[]; empty: string }) {
  if (rows.length === 0) return <p className="px-4 py-5 text-sm text-slate-500">{empty}</p>;
  return (
    <Table>
      <THead>
        <TH>Client</TH><TH>Plan</TH><TH align="right">Messages</TH><TH align="right">Tokens</TH>
        <TH align="right">Msg cap</TH><TH align="right">Token cap</TH><TH align="right">Budget</TH><TH align="right">Cost</TH>
      </THead>
      <TBody>
        {rows.map((r) => (
          <TR key={r.tenantId}>
            <TD>
              {r.name}
              <span className="block text-xs text-slate-500">
                {r.email}
                {!r.entitled && " · no access now"}
              </span>
            </TD>
            <TD muted>{r.plan || "—"}</TD>
            <TD align="right" numeric>{num(r.messages)}</TD>
            <TD align="right" numeric>{num(r.tokens)}</TD>
            <TD align="right" numeric>{pct(r.messagePct)}</TD>
            <TD align="right" numeric>{pct(r.tokenPct)}</TD>
            <TD align="right" numeric>{pct(r.budgetPct)}</TD>
            <TD align="right" numeric>{usd(r.costUsd)}</TD>
          </TR>
        ))}
      </TBody>
    </Table>
  );
}

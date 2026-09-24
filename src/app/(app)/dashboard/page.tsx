"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { AutomationLog, ContactsResponse, Pipeline } from "@/lib/types";
import { Icon } from "@/components/icons";
import { PageHeader, Section, StatTile } from "@/components/ui";

interface Metrics {
  pipelines: number;
  contacts: number;
  totalValue: number;
  withEmail: number;
  withPhone: number;
  activeAutomations: number;
  emailsSent: number;
  sequencesCompleted: number;
  emailsFailed: number;
}

const EMPTY: Metrics = {
  pipelines: 0,
  contacts: 0,
  totalValue: 0,
  withEmail: 0,
  withPhone: 0,
  activeAutomations: 0,
  emailsSent: 0,
  sequencesCompleted: 0,
  emailsFailed: 0,
};

export default function DashboardPage() {
  const { user } = useAuth();
  const [metrics, setMetrics] = useState<Metrics>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      // Everything here comes from endpoints that already exist; the dashboard
      // is a read-only roll-up, so it adds no new server surface.
      const [pipelines, contacts, logs] = await Promise.all([
        api<Pipeline[]>("/pipelines"),
        api<ContactsResponse>("/contacts"),
        api<AutomationLog[]>("/automation/logs?limit=1000"),
      ]);

      setMetrics({
        pipelines: pipelines.length,
        contacts: contacts.summary.totalContacts,
        totalValue: contacts.summary.totalValue,
        withEmail: contacts.summary.withEmail,
        withPhone: contacts.summary.withPhone,
        activeAutomations: contacts.summary.activeAutomations,
        emailsSent: logs.filter((l) => l.action === "sent").length,
        sequencesCompleted: logs.filter((l) => l.action === "completed").length,
        emailsFailed: logs.filter((l) => l.action === "failed").length,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load the dashboard");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    async function run() {
      await load();
    }
    run();
  }, [load]);

  const inr = (n: number) => `₹${n.toLocaleString("en-IN")}`;
  const emailCoverage =
    metrics.contacts > 0
      ? `${Math.round((metrics.withEmail / metrics.contacts) * 100)}%`
      : "—";

  const today = new Date().toLocaleDateString("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  return (
    <div className="p-6">
      <PageHeader
        title={`Welcome back, ${user?.name?.split(" ")[0] ?? ""}`.trim()}
        subtitle={today}
        actions={
          <>
            <button
              onClick={load}
              className="flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm hover:bg-slate-50"
            >
              <Icon.Refresh width={16} height={16} className="text-slate-500" />
              Refresh
            </button>
            <Link
              href="/board"
              className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
            >
              Open board
            </Link>
          </>
        }
      />

      {error && (
        <p className="mb-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>
      )}

      {loading ? (
        <DashboardSkeleton />
      ) : (
        <>
          <Section title="Pipeline & Contacts">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatTile label="Pipelines" value={metrics.pipelines} icon="Board" tone="blue" />
              <StatTile label="Total contacts" value={metrics.contacts} icon="Contacts" tone="violet" />
              <StatTile label="Pipeline value" value={inr(metrics.totalValue)} icon="Money" tone="green" />
              <StatTile
                label="Active automations"
                value={metrics.activeAutomations}
                icon="Sparkle"
                tone="amber"
                badge={metrics.activeAutomations > 0 ? "running" : "idle"}
              />
            </div>
          </Section>

          <Section title="Email Automation">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatTile label="Emails sent" value={metrics.emailsSent} icon="Send" tone="blue" />
              <StatTile
                label="Sequences completed"
                value={metrics.sequencesCompleted}
                icon="Check"
                tone="green"
              />
              <StatTile
                label="Failed sends"
                value={metrics.emailsFailed}
                icon="Mail"
                tone={metrics.emailsFailed > 0 ? "rose" : "slate"}
                badge={metrics.emailsFailed > 0 ? "needs attention" : "healthy"}
              />
              <StatTile label="Email coverage" value={emailCoverage} icon="Percent" tone="violet" />
            </div>
          </Section>

          <Section title="Reachability">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatTile label="With email" value={metrics.withEmail} icon="Mail" tone="blue" />
              <StatTile label="With phone" value={metrics.withPhone} icon="Phone" tone="green" />
            </div>
          </Section>
        </>
      )}
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      {[0, 1].map((row) => (
        <div key={row} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-28 animate-pulse rounded-xl border border-slate-200 bg-white" />
          ))}
        </div>
      ))}
    </div>
  );
}

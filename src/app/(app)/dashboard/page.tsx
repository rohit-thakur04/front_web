"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { AutomationLog, Contact, ContactsResponse, Pipeline, Stage } from "@/lib/types";
import { Icon } from "@/components/icons";
import { PageHeader, Section, StatTile } from "@/components/ui";
import { AreaTrend, BarList, Meter, StackedColumns } from "@/components/charts";

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

/** Module scope on purpose: a useMemo callback runs during the same render pass,
 *  before a `const` declared lower in the component body has initialised, so a
 *  helper referenced from a memo cannot live under it. */
const inr = (n: number) => `₹${n.toLocaleString("en-IN")}`;

/** Local-day key, so buckets line up with the user's calendar rather than UTC. */
function dayKey(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

function lastNDays(n: number) {
  const out: { key: string; label: string }[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    out.push({
      key: `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`,
      label: d.toLocaleDateString("en-IN", { day: "numeric", month: "short" }),
    });
  }
  return out;
}

/** Buckets rows into the last n calendar days. Days with nothing still appear,
 *  so a gap reads as a quiet day rather than compressing the axis. */
function dailySeries<T extends { createdAt: string }>(rows: T[], n: number, weight: (r: T) => number) {
  const days = lastNDays(n);
  const index = new Map(days.map((d) => [d.key, 0]));
  for (const r of rows) {
    const k = dayKey(r.createdAt);
    if (index.has(k)) index.set(k, index.get(k)! + weight(r));
  }
  return days.map((d) => ({ label: d.label, value: index.get(d.key)! }));
}

export default function DashboardPage() {
  const { user } = useAuth();
  const [metrics, setMetrics] = useState<Metrics>(EMPTY);
  // The charts derive from the same two responses the tiles already use, so
  // adding them costs no extra requests and no new server surface.
  const [contactRows, setContactRows] = useState<Contact[]>([]);
  const [logRows, setLogRows] = useState<AutomationLog[]>([]);
  const [pipelineList, setPipelineList] = useState<Pipeline[]>([]);
  // "" means every pipeline. Stage names repeat across pipelines, so without a
  // filter the widget silently merges two different "Qualified" columns.
  const [pipelineFilter, setPipelineFilter] = useState("");
  // Stage order for the selected pipeline, so the rows read as the funnel the
  // client built rather than sorted by size.
  const [stageOrder, setStageOrder] = useState<Stage[]>([]);
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

      setPipelineList(pipelines);
      setContactRows(contacts.contacts ?? []);
      setLogRows(logs);
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

  useEffect(() => {
    let cancelled = false;
    // The state writes all live inside the async wrapper: setting state directly
    // in an effect body cascades an extra render, which is what the lint rule is
    // guarding against, and the other tabs in this app follow the same shape.
    async function run() {
      if (!pipelineFilter) {
        if (!cancelled) setStageOrder([]);
        return;
      }
      try {
        const stages = await api<Stage[]>(`/pipelines/${pipelineFilter}/stages`);
        if (!cancelled) setStageOrder(stages);
      } catch {
        // Without the order the rows still render, just sorted by size.
        if (!cancelled) setStageOrder([]);
      }
    }
    run();
    return () => {
      cancelled = true;
    };
  }, [pipelineFilter]);

  // --- Chart series ------------------------------------------------------
  // All derived client-side from rows already fetched. Sorted descending so the
  // bar ramp's darkest step lands on the largest stage.
  const byStage = useMemo(() => {
    const rows = pipelineFilter
      ? contactRows.filter((c) => c.pipelineId === pipelineFilter)
      : contactRows;

    // Grouped by stage id, not name: two pipelines can both have a "Qualified"
    // stage, and merging them would be wrong in the all-pipelines view too.
    const totals = new Map<string, { label: string; count: number; value: number }>();
    for (const c of rows) {
      const key = c.stageId || "unassigned";
      const cur = totals.get(key) ?? {
        label: c.stageName || "Unassigned",
        count: 0,
        value: 0,
      };
      cur.count += 1;
      cur.value += c.value || 0;
      totals.set(key, cur);
    }

    const out = [...totals.entries()].map(([id, v]) => ({
      id,
      label: v.label,
      value: v.count,
      sub: v.value > 0 ? inr(v.value) : undefined,
    }));

    if (pipelineFilter && stageOrder.length > 0) {
      // Funnel order, and every stage shown — an empty stage is information,
      // not something to hide.
      const pos = new Map(stageOrder.map((st, i) => [st._id, i]));
      const seeded = stageOrder.map((st) => {
        const found = out.find((o) => o.id === st._id);
        return found ?? { id: st._id, label: st.name, value: 0, sub: undefined };
      });
      const extras = out.filter((o) => !pos.has(o.id));
      return [...seeded, ...extras];
    }

    return out
      .sort((a, b) => b.value - a.value)
      .slice(0, 8); // Past ~7 classes a table reads better than more marks.
  }, [contactRows, pipelineFilter, stageOrder]);

  const newContacts = useMemo(() => dailySeries(contactRows, 30, () => 1), [contactRows]);

  const automation = useMemo(() => {
    const days = lastNDays(14);
    const index = new Map(days.map((d) => [d.key, { sent: 0, completed: 0, failed: 0 }]));
    for (const l of logRows) {
      const bucket = index.get(dayKey(l.createdAt));
      if (!bucket) continue;
      if (l.action === "sent") bucket.sent++;
      else if (l.action === "completed") bucket.completed++;
      else if (l.action === "failed") bucket.failed++;
    }
    return days.map((d) => ({ label: d.label, values: index.get(d.key)! }));
  }, [logRows]);

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

          <Section title="Where your contacts are">
            <div className="grid gap-4 lg:grid-cols-3">
              <Card
                className="lg:col-span-2"
                title="Contacts by stage"
                subtitle={
                  pipelineFilter
                    ? "In this pipeline's own stage order"
                    : "Across every pipeline, largest first"
                }
                action={
                  <select
                    value={pipelineFilter}
                    onChange={(e) => setPipelineFilter(e.target.value)}
                    aria-label="Filter by pipeline"
                    className="rounded-lg border border-slate-300 px-2 py-1 text-xs"
                  >
                    <option value="">All pipelines</option>
                    {pipelineList.map((p) => (
                      <option key={p._id} value={p._id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                }
              >
                <BarList data={byStage} empty="No contacts on the board yet" />
              </Card>

              <Card title="Reachability" subtitle="How many contacts you can actually contact">
                <div className="viz space-y-5">
                  <Meter label="Have an email" value={metrics.withEmail} total={metrics.contacts} />
                  <Meter label="Have a phone number" value={metrics.withPhone} total={metrics.contacts} />
                  <Meter
                    label="In an automation"
                    value={metrics.activeAutomations}
                    total={metrics.contacts}
                    hint="Contacts currently moving through an email sequence."
                  />
                </div>
              </Card>
            </div>
          </Section>

          <Section title="Activity">
            <div className="grid gap-4 lg:grid-cols-2">
              <Card title="New contacts" subtitle="Last 30 days">
                <AreaTrend data={newContacts} empty="No contacts added in the last 30 days" />
              </Card>

              <Card title="Automation outcomes" subtitle="Last 14 days">
                <StackedColumns
                  data={automation}
                  series={[
                    { key: "sent", label: "Sent", color: "--viz-s1" },
                    { key: "completed", label: "Completed", color: "--viz-s2" },
                    { key: "failed", label: "Failed", color: "--viz-s3" },
                  ]}
                />
              </Card>
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

/** Chart card. The .viz class is what scopes the validated --viz-* tokens, so
 *  every chart must sit inside one. */
function Card({
  title,
  subtitle,
  action,
  className = "",
  children,
}: {
  title: string;
  subtitle?: string;
  /** Optional control in the header row, e.g. a filter for this chart only. */
  action?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`viz rounded-xl border border-slate-200 bg-white p-5 ${className}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">{title}</h3>
          {subtitle && <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>}
        </div>
        {action}
      </div>
      <div className="mt-4">{children}</div>
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

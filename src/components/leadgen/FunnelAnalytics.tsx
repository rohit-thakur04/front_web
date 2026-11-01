"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Panel, Table, THead, TH, TBody, TR, TD } from "@/components/kit";

interface StatLine {
  path?: string;
  name?: string;
  source?: string;
  views: number;
  submissions: number;
  conversionRate: number;
}

interface FunnelStats {
  days: number;
  views: number;
  submissions: number;
  conversionRate: number;
  pages: StatLine[];
  sources: StatLine[];
}

const RANGES = [7, 30, 90] as const;

const pct = (r: number) => `${(r * 100).toFixed(r > 0 && r < 0.1 ? 1 : 0)}%`;
const num = (n: number) => n.toLocaleString("en-IN");

/*
 * Views, form submissions and conversion for one funnel.
 *
 * Views are counted on the server as the page is served, so they need no script
 * on the page and are not blocked by ad blockers. A submission counts here when
 * the form was embedded on one of this funnel's pages — the page tells the form
 * which funnel it is on.
 */
export function FunnelAnalytics({ funnelId, published }: { funnelId: string; published: boolean }) {
  const [days, setDays] = useState<number>(30);
  const [stats, setStats] = useState<FunnelStats | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let live = true;
    async function run() {
      try {
        const s = await api<FunnelStats>(`/funnels/${funnelId}/stats?days=${days}`);
        if (live) {
          setStats(s);
          setError("");
        }
      } catch (e) {
        if (live) setError(e instanceof Error ? e.message : "Could not load analytics");
      }
    }
    run();
    return () => {
      live = false;
    };
  }, [funnelId, days]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-slate-500">Last</span>
        {RANGES.map((d) => (
          <button
            key={d}
            onClick={() => setDays(d)}
            aria-pressed={days === d}
            className={`rounded-lg border px-2.5 py-1 text-sm ${
              days === d ? "border-blue-500 bg-blue-50 font-medium" : "border-slate-300 hover:bg-slate-50"
            }`}
          >
            {d} days
          </button>
        ))}
      </div>

      {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
      {!published && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          This funnel isn&apos;t published, so nobody can visit it yet. Views start counting once it is.
        </p>
      )}

      {stats && (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            {(
              [
                ["Page views", num(stats.views)],
                ["Form submissions", num(stats.submissions)],
                ["Conversion rate", pct(stats.conversionRate)],
              ] as const
            ).map(([label, value]) => (
              <div key={label} className="rounded-xl border border-slate-200 bg-white p-4">
                <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
              </div>
            ))}
          </div>

          <Panel title="By page" flush>
            <Lines lines={stats.pages} label={(l) => `${l.name || "Home"} · /${l.path ?? ""}`} />
          </Panel>

          <Panel
            title="By source"
            description="From the utm_source on the link people arrived with. Links without one count as direct."
            flush
          >
            {stats.sources.length === 0 ? (
              <p className="px-4 py-6 text-sm text-slate-500">No visits in this period.</p>
            ) : (
              <Lines lines={stats.sources} label={(l) => l.source ?? ""} />
            )}
          </Panel>
        </>
      )}
    </div>
  );
}

function Lines({ lines, label }: { lines: StatLine[]; label: (l: StatLine) => string }) {
  return (
    <Table>
      <THead>
        <TH>Name</TH>
        <TH align="right">Views</TH>
        <TH align="right">Submissions</TH>
        <TH align="right">Conversion</TH>
      </THead>
      <TBody>
        {lines.map((l) => (
          <TR key={label(l)}>
            <TD>{label(l)}</TD>
            <TD align="right" numeric>{num(l.views)}</TD>
            <TD align="right" numeric>{num(l.submissions)}</TD>
            <TD align="right" numeric muted={l.views === 0}>
              {l.views === 0 ? "—" : pct(l.conversionRate)}
            </TD>
          </TR>
        ))}
      </TBody>
    </Table>
  );
}

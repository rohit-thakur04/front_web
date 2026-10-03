"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

interface CategoryCount {
  category: string;
  label: string;
  count: number;
  estimatePaise: number;
}

interface UsageReport {
  days: number;
  totalMessages: number;
  breakdown: CategoryCount[];
  estimatePaise: number;
}

/**
 * Paise to a rupee string. Whole rupees above Rs 10 — a client reconciling an
 * invoice does not need two decimal places on Rs 213.
 */
function rupees(paise: number): string {
  const r = paise / 100;
  if (r === 0) return "Rs 0";
  if (r < 10) return `Rs ${r.toFixed(2)}`;
  return `Rs ${Math.round(r).toLocaleString("en-IN")}`;
}

/*
MessageSpend shows what this tenant sent through Meta and what it likely cost.

Clients pay Meta directly, which means the only bill they see arrives from Meta
in dollars, itemised by nothing they recognise, weeks after the sends happened.
This is the counterpart they can check it against.

Framed as an estimate everywhere it appears, deliberately. The rates come from a
card we do not control and Meta converts currency at a rate we never see, so the
one failure that matters here is a client trusting this number over their real
invoice.
*/
export function MessageSpend() {
  const [report, setReport] = useState<UsageReport | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    api<UsageReport>("/usage/messages?days=30")
      .then(setReport)
      // Silent on failure: spend is context, not the job of this page. A red
      // banner over the template list because a secondary count failed costs
      // the client more than the missing number does.
      .catch(() => setFailed(true));
  }, []);

  if (failed || !report) return null;

  if (report.totalMessages === 0) {
    return (
      <div className="mb-3 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-500">
        No WhatsApp messages sent in the last 30 days — nothing billed by Meta.
      </div>
    );
  }

  return (
    <div className="mb-3 rounded-lg border border-slate-200 bg-white p-3">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <span className="text-sm font-semibold">WhatsApp spend</span>
          <span className="ml-2 text-xs text-slate-500">last 30 days</span>
        </div>
        <div className="text-right">
          <span className="text-lg font-semibold">{rupees(report.estimatePaise)}</span>
          <span className="ml-1.5 text-xs text-slate-500">
            est. · {report.totalMessages} message{report.totalMessages === 1 ? "" : "s"}
          </span>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {report.breakdown.map((row) => (
          <span
            key={row.category}
            className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-700"
          >
            {row.label}: {row.count}
            {/* An unpriced category still shows its count. Meta adds
                categories, and no cost there means "we have no rate for this",
                not "these were free". */}
            {row.estimatePaise > 0 ? ` · ${rupees(row.estimatePaise)}` : ""}
          </span>
        ))}
      </div>

      <p className="mt-2 text-xs text-slate-500">
        Estimated from Meta&apos;s Indian rates. Meta bills you directly — treat your invoice from
        them as the real figure.
      </p>
    </div>
  );
}

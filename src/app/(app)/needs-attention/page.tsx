"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { PageHeader } from "@/components/ui";
import { Icon } from "@/components/icons";

interface AttentionContact {
  cardId: string;
  name: string;
  phone: string;
  email: string;
  pipelineId: string;
  stageId: string;
  stageName: string;
  since: string;
  detail: string;
}

interface AttentionGroup {
  key: string;
  severity: "error" | "warning";
  title: string;
  why: string;
  total: number;
  contacts: AttentionContact[];
}

/*
The screen that answers "what do I do next".

Every other screen in the product answers "how are we doing" — counts, charts,
a board of columns. None of them distinguishes a lead that arrived on Tuesday
and was never opened from one that was called twice, because on a board they
look identical.

Each group here is a statement of fact about stored data, never advice. That
restraint is the whole value: a screen that cries wolf gets skimmed, and then
the one row that mattered gets skimmed with it.
*/
export default function NeedsAttentionPage() {
  const [groups, setGroups] = useState<AttentionGroup[] | null>(null);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState("");

  useEffect(() => {
    api<{ groups: AttentionGroup[]; total: number }>("/attention/contacts")
      .then((r) => {
        setGroups(r.groups ?? []);
        setTotal(r.total);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Could not load"));
  }, []);

  return (
    <div className="mx-auto max-w-[1100px] p-6">
      <PageHeader
        title="Needs Attention"
        subtitle={
          total > 0
            ? `${total} contact${total === 1 ? "" : "s"} waiting on someone`
            : "Contacts waiting on someone"
        }
      />

      {error && (
        <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}

      {groups === null && !error && <p className="text-sm text-slate-500">Loading…</p>}

      {/* The empty state is a result, not a gap. Somebody who has cleared their
          leads should be told so plainly rather than shown a blank page that
          reads as something having failed to load. */}
      {groups !== null && groups.length === 0 && (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center">
          <p className="text-sm font-medium">Nothing is waiting on you.</p>
          <p className="mt-1 text-sm text-slate-500">
            Every contact has been picked up, and no follow-up has failed in the last week.
          </p>
        </div>
      )}

      <div className="space-y-4">
        {groups?.map((group) => (
          <Group key={group.key} group={group} />
        ))}
      </div>
    </div>
  );
}

function Group({ group }: { group: AttentionGroup }) {
  const error = group.severity === "error";
  // Shown only when the cap hid some. A count that silently disagrees with the
  // number of rows is how a client decides the screen is broken.
  const hidden = group.total - group.contacts.length;

  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div
        className={`flex flex-wrap items-baseline gap-x-2 gap-y-1 border-b px-4 py-3 ${
          error ? "border-rose-100 bg-rose-50" : "border-amber-100 bg-amber-50"
        }`}
      >
        <h2 className={`text-sm font-semibold ${error ? "text-rose-900" : "text-amber-900"}`}>
          {group.title}
        </h2>
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-medium ${
            error ? "bg-rose-600 text-white" : "bg-amber-500 text-white"
          }`}
        >
          {group.total}
        </span>
        <p className={`w-full text-xs ${error ? "text-rose-800" : "text-amber-800"}`}>
          {group.why}
        </p>
      </div>

      <ul className="divide-y divide-slate-100">
        {group.contacts.map((c) => (
          <li key={c.cardId} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{c.name || "Unnamed contact"}</p>
              <p className="truncate text-xs text-slate-500">
                {c.stageName && <span>{c.stageName} · </span>}
                {c.detail}
              </p>
            </div>

            {/* A phone link is the whole point on a screen like this: the next
                action for almost every row is to ring them. Rendered only when
                there is a number, rather than as a dead control. */}
            {c.phone && (
              <a
                href={`tel:${c.phone}`}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-medium hover:bg-slate-50"
              >
                <Icon.Phone width={13} height={13} />
                Call
              </a>
            )}
            {c.email && (
              <a
                href={`mailto:${c.email}`}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-medium hover:bg-slate-50"
              >
                <Icon.Mail width={13} height={13} />
                Email
              </a>
            )}
          </li>
        ))}
      </ul>

      {hidden > 0 && (
        <p className="border-t border-slate-100 px-4 py-2 text-xs text-slate-500">
          {hidden} more not shown. Clear some of these first — the oldest are listed.
        </p>
      )}
    </section>
  );
}

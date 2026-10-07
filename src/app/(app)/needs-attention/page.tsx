"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { Icon } from "@/components/icons";
import { Badge, Button, EmptyState, PageTitle, Panel, Skeleton } from "@/components/kit";

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
Needs Attention — the screen the product opens on.

Built on the component kit as the first screen to adopt it, deliberately: it is
the one somebody sees first and most often, so it is where a design language
either holds up or does not.

Three things it does differently from the rest of the product, and all three are
structural rather than visual:

- It is a worklist, not a dashboard. Every row names a person, a reason and an
  elapsed time, and carries the action for it. Nothing here is a count that
  leads somewhere else.

- The action travels with the row. Calling is one tap from the row rather than
  three clicks through a board, because for almost every row here the next
  action is to ring them.

- Severity is carried by a badge with a dot and by order, never by colour
  alone. These rows are red and amber, which are the two colours a red-green
  colourblind reader cannot separate.
*/
export default function NeedsAttentionPage() {
  const [groups, setGroups] = useState<AttentionGroup[] | null>(null);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState("");

  useEffect(() => {
    async function run() {
      try {
        const r = await api<{ groups: AttentionGroup[]; total: number }>(
          "/attention/contacts",
        );
        setGroups(r.groups ?? []);
        setTotal(r.total);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not load this list");
      }
    }
    void run();
  }, []);

  return (
    <div className="mx-auto max-w-[920px] px-6 py-6">
      <PageTitle
        eyebrow="Today"
        title="Needs Attention"
        description={
          total > 0
            ? `${total} contact${total === 1 ? "" : "s"} waiting on someone. Oldest first.`
            : "Contacts waiting on a person rather than on an automation."
        }
        actions={
          <Button
            tone="ghost"
            size="sm"
            icon={<Icon.Board width={14} height={14} />}
            onClick={() => (window.location.href = "/board")}
          >
            Open board
          </Button>
        }
      />

      {error && (
        <Panel className="mb-4">
          <p className="text-sm text-[var(--ark-danger)]">{error}</p>
        </Panel>
      )}

      {/* A skeleton shaped like the rows that are coming, rather than the word
          "Loading" and then a jump. */}
      {groups === null && !error && (
        <div className="space-y-3">
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-2/3" />
        </div>
      )}

      {groups !== null && groups.length === 0 && (
        <Panel flush>
          <EmptyState
            icon={<Icon.Check width={18} height={18} />}
            title="Nothing is waiting on you."
            body="Every contact has been picked up, and no follow-up has failed in the last week. This list fills itself as enquiries arrive."
            action={
              <Link href="/contacts">
                <Button tone="neutral" size="sm">
                  See all contacts
                </Button>
              </Link>
            }
          />
        </Panel>
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
  const tone = group.severity === "error" ? "danger" : "warn";
  // Shown only when the cap hid some. A count that disagrees with the number of
  // rows is how somebody decides the screen is broken.
  const hidden = group.total - group.contacts.length;

  return (
    <Panel
      flush
      title={group.title}
      description={group.why}
      actions={<Badge tone={tone}>{group.total}</Badge>}
    >
      <ul className="divide-y divide-[var(--ark-line)]">
        {group.contacts.map((c) => (
          <li
            key={c.cardId}
            className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-2 transition-colors hover:bg-[var(--ark-surface-2)]"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-medium text-[var(--ark-ink)]">
                {c.name || "Unnamed contact"}
              </p>
              <p className="truncate text-xs text-[var(--ark-ink-3)]">
                {c.stageName && (
                  <span className="text-[var(--ark-ink-muted)]">{c.stageName} · </span>
                )}
                {c.detail}
              </p>
            </div>

            {/* Rendered only where there is something to act on. A dead control
                that looks live is worse than no control. */}
            {c.phone && (
              <a href={`tel:${c.phone}`} className="shrink-0">
                <Button
                  tone="primary"
                  size="sm"
                  icon={<Icon.Phone width={13} height={13} />}
                >
                  Call
                </Button>
              </a>
            )}
            {c.email && (
              <a href={`mailto:${c.email}`} className="shrink-0">
                <Button tone="neutral" size="sm" icon={<Icon.Mail width={13} height={13} />}>
                  Email
                </Button>
              </a>
            )}
          </li>
        ))}
      </ul>

      {hidden > 0 && (
        <p className="border-t border-[var(--ark-line)] px-4 py-2 text-xs text-[var(--ark-ink-3)]">
          {hidden} more not shown — clear some of these first. The oldest are listed.
        </p>
      )}
    </Panel>
  );
}

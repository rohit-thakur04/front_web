"use client";

import type { CardStageProgress } from "@/lib/types";

interface Props {
  progress?: CardStageProgress;
  templateCount: number;
  intervalHours: number;
}

// nextInLabel renders the wait until the next email as a human interval.
function nextInLabel(lastSentAt: string | null, intervalHours: number): string {
  if (!lastSentAt) return "sending now";

  const dueAt = new Date(lastSentAt).getTime() + intervalHours * 3600_000;
  const msLeft = dueAt - Date.now();
  if (msLeft <= 0) return "due now";

  const hours = msLeft / 3600_000;
  if (hours >= 1) return `next in ~${Math.round(hours)}h`;
  const minutes = Math.max(1, Math.round(msLeft / 60_000));
  return `next in ~${minutes}m`;
}

/**
 * Shows where a card sits in its stage's email sequence.
 *
 * A card with no progress record renders nothing rather than an empty badge —
 * the stage simply has no automation for it.
 */
export function AutomationBadge({ progress, templateCount, intervalHours }: Props) {
  if (!progress) return null;

  if (progress.status === "stopped") {
    return (
      <span className="inline-flex items-center gap-1 rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-600">
        ⏸ Stopped · day {progress.currentDay}
      </span>
    );
  }

  if (progress.status === "completed") {
    return (
      <span className="inline-flex items-center gap-1 rounded bg-emerald-50 px-1.5 py-0.5 text-[11px] font-medium text-emerald-700">
        ✓ Sequence complete
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 rounded bg-blue-50 px-1.5 py-0.5 text-[11px] font-medium text-blue-700">
      ✉ Day {progress.currentDay} of {templateCount} ·{" "}
      {nextInLabel(progress.lastEmailSentAt, intervalHours)}
    </span>
  );
}

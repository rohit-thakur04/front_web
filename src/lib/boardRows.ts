/**
 * Turning a board into flat contact rows.
 *
 * The board holds cards nested inside stages, but the filter and the export both
 * want a flat list carrying the names shown on screen. Doing that conversion in
 * one place is what keeps the board's filtered card count and the row count in
 * its exported file the same number.
 */

import type { BoardAutomation, BoardResponse, Card } from "./types";
import type { SortableContact } from "./contactFilters";

/** A board card with the fields the filter and the export need added. */
export interface BoardRow extends Card, SortableContact {
  pipelineName: string;
  stageName: string;
  hasAutomation: boolean;
}

/**
 * The cards with an email sequence currently running.
 *
 * The board's automation payload is a list of progress rows, and a card can have
 * one per stage it has passed through — only the active row counts as running.
 * Keyed by card id alone, because a card lives in exactly one stage at a time.
 */
export function runningCardIds(automation: BoardAutomation | null): Set<string> {
  const ids = new Set<string>();
  for (const p of automation?.progress ?? []) {
    if (p.status === "active") ids.add(p.cardId);
  }
  return ids;
}

/** Every card on the board as a flat row, in stage order then card order. */
export function boardRows(
  board: BoardResponse,
  automation: BoardAutomation | null,
): BoardRow[] {
  const running = runningCardIds(automation);
  const rows: BoardRow[] = [];
  for (const stage of board.stages) {
    for (const card of stage.cards ?? []) {
      rows.push({
        ...card,
        pipelineName: board.pipeline.name,
        stageName: stage.name,
        hasAutomation: running.has(card._id),
      });
    }
  }
  return rows;
}

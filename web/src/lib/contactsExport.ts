/**
 * The one contact export, called from the Contacts page and the CRM board.
 *
 * Two implementations would drift, and the way they drift is silent: a column
 * added on one page and not the other, so a file exported from the board no
 * longer re-imports. The change request asked for one service for exactly this
 * reason.
 *
 * The rows passed in are always the filtered, sorted rows on screen. Exporting
 * anything else is a trap — a client who has filtered to forty contacts and gets
 * four thousand has no way to tell which set the file holds.
 */

import { downloadCSV, toCSV } from "./csv";

/** A row as the export needs it: the names, not the ids. */
export interface ExportableContact {
  name: string;
  phone: string;
  email: string;
  value: number;
  pipelineName?: string;
  stageName?: string;
  createdAt: string;
}

/**
 * The column order, and the header spellings the importer recognises.
 *
 * Stage is included so an exported file can be edited and imported back —
 * a round trip is the most common reason anyone exports at all.
 */
const HEADERS = ["Name", "Phone", "Email", "Value", "Pipeline", "Stage", "Added"];

/** ISO date, not a locale string: a CSV is read by machines as often as by people. */
function isoDate(value: string): string {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
}

/**
 * Writes the rows to a CSV download and returns how many were written.
 *
 * `label` names the file — "contacts" from the Contacts page, the pipeline's own
 * name from the board — so a folder of exports is still legible a week later.
 */
export function exportContacts(rows: ExportableContact[], label = "contacts"): number {
  const csv = toCSV(
    HEADERS,
    rows.map((r) => [
      r.name,
      r.phone,
      r.email,
      // The raw number, not a formatted one: "₹50,000" re-imports as 50 without
      // the currency stripping that parseMoney has to do to rescue it.
      r.value,
      r.pipelineName ?? "",
      r.stageName ?? "",
      isoDate(r.createdAt),
    ]),
  );
  downloadCSV(`${slug(label)}-${new Date().toISOString().slice(0, 10)}.csv`, csv);
  return rows.length;
}

/** A filename-safe version of a pipeline name, which is free text. */
function slug(label: string): string {
  const cleaned = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return cleaned || "contacts";
}

/** The message shown after an export, so both pages word it identically. */
export function exportMessage(count: number, filtered: boolean): string {
  const noun = count === 1 ? "contact" : "contacts";
  const scope = filtered ? " matching your filters" : "";
  return `Exported ${count.toLocaleString()} ${noun}${scope} to CSV.`;
}

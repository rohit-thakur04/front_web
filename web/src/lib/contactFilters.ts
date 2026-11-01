/**
 * One filter and one sort, shared by the Contacts page and the CRM board.
 *
 * The two screens read the same records, so two implementations would drift —
 * "has email" meaning a non-empty string on one page and a valid address on the
 * other is the kind of difference nobody notices until an export is wrong. The
 * predicate lives here and both pages call it.
 *
 * It runs in the browser rather than in Mongo, which also means it has to agree
 * with itself and nothing else: the board already holds every card for the
 * selected pipeline, and /contacts already returns the tenant's whole list, so
 * filtering locally is instant and the counts shown can never lag the rows.
 */

/** The fields a filter needs. Both Contact and Card satisfy this. */
export interface FilterableContact {
  name: string;
  phone: string;
  email: string;
  value: number;
  pipelineId: string;
  stageId: string;
  createdAt: string;
  /** Whether an email sequence is currently running for this contact. */
  hasAutomation?: boolean;
}

/** A yes/no/either filter. "" means the filter is off. */
export type Tri = "" | "yes" | "no";

export interface ContactFilter {
  search: string;
  pipelineId: string;
  stageId: string;
  hasEmail: Tri;
  hasPhone: Tri;
  /**
   * Value and date bounds are kept as the raw strings the inputs hold. A number
   * cannot represent "the box is empty", and 0 is a legitimate minimum value.
   */
  minValue: string;
  maxValue: string;
  addedFrom: string; // yyyy-mm-dd
  addedTo: string; // yyyy-mm-dd
  automation: Tri;
}

export const EMPTY_FILTER: ContactFilter = {
  search: "",
  pipelineId: "",
  stageId: "",
  hasEmail: "",
  hasPhone: "",
  minValue: "",
  maxValue: "",
  addedFrom: "",
  addedTo: "",
  automation: "",
};

/** True when a tri-state filter rejects the value it was given. */
function triRejects(rule: Tri, present: boolean): boolean {
  if (rule === "yes") return !present;
  if (rule === "no") return present;
  return false;
}

/**
 * The end of the given local day, in epoch milliseconds.
 *
 * An inclusive "to" date is what a person means by it: picking 5 March and
 * seeing nothing added on 5 March reads as a broken filter. Comparing against
 * midnight would do exactly that.
 */
function endOfDay(yyyymmdd: string): number {
  const d = new Date(`${yyyymmdd}T00:00:00`);
  d.setHours(23, 59, 59, 999);
  return d.getTime();
}

function startOfDay(yyyymmdd: string): number {
  return new Date(`${yyyymmdd}T00:00:00`).getTime();
}

/** Whether one contact survives the filter. */
export function matchesFilter(row: FilterableContact, f: ContactFilter): boolean {
  const term = f.search.trim().toLowerCase();
  if (term) {
    const haystack = `${row.name} ${row.phone} ${row.email}`.toLowerCase();
    if (!haystack.includes(term)) return false;
  }

  if (f.pipelineId && row.pipelineId !== f.pipelineId) return false;
  if (f.stageId && row.stageId !== f.stageId) return false;

  if (triRejects(f.hasEmail, row.email.trim() !== "")) return false;
  if (triRejects(f.hasPhone, row.phone.trim() !== "")) return false;
  if (triRejects(f.automation, row.hasAutomation === true)) return false;

  // Number("") is 0, which would silently turn an empty box into "at least 0".
  if (f.minValue !== "" && row.value < Number(f.minValue)) return false;
  if (f.maxValue !== "" && row.value > Number(f.maxValue)) return false;

  if (f.addedFrom || f.addedTo) {
    const added = new Date(row.createdAt).getTime();
    if (f.addedFrom && added < startOfDay(f.addedFrom)) return false;
    if (f.addedTo && added > endOfDay(f.addedTo)) return false;
  }

  return true;
}

/** How many filters are switched on. Search is counted separately by callers. */
export function activeFilterCount(f: ContactFilter): number {
  let n = 0;
  if (f.pipelineId) n++;
  if (f.stageId) n++;
  if (f.hasEmail) n++;
  if (f.hasPhone) n++;
  if (f.automation) n++;
  if (f.minValue !== "" || f.maxValue !== "") n++;
  if (f.addedFrom || f.addedTo) n++;
  return n;
}

/** One removable chip above the table. `clear` is the patch that removes it. */
export interface FilterChip {
  key: string;
  label: string;
  clear: Partial<ContactFilter>;
}

/**
 * The active filters as chips.
 *
 * Chips exist so a filter can never be on invisibly. A dropdown that has been
 * collapsed looks exactly like one that was never opened, and the usual result
 * is someone concluding their contacts are gone.
 */
export function filterChips(
  f: ContactFilter,
  names: { pipelines?: Record<string, string>; stages?: Record<string, string> } = {},
): FilterChip[] {
  const chips: FilterChip[] = [];
  const yesNo = (t: Tri, yes: string, no: string) => (t === "yes" ? yes : no);

  if (f.pipelineId) {
    chips.push({
      key: "pipelineId",
      // Falls back to the id so a chip is never blank while names are loading.
      label: `Pipeline: ${names.pipelines?.[f.pipelineId] ?? "selected"}`,
      // Clearing the pipeline clears the stage too: a stage belongs to one
      // pipeline, so the pair left behind would match nothing.
      clear: { pipelineId: "", stageId: "" },
    });
  }
  if (f.stageId) {
    chips.push({
      key: "stageId",
      label: `Stage: ${names.stages?.[f.stageId] ?? "selected"}`,
      clear: { stageId: "" },
    });
  }
  if (f.hasEmail) {
    chips.push({
      key: "hasEmail",
      label: yesNo(f.hasEmail, "Has email", "No email"),
      clear: { hasEmail: "" },
    });
  }
  if (f.hasPhone) {
    chips.push({
      key: "hasPhone",
      label: yesNo(f.hasPhone, "Has phone", "No phone"),
      clear: { hasPhone: "" },
    });
  }
  if (f.automation) {
    chips.push({
      key: "automation",
      label: yesNo(f.automation, "Automation running", "No automation"),
      clear: { automation: "" },
    });
  }
  if (f.minValue !== "" || f.maxValue !== "") {
    const lo = f.minValue === "" ? "" : `₹${Number(f.minValue).toLocaleString("en-IN")}`;
    const hi = f.maxValue === "" ? "" : `₹${Number(f.maxValue).toLocaleString("en-IN")}`;
    chips.push({
      key: "value",
      label: lo && hi ? `Value ${lo}–${hi}` : lo ? `Value from ${lo}` : `Value up to ${hi}`,
      clear: { minValue: "", maxValue: "" },
    });
  }
  if (f.addedFrom || f.addedTo) {
    chips.push({
      key: "added",
      label:
        f.addedFrom && f.addedTo
          ? `Added ${f.addedFrom} to ${f.addedTo}`
          : f.addedFrom
            ? `Added from ${f.addedFrom}`
            : `Added up to ${f.addedTo}`,
      clear: { addedFrom: "", addedTo: "" },
    });
  }
  return chips;
}

// --- Sorting --------------------------------------------------------------

export type SortKey = "name" | "value" | "pipeline" | "stage" | "added";
export type SortDir = "asc" | "desc";

export interface Sort {
  key: SortKey;
  dir: SortDir;
}

/** The default: newest first, which is what a lead list is usually read as. */
export const DEFAULT_SORT: Sort = { key: "added", dir: "desc" };

/**
 * Which direction a column starts in when first clicked.
 *
 * A name ascending and a date descending are both "the useful way round", and
 * making every column start ascending means the first click on Added shows the
 * oldest contacts — never what was wanted.
 */
const FIRST_DIR: Record<SortKey, SortDir> = {
  name: "asc",
  value: "desc",
  pipeline: "asc",
  stage: "asc",
  added: "desc",
};

/** The sort produced by clicking a column header, given the current sort. */
export function toggleSort(current: Sort, key: SortKey): Sort {
  if (current.key !== key) return { key, dir: FIRST_DIR[key] };
  return { key, dir: current.dir === "asc" ? "desc" : "asc" };
}

/** A row as the table sees it: ids resolved to the names on screen. */
export interface SortableContact extends FilterableContact {
  pipelineName?: string;
  stageName?: string;
}

/**
 * Sorted copy of the rows. Never sorts in place — the caller's array is usually
 * the fetched list, and mutating it makes the next filter pass order-dependent.
 */
export function sortContacts<T extends SortableContact>(rows: T[], sort: Sort): T[] {
  const sign = sort.dir === "asc" ? 1 : -1;
  // localeCompare so "Ärzt" and "Zoe" order the way a reader expects, and
  // numeric so "Client 2" comes before "Client 10".
  const text = (a: string, b: string) =>
    a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });

  return [...rows].sort((a, b) => {
    switch (sort.key) {
      case "name":
        return sign * text(a.name, b.name);
      case "value":
        return sign * (a.value - b.value);
      case "pipeline":
        return sign * text(a.pipelineName ?? "", b.pipelineName ?? "");
      case "stage":
        return sign * text(a.stageName ?? "", b.stageName ?? "");
      case "added":
        return (
          sign * (new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
        );
    }
  });
}

// --- Summary --------------------------------------------------------------

export interface ContactTotals {
  totalContacts: number;
  totalValue: number;
  withEmail: number;
  withPhone: number;
  activeAutomations: number;
}

/**
 * Totals for a set of rows.
 *
 * Computed from the filtered rows on the client, for the same reason the server
 * used to compute them from the filtered query: a tile that disagrees with the
 * table under it is worse than no tile.
 */
export function summarize(rows: FilterableContact[]): ContactTotals {
  const totals: ContactTotals = {
    totalContacts: rows.length,
    totalValue: 0,
    withEmail: 0,
    withPhone: 0,
    activeAutomations: 0,
  };
  for (const r of rows) {
    totals.totalValue += r.value;
    if (r.email.trim() !== "") totals.withEmail++;
    if (r.phone.trim() !== "") totals.withPhone++;
    if (r.hasAutomation) totals.activeAutomations++;
  }
  return totals;
}

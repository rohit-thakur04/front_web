import { describe, expect, it } from "vitest";
import {
  DEFAULT_SORT,
  EMPTY_FILTER,
  type ContactFilter,
  type SortableContact,
  activeFilterCount,
  filterChips,
  matchesFilter,
  sortContacts,
  summarize,
  toggleSort,
} from "./contactFilters";

function row(over: Partial<SortableContact> = {}): SortableContact {
  return {
    name: "Asha Patel",
    phone: "+91 98765 43210",
    email: "asha@example.com",
    value: 5000,
    pipelineId: "p1",
    stageId: "s1",
    createdAt: "2026-03-05T10:00:00Z",
    hasAutomation: false,
    ...over,
  };
}

function filter(over: Partial<ContactFilter> = {}): ContactFilter {
  return { ...EMPTY_FILTER, ...over };
}

describe("matchesFilter", () => {
  it("passes everything when no filter is set", () => {
    expect(matchesFilter(row(), EMPTY_FILTER)).toBe(true);
    expect(matchesFilter(row({ email: "", phone: "", value: 0 }), EMPTY_FILTER)).toBe(true);
  });

  describe("search", () => {
    it("matches name, phone and email", () => {
      expect(matchesFilter(row(), filter({ search: "asha" }))).toBe(true);
      expect(matchesFilter(row(), filter({ search: "98765" }))).toBe(true);
      expect(matchesFilter(row(), filter({ search: "example.com" }))).toBe(true);
    });
    it("is case-insensitive and ignores surrounding space", () => {
      expect(matchesFilter(row(), filter({ search: "  ASHA " }))).toBe(true);
    });
    it("rejects a term that appears nowhere", () => {
      expect(matchesFilter(row(), filter({ search: "zzz" }))).toBe(false);
    });
  });

  describe("pipeline and stage", () => {
    it("matches on id, not name", () => {
      expect(matchesFilter(row(), filter({ pipelineId: "p1" }))).toBe(true);
      expect(matchesFilter(row(), filter({ pipelineId: "p2" }))).toBe(false);
      expect(matchesFilter(row(), filter({ stageId: "s1" }))).toBe(true);
      expect(matchesFilter(row(), filter({ stageId: "s9" }))).toBe(false);
    });
  });

  describe("has email / has phone", () => {
    it("treats a whitespace-only value as absent", () => {
      // Otherwise a CSV import of empty cells reads as "has email".
      expect(matchesFilter(row({ email: "   " }), filter({ hasEmail: "yes" }))).toBe(false);
      expect(matchesFilter(row({ email: "   " }), filter({ hasEmail: "no" }))).toBe(true);
    });
    it("filters both ways", () => {
      expect(matchesFilter(row(), filter({ hasEmail: "yes" }))).toBe(true);
      expect(matchesFilter(row(), filter({ hasEmail: "no" }))).toBe(false);
      expect(matchesFilter(row({ phone: "" }), filter({ hasPhone: "no" }))).toBe(true);
    });
  });

  describe("automation", () => {
    it("treats an absent flag as no automation", () => {
      const r = row();
      delete r.hasAutomation;
      expect(matchesFilter(r, filter({ automation: "no" }))).toBe(true);
      expect(matchesFilter(r, filter({ automation: "yes" }))).toBe(false);
    });
    it("matches a running sequence", () => {
      expect(matchesFilter(row({ hasAutomation: true }), filter({ automation: "yes" }))).toBe(true);
    });
  });

  describe("value range", () => {
    it("is inclusive at both ends", () => {
      expect(matchesFilter(row({ value: 100 }), filter({ minValue: "100" }))).toBe(true);
      expect(matchesFilter(row({ value: 100 }), filter({ maxValue: "100" }))).toBe(true);
    });
    it("rejects outside the range", () => {
      expect(matchesFilter(row({ value: 99 }), filter({ minValue: "100" }))).toBe(false);
      expect(matchesFilter(row({ value: 101 }), filter({ maxValue: "100" }))).toBe(false);
    });
    it("does not treat an empty box as zero", () => {
      // Number("") is 0, so a careless check turns a blank minimum into
      // "at least 0" — which silently drops nothing but reads as a live filter.
      const zero = row({ value: 0 });
      expect(matchesFilter(zero, filter({ minValue: "" }))).toBe(true);
      expect(matchesFilter(zero, filter({ maxValue: "" }))).toBe(true);
    });
    it("allows a genuine zero minimum", () => {
      expect(matchesFilter(row({ value: 0 }), filter({ minValue: "0" }))).toBe(true);
      expect(matchesFilter(row({ value: -1 }), filter({ minValue: "0" }))).toBe(false);
    });
  });

  describe("date added range", () => {
    const march5 = row({ createdAt: "2026-03-05T14:30:00" });

    it("includes a contact added on the `to` date", () => {
      // The whole day, not midnight: picking 5 March and seeing nothing added
      // that afternoon reads as a broken filter.
      expect(matchesFilter(march5, filter({ addedTo: "2026-03-05" }))).toBe(true);
    });
    it("includes a contact added on the `from` date", () => {
      expect(matchesFilter(march5, filter({ addedFrom: "2026-03-05" }))).toBe(true);
    });
    it("excludes either side of the range", () => {
      expect(matchesFilter(march5, filter({ addedFrom: "2026-03-06" }))).toBe(false);
      expect(matchesFilter(march5, filter({ addedTo: "2026-03-04" }))).toBe(false);
    });
    it("handles both bounds together", () => {
      expect(
        matchesFilter(march5, filter({ addedFrom: "2026-03-01", addedTo: "2026-03-31" })),
      ).toBe(true);
    });
  });

  it("requires every active filter to pass", () => {
    const f = filter({ hasEmail: "yes", minValue: "10000" });
    expect(matchesFilter(row({ value: 5000 }), f)).toBe(false);
    expect(matchesFilter(row({ value: 20000 }), f)).toBe(true);
  });
});

describe("activeFilterCount", () => {
  it("is zero for an empty filter", () => {
    expect(activeFilterCount(EMPTY_FILTER)).toBe(0);
  });
  it("does not count search, which has its own box", () => {
    expect(activeFilterCount(filter({ search: "asha" }))).toBe(0);
  });
  it("counts a range once, however many ends are set", () => {
    expect(activeFilterCount(filter({ minValue: "1" }))).toBe(1);
    expect(activeFilterCount(filter({ minValue: "1", maxValue: "2" }))).toBe(1);
    expect(activeFilterCount(filter({ addedFrom: "2026-01-01", addedTo: "2026-02-01" }))).toBe(1);
  });
  it("adds up independent filters", () => {
    expect(
      activeFilterCount(filter({ pipelineId: "p1", stageId: "s1", hasEmail: "yes" })),
    ).toBe(3);
  });
});

describe("filterChips", () => {
  it("produces nothing when no filter is set", () => {
    expect(filterChips(EMPTY_FILTER)).toEqual([]);
  });

  it("names the pipeline and stage", () => {
    const chips = filterChips(filter({ pipelineId: "p1", stageId: "s1" }), {
      pipelines: { p1: "Enterprise" },
      stages: { s1: "Qualified" },
    });
    expect(chips.map((c) => c.label)).toEqual(["Pipeline: Enterprise", "Stage: Qualified"]);
  });

  it("stays readable when names have not loaded yet", () => {
    const [chip] = filterChips(filter({ pipelineId: "p1" }));
    expect(chip.label).toBe("Pipeline: selected");
  });

  it("clears the stage along with the pipeline", () => {
    // A stage belongs to one pipeline, so the leftover pair matches nothing.
    const [chip] = filterChips(filter({ pipelineId: "p1", stageId: "s1" }));
    expect(chip.clear).toEqual({ pipelineId: "", stageId: "" });
  });

  it("distinguishes yes from no", () => {
    expect(filterChips(filter({ hasEmail: "yes" }))[0].label).toBe("Has email");
    expect(filterChips(filter({ hasEmail: "no" }))[0].label).toBe("No email");
    expect(filterChips(filter({ automation: "no" }))[0].label).toBe("No automation");
  });

  it("describes one-sided and two-sided value ranges", () => {
    expect(filterChips(filter({ minValue: "1000" }))[0].label).toBe("Value from ₹1,000");
    expect(filterChips(filter({ maxValue: "1000" }))[0].label).toBe("Value up to ₹1,000");
    expect(filterChips(filter({ minValue: "1000", maxValue: "5000" }))[0].label).toBe(
      "Value ₹1,000–₹5,000",
    );
  });

  it("gives every chip a patch that switches its filter off", () => {
    const f = filter({
      pipelineId: "p1",
      hasEmail: "yes",
      minValue: "5",
      addedFrom: "2026-01-01",
      automation: "no",
    });
    const cleared = filterChips(f).reduce((acc, c) => ({ ...acc, ...c.clear }), f);
    expect(activeFilterCount(cleared)).toBe(0);
  });
});

describe("toggleSort", () => {
  it("starts a name sort ascending and a date sort descending", () => {
    // The first click has to land on the useful order, or every sort takes two.
    expect(toggleSort(DEFAULT_SORT, "name")).toEqual({ key: "name", dir: "asc" });
    expect(toggleSort({ key: "name", dir: "asc" }, "added")).toEqual({
      key: "added",
      dir: "desc",
    });
    expect(toggleSort({ key: "name", dir: "asc" }, "value")).toEqual({
      key: "value",
      dir: "desc",
    });
  });

  it("flips direction when the same column is clicked again", () => {
    expect(toggleSort({ key: "name", dir: "asc" }, "name")).toEqual({
      key: "name",
      dir: "desc",
    });
    expect(toggleSort({ key: "name", dir: "desc" }, "name")).toEqual({
      key: "name",
      dir: "asc",
    });
  });
});

describe("sortContacts", () => {
  const rows = [
    row({ name: "Client 10", value: 300, createdAt: "2026-01-03T00:00:00Z", pipelineName: "B", stageName: "Z" }),
    row({ name: "Client 2", value: 100, createdAt: "2026-01-01T00:00:00Z", pipelineName: "A", stageName: "Y" }),
    row({ name: "asha", value: 200, createdAt: "2026-01-02T00:00:00Z", pipelineName: "C", stageName: "X" }),
  ];

  it("does not mutate the input", () => {
    const before = rows.map((r) => r.name);
    sortContacts(rows, { key: "name", dir: "asc" });
    expect(rows.map((r) => r.name)).toEqual(before);
  });

  it("sorts names naturally, so 2 comes before 10", () => {
    const names = sortContacts(rows, { key: "name", dir: "asc" }).map((r) => r.name);
    expect(names.indexOf("Client 2")).toBeLessThan(names.indexOf("Client 10"));
  });

  it("ignores case when ordering names", () => {
    const names = sortContacts(rows, { key: "name", dir: "asc" }).map((r) => r.name);
    expect(names[0]).toBe("asha");
  });

  it("sorts by value in both directions", () => {
    expect(sortContacts(rows, { key: "value", dir: "asc" }).map((r) => r.value)).toEqual([100, 200, 300]);
    expect(sortContacts(rows, { key: "value", dir: "desc" }).map((r) => r.value)).toEqual([300, 200, 100]);
  });

  it("sorts by date added", () => {
    expect(
      sortContacts(rows, { key: "added", dir: "desc" }).map((r) => r.createdAt.slice(0, 10)),
    ).toEqual(["2026-01-03", "2026-01-02", "2026-01-01"]);
  });

  it("sorts by the pipeline and stage names on screen, not their ids", () => {
    expect(sortContacts(rows, { key: "pipeline", dir: "asc" }).map((r) => r.pipelineName)).toEqual(["A", "B", "C"]);
    expect(sortContacts(rows, { key: "stage", dir: "asc" }).map((r) => r.stageName)).toEqual(["X", "Y", "Z"]);
  });

  it("tolerates rows with no pipeline or stage name", () => {
    const mixed = [row({ pipelineName: "A" }), row({ pipelineName: undefined })];
    expect(() => sortContacts(mixed, { key: "pipeline", dir: "asc" })).not.toThrow();
  });
});

describe("summarize", () => {
  it("counts an empty list as all zeroes", () => {
    expect(summarize([])).toEqual({
      totalContacts: 0,
      totalValue: 0,
      withEmail: 0,
      withPhone: 0,
      activeAutomations: 0,
    });
  });

  it("totals the rows it is given", () => {
    const totals = summarize([
      row({ value: 1000, hasAutomation: true }),
      row({ value: 500, email: "", phone: "" }),
    ]);
    expect(totals).toEqual({
      totalContacts: 2,
      totalValue: 1500,
      withEmail: 1,
      withPhone: 1,
      activeAutomations: 1,
    });
  });

  it("does not count a whitespace-only email", () => {
    expect(summarize([row({ email: "  " })]).withEmail).toBe(0);
  });
});

import { describe, expect, it } from "vitest";
import type { WorkflowStep } from "./types";
import {
  ROOT,
  addToContainer,
  containerId,
  findStep,
  insertIntoContainer,
  removeStep,
  updateStep,
} from "./workflowTree";

function step(id: string, over: Partial<WorkflowStep> = {}): WorkflowStep {
  return {
    id,
    kind: "action",
    type: "send_email",
    label: `Step ${id}`,
    config: {},
    ...over,
  };
}

function condition(id: string, yes: WorkflowStep[] = [], no: WorkflowStep[] = []): WorkflowStep {
  return { ...step(id, { kind: "condition", type: "if_else" }), yes, no };
}

const ids = (steps: WorkflowStep[]) => steps.map((s) => s.id);

describe("insertIntoContainer at the root", () => {
  const base = [step("a"), step("b"), step("c")];

  it("appends when no index is given", () => {
    expect(ids(insertIntoContainer(base, ROOT, step("new")))).toEqual(["a", "b", "c", "new"]);
  });

  it("inserts at the front", () => {
    expect(ids(insertIntoContainer(base, ROOT, step("new"), 0))).toEqual(["new", "a", "b", "c"]);
  });

  it("inserts between two steps", () => {
    // The point of the whole change: adding a step mid-sequence used to mean
    // deleting everything after it and rebuilding the tail.
    expect(ids(insertIntoContainer(base, ROOT, step("new"), 1))).toEqual(["a", "new", "b", "c"]);
    expect(ids(insertIntoContainer(base, ROOT, step("new"), 2))).toEqual(["a", "b", "new", "c"]);
  });

  it("inserts at the end when the index is the length", () => {
    expect(ids(insertIntoContainer(base, ROOT, step("new"), 3))).toEqual(["a", "b", "c", "new"]);
  });

  it("clamps an index past the end rather than dropping the step", () => {
    // A stale index from a list that changed under the click must not lose it.
    expect(ids(insertIntoContainer(base, ROOT, step("new"), 99))).toEqual(["a", "b", "c", "new"]);
  });

  it("clamps a negative index to the front", () => {
    expect(ids(insertIntoContainer(base, ROOT, step("new"), -5))).toEqual(["new", "a", "b", "c"]);
  });

  it("works on an empty list", () => {
    expect(ids(insertIntoContainer([], ROOT, step("new"), 0))).toEqual(["new"]);
    expect(ids(insertIntoContainer([], ROOT, step("new")))).toEqual(["new"]);
  });

  it("does not mutate the original", () => {
    const original = [step("a"), step("b")];
    insertIntoContainer(original, ROOT, step("new"), 1);
    expect(ids(original)).toEqual(["a", "b"]);
  });
});

describe("insertIntoContainer inside a condition branch", () => {
  const tree = [step("a"), condition("cond", [step("y1"), step("y2")], [step("n1")]), step("z")];

  it("inserts mid-branch on the Yes path", () => {
    const out = insertIntoContainer(tree, containerId("cond", "yes"), step("new"), 1);
    const cond = out.find((s) => s.id === "cond")!;
    expect(ids(cond.yes ?? [])).toEqual(["y1", "new", "y2"]);
    // The other branch and the surrounding steps are untouched.
    expect(ids(cond.no ?? [])).toEqual(["n1"]);
    expect(ids(out)).toEqual(["a", "cond", "z"]);
  });

  it("inserts on the No path without touching Yes", () => {
    const out = insertIntoContainer(tree, containerId("cond", "no"), step("new"), 0);
    const cond = out.find((s) => s.id === "cond")!;
    expect(ids(cond.no ?? [])).toEqual(["new", "n1"]);
    expect(ids(cond.yes ?? [])).toEqual(["y1", "y2"]);
  });

  it("reaches a branch nested inside another branch", () => {
    const nested = [condition("outer", [condition("inner", [step("deep")], [])], [])];
    const out = insertIntoContainer(nested, containerId("inner", "yes"), step("new"), 0);
    const inner = out[0].yes![0];
    expect(ids(inner.yes ?? [])).toEqual(["new", "deep"]);
  });

  it("appends to an empty branch", () => {
    const out = insertIntoContainer([condition("cond")], containerId("cond", "yes"), step("new"));
    expect(ids(out[0].yes ?? [])).toEqual(["new"]);
  });

  it("leaves the tree alone when the container does not exist", () => {
    const out = insertIntoContainer(tree, containerId("missing", "yes"), step("new"), 0);
    expect(ids(out)).toEqual(["a", "cond", "z"]);
    const cond = out.find((s) => s.id === "cond")!;
    expect(ids(cond.yes ?? [])).toEqual(["y1", "y2"]);
  });
});

describe("addToContainer still appends", () => {
  it("behaves as it always did at the root", () => {
    expect(ids(addToContainer([step("a")], ROOT, step("new")))).toEqual(["a", "new"]);
  });

  it("behaves as it always did in a branch", () => {
    const out = addToContainer([condition("cond", [step("y1")])], containerId("cond", "yes"), step("new"));
    expect(ids(out[0].yes ?? [])).toEqual(["y1", "new"]);
  });
});

describe("removeStep", () => {
  it("removes from the root", () => {
    expect(ids(removeStep([step("a"), step("b")], "a"))).toEqual(["b"]);
  });

  it("removes from inside a branch", () => {
    const out = removeStep([condition("cond", [step("y1"), step("y2")])], "y1");
    expect(ids(out[0].yes ?? [])).toEqual(["y2"]);
  });
});

describe("updateStep", () => {
  it("patches a step in a branch without disturbing its siblings", () => {
    const out = updateStep(
      [condition("cond", [step("y1"), step("y2")])],
      "y2",
      { label: "Renamed" },
    );
    expect(out[0].yes![1].label).toBe("Renamed");
    expect(out[0].yes![0].label).toBe("Step y1");
  });
});

describe("findStep", () => {
  it("finds a step at any depth", () => {
    const tree = [condition("outer", [condition("inner", [step("deep")])])];
    expect(findStep(tree, "deep")?.id).toBe("deep");
    expect(findStep(tree, "nope")).toBeNull();
  });
});

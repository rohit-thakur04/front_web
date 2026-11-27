import { describe, expect, it } from "vitest";
import { designOf } from "./workflowDesign";
import type { Workflow } from "./types";

const base: Workflow = {
  _id: "w1",
  ownerId: "o1",
  name: "Welcome",
  status: "published",
  trigger: "contact_created",
  triggerConfig: {},
  steps: [{ id: "s1", kind: "action", type: "add_tag", label: "Add Tag", config: { tag: "new" } }],
  createdAt: "",
  updatedAt: "",
};

// Spec defect 1: opening and closing a step without editing must leave the
// workflow clean, so "Save and republish" is never offered for nothing.
describe("designOf", () => {
  it("does not change when nothing was edited", () => {
    const reselected = { ...base, steps: base.steps.map((s) => ({ ...s, config: { ...s.config } })) };
    expect(designOf(reselected)).toBe(designOf(base));
  });

  it("ignores key order and missing defaults", () => {
    const reordered = { ...base, steps: [{ ...base.steps[0], config: { tag: "new" } }], settings: undefined };
    const withDefaults = { ...base, settings: { timeZone: "", allowReentry: false, reentryWaitHours: 0 }, exitGoals: [] };
    expect(designOf(reordered)).toBe(designOf(withDefaults));
  });

  it("changes on a real edit, and back when it is undone", () => {
    const edited = { ...base, steps: [{ ...base.steps[0], config: { tag: "hot" } }] };
    expect(designOf(edited)).not.toBe(designOf(base));
    const undone = { ...edited, steps: [{ ...edited.steps[0], config: { tag: "new" } }] };
    expect(designOf(undone)).toBe(designOf(base));
  });
});

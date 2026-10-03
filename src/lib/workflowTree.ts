import type { WorkflowStep } from "./types";

// A "container" is where steps live: the root list, or one branch of a condition.
// Non-root containers are identified as "<conditionStepId>:yes" | ":no".
export const ROOT = "root";

export function containerId(condStepId: string, branch: "yes" | "no"): string {
  return `${condStepId}:${branch}`;
}

/**
 * insertIntoContainer places a step in the given container, anywhere in the tree.
 *
 * `index` is the position it should end up at; omitting it appends. Inserting in
 * the middle is what the "+" on each connector needs: building a sequence used to
 * mean appending only, so adding a step between two existing ones meant deleting
 * everything after it and rebuilding the tail.
 *
 * The index is clamped rather than trusted. It comes from a rendered list, and a
 * stale one — a step deleted in another tab, a re-render mid-click — would
 * otherwise splice at a position that no longer exists and silently drop the
 * step on the floor.
 */
export function insertIntoContainer(
  steps: WorkflowStep[],
  container: string,
  step: WorkflowStep,
  index?: number,
): WorkflowStep[] {
  const place = (arr: WorkflowStep[]): WorkflowStep[] => {
    const at = index === undefined ? arr.length : Math.max(0, Math.min(index, arr.length));
    return [...arr.slice(0, at), step, ...arr.slice(at)];
  };

  if (container === ROOT) return place(steps);

  const [condId, branch] = container.split(":") as [string, "yes" | "no"];
  return steps.map((s) => {
    if (s.id === condId) {
      return { ...s, [branch]: place((branch === "yes" ? s.yes : s.no) ?? []) };
    }
    if (s.kind === "condition") {
      return {
        ...s,
        yes: insertIntoContainer(s.yes ?? [], container, step, index),
        no: insertIntoContainer(s.no ?? [], container, step, index),
      };
    }
    return s;
  });
}

/** Appends to a container. Kept as the name the append-only callers already use. */
export function addToContainer(
  steps: WorkflowStep[],
  container: string,
  step: WorkflowStep,
): WorkflowStep[] {
  return insertIntoContainer(steps, container, step);
}

export function removeStep(steps: WorkflowStep[], id: string): WorkflowStep[] {
  return steps
    .filter((s) => s.id !== id)
    .map((s) =>
      s.kind === "condition"
        ? { ...s, yes: removeStep(s.yes ?? [], id), no: removeStep(s.no ?? [], id) }
        : s,
    );
}

export function updateStep(
  steps: WorkflowStep[],
  id: string,
  patch: Partial<WorkflowStep>,
): WorkflowStep[] {
  return steps.map((s) => {
    if (s.id === id) return { ...s, ...patch };
    if (s.kind === "condition") {
      return {
        ...s,
        yes: updateStep(s.yes ?? [], id, patch),
        no: updateStep(s.no ?? [], id, patch),
      };
    }
    return s;
  });
}

export function findStep(steps: WorkflowStep[], id: string): WorkflowStep | null {
  for (const s of steps) {
    if (s.id === id) return s;
    if (s.kind === "condition") {
      const found = findStep(s.yes ?? [], id) ?? findStep(s.no ?? [], id);
      if (found) return found;
    }
  }
  return null;
}

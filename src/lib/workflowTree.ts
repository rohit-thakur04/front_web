import type { WorkflowStep } from "./types";

// A "container" is where steps live: the root list, or one branch of a condition.
// Non-root containers are identified as "<conditionStepId>:yes" | ":no".
export const ROOT = "root";

export function containerId(condStepId: string, branch: "yes" | "no"): string {
  return `${condStepId}:${branch}`;
}

// addToContainer appends a step to the given container, anywhere in the tree.
export function addToContainer(
  steps: WorkflowStep[],
  container: string,
  step: WorkflowStep,
): WorkflowStep[] {
  if (container === ROOT) return [...steps, step];
  const [condId, branch] = container.split(":") as [string, "yes" | "no"];
  return steps.map((s) => {
    if (s.id === condId) {
      const arr = (branch === "yes" ? s.yes : s.no) ?? [];
      return { ...s, [branch]: [...arr, step] };
    }
    if (s.kind === "condition") {
      return {
        ...s,
        yes: addToContainer(s.yes ?? [], container, step),
        no: addToContainer(s.no ?? [], container, step),
      };
    }
    return s;
  });
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

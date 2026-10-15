import type { WorkflowStep } from "./types";

/*
Workflow recipes.

The hardest part of any workflow builder is the empty canvas. Somebody who knows
exactly what they want — "when a form comes in, message them and file them under
New" — still has to translate that into a trigger, two steps and their
configuration, and the catalog in front of them lists twenty-five entry points of
which two work. That is the gap between "the builder is hard" and "the builder is
badly designed", and it is not closed by restyling anything.

So a recipe is a working shape, named after the outcome rather than the
mechanism. It arrives with the trigger set and the steps in order, and the only
thing left is choosing which template or which stage — which is the part only the
account owner can answer.

Every recipe uses ONLY triggers that fire and actions that have executors. A
recipe built on a dead catalog entry would be worse than the empty canvas: it
would look finished and do nothing. That constraint is why the list is short, and
the list grows as the engine does.
*/

export interface WorkflowRecipe {
  key: string;
  /** Named for the outcome, in the words somebody would use for it. */
  name: string;
  /** What it does, in one sentence. */
  summary: string;
  /** Who it is for, so a broker can skip a clinic's recipe. */
  bestFor: string;
  trigger: string;
  triggerConfig?: Record<string, unknown>;
  /** What still needs choosing after it is created. Shown before creating. */
  needs: string[];
  steps: Omit<WorkflowStep, "id">[];
}

/*
Step ids are minted at creation rather than stored here.

Two workflows created from one recipe would otherwise share step ids, and the
builder addresses steps by id — selecting a step in one would be ambiguous the
moment both were open.
*/
function stepID(): string {
  return Math.random().toString(36).slice(2, 10);
}

/*
Gives a recipe's steps fresh ids, all the way down.

Recursive because a condition's branches are steps too, and the builder
addresses every step by id — a nested step left with a blank one cannot be
selected or edited, which would make the branching recipe the least usable of
the five.
*/
export function materialise(recipe: WorkflowRecipe): WorkflowStep[] {
  const walk = (steps: Omit<WorkflowStep, "id">[]): WorkflowStep[] =>
    steps.map((s) => ({
      ...s,
      id: stepID(),
      yes: s.yes ? walk(s.yes) : undefined,
      no: s.no ? walk(s.no) : undefined,
    })) as WorkflowStep[];

  return walk(recipe.steps);
}

export const WORKFLOW_RECIPES: WorkflowRecipe[] = [
  {
    key: "reply-to-enquiry",
    name: "Reply the moment an enquiry arrives",
    summary:
      "Someone submits your form and gets a WhatsApp message straight away, before they go and ask somebody else.",
    bestFor: "Any business where the first reply usually wins the job",
    trigger: "form_submitted",
    needs: ["Which form", "Which WhatsApp template"],
    steps: [
      {
        kind: "action",
        type: "send_whatsapp",
        label: "WhatsApp them straight away",
        config: {},
      },
    ],
  },
  {
    key: "welcome-and-file",
    name: "Welcome a new lead and file them",
    summary:
      "A form submission sends a welcome email and moves the contact into the stage you choose, which starts that stage's follow-up.",
    bestFor: "Anyone running a pipeline with stage-by-stage follow-up",
    trigger: "form_submitted",
    needs: ["Which form", "Which email template", "Which stage"],
    steps: [
      {
        kind: "action",
        type: "send_email",
        label: "Send the welcome email",
        config: {},
      },
      {
        kind: "action",
        type: "move_stage",
        label: "File them under the right stage",
        config: {},
      },
    ],
  },
  {
    key: "nudge-after-two-days",
    name: "Nudge anyone who goes quiet",
    summary:
      "Waits two days after a contact arrives, then sends a follow-up. The wait is editable once it is created.",
    bestFor: "Enquiries that need a second touch before they are written off",
    trigger: "contact_created",
    needs: ["Which email template"],
    steps: [
      {
        kind: "delay",
        type: "delay",
        label: "Wait 2 days",
        config: { amount: "2", unit: "days" },
      },
      {
        kind: "action",
        type: "send_email",
        label: "Send the follow-up",
        config: {},
      },
    ],
  },
  {
    key: "email-or-whatsapp",
    name: "Email them if you have an address, WhatsApp if not",
    summary:
      "Checks whether the contact left an email. Those who did get an email; everyone else gets a WhatsApp message.",
    bestFor: "Forms where email is optional and most people only leave a number",
    trigger: "form_submitted",
    needs: ["Which form", "An email template", "A WhatsApp template"],
    steps: [
      {
        kind: "condition",
        type: "if_else",
        label: "Did they leave an email address?",
        config: { field: "email", operator: "exists" },
        yes: [
          {
            id: "",
            kind: "action",
            type: "send_email",
            label: "Send the email",
            config: {},
          },
        ],
        no: [
          {
            id: "",
            kind: "action",
            type: "send_whatsapp",
            label: "Send a WhatsApp message instead",
            config: {},
          },
        ],
      },
    ],
  },
  {
    key: "move-on-arrival",
    name: "File every form lead into one stage",
    summary:
      "No messages — just puts every submission of a form into the stage you pick, so the board stays organised.",
    bestFor: "Running several forms into one pipeline",
    trigger: "form_submitted",
    needs: ["Which form", "Which stage"],
    steps: [
      {
        kind: "action",
        type: "move_stage",
        label: "Move them to the stage",
        config: {},
      },
    ],
  },
];

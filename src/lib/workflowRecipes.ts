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
would look finished and do nothing.

That constraint used to keep this list to five, because the engine ran two
triggers and three actions. It now runs fourteen and nineteen, so the recipes
below cover the things clients actually ask for — chasing a quiet deal, telling
somebody when a lead arrives, not messaging at 3am — rather than the small
corner that happened to be built.
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
  {
    key: "tell-the-team",
    name: "Tell someone the moment a lead arrives",
    summary:
      "Emails a person on your team with the lead's name, number and stage, so nobody finds out the next morning.",
    bestFor: "Anywhere the first call back wins the job",
    trigger: "form_submitted",
    needs: ["Which form", "Who to tell"],
    steps: [
      {
        kind: "action",
        type: "internal_notify",
        label: "Email the team",
        config: { subject: "New lead" },
      },
      {
        kind: "action",
        type: "add_tag",
        label: "Tag them as new",
        config: { tag: "new-lead" },
      },
    ],
  },
  {
    key: "chase-the-quiet-ones",
    name: "Chase a deal that has gone quiet",
    summary:
      "Waits until working hours, then messages anyone nobody has touched for a week and tags them so you can see who was chased.",
    bestFor: "Deals that die of silence rather than of a no",
    trigger: "deal_stale",
    triggerConfig: { days: "7" },
    needs: ["Which email template", "How many days (7 by default)"],
    steps: [
      {
        kind: "delay",
        type: "business_hours",
        label: "Wait for working hours",
        config: {},
      },
      {
        kind: "action",
        type: "send_email",
        label: "Send the nudge",
        config: {},
      },
      {
        kind: "action",
        type: "add_tag",
        label: "Note that they were chased",
        config: { tag: "chased" },
      },
    ],
  },
  {
    key: "won-handover",
    name: "Hand a won deal over",
    summary:
      "When a deal reaches a stage you have marked as Won, it tags the customer, tells your team, and sends a thank-you.",
    bestFor: "Making sure a sale turns into delivery rather than stopping at the board",
    trigger: "deal_won",
    needs: ["Who to tell", "A thank-you email template", "A stage marked as Won"],
    steps: [
      {
        kind: "action",
        type: "add_tag",
        label: "Tag them as a customer",
        config: { tag: "customer" },
      },
      {
        kind: "action",
        type: "internal_notify",
        label: "Tell the team it closed",
        config: { subject: "Deal won" },
      },
      {
        kind: "action",
        type: "send_email",
        label: "Thank them",
        config: {},
      },
    ],
  },
  {
    key: "vip-route",
    name: "Treat your big leads differently",
    summary:
      "Checks whether a lead is worth more than a figure you set. Big ones get assigned to someone and flagged; the rest get the usual email.",
    bestFor: "Anywhere a large enquiry deserves a person rather than a sequence",
    trigger: "form_submitted",
    needs: ["Which form", "The value to split on", "Who takes the big ones"],
    steps: [
      {
        kind: "condition",
        type: "if_else",
        label: "Is this a big one?",
        config: { field: "value", operator: "greater", value: "50000" },
        yes: [
          {
            id: "",
            kind: "action",
            type: "add_tag",
            label: "Tag as high value",
            config: { tag: "high-value" },
          },
          {
            id: "",
            kind: "action",
            type: "assign_user",
            label: "Give it to someone",
            config: {},
          },
          {
            id: "",
            kind: "action",
            type: "internal_notify",
            label: "Tell them straight away",
            config: { subject: "High value lead" },
          },
        ],
        no: [
          {
            id: "",
            kind: "action",
            type: "send_email",
            label: "Send the standard reply",
            config: {},
          },
        ],
      },
    ],
  },
  {
    key: "stop-when-they-reply",
    name: "Follow up, but stop once they are moving",
    summary:
      "Waits two days, checks whether the contact has left the first stage, and only chases the ones who have not.",
    bestFor: "Not pestering somebody your team is already talking to",
    trigger: "contact_created",
    needs: ["Which stage counts as 'still waiting'", "An email template"],
    steps: [
      {
        kind: "delay",
        type: "delay",
        label: "Wait 2 days",
        config: { amount: "2", unit: "days" },
      },
      {
        kind: "condition",
        type: "filter",
        label: "Only if they are still sitting in the first stage",
        config: { field: "stage", operator: "equals", value: "" },
      },
      {
        kind: "delay",
        type: "business_hours",
        label: "Wait for working hours",
        config: {},
      },
      {
        kind: "action",
        type: "send_email",
        label: "Send the follow-up",
        config: {},
      },
    ],
  },
];

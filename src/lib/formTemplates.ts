import type { FormField } from "@/lib/types";

/*
 * Built-in starter forms. Each one creates an ordinary form the client then edits
 * — a template is a starting point, not a linked copy, so changing one later
 * cannot alter forms already made from it.
 *
 * Kept short on purpose: each question costs leads on a phone, so a template
 * asks only what that kind of business needs to call someone back.
 */
type TemplateField = Omit<FormField, "id">;

export interface FormTemplate {
  key: string;
  name: string;
  blurb: string;
  fields: TemplateField[];
}

const q = (
  type: string,
  label: string,
  required = false,
  options?: string[],
  placeholder = "",
): TemplateField => ({ type, label, required, options: options ?? [], placeholder });

export const FORM_TEMPLATES: FormTemplate[] = [
  {
    key: "contact",
    name: "Contact us",
    blurb: "Name, phone, email and a message.",
    fields: [
      q("full_name", "Your name", true),
      q("phone", "Mobile number", true),
      q("email", "Email"),
      q("multi_line", "How can we help?", false, undefined, "Tell us a little about what you need"),
    ],
  },
  {
    key: "lead",
    name: "Quick lead capture",
    blurb: "The shortest form that still gets a callback.",
    fields: [q("full_name", "Your name", true), q("phone", "Mobile number", true)],
  },
  {
    key: "callback",
    name: "Request a callback",
    blurb: "When to call, and what about.",
    fields: [
      q("full_name", "Your name", true),
      q("phone", "Mobile number", true),
      q("single_dropdown", "Best time to call", false, ["Morning", "Afternoon", "Evening"]),
      q("single_line", "What is it about?"),
    ],
  },
  {
    key: "quote",
    name: "Get a quote",
    blurb: "Service, budget and timeline for pricing an enquiry.",
    fields: [
      q("full_name", "Your name", true),
      q("phone", "Mobile number", true),
      q("email", "Email"),
      q("single_dropdown", "Service you need", true, ["[SERVICE 1]", "[SERVICE 2]", "[SERVICE 3]"]),
      q("single_dropdown", "Budget", false, ["Under ₹25,000", "₹25,000 – ₹1 lakh", "Above ₹1 lakh"]),
      q("radio", "When do you want to start?", false, ["Right away", "This month", "Just exploring"]),
    ],
  },
  {
    key: "event",
    name: "Event registration",
    blurb: "Sign-ups with number of attendees.",
    fields: [
      q("full_name", "Your name", true),
      q("phone", "Mobile number", true),
      q("email", "Email", true),
      q("single_dropdown", "Number of people", false, ["1", "2", "3", "4", "5+"]),
    ],
  },
  {
    key: "feedback",
    name: "Customer feedback",
    blurb: "A rating and what to improve.",
    fields: [
      q("full_name", "Your name"),
      q("radio", "How was your experience?", true, ["Excellent", "Good", "Average", "Poor"]),
      q("multi_line", "What could we do better?"),
      q("checkbox", "You can contact me about my feedback", false, ["Yes"]),
    ],
  },
];

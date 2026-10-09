// Field names mirror the Go JSON tags exactly; the API contract depends on them.

export type Role = "admin" | "client" | "staff";

export interface User {
  _id: string;
  email: string;
  name: string;
  role: Role;
  planId?: string | null;
  // Workflow allowance for a client account. 0 or absent means unlimited.
  workflowLimit?: number;
  // Set only on staff accounts: the client that owns this staff member.
  parentId?: string | null;
  // Feature keys a staff account is granted directly (subset of the client's own).
  permissions?: string[] | null;
  // Assigned role, if any — supplies a baseline permission set.
  roleId?: string | null;
  phone?: string;
  // Deactivated accounts can't log in. Absent means active.
  disabled?: boolean;
  // Last successful sign-in. Absent means never — the state worth noticing on
  // the Staff page, since it usually means a pin was never passed on.
  lastLoginAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

// A staff member is a User with role "staff". Aliased for readability at call
// sites that deal specifically with staff.
export type StaffMember = User;

// The /staff/permissions response: the feature catalog plus the subset of keys
// the calling client is itself allowed to delegate to a staff member.
export interface StaffPermissionCatalog {
  groups: FeatureGroup[];
  available: string[];
}

// A reusable staff role: a named permission set at a hierarchy level.
export interface StaffRole {
  _id: string;
  ownerId: string;
  name: string;
  level: number; // 1..6
  permissions: string[];
  isSystem?: boolean;
  createdAt: string;
  updatedAt: string;
}

// The role hierarchy tiers, mirroring the backend RoleLevels map.
export const ROLE_LEVELS: { level: number; label: string }[] = [
  { level: 1, label: "Executive" },
  { level: 2, label: "Director" },
  { level: 3, label: "Manager" },
  { level: 4, label: "Team Lead" },
  { level: 5, label: "Staff" },
  { level: 6, label: "Intern" },
];

export function roleLevelLabel(level: number): string {
  return ROLE_LEVELS.find((l) => l.level === level)?.label ?? `L${level}`;
}

// The /auth/me response: the user plus the feature map that applies to them.
// A null features map means "not gated" — admins, or clients with no plan.
export interface MeResponse {
  user: User;
  features: Record<string, boolean> | null;
  // How many workflows this tenant may create. 0 means unlimited. Resolved
  // server-side, so a staff account receives its client's allowance.
  workflowLimit: number;
}

// --- Workflows (automation builder) --------------------------------------

export interface WorkflowStep {
  id: string;
  kind: "action" | "condition" | "delay";
  type: string; // catalog key
  label: string;
  config: Record<string, unknown>;
  yes?: WorkflowStep[]; // condition branches (If/Else only)
  no?: WorkflowStep[];
}

export interface Workflow {
  _id: string;
  ownerId: string;
  name: string;
  // paused = has been published and is temporarily off; draft has never run.
  status: "draft" | "published" | "paused";
  trigger: string;
  triggerConfig: Record<string, unknown>;
  steps: WorkflowStep[];
  createdAt: string;
  updatedAt: string;
  // Derived server-side for the list view; absent on a workflow that never ran.
  lastRunAt?: string | null;
  runCount?: number;
}

// One reason a workflow cannot be published yet, as the server reports it.
export interface PublishProblem {
  stepId: string;
  label: string;
  reason: string;
}

export interface CatalogItem {
  key: string;
  label: string;
  description: string;
  icon: string;
  app: string;
  kind?: "action" | "condition" | "delay";
  // True only for steps that fork into Yes/No paths (If/Else).
  branches?: boolean;
  // True when the engine has no executor for this step yet — the picker shows it
  // disabled rather than letting a sequence be built around a silent no-op.
  unavailable?: boolean;
}

// One event in a workflow run's timeline, for the Activity panel.
export interface WorkflowActivity {
  _id: string;
  ownerId: string;
  workflowId: string;
  runId: string;
  cardId: string;
  contact: string;
  action:
    | "enrolled"
    | "email_sent"
    | "email_failed"
    | "email_skipped"
    | "whatsapp_sent"
    | "whatsapp_failed"
    | "whatsapp_skipped"
    | "delay"
    | "branch"
    | "completed"
    // A run that finished with steps that never ran. Distinct from "completed"
    // so the timeline cannot present it as a clean success.
    | "completed_with_issues"
    | "failed"
    | "skipped";
  detail: string;
  createdAt: string;
}

export interface CatalogGroup {
  key: string;
  label: string;
  icon: string;
  items: CatalogItem[];
}

export interface WorkflowCatalog {
  triggers: CatalogGroup[];
  actions: CatalogGroup[];
  conditions: CatalogGroup[];
}

// --- Forms (lead-capture builder) ----------------------------------------

export interface FormField {
  id: string;
  type: string; // catalog element key
  label: string;
  placeholder: string;
  required: boolean;
  options?: string[] | null; // choice fields only
  // Markup for a content block (see isContentField). The server sanitizes it on
  // every save, so anything read back from the API is already safe to render.
  html?: string;
}

/**
 * One answer a visitor gave, with the question as it was worded at the time.
 *
 * The label and type are copies, not references into the form. A form edited
 * after a submission arrived must not relabel history, which is exactly what
 * reading the live form definition would do.
 */
export interface FormAnswer {
  fieldId: string;
  label: string;
  type: string;
  value: string;
}

/** One completed form, linked to the contact it created when one was created. */
export interface FormSubmission {
  _id: string;
  formId: string;
  formName: string;
  answers: FormAnswer[];
  cardId?: string | null;
  createdAt: string;
}

export interface FormStyles {
  pageBackground: string;
  formCard: string;
  textColor: string;
  inputBackground: string;
  inputText: string;
  buttonBackground: string;
  buttonText: string;
  cornerRadius: number;
  submitLabel: string;
}

export interface Form {
  _id: string;
  ownerId: string;
  name: string;
  status: "draft" | "published";
  fields: FormField[];
  styles: FormStyles;
  theme: string;
  /**
   * How the form is presented to a visitor.
   *
   * "classic" lists every question on one page; "stepped" asks one at a time,
   * which is what gets finished on a phone. The fields and the submission are
   * identical either way, so this is switchable after the form is shared.
   */
  layout?: "classic" | "stepped";
  createdAt: string;
  updatedAt: string;
}

export interface FormElement {
  key: string;
  label: string;
  icon: string;
  placeholder: string;
  hasOptions: boolean;
  // True for an element that displays something instead of asking for it.
  content?: boolean;
}

export interface FormElementGroup {
  key: string;
  label: string;
  items: FormElement[];
}

export interface FormTheme {
  key: string;
  label: string;
  swatch: string[];
  styles: FormStyles;
}

export interface FormCatalog {
  elements: FormElementGroup[];
  themes: FormTheme[];
}

// --- Lead Generation -----------------------------------------------------

export type FunnelType = "funnel" | "website" | "link_page";

/** One page inside a funnel. The first is always home, and its path is empty. */
export interface FunnelPage {
  id: string;
  name: string;
  /** The segment after the slug. Empty means the funnel's own address. */
  path: string;
  html: string;
  publishedHtml: string;
}

export interface Funnel {
  _id: string;
  ownerId: string;
  name: string;
  type: FunnelType;
  slug: string;
  /**
   * Every page in the funnel, home first.
   *
   * Always sent — the API fills it in for funnels saved before multi-page
   * support, so the browser never has to know they existed.
   */
  pages: FunnelPage[];
  /** The home page's content. Kept for compatibility; read `pages` instead. */
  html: string;
  publishedHtml: string;
  published: boolean;
  publishedAt: string | null;
  /**
   * Where the API serves this page, resolved server-side.
   *
   * Sent rather than assembled in the browser because it depends on
   * PUBLIC_BASE_URL and the answering host. Optional so an older API build does
   * not break the editor.
   */
  publicUrl: string;
  createdAt: string;
  updatedAt: string;
}

// --- Integrations (App Store) --------------------------------------------

export interface IntegrationField {
  key: string;
  label: string;
  placeholder: string;
  secret: boolean;
}

export interface IntegrationProvider {
  key: string;
  name: string;
  description: string;
  icon: string;
  required: boolean;
  fields: IntegrationField[];
}

export interface IntegrationGroup {
  key: string;
  label: string;
  providers: IntegrationProvider[];
}

export interface Integration {
  _id: string;
  ownerId: string;
  provider: string;
  status: "connected" | "disconnected";
  /**
   * Whether the stored keys can still be decrypted and used.
   *
   * Derived per request, so it is the only trustworthy signal here: `status` is
   * a string written once at connect time and keeps reading "connected" after
   * the secrets have stopped working. Optional because an older API build does
   * not send it, and absent must not be read as broken.
   */
  usable?: boolean;
  hints: Record<string, string>;
  connectedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

// --- Custom SMTP ---------------------------------------------------------

export interface SMTPConnection {
  _id: string;
  ownerId: string;
  displayName: string;
  host: string;
  port: number;
  username: string;
  encryption: "tls" | "ssl" | "none";
  fromEmail: string;
  fromName: string;
  replyTo: string;
  dailyLimit: number;
  hourlyLimit: number;
  maxBurst: number;
  isDefault: boolean;
  // Whether a password is stored (the value itself is never returned).
  hasPassword: boolean;
  createdAt: string;
  updatedAt: string;
}

// --- Plans ---------------------------------------------------------------

export interface Feature {
  key: string;
  label: string;
  route: string;
  enforced: boolean;
}

export interface FeatureGroup {
  key: string;
  label: string;
  icon: string;
  features: Feature[];
}

export interface BillingCycle {
  key: string;
  label: string;
  price: number;
  active: boolean;
  visible: boolean;
}

export interface PlanPricing {
  currency: string;
  trialDays: number;
  gateways: string[];
  cycles: BillingCycle[];
}

export interface PlanTax {
  apply: boolean;
  country: string;
  ratePct: number;
  inclusive: boolean;
  hsnSac: string;
  gstin: string;
}

export interface PlanLimits {
  monthlyEmailLimit: number;
  maxStaff: number;
  maxContacts: number;
  maxPipelines: number;
  maxTemplates: number;
  whiteLabel: boolean;
}

export interface PlanAddOns {
  prebuiltTemplates: boolean;
  funnelTemplates: boolean;
  emailTemplates: boolean;
  whatsappTemplates: boolean;
  automationTemplates: boolean;
  customThemes: boolean;
}

export interface PlanLifecycle {
  gracePeriodDays: number;
  lockMode: string;
  overduePolicy: boolean;
}

export interface Plan {
  _id: string;
  ownerId: string;
  name: string;
  description: string;
  imageUrl: string;
  pricing: PlanPricing;
  tax: PlanTax;
  limits: PlanLimits;
  features: Record<string, boolean>;
  addOns: PlanAddOns;
  lifecycle: PlanLifecycle;
  createdAt: string;
  updatedAt: string;
}

export interface Pipeline {
  _id: string;
  name: string;
  ownerId: string;
  createdAt: string;
  updatedAt: string;
}

export interface Card {
  _id: string;
  name: string;
  phone: string;
  email: string;
  value: number;
  position: number;
  stageId: string;
  pipelineId: string;
  ownerId: string;
  createdAt: string;
  updatedAt: string;
}

export interface Stage {
  _id: string;
  name: string;
  position: number;
  color: string;
  pipelineId: string;
  ownerId: string;
  cards?: Card[];
  createdAt: string;
  updatedAt: string;
}

export interface BoardResponse {
  pipeline: Pipeline;
  stages: Stage[];
}

export interface EmailTemplate {
  _id: string;
  name: string;
  subject: string;
  fromName: string;
  replyTo: string;
  content: string;
  attachmentUrl: string;
  dayNumber: number;
  stageId: string;
  pipelineId: string;
  ownerId: string;
  isActive: boolean;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
}

export type ProgressStatus = "active" | "stopped" | "completed";

export interface CardStageProgress {
  _id: string;
  cardId: string;
  stageId: string;
  pipelineId: string;
  ownerId: string;
  currentDay: number;
  lastEmailSentAt: string | null;
  status: ProgressStatus;
  createdAt: string;
  updatedAt: string;
}

export interface BoardAutomation {
  progress: CardStageProgress[];
  stageTemplateCounts: Record<string, number>;
  intervalHours: number;
}

export type LogAction =
  | "entered"
  | "sent"
  | "failed"
  | "skipped"
  | "stopped"
  | "completed";

export interface AutomationLog {
  _id: string;
  cardId: string;
  stageId: string;
  pipelineId: string;
  ownerId: string;
  templateId: string | null;
  action: LogAction;
  dayNumber: number;
  errorMessage: string;
  createdAt: string;
}

export interface Contact extends Card {
  pipelineName: string;
  stageName: string;
  // Whether an email sequence is currently running for this contact. Sent per
  // row so the Contacts page and the board can both filter on it locally.
  hasAutomation: boolean;
}

export interface ContactSummary {
  totalContacts: number;
  totalValue: number;
  withEmail: number;
  withPhone: number;
  activeAutomations: number;
}

export interface ContactsResponse {
  contacts: Contact[];
  summary: ContactSummary;
}

export interface ImportResult {
  created: number;
  skipped: number;
  failed: number;
  errors: { row: number; message: string }[];
}

export type WabaStatus = "DRAFT" | "PENDING" | "APPROVED" | "REJECTED";
export type WabaCategory = "MARKETING" | "UTILITY" | "AUTHENTICATION";
export type WabaHeaderType = "NONE" | "TEXT" | "IMAGE" | "VIDEO" | "DOCUMENT";

export interface WabaButton {
  type: "CTA" | "QUICK_REPLY";
  text: string;
  actionType: string;
  url: string;
  phone: string;
}

export interface WabaTemplate {
  _id: string;
  ownerId: string;
  name: string;
  language: string;
  category: WabaCategory;
  headerType: WabaHeaderType;
  headerText: string;
  headerMediaUrl: string;
  body: string;
  footer: string;
  buttons: WabaButton[];
  variableSamples: string[];
  variableMap: string[];
  status: WabaStatus;
  metaTemplateId: string;
  rejectionReason: string;
  createdAt: string;
  updatedAt: string;
}

// --- Short URLs (lead-generation attribution) -----------------------------

/** One target in a rotating short link. */
export interface LinkDestination {
  url: string;
  label: string;
  /** This destination's share of the clicks. Blank or zero counts as one. */
  weight: number;
  /** This destination's own tally, so you can see which one got the traffic. */
  clicks: number;
}

export interface ShortURL {
  _id: string;
  ownerId: string;
  // The path segment in /r/<code>. Immutable once created — links get shared.
  code: string;
  targetUrl: string;
  title: string;
  campaign: string;
  /**
   * When there is more than one, clicks are split between them by weight and
   * targetUrl is just the first one. Absent on an ordinary single-target link,
   * which is what every link created before rotation is.
   */
  destinations?: LinkDestination[] | null;
  /**
   * How the rotation advances.
   *
   * "weighted" splits every click proportionally; "clicks" gives each
   * destination a run of clicks before moving on; "time" moves on by the clock
   * whether or not anybody clicked. Absent means weighted.
   */
  rotationMode?: "weighted" | "clicks" | "time" | null;
  rotateEveryClicks?: number;
  rotateEveryMinutes?: number;
  clicks: number;
  lastClickedAt?: string | null;
  /** The whole link to hand out, resolved server-side. See Funnel.publicUrl. */
  shortUrl?: string;
  createdAt: string;
  updatedAt: string;
}

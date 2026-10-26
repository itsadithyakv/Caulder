import { z } from "zod";
import type { Reached, Sent } from "./reached";
import type { EmailReply } from "./mail";
import type { Renewal } from "./costs";
import type { Deadline } from "./deadlines";
import { cleanProfile, type ProfileKind } from "./profiles";
import { TAX_TREATMENTS, type TaxLine, type TaxTreatment } from "./tax";
import type { Ahead, ClientMoney } from "./insights";

/**
 * The domain types and their validators, imported by BOTH the renderer and the
 * main process so a form and the table it writes to cannot disagree.
 */

/* ---- Accents -------------------------------------------------------------
 * A company picks an accent from this fixed set, and Caulder stores the id,
 * never a hex. Two reasons. A free colour picker cannot promise 4.5:1 against
 * the canvas or under white button text, and every value the UI uses has to
 * exist in tokens.css as a scale step rather than as a literal in the
 * database. Each id has a light and a dark pair, both contrast-checked; see
 * the accent blocks in tokens.css.
 * ------------------------------------------------------------------------ */

export const ACCENT_IDS = ["blue", "teal", "violet", "amber", "rose", "coffee"] as const;
export type AccentId = (typeof ACCENT_IDS)[number];

export const ACCENT_LABEL: Record<AccentId, string> = {
  blue: "Blue",
  teal: "Teal",
  violet: "Violet",
  amber: "Amber",
  rose: "Rose",
  coffee: "Coffee",
};

/** Coffee, the app's own colour: a new company looks like the rest of Caulder until somebody picks another. */
export const DEFAULT_ACCENT: AccentId = "coffee";

/* ---- Company ------------------------------------------------------------ */

/** Why a deal was lost. Fixed list plus free text, so it can be counted. */
export const LOSS_REASONS = [
  "price",
  "timing",
  "competitor",
  "no-budget",
  "no-response",
  "not-a-fit",
  "other",
] as const;
type LossReason = (typeof LOSS_REASONS)[number];

export const LOSS_REASON_LABEL: Record<LossReason, string> = {
  price: "Too expensive",
  timing: "Wrong time",
  competitor: "Went with someone else",
  "no-budget": "No budget",
  "no-response": "Went quiet",
  "not-a-fit": "Not a fit",
  other: "Something else",
};

export const GOAL_PERIODS = ["month", "quarter", "year"] as const;
export type GoalPeriod = (typeof GOAL_PERIODS)[number];

/** @public Read by a screen hidden in phase 1 of PLAN.md. */
export const GOAL_PERIOD_LABEL: Record<GoalPeriod, string> = {
  month: "a month",
  quarter: "a quarter",
  year: "a year",
};

/* ---- What kind of workspace this is -------------------------------------
 *
 * Caulder started as one thing: a funnel. A workspace kind is how it became
 * two without either half having to pretend to be the other.
 *
 * `solo` is the outreach workspace - leads, pipeline, email, forecast.
 * `personal` plans a day: a timetable, notes, and focus. It has no funnel,
 * which is why hiding the screens is the point rather than a tidy-up.
 *
 * `team` is named here and nowhere else on purpose. It needs sync, accounts
 * and conflict resolution, none of which exist, and a value the app cannot
 * produce has no business in a CHECK constraint or a picker.
 * ------------------------------------------------------------------------ */

export const WORKSPACE_KINDS = ["solo", "personal"] as const;
export type WorkspaceKind = (typeof WORKSPACE_KINDS)[number];

/**
 * Funnel presets, offered when a company is created.
 *
 * A funnel is the one thing that genuinely differs between kinds of business,
 * and it is also the thing nobody wants to build from an empty list on their
 * first minute in an app. These are starting points, not commitments - every
 * stage can be renamed, reordered or deleted from Settings afterwards.
 */
export const COMPANY_MODES = ["sales", "agency", "consulting", "minimal"] as const;
export type CompanyMode = (typeof COMPANY_MODES)[number];

export const COMPANY_MODE_LABEL: Record<CompanyMode, string> = {
  sales: "Selling a product",
  agency: "Agency or studio work",
  consulting: "Consulting or freelance",
  minimal: "Start from almost nothing",
};

export const COMPANY_MODE_HINT: Record<CompanyMode, string> = {
  sales: "Outreach to close. The default, and what most of Caulder was built around.",
  agency: "Brief, pitch, proposal, then the work. For project-shaped deals.",
  consulting: "Fewer, longer conversations. Discovery leads, and scoping is the hard part.",
  minimal: "Three stages. Add your own once you know what they are.",
};

export const COMPANY_MODE_STAGES: Record<
  CompanyMode,
  readonly { name: string; kind: StageKind }[]
> = {
  sales: [
    { name: "New", kind: "open" },
    { name: "Contacted", kind: "open" },
    { name: "Interested", kind: "open" },
    { name: "Meeting booked", kind: "open" },
    { name: "Proposal sent", kind: "open" },
    { name: "Won", kind: "won" },
    { name: "Lost", kind: "lost" },
  ],
  agency: [
    { name: "Enquiry", kind: "open" },
    { name: "Brief taken", kind: "open" },
    { name: "Pitching", kind: "open" },
    { name: "Proposal out", kind: "open" },
    { name: "Negotiating", kind: "open" },
    { name: "Signed", kind: "won" },
    { name: "Went elsewhere", kind: "lost" },
  ],
  consulting: [
    { name: "Introduced", kind: "open" },
    { name: "Discovery call", kind: "open" },
    { name: "Scoping", kind: "open" },
    { name: "Statement of work", kind: "open" },
    { name: "Engaged", kind: "won" },
    { name: "Not now", kind: "lost" },
  ],
  minimal: [
    { name: "To contact", kind: "open" },
    { name: "In conversation", kind: "open" },
    { name: "Won", kind: "won" },
    { name: "Lost", kind: "lost" },
  ],
};

export const companyInput = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Give it a name.")
    .max(80, "Keep the name under 80 characters."),
  accent: z.enum(ACCENT_IDS),
  timezone: z.string().trim().min(1),
  /**
   * Outreach or personal. Settled at creation and not changed afterwards: a
   * workspace with two hundred leads in it cannot meaningfully become a day
   * planner, and offering the switch would mostly be offering a way to hide
   * your own data.
   */
  kind: z.enum(WORKSPACE_KINDS).default("solo"),
  /** Which funnel to start from. Every stage is editable afterwards. */
  mode: z.enum(COMPANY_MODES).default("sales"),
  /**
   * A small PNG data URL, downscaled in the renderer before it gets here.
   * Capped so a 12 MP photograph cannot become a row in the database.
   */
  logo: z.string().max(200_000).nullable().default(null),
  /** Where the company is, as an ISO code. Its money and phone numbers start from it. */
  country: z
    .string()
    .regex(/^[A-Z]{2}$/, "That is not a country.")
    .nullable()
    .default(null),
  /** Its money; when left out, the country's own. */
  currency: z
    .string()
    .regex(/^[A-Z]{3}$/, "That is not a currency.")
    .optional(),
});

/** What comes OUT of the schema: every field settled. */
export type CompanyInput = z.infer<typeof companyInput>;

/**
 * What may go IN: the defaulted fields are optional.
 *
 * Two types rather than one because the repository is called both by the IPC
 * handler, which passes a parsed object, and by tests, which write one by
 * hand. Making the defaults required would mean every caller restating
 * "sales" and null to say nothing.
 */
export type CompanyDraft = z.input<typeof companyInput>;

export type Company = {
  id: string;
  name: string;
  accent: AccentId;
  timezone: string;
  /** Which half of the app this workspace is. Fixed at creation. */
  kind: WorkspaceKind;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
  /** Denormalised for the switcher and the sidebar. Not stored. */
  leadCount: number;
  /** A small PNG data URL, or null. Shown in the sidebar instead of initials. */
  logo: string | null;
  /** What this company is aiming at, and over what period. Null means none set. */
  goalValue: number | null;
  goalPeriod: GoalPeriod | null;
  /**
   * Minutes before a block starts to say so. Null is off, which is the
   * default and the master switch — see `shared/remind.ts`.
   */
  remindMinutes: number | null;
  /**
   * Which stage counts as "qualified" for the marketing report. Null until
   * somebody says — the app inventing it from position would be the app
   * deciding what this funnel means.
   */
  qualifiedStageId: string | null;
  /** ISO 4217, for formatting only. Nothing is ever converted. */
  currency: string;
  /** ISO 3166 code: where the company is. Null for one made before countries, until one is chosen. */
  country: string | null;
};

/* ---- Pipeline stages ----------------------------------------------------
 * Seeded per company on creation so a new workspace is usable immediately
 * rather than presenting an empty board. The user can rename, reorder and add
 * to these later.
 * ------------------------------------------------------------------------ */

export type StageKind = "open" | "won" | "lost";

export type PipelineStage = {
  id: string;
  companyId: string;
  name: string;
  position: number;
  kind: StageKind;
};

export const DEFAULT_STAGES: readonly { name: string; kind: StageKind }[] = [
  { name: "New", kind: "open" },
  { name: "Contacted", kind: "open" },
  { name: "Interested", kind: "open" },
  { name: "Meeting booked", kind: "open" },
  { name: "Proposal sent", kind: "open" },
  { name: "Won", kind: "won" },
  { name: "Lost", kind: "lost" },
];

/* ---- Leads --------------------------------------------------------------
 * Only the name is required. The spreadsheet this replaces has rows where
 * everything else is missing, and refusing those would mean refusing most of
 * the file.
 *
 * Blank strings from a form are normalised to null on the way in, so "unset"
 * has exactly one representation in the database rather than two.
 * ------------------------------------------------------------------------ */

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value.length === 0 ? null : value))
    .nullable()
    .default(null);

/**
 * A LinkedIn or Instagram profile: whatever was typed, kept as one address in
 * full, and refused in a sentence when it is not a profile on that site
 * (`shared/profiles.ts`).
 */
const profileField = (kind: ProfileKind) =>
  z
    .string()
    .trim()
    .max(300, "That is too long to be a profile's address.")
    .transform((value, context) => {
      try {
        return cleanProfile(kind, value);
      } catch (cause) {
        context.addIssue({ code: "custom", message: cause instanceof Error ? cause.message : "That is not a profile." });
        return z.NEVER;
      }
    })
    .nullable()
    .default(null);

/**
 * Who a contact is to the company. Deals and Going quiet show prospects and
 * customers; an accountant or a vendor is somebody you know, not a sale.
 */
export const RELATIONSHIPS = [
  "prospect",
  "customer",
  "vendor",
  "partner",
  "advisor",
  "investor",
  "accountant",
  "candidate",
] as const;
export type Relationship = (typeof RELATIONSHIPS)[number];

export const RELATIONSHIP_LABEL: Record<Relationship, string> = {
  prospect: "Prospect",
  customer: "Customer",
  vendor: "Vendor",
  partner: "Partner",
  advisor: "Advisor",
  investor: "Investor",
  accountant: "Accountant",
  candidate: "Candidate",
};

export const leadInput = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Give the lead a name.")
    .max(160, "Keep the name under 160 characters."),
  contactPerson: optionalText(120),
  /** What the contact person is there: "Owner", "Head of marketing". */
  contactRole: optionalText(80),
  email: optionalText(200),
  phone: optionalText(60),
  altPhone: optionalText(60),
  location: optionalText(300),
  city: optionalText(120),
  pin: optionalText(20),
  source: optionalText(160),
  website: optionalText(300),
  linkedin: profileField("linkedin"),
  instagram: profileField("instagram"),
  // The messages matter: this one is reachable by typing "12.5" into the
  // value box, and Zod's own text for it is "Invalid input: expected int,
  // received number", which tells a user nothing they can act on.
  value: z
    .number()
    .int("Value has to be a whole number.")
    .nonnegative("Value cannot be negative.")
    .nullable()
    .default(null),
  notes: optionalText(4000),
  /**
   * With `value`, the contact's main deal. A new contact you sell to starts
   * with one; an edit moves it while the contact has at most one deal. A
   * contact with several has them edited as deals.
   */
  stageId: z.string().nullable().default(null),
  /**
   * Do not reach out to this one, ever.
   *
   * Enforced where the reaching-out happens rather than hidden in the UI:
   * `queueMessage`, enrolment, and the WhatsApp button all refuse. A flag
   * only the screen respects is not a flag.
   */
  doNotContact: z.boolean().default(false),
  relationship: z.enum(RELATIONSHIPS).default("prospect"),
});

export type LeadInput = z.infer<typeof leadInput>;

export type Lead = {
  id: string;
  companyId: string;
  stageId: string | null;
  name: string;
  contactPerson: string | null;
  contactRole: string | null;
  email: string | null;
  phone: string | null;
  /** Kept and imported, and no longer on the form: they came from the first customer's spreadsheet. */
  altPhone: string | null;
  location: string | null;
  city: string | null;
  pin: string | null;
  source: string | null;
  website: string | null;
  /** Their profiles, each as an address in full (`shared/profiles.ts`). */
  linkedin: string | null;
  instagram: string | null;
  value: number | null;
  tags: string[];
  notes: string | null;
  lastContactedAt: string | null;
  createdAt: string;
  updatedAt: string;
  /** Why it was lost, when it was. Free text so an unlisted reason is sayable. */
  lossReason: string | null;
  doNotContact: boolean;
  relationship: Relationship;
  /**
   * How many deals the contact has. `stageId`, `value` and `lossReason` above
   * are its main deal's - the open one touched last, or the last one - so the
   * list can show one stage per contact; null when it has none.
   */
  dealCount: number;
};

/* ---- Deals ---------------------------------------------------------------
 * What is being sold to a contact. A contact can have several: a school that
 * buys twice, two products to one customer. The board shows deals; a quote
 * or an invoice belongs to one.
 * ------------------------------------------------------------------------ */

export type Deal = {
  id: string;
  companyId: string;
  leadId: string;
  title: string;
  stageId: string | null;
  value: number | null;
  lossReason: string | null;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export const dealInput = z.object({
  title: z
    .string()
    .trim()
    .min(1, "Give the deal a name.")
    .max(160, "Keep the name under 160 characters."),
  stageId: z.string().nullable().default(null),
  value: z
    .number()
    .int("Value has to be a whole number.")
    .nonnegative("Value cannot be negative.")
    .nullable()
    .default(null),
});

export type DealInput = z.infer<typeof dealInput>;

/** What the table asks for. Every field is optional and they combine with AND. */
export type LeadQuery = {
  companyId: string;
  /** Matched against name, contact, email, phone and city. */
  search?: string;
  stageId?: string | null;
  relationship?: Relationship;
  /** Whether they have been written to, and whether they answered (shared/reached.ts). */
  reached?: Reached;
  sort?: LeadSort;
  direction?: SortDirection;
};

export const LEAD_SORTS = ["recent", "name", "value", "stage", "next"] as const;
export type LeadSort = (typeof LEAD_SORTS)[number];

export type SortDirection = "asc" | "desc";

/**
 * The direction a column starts in when it is first clicked.
 *
 * Not always ascending: nobody wants the oldest lead or the smallest deal
 * first, and clicking a column to get the least interesting end of it is the
 * kind of small wrongness that makes a table feel unhelpful. Text goes A-Z,
 * everything else goes most-interesting-first.
 */
export const LEAD_SORT_DEFAULT_DIRECTION: Record<LeadSort, SortDirection> = {
  name: "asc",
  stage: "asc",
  next: "asc", // soonest first: the thing you have to do next
  recent: "desc", // most recently touched first
  value: "desc", // biggest first
};

/**
 * One row of the leads table.
 *
 * A lead plus the one thing the list needs that the record itself does not
 * carry: what happens next. It is a separate type rather than a wider `Lead`
 * so that nothing which merely edits a lead has to invent a next step.
 */
export type LeadListRow = Lead & {
  /** The soonest open task, or null when nothing is planned. */
  nextTaskDue: string | null;
  nextTaskKind: TaskKind | null;
  nextTaskTitle: string | null;
};

/** Column headings, and what a screen reader announces the sort as. */
export const LEAD_SORT_LABEL: Record<LeadSort, string> = {
  recent: "Last touched",
  name: "Name",
  value: "Value",
  stage: "Stage",
  next: "Next step",
};

/* ---- Activities ---------------------------------------------------------
 * The timeline. Append-only: a correction is a new entry, never an edit, so
 * the record of what happened stays true.
 * ------------------------------------------------------------------------ */

export const ACTIVITY_KINDS = [
  "created",
  "note",
  "call",
  "meeting",
  "whatsapp",
  "linkedin",
  "instagram",
  "stage_change",
  "field_change",
  "email_queued",
  "email_sent",
  "email_opened",
  "email_replied",
  "email_failed",
  "email_bounced",
  "task_done",
  "imported",
  "import_undone",
  /** They answered somewhere Caulder cannot read - WhatsApp, LinkedIn, the phone - said by hand. */
  "replied",
] as const;

export type ActivityKind = (typeof ACTIVITY_KINDS)[number];

/** The kinds a person can add by hand. The rest are written by the app. */
export const LOGGABLE_KINDS = ["note", "call", "meeting", "whatsapp", "linkedin", "instagram", "replied"] as const;
export type LoggableKind = (typeof LOGGABLE_KINDS)[number];

export const ACTIVITY_LABEL: Record<ActivityKind, string> = {
  created: "Created",
  note: "Note",
  call: "Call",
  meeting: "Meeting",
  whatsapp: "WhatsApp",
  linkedin: "LinkedIn",
  instagram: "Instagram",
  stage_change: "Stage changed",
  field_change: "Details edited",
  email_queued: "Email queued",
  email_sent: "Email sent",
  email_opened: "Email opened",
  email_replied: "Reply received",
  email_failed: "Email failed",
  email_bounced: "Email bounced",
  task_done: "Task done",
  imported: "Imported",
  import_undone: "Import undone",
  replied: "They answered",
};

export type Activity = {
  id: string;
  leadId: string;
  kind: ActivityKind;
  body: string | null;
  occurredAt: string;
  createdAt: string;
};

export const activityInput = z.object({
  leadId: z.string().min(1),
  kind: z.enum(LOGGABLE_KINDS),
  body: z.string().trim().max(4000).nullable().default(null),
});

export type ActivityInput = z.infer<typeof activityInput>;

/**
 * Logging a call or a meeting means you spoke to them, so it moves the
 * last-contacted date. A note does not: writing something down is not contact.
 */
export function countsAsContact(kind: LoggableKind): boolean {
  // A WhatsApp message is contact for the same reason a call is and a note is
  // not: somebody heard from you. The going-quiet list depends on this staying
  // honest in both directions. A message on LinkedIn or Instagram is the same.
  return kind !== "note";
}

/* ---- Currency ------------------------------------------------------------
 * Per workspace, for display only. Nothing is ever converted: a total is a
 * total of one thing, and converting would mean choosing a date to have
 * converted on and being wrong about it forever after.
 * ------------------------------------------------------------------------- */

export const CURRENCIES = ["INR", "USD", "EUR", "GBP", "AED", "SGD", "AUD"] as const;

/* ---- The board ----------------------------------------------------------
 * The pipeline, as the screen needs it: columns with their own totals, and
 * cards carrying only what a card shows.
 * ------------------------------------------------------------------------ */

/** A deal on the board, with enough of its contact to recognise it. */
export type BoardCard = {
  /** The deal. */
  id: string;
  leadId: string;
  /** The deal's own name, which starts as the contact's. */
  title: string;
  /** The contact's name. */
  name: string;
  city: string | null;
  contactPerson: string | null;
  value: number | null;
  lastContactedAt: string | null;
  /** Whether anything is planned. A card with no next step is how one drifts. */
  hasNextStep: boolean;
  /** Marked on the card so nobody picks it up meaning to get in touch. */
  doNotContact: boolean;
};

export type BoardColumn = {
  /** Null for the Unstaged column, which appears only when it has cards. */
  stageId: string | null;
  name: string;
  kind: StageKind;
  /** Every deal in the column, even where more cards exist than are rendered. */
  total: number;
  value: number;
  cards: BoardCard[];
};

export type Board = { columns: BoardColumn[] };

export const stageInput = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Give the stage a name.")
    .max(40, "Keep the name under 40 characters."),
  kind: z.enum(["open", "won", "lost"]),
});

export type StageInput = z.infer<typeof stageInput>;

export const STAGE_KIND_LABEL: Record<StageKind, string> = {
  open: "In play",
  won: "Won",
  lost: "Lost",
};

/* ---- Tasks --------------------------------------------------------------
 * What drives the Today screen, and the reason the app is worth opening in
 * the morning.
 * ------------------------------------------------------------------------ */

export const TASK_KINDS = ["call", "email", "follow_up", "meeting", "todo"] as const;
export type TaskKind = (typeof TASK_KINDS)[number];

export const TASK_KIND_LABEL: Record<TaskKind, string> = {
  call: "Call",
  email: "Email",
  follow_up: "Follow up",
  meeting: "Meeting",
  todo: "To do",
};

/** Plural, for the group headings on Today. */
export const TASK_KIND_GROUP: Record<TaskKind, string> = {
  call: "Calls to make",
  email: "Emails to send",
  follow_up: "Follow-ups",
  meeting: "Meetings",
  todo: "Other",
};

export type TaskStatus = "open" | "done";

/** What stays true about a contact, said to the line (PLAN.md, part twelve, phase 49). */
export type Fact = { id: string; leadId: string; text: string; until: string | null; createdAt: string };

export const factInput = z.object({
  leadId: z.string().min(1).max(80),
  text: z.string().trim().min(1, "Say what is true about them.").max(500, "Keep it under 500 characters."),
  until: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().default(null),
  /** A birthday's next day: kept with a reminder every year. */
  birthday: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().default(null),
});
export type FactInput = z.infer<typeof factInput>;

/** "Got 2400 from harbour": their open invoice paid (PLAN.md, part twelve, phase 49). */
export const paidFromInput = z.object({
  leadId: z.string().min(1).max(80),
  amount: z.number().int().positive().nullable().default(null),
});
export type PaidFromInput = z.infer<typeof paidFromInput>;

/**
 * A task that comes back when it is ticked off (PLAN.md, part twelve, phase
 * 47): rent on the 1st, a birthday. A week's days are a block series instead.
 */
export const TASK_REPEATS = ["fortnightly", "monthly", "yearly"] as const;
export type TaskRepeat = (typeof TASK_REPEATS)[number];

export const TASK_REPEAT_LABEL: Record<TaskRepeat, string> = {
  fortnightly: "Every two weeks",
  monthly: "Every month",
  yearly: "Every year",
};

export type Task = {
  id: string;
  companyId: string;
  leadId: string | null;
  /** Denormalised for display: Today lists tasks, not leads. */
  leadName: string | null;
  /** The contact is marked do not contact, so a task cannot start a call to it. */
  leadDoNotContact: boolean;
  /** The page that made it - a playbook's step - so the task can say where it came from. */
  pageId: string | null;
  pageTitle: string | null;
  title: string;
  kind: TaskKind;
  /**
   * 'must' | 'should' | 'spare', the same three levels a block has. Null reads
   * as "should", the middle. Caulder's alone: Google Tasks has no such field,
   * so the sync neither sends it nor can clear it.
   */
  priority: string | null;
  status: TaskStatus;
  dueOn: string;
  notes: string | null;
  /** It comes back when ticked off: a fortnight, a month or a year on. */
  repeats: TaskRepeat | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export const taskInput = z.object({
  /** Same three levels as a block, so Today can order what is due. */
  priority: z.enum(["must", "should", "spare"]).nullable().default(null),
  leadId: z.string().nullable().default(null),
  title: z
    .string()
    .trim()
    .min(1, "Say what needs doing.")
    .max(200, "Keep the title under 200 characters."),
  kind: z.enum(TASK_KINDS).default("follow_up"),
  dueOn: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date."),
  notes: z
    .string()
    .trim()
    .max(2000)
    .transform((value) => (value.length === 0 ? null : value))
    .nullable()
    .default(null),
  repeats: z.enum(TASK_REPEATS).nullable().optional(),
});

export type TaskInput = z.infer<typeof taskInput>;

/**
 * What the quick-add line resolves to, once every question is answered.
 *
 * Checked again here rather than trusted from the renderer: the parse runs in
 * the window, and anything that crosses the bridge is re-validated like every
 * other input.
 */
export const quickInput = z.object({
  title: z
    .string()
    .trim()
    .min(1, "Say what the task is.")
    .max(200, "Keep the title under 200 characters."),
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "That is not a day."),
  time: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "That is not a time.")
    .nullable()
    .default(null),
  minutes: z
    .number()
    .int()
    .min(5, "Give it at least five minutes.")
    .max(24 * 60, "That is longer than a day.")
    .nullable()
    .default(null),
  kind: z.enum(TASK_KINDS).default("todo"),
  priority: z.enum(["must", "should", "spare"]).nullable().default(null),
  /** The contact it is for, when the line named one: "call Oakridge tmrw". */
  leadId: z.string().nullable().default(null),
  /** Whatever the line said after the task itself - its second sentence - kept as the task's note. */
  notes: z
    .string()
    .trim()
    .max(2000)
    .transform((value) => (value.length === 0 ? null : value))
    .nullable()
    .default(null),
  /**
   * A second task the line asked for, hung off the first one's day: "...so i
   * need to remind him 2 days prior". Its own task rather than a reminder on
   * the first, because it is a thing to do and to tick, on a day of its own.
   */
  followUp: z
    .object({
      title: z.string().trim().min(1).max(200),
      day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "That is not a day."),
      kind: z.enum(TASK_KINDS).default("todo"),
      notes: z.string().trim().max(2000).nullable().default(null),
    })
    .nullable()
    .default(null),
  /** The line said "remind me": a notification at its time, or at the start of its day. */
  remind: z.boolean().default(false),
  /** "Pay rent on the 1st of every month": a task that comes back when it is ticked off. */
  every: z.enum(TASK_REPEATS).nullable().default(null),
  /**
   * "Gym every Mon, Wed, Fri" - hours set aside on those days until the last
   * one, rather than a task. A task is done once; a repeat is a habit.
   */
  repeat: z
    .object({
      weekdays: z.array(z.number().int().min(1).max(7)).min(1).max(7),
      until: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "That is not a day."),
      /** Every week, or every other week (PLAN.md, part twelve, phase 47). */
      every: z.union([z.literal(1), z.literal(2)]).optional(),
    })
    .nullable()
    .default(null),
}).refine((input) => input.repeat === null || input.time !== null, {
  message: "A repeat needs a time to set aside.",
  path: ["time"],
});

export type QuickInput = z.input<typeof quickInput>;

/* ---- Today --------------------------------------------------------------
 * The home screen answers one question: what do I do this morning.
 * ------------------------------------------------------------------------ */

/** A lead nothing has happened to for a while. */
export type ColdLead = {
  id: string;
  name: string;
  city: string | null;
  stageName: string | null;
  /** The last time anything meaningful happened, as a calendar day. */
  lastTouchedOn: string;
  daysQuiet: number;
};

/** How somebody can be written to or rung, from what is on their page. */
export type ReachWay = "email" | "phone" | "linkedin" | "instagram";

/** A prospect nobody has reached out to yet. */
export type ReachLead = {
  id: string;
  name: string;
  /** Who to ask for there, when that is known. */
  person: string | null;
  stageName: string | null;
  city: string | null;
  /** The day they were added, so the list can say how long they have waited. */
  addedOn: string;
  ways: ReachWay[];
};

/**
 * Outreach, as Today shows it: how many people were reached today and in the
 * last seven days, and who is still waiting for a first message - the oldest
 * first, a handful of them, with how many there are in all.
 */
export type Reach = {
  today: number;
  week: number;
  next: ReachLead[];
  waiting: number;
  /** Who was written to in the last seven days, and what came back. */
  sent: Sent;
};

export type Today = {
  /** The company's own day, so the UI never recomputes it differently. */
  day: string;
  /**
   * What is actually in the hours today, laid out.
   *
   * Today is the landing screen, and for the person this is for - a student
   * founder - the answer to "what is happening today" is a lecture at nine, a
   * client at two and the gym at six, not only a list of follow-ups. A home
   * screen that knows about half the day is one you stop opening.
   */
  blocks: LaidOutBlock[];
  overdue: Task[];
  dueToday: Task[];
  /** Open tasks after today, for the "what's coming" line. */
  upcoming: Task[];
  cold: ColdLead[];
  /** How many days of quiet counts as cold. */
  coldAfterDays: number;
  /** Sent invoices past their due date. Above overdue tasks: late money is later than a late call. */
  unpaid: Invoice[];
  /** Retainer invoices Caulder drafted, waiting to be looked at and sent. */
  drafted: Invoice[];
  /** Replies to email sent from Caulder, from the last seven days. */
  replies: EmailReply[];
  /** Running costs renewing soon, or overdue for it. */
  renewals: Renewal[];
  /** Filings, notice dates and expiries that are late or coming up. */
  deadlines: Deadline[];
  /** Who was reached, and who is still waiting to be. */
  reach: Reach;
  /** Quotes sent a week ago or more with no answer, or past their last day (part thirteen, phase 52). */
  quotesWaiting: Quote[];
};

/* ---- Settings -----------------------------------------------------------
 * A tiny key-value table. Only keys listed here are accepted, so a typo in a
 * caller becomes a type error rather than a silently orphaned row.
 * ------------------------------------------------------------------------ */

export const SETTING_KEYS = [
  "activeCompanyId",
  /**
   * Who this Caulder is, for two founders: a name every revision it writes
   * carries, and an id the shared brain knows it by. JSON.
   */
  "thisIsMe",
  "coldAfterDays",
  /**
   * Days until the built-in follow-up is due after a deal moves stage with
   * nothing planned. Never set means three; "0" means never.
   */
  "followUpDays",
  "notify",
  /**
   * The system-wide combination that opens the quick window. Never set means
   * DEFAULT_CAPTURE_SHORTCUT; empty means deliberately off. The two are kept
   * apart so turning it off survives a restart instead of being "defaulted"
   * back on.
   */
  "captureShortcut",
  /**
   * Whether closing the main window leaves Caulder in the tray. Never set
   * means yes: the tray icon and the key are the whole point of it running.
   */
  "keepInTray",
  /** Whether it has already said, once, that it is still in the tray. */
  "trayNoticed",
  /**
   * The Google web-app URL and its secret, encrypted by the OS.
   *
   * A key rather than its own table because it is one blob and there is one of
   * it. The value here is ciphertext: see services/credentials.ts for why it
   * is never stored readable and never handed back to the renderer.
   */
  "googleConnection",
  /** Whether to keep Google in step without being asked. Off by default. */
  "googleAuto",
  /**
   * What the script said about itself when last asked: its version, the Gmail
   * address it sends from and today's remaining sends. JSON. Kept so a
   * contact's page knows whether it can send without asking Google first.
   */
  "googleScript",
  /**
   * The AI service Ask the brain uses - which one, its address and its key -
   * encrypted by the OS like `googleConnection`. Empty once disconnected.
   */
  "aiConnection",
  /** The models that service offered when last asked, as JSON. */
  "aiModels",
  /** Which of them answers. */
  "aiModel",
  /** How much of the company goes with a question: small, medium, large or whole. */
  "aiContext",
  "aiScope",
  "aiLine",
  /** "1" once the first-run tour has been finished or skipped. */
  "tourDone",
  /**
   * Whether the desk widget comes back on launch. Never set means no: it is
   * the one part of Caulder that puts something on screen you did not open,
   * so it starts asked-for or not at all.
   */
  "widgetOpen",
  /** Where it sits in the stack: desktop, front or normal. See electron/main/desk.ts. */
  "widgetLevel",
  /** Where the resting pill was left, as {"x":n,"y":n}. Clamped onto a real screen on every launch. */
  "widgetSpot",
  // Set once the first launch of an installed copy has turned on opening at sign-in.
  "startupSet",
  /** The hour of the morning brief, "HH:MM"; never set is 09:00, empty is off. */
  "briefAt",
  /** The day the morning brief was last sent. */
  "briefed",
  /** The renewals already said, as "pageId|day|soon" or "|due" (JSON), kept only while each is in view. */
  "renewalsTold",
  /** "on" when understanding on this machine is switched off; on by default (PLAN.md, part five). */
  "understandOff",
  /** Loose memories not to offer moving again, as "pageId#hash" (JSON): *Not these*, phase 21. */
  "looseLeft",
  /**
   * When to ask, on Today, for support: a day, or "never" once answered for
   * good. Never set means Caulder was just opened for the first time; see
   * shared/support.ts (part six).
   */
  "supportAsk",
] as const;
export type SettingKey = (typeof SETTING_KEYS)[number];

/**
 * The key that opens the quick window from anywhere, until somebody picks
 * another. Ctrl and the Windows key, which sit together under the thumb and
 * left hand, and "A", the key that opens quick add inside Caulder - so it is
 * the same key, from everywhere. Ctrl+Alt+A came first and was awkward to
 * reach; Ctrl+Alt+Space was already held by another app on a real machine.
 * Electron writes the Windows key as Super; sayShortcut says it as Win.
 *
 * Not Ctrl and the Windows key alone: a system-wide key needs a key, not only
 * modifiers, so two modifiers by themselves cannot be claimed.
 */
/** Ctrl+Q, the owner's choice (23 October 2026); it was Ctrl+Win+A. Held, no other app gets Ctrl+Q. */
export const DEFAULT_CAPTURE_SHORTCUT = "Ctrl+Q";

/** "Ctrl+Win+A": an accelerator the way a person on Windows would say it. */
export function sayShortcut(accelerator: string): string {
  return accelerator
    .replace(/\bCommandOrControl\b|\bCmdOrCtrl\b|\bControl\b/g, "Ctrl")
    .replace(/\bSuper\b|\bMeta\b/g, "Win");
}

/**
 * The system timezone, used as the default when creating a company. Falls back
 * to UTC on the rare runtime that reports nothing.
 */
export function systemTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}


/* ---- Custom fields ------------------------------------------------------ */

export const FIELD_KINDS = ["text", "number", "date", "choice"] as const;
export type FieldKind = (typeof FIELD_KINDS)[number];

export const FIELD_KIND_LABEL: Record<FieldKind, string> = {
  text: "Text",
  number: "Number",
  date: "Date",
  choice: "One of a list",
};

export type CustomField = {
  id: string;
  companyId: string;
  name: string;
  kind: FieldKind;
  choices: string[];
  position: number;
};

export const customFieldInput = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Give the field a name.")
    .max(60, "Keep the name under 60 characters."),
  kind: z.enum(FIELD_KINDS),
  choices: z.array(z.string().trim().min(1)).max(30).default([]),
});

export type CustomFieldInput = z.infer<typeof customFieldInput>;

/* ---- The day ------------------------------------------------------------
 *
 * A block is part of a day. The distinction from a task is not pedantry: a
 * task is DUE ON a day and a block OCCUPIES some of one, so a task can sit in
 * a list and a block cannot. They are linked rather than merged, because the
 * question "what am I doing at three" and the question "what has to happen
 * today" have different answers and both are worth asking.
 * ------------------------------------------------------------------------ */

/**
 * Suggested shapes for a block, free text underneath.
 *
 * The list makes a day countable - "you planned four hours of deep work and
 * did one" is only sayable if the app knows which was which. The freedom
 * underneath means an unlisted kind never has to be forced into the wrong box.
 *
 * A working day's, since phase 32: Class, Studying, Break and Personal were
 * a student's, and blocks that had them are Away (migration 53). Away is
 * anything that is not work, without saying what - the calendar holds the
 * whole day, and what the hour is for is nobody's business but its owner's.
 */
export const BLOCK_KINDS = ["focus", "meeting", "call", "admin", "away"] as const;
export type BlockKind = (typeof BLOCK_KINDS)[number];

export const BLOCK_KIND_LABEL: Record<BlockKind, string> = {
  focus: "Deep work",
  meeting: "Meeting",
  call: "Call",
  admin: "Admin",
  away: "Away",
};

/** Who owns the block, and therefore who wins when both sides changed it. */
export type BlockSource = "caulder" | "google";

export type Block = {
  id: string;
  companyId: string;
  /** `YYYY-MM-DD`, in the workspace's own timezone. */
  day: string;
  /** `HH:MM`. Nine o'clock is nine o'clock; it is not an instant. */
  startsAt: string;
  minutes: number;
  title: string;
  kind: string | null;
  notes: string | null;
  /** The task this hour is set aside for, if it is set aside for one. */
  taskId: string | null;
  /** The repeat this came from, when it came from one. */
  seriesId: string | null;
  /** 'must' | 'should' | 'spare'. Null takes the kind's usual weight. */
  priority: string | null;
  /** Null | 'skipped' | 'moved'. Null and past means it happened. */
  outcome: string | null;
  /** Denormalised for display, the way `Task.leadName` is. */
  taskTitle: string | null;
  /** The brain page this time is for - a course, a hobby - when it was set aside from one. */
  pageId: string | null;
  pageTitle: string | null;
  /**
   * How long before this starts to say something.
   *
   * Null follows the workspace, a negative number means never. See
   * `shared/remind.ts`, which is the only place the rule lives.
   */
  remindMinutes: number | null;
  /** When it was mentioned, so it is mentioned once. */
  remindedAt: string | null;
  source: BlockSource;
  /** The Google event this mirrors, or null for a block that is ours. */
  externalId: string | null;
  /** Changed here and not yet pushed. */
  isDirty: boolean;
  createdAt: string;
  updatedAt: string;
  /** The contact this time is for (part thirteen, phase 57), and their name. */
  leadId: string | null;
  leadName: string | null;
  /** Billed by the hour: offered on the contact's page until it is on an invoice. */
  billable: boolean;
  /** The invoice that billed it, once one has. */
  invoiceId: string | null;
};

export const blockInput = z.object({
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "That is not a day."),
  startsAt: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "That is not a time."),
  minutes: z
    .number()
    .int("Use whole minutes.")
    .min(5, "Five minutes is the shortest block worth drawing.")
    .max(24 * 60, "A block cannot be longer than a day."),
  title: z
    .string()
    .trim()
    .min(1, "Give the block a name.")
    .max(200, "Keep it under 200 characters."),
  kind: optionalText(40),
  notes: optionalText(2000),
  taskId: z.string().nullable().default(null),
  priority: z.enum(["must", "should", "spare"]).nullable().default(null),
  /**
   * When to be told about it, if the workspace's own answer is not the one
   * you want for this block. Null follows the workspace; -1 means never.
   */
  remindMinutes: z
    .number()
    .int()
    .min(-1, "That is not a reminder.")
    .max(24 * 60, "A day is as far ahead as a reminder can be set.")
    .nullable()
    .default(null),
  /**
   * Whom the time is for, and whether it is billed by the hour (PLAN.md,
   * part thirteen, phase 57). Read only when a block is made; after that it
   * is changed apart from the form (`hours:set-for`), so a drag or a sync
   * that saves the block cannot forget it.
   */
  forClient: z.object({ leadId: z.string().min(1), billable: z.boolean() }).nullable().optional(),
  /**
   * How it repeats, if it does. ISO weekday numbers and a last day.
   *
   * Part of the block's own input rather than a separate call, because
   * "every Tuesday until December" is one decision made once, in one
   * form, and splitting it into two steps is how the second one gets
   * forgotten.
   */
  repeat: z
    .object({
      weekdays: z.array(z.number().int().min(1).max(7)).min(1).max(7),
      until: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "That is not a day."),
      /** Every week, or every other week (PLAN.md, part twelve, phase 47). */
      every: z.union([z.literal(1), z.literal(2)]).optional(),
    })
    .nullable()
    .default(null),
});

export type BlockInput = z.infer<typeof blockInput>;
export type BlockDraft = z.input<typeof blockInput>;

/**
 * How a block is laid out when it shares its hours with another.
 *
 * Overlap is allowed. A day where two things genuinely clash is a day worth
 * seeing clashing - refusing to store it would just mean planning it somewhere
 * else. So the geometry is computed rather than prevented: `columns` is how
 * many blocks share this stretch and `column` is which one this is.
 */
export type LaidOutBlock = Block & { column: number; columns: number };

/**
 * Seven days at once.
 *
 * Deliberately thinner than seven DayPlans. The week is read to see shape —
 * where the empty afternoons are, which day is overfull — and the tasks,
 * notes, breakdown and focus session that make a day worth opening are all
 * answers to questions you ask about one day, not seven.
 */
export type WeekPlan = {
  /** The Monday. */
  from: string;
  days: {
    day: string;
    blocks: LaidOutBlock[];
    /** Minutes accounted for, so a heavy day is visible from the heading. */
    planned: number;
    /** What falls due that day. */
    deadlines: Deadline[];
  }[];
};

export type DayPlan = {
  day: string;
  blocks: LaidOutBlock[];
  /** Open tasks due on this day, so the plan can be built out of real work. */
  tasks: Task[];
  /** Filings, notice dates and expiries falling on this day, done or not. */
  deadlines: Deadline[];
  notes: Note[];
  /** Minutes accounted for, by block kind. What "four hours of admin" reads off. */
  spent: { kind: string; minutes: number }[];
  /** Total minutes planned, and how many of them have already gone. */
  planned: number;
  elapsed: number;
  /** The session running right now, if one is. */
};

/* ---- Notes --------------------------------------------------------------
 *
 * Deliberately not an activity. `activities.lead_id` is NOT NULL, and the
 * whole point of catching a thought is that it does not belong to anything
 * yet. Making it belong to a lead first is how the thought gets lost.
 * ------------------------------------------------------------------------ */

export type Note = {
  id: string;
  companyId: string;
  body: string;
  /** The day it was caught. */
  day: string;
  isPinned: boolean;
  createdAt: string;
  updatedAt: string;
};

export const noteInput = z.object({
  body: z
    .string()
    .trim()
    .min(1, "There is nothing to save.")
    .max(8000, "Keep a note under 8000 characters."),
});

/* ---- The Google link ----------------------------------------------------
 *
 * Caulder still calls nothing on its own behalf. It talks to a script running
 * in the user's own Google account, which is what lets this work without a
 * Cloud project, a client secret in the binary, or Google's review process.
 * ------------------------------------------------------------------------ */

/** What the last sync did, and over what range. */
export type GoogleSync = {
  lastSyncedAt: string | null;
  /**
   * The window that was actually asked about. Absence from Google's answer
   * means "deleted" only inside it, which is what stops one narrow sync
   * erasing a year of history.
   */
  syncedFrom: string | null;
  syncedTo: string | null;
  pushed: number;
  pulled: number;
  /** Changed on both sides. The owner won; this is how many times. */
  conflicts: number;
  lastError: string | null;
};

/** What Settings needs to draw the whole feature. */
export type GoogleState = {
  /** Whether a URL and key are stored. The values themselves never come back. */
  connected: boolean;
  /**
   * False when the OS will not encrypt secrets at rest, in which case Caulder
   * refuses to store the key rather than keeping it readable.
   */
  canStore: boolean;
  account: string | null;
  calendars: { id: string; name: string }[];
  taskLists: { id: string; name: string }[];
  calendarId: string | null;
  taskListId: string | null;
  /** Whether it syncs on its own. Off until asked for. */
  auto: boolean;
  sync: GoogleSync;
  /** What the script said about itself when last asked; null before it ever has. */
  script: {
    version: number;
    /** The version this build ships. Older than this means "update the script". */
    latest: number;
    address: string | null;
    remaining: number | null;
    mailError: string | null;
  } | null;
};

/* ---- Money ---------------------------------------------------------------
 * Quotes, invoices, payments and spend. Whole units of the workspace's
 * currency throughout, the same rule as leads.value. See PLAN.md, phase 3.
 * ------------------------------------------------------------------------- */

export const QUOTE_STATUSES = ["draft", "sent", "accepted", "declined"] as const;
export type QuoteStatus = (typeof QUOTE_STATUSES)[number];

export const QUOTE_STATUS_LABEL: Record<QuoteStatus, string> = {
  draft: "Draft",
  sent: "Sent",
  accepted: "Accepted",
  declined: "Declined",
};

export const INVOICE_STATUSES = ["draft", "sent", "paid", "void"] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

export const INVOICE_STATUS_LABEL: Record<InvoiceStatus, string> = {
  draft: "Draft",
  sent: "Sent",
  paid: "Paid",
  void: "Void",
};

const dayString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "That is not a day.");

export const moneyLineInput = z.object({
  description: z
    .string()
    .trim()
    .min(1, "Say what the line is for.")
    .max(200, "Keep a line under 200 characters."),
  quantity: z
    .number()
    .positive("A quantity has to be more than nothing.")
    .max(100_000, "That is too many."),
  /** Whole units of the currency. Zero is allowed: a free line is a real line. */
  unitPrice: z.number().int("Whole units of the currency.").min(0, "A price cannot be negative."),
  /**
   * The product it is, when it came from the catalogue. The words and the
   * price stay the line's own: what was charged is what was charged, whatever
   * the catalogue says later.
   */
  productId: z.string().nullable().optional(),
  /** The tax on it, as a percentage; null for none. Left out, the line takes the product's, or the client's usual. */
  taxRate: z.number().min(0, "A tax rate cannot be negative.").max(100, "A tax rate is at most 100%.").nullable().optional(),
});
export type MoneyLineInput = z.infer<typeof moneyLineInput>;

/** How a document is taxed (shared/tax.ts). Left out of a new one, it is worked out from the company and the client. */
const docTaxInput = z.object({
  treatment: z.enum(TAX_TREATMENTS).nullable(),
  inclusive: z.boolean(),
});


export const quoteInput = z.object({
  leadId: z.string().min(1, "Pick a contact."),
  /** The deal it is for. Left out, it is the contact's main deal. */
  dealId: z.string().nullable().optional(),
  issuedOn: dayString,
  notes: optionalText(2000),
  lines: z.array(moneyLineInput).min(1, "Add at least one line.").max(50, "Fifty lines is the limit."),
  tax: docTaxInput.optional(),
  /** A quote's last good day (phase 52); not used by an invoice. */
  validUntil: dayString.nullable().optional(),
});
export type QuoteInput = z.infer<typeof quoteInput>;

/** How often an invoice is written again for the same contact: a retainer. */
export const INVOICE_REPEATS = ["monthly", "quarterly", "yearly"] as const;
export type InvoiceRepeat = (typeof INVOICE_REPEATS)[number];

export const INVOICE_REPEAT_LABEL: Record<InvoiceRepeat, string> = {
  monthly: "Every month",
  quarterly: "Every quarter",
  yearly: "Every year",
};

/** How many months on the next one is. */
export const INVOICE_REPEAT_MONTHS: Record<InvoiceRepeat, number> = { monthly: 1, quarterly: 3, yearly: 12 };

export const invoiceInput = quoteInput
  .extend({ dueOn: dayString, repeats: z.enum(INVOICE_REPEATS).nullable().optional() })
  .refine((input) => input.dueOn >= input.issuedOn, {
    message: "An invoice cannot be due before it was issued.",
    path: ["dueOn"],
  });
export type InvoiceInput = z.infer<typeof invoiceInput>;

export const paymentInput = z.object({
  amount: z.number().int("Whole units of the currency.").positive("A payment has to be more than nothing."),
  paidOn: dayString,
  note: optionalText(500),
  /** What the client kept back as tax and paid in the company's name: India's TDS (migration 62). */
  withheld: z.number().int("Whole units of the currency.").min(0, "Withheld tax cannot be less than nothing.").default(0),
});
/** As typed: `withheld` may be left out, and is nothing. */
export type PaymentInput = z.input<typeof paymentInput>;

export const spendEntryInput = z.object({
  spentOn: dayString,
  /** Never zero; negative is a refund. */
  amount: z
    .number()
    .int("Whole units of the currency.")
    .refine((value) => value !== 0, "An amount of nothing is not a spend."),
  what: z.string().trim().min(1, "Say what it was for.").max(200, "Keep it under 200 characters."),
});
export type SpendEntryInput = z.infer<typeof spendEntryInput>;

export type MoneyLine = {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  /** The product it came from, if it did, and that product's name now. */
  productId: string | null;
  productName: string | null;
  /** Its tax, as a percentage; null for none. */
  taxRate: number | null;
};

/** What a quote or an invoice adds up to, with its tax (shared/tax.ts `taxed`). */
type DocMoney = {
  /** Before tax. */
  subtotal: number;
  /** The tax, one line a component and a rate. Empty when none is charged. */
  tax: TaxLine[];
  /** Said on it when tax is not charged, and why: a reverse charge, an export. */
  taxNote: string | null;
  taxTreatment: TaxTreatment | null;
  taxInclusive: boolean;
  /**
   * Its number as printed, searched for and chased by: "INV-0042", or as the
   * company writes them - "PK/26-27/0042" (shared/invoicelook.ts). A quote's
   * is always "Q-0007".
   */
  label: string;
};

export type Quote = {
  id: string;
  companyId: string;
  leadId: string;
  leadName: string;
  dealId: string | null;
  dealTitle: string | null;
  number: number;
  status: QuoteStatus;
  issuedOn: string;
  notes: string | null;
  /** What it comes to, tax and all. */
  total: number;
  lines: MoneyLine[];
  createdAt: string;
  /** Its last good day, or null. */
  validUntil: string | null;
} & DocMoney;

export type Payment = {
  id: string;
  invoiceId: string;
  /** What came in. */
  amount: number;
  /** What the client withheld as tax (TDS): paid towards the invoice, but not money in the bank. */
  withheld: number;
  paidOn: string;
  note: string | null;
};

export type Invoice = {
  id: string;
  companyId: string;
  leadId: string;
  leadName: string;
  dealId: string | null;
  dealTitle: string | null;
  quoteId: string | null;
  number: number;
  status: InvoiceStatus;
  issuedOn: string;
  dueOn: string;
  paidOn: string | null;
  notes: string | null;
  total: number;
  /** What has come in against it so far. */
  paid: number;
  lines: MoneyLine[];
  payments: Payment[];
  createdAt: string;
  /**
   * A retainer: how often it is written again. On the newest invoice of the
   * run only - when the next is drafted, the saying moves to the draft.
   */
  repeats: InvoiceRepeat | null;
  /**
   * The reminders that have gone about it (shared/chase.ts): read from the
   * emails sent to its contact with its number in the subject, so nothing is
   * kept to say so. Null when none has, and for an invoice that is not owed.
   */
  reminded: { at: string; times: number } | null;
} & DocMoney;

export type SpendEntry = {
  id: string;
  spentOn: string;
  amount: number;
  what: string;
};

/** The Money screen: this month's four numbers, and the three lists. */
export type MoneyOverview = {
  /** The month the figures are for, as YYYY-MM in the company's timezone. */
  month: string;
  currency: string;
  quoted: number;
  invoiced: number;
  paid: number;
  spent: number;
  /** The monthly target, or null when none is set or the target is not monthly. */
  target: number | null;
  invoices: Invoice[];
  quotes: Quote[];
  spend: SpendEntry[];
  /** Sent, past due, unpaid. Also on Today. */
  overdue: Invoice[];
  /** The tax charged on what was invoiced this quarter, by component and rate: what the return asks (phase 51). */
  taxQuarter: { from: string; to: string; lines: TaxLine[] };
  /** The next ninety days: owed and due, retainers to come, running costs (phase 54). */
  ahead: Ahead;
  /** Who the money comes from (phase 55). */
  clients: { clients: ClientMoney[]; mostOfIt: ClientMoney | null };
};

/** A sent invoice past its due date. Worked out when read, never stored. */
export function isOverdueInvoice(invoice: Invoice, day: string): boolean {
  return invoice.status === "sent" && invoice.dueOn < day;
}

/** "INV-0007", "Q-0003". */
export function documentNumber(kind: "quote" | "invoice", number: number): string {
  return `${kind === "quote" ? "Q" : "INV"}-${String(number).padStart(4, "0")}`;
}

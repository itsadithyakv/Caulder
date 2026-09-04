import { z } from "zod";

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

export const ACCENT_IDS = ["blue", "teal", "violet", "amber", "rose"] as const;
export type AccentId = (typeof ACCENT_IDS)[number];

export const ACCENT_LABEL: Record<AccentId, string> = {
  blue: "Blue",
  teal: "Teal",
  violet: "Violet",
  amber: "Amber",
  rose: "Rose",
};

export const DEFAULT_ACCENT: AccentId = "blue";

/* ---- Company ------------------------------------------------------------ */

export const companyInput = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Give the company a name.")
    .max(80, "Keep the name under 80 characters."),
  accent: z.enum(ACCENT_IDS),
  timezone: z.string().trim().min(1),
});

export type CompanyInput = z.infer<typeof companyInput>;

export type Company = {
  id: string;
  name: string;
  accent: AccentId;
  timezone: string;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
  /** Denormalised for the switcher and the sidebar. Not stored. */
  leadCount: number;
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

export const leadInput = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Give the lead a name.")
    .max(160, "Keep the name under 160 characters."),
  contactPerson: optionalText(120),
  email: optionalText(200),
  phone: optionalText(60),
  altPhone: optionalText(60),
  location: optionalText(300),
  city: optionalText(120),
  pin: optionalText(20),
  source: optionalText(160),
  website: optionalText(300),
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
  stageId: z.string().nullable().default(null),
});

export type LeadInput = z.infer<typeof leadInput>;

export type Lead = {
  id: string;
  companyId: string;
  stageId: string | null;
  name: string;
  contactPerson: string | null;
  email: string | null;
  phone: string | null;
  altPhone: string | null;
  location: string | null;
  city: string | null;
  pin: string | null;
  source: string | null;
  website: string | null;
  value: number | null;
  tags: string[];
  notes: string | null;
  lastContactedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

/** What the table asks for. Every field is optional and they combine with AND. */
export type LeadQuery = {
  companyId: string;
  /** Matched against name, contact, email, phone and city. */
  search?: string;
  stageId?: string | null;
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
] as const;

export type ActivityKind = (typeof ACTIVITY_KINDS)[number];

/** The kinds a person can add by hand. The rest are written by the app. */
export const LOGGABLE_KINDS = ["note", "call", "meeting"] as const;
export type LoggableKind = (typeof LOGGABLE_KINDS)[number];

export const ACTIVITY_LABEL: Record<ActivityKind, string> = {
  created: "Created",
  note: "Note",
  call: "Call",
  meeting: "Meeting",
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
  return kind === "call" || kind === "meeting";
}

/* ---- The board ----------------------------------------------------------
 * The pipeline, as the screen needs it: columns with their own totals, and
 * cards carrying only what a card shows.
 * ------------------------------------------------------------------------ */

export type BoardCard = {
  id: string;
  name: string;
  city: string | null;
  contactPerson: string | null;
  value: number | null;
  lastContactedAt: string | null;
  /** Whether anything is planned. A card with no next step is how one drifts. */
  hasNextStep: boolean;
};

export type BoardColumn = {
  /** Null for the Unstaged column, which appears only when it has cards. */
  stageId: string | null;
  name: string;
  kind: StageKind;
  /** Every lead in the column, even where more cards exist than are rendered. */
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

export type Task = {
  id: string;
  companyId: string;
  leadId: string | null;
  /** Denormalised for display: Today lists tasks, not leads. */
  leadName: string | null;
  title: string;
  kind: TaskKind;
  status: TaskStatus;
  dueOn: string;
  notes: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export const taskInput = z.object({
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
});

export type TaskInput = z.infer<typeof taskInput>;

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

export type Today = {
  /** The company's own day, so the UI never recomputes it differently. */
  day: string;
  overdue: Task[];
  dueToday: Task[];
  /** Open tasks after today, for the "what's coming" line. */
  upcoming: Task[];
  cold: ColdLead[];
  /** How many days of quiet counts as cold. */
  coldAfterDays: number;
  /** Messages due to go out, waiting on an export. */
  emailsReady: number;
  /** Leads who replied and have heard nothing back. The warmest thing here. */
  awaitingReply: { leadId: string; leadName: string | null; subject: string; repliedAt: string | null }[];
  /**
   * When a log was last read back. The bridge is manual, so an outbox exported
   * and never reconciled is the failure this surfaces.
   */
  lastSyncAt: string | null;
  /** True when something was exported after the last log came back. */
  syncOverdue: boolean;
};

/* ---- Settings -----------------------------------------------------------
 * A tiny key-value table. Only keys listed here are accepted, so a typo in a
 * caller becomes a type error rather than a silently orphaned row.
 * ------------------------------------------------------------------------ */

export const SETTING_KEYS = [
  "activeCompanyId",
  "syncFolder",
  "coldAfterDays",
  "mailProvider",
] as const;
export type SettingKey = (typeof SETTING_KEYS)[number];

/**
 * The system timezone, used as the default when creating a company. Falls back
 * to UTC on the rare runtime that reports nothing.
 */
export function systemTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

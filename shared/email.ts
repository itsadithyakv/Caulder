import { z } from "zod";

/**
 * Email, and the file bridge to Google Apps Script.
 *
 * Caulder never sends anything. Apps Script runs in Google's cloud, Caulder
 * runs offline on a PC, and neither can call the other — so the handover is
 * files, and the whole design turns on making a file-based exchange safe to
 * repeat.
 */

/* ---- The status ladder --------------------------------------------------
 * A message climbs: queued -> exported -> sent -> opened -> replied.
 *
 * Log files do not arrive in the order they were written, and the same log can
 * be imported twice. Both are survivable only because the ladder never goes
 * backwards: an "opened" row arriving after a "replied" row is ignored rather
 * than losing the reply.
 * ------------------------------------------------------------------------ */

/**
 * What actually does the sending, on the other side of the bridge.
 *
 * Stored only so the setup guide can show the right instructions. Caulder
 * sends through none of them and never talks to any of them.
 */
export const MAIL_PROVIDERS = ["gmail", "zoho", "smtp"] as const;
export type MailProvider = (typeof MAIL_PROVIDERS)[number];

export const EMAIL_STATUSES = [
  "queued",
  "exported",
  "sent",
  "opened",
  "replied",
  "failed",
  "skipped",
  "bounced",
] as const;

export type EmailStatus = (typeof EMAIL_STATUSES)[number];

/**
 * How far along the ladder each status sits.
 *
 * `failed` and `skipped` sit below `sent` on purpose: a failure is not
 * progress, and a message that fails and is later reported sent should end up
 * sent. Retry moves a message back to `queued` explicitly rather than by rank.
 */
const RANK: Record<EmailStatus, number> = {
  queued: 0,
  exported: 1,
  failed: 2,
  skipped: 2,
  sent: 3,
  opened: 4,
  replied: 5,
  /**
   * Above everything, because a bounce is the most durable fact a message can
   * report and the only one that asks the user to do something. A message that
   * bounced must not be quietly moved back to "sent" by a later log row, and
   * an open registered while the bounce notice itself was processed must not
   * hide it. A genuine reply followed by a bounce for the SAME message id does
   * not happen - the two are mutually exclusive for one send.
   */
  bounced: 6,
};

export function isForward(from: EmailStatus, to: EmailStatus): boolean {
  return RANK[to] > RANK[from];
}

export const EMAIL_STATUS_LABEL: Record<EmailStatus, string> = {
  queued: "Queued",
  exported: "Waiting on the script",
  sent: "Sent",
  opened: "Opened",
  replied: "Replied",
  failed: "Failed",
  bounced: "Bounced",
  skipped: "Skipped",
};

/** Retry policy, ported from Unifloe's email worker. */
export const MAX_ATTEMPTS = 5;

/** Capped exponential backoff, in minutes: 2, 4, 8, 16, 32, then 60. */
export function backoffMinutes(attemptCount: number): number {
  return Math.min(60, 2 ** Math.max(1, attemptCount));
}

/* ---- The bridge files ---------------------------------------------------
 * Two CSVs. Caulder writes the outbox; Apps Script writes the log.
 * ------------------------------------------------------------------------ */

export const OUTBOX_COLUMNS = [
  "message_id",
  "lead_id",
  "to_email",
  "subject",
  "body_html",
  "scheduled_for",
] as const;

export const LOG_COLUMNS = [
  "message_id",
  "status",
  "sent_at",
  "provider_message_id",
  "thread_id",
  "opened_at",
  "replied_at",
  "bounced_at",
  "error",
] as const;

export type LogRow = {
  messageId: string;
  status: EmailStatus;
  sentAt: string | null;
  providerMessageId: string | null;
  threadId: string | null;
  openedAt: string | null;
  repliedAt: string | null;
  bouncedAt: string | null;
  error: string | null;
};

/** What a log import did, reported back so the user can see it landed. */
export type IngestResult = {
  filename: string;
  rows: number;
  /** Rows that moved a message along the ladder. */
  applied: number;
  /** Rows that were already known, or would have moved a message backwards. */
  ignored: number;
  /** Rows whose message_id matches nothing here. */
  unmatched: number;
  /** True when this exact file has been read before. */
  duplicate: boolean;
};

export type ExportResult = {
  path: string;
  count: number;
};

/* ---- Templates ---------------------------------------------------------- */

/**
 * Variables a template may use. Anything else is left alone rather than
 * replaced with a blank, so a typo is visible instead of silently deleting
 * half a sentence.
 */
export const TEMPLATE_VARIABLES = [
  { token: "{{lead.name}}", describes: "The lead's name" },
  { token: "{{lead.greeting}}", describes: "The contact person, or \"there\"" },
  { token: "{{lead.contact}}", describes: "The contact person, blank if unknown" },
  { token: "{{lead.city}}", describes: "The lead's city" },
  { token: "{{company.name}}", describes: "Your company's name" },
] as const;

export const templateInput = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Give the template a name.")
    .max(80, "Keep the name under 80 characters."),
  subject: z
    .string()
    .trim()
    .min(1, "A subject line is not optional.")
    .max(200, "Keep the subject under 200 characters."),
  body: z.string().trim().min(1, "Write something to send.").max(20000),
});

export type TemplateInput = z.infer<typeof templateInput>;

export type EmailTemplate = {
  id: string;
  companyId: string;
  name: string;
  subject: string;
  body: string;
  createdAt: string;
  updatedAt: string;
};

/* ---- Messages ----------------------------------------------------------- */

export type EmailMessage = {
  id: string;
  messageId: string;
  leadId: string;
  leadName: string | null;
  toEmail: string;
  subject: string;
  body: string;
  status: EmailStatus;
  scheduledFor: string;
  attemptCount: number;
  sentAt: string | null;
  openedAt: string | null;
  repliedAt: string | null;
  bouncedAt: string | null;
  /** The reason, for a failure or a bounce. Cleared by any other step. */
  failure: string | null;
  createdAt: string;
};

export const queueInput = z.object({
  leadId: z.string().min(1),
  toEmail: z.string().trim().min(3, "That lead has no email address."),
  subject: z.string().trim().min(1, "A subject line is not optional.").max(200),
  body: z.string().trim().min(1, "Write something to send.").max(20000),
  /** A calendar day. Nothing is exported before it. */
  scheduledFor: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date."),
});

export type QueueInput = z.infer<typeof queueInput>;

/* ---- Sequences ---------------------------------------------------------- */

export type SequenceStep = {
  id: string;
  templateId: string;
  templateName: string;
  position: number;
  /** Days after the previous step was actually sent. Step one is 0. */
  offsetDays: number;
};

export type Sequence = {
  id: string;
  companyId: string;
  name: string;
  isActive: boolean;
  steps: SequenceStep[];
  activeCount: number;
};

export const sequenceInput = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Give the sequence a name.")
    .max(80, "Keep the name under 80 characters."),
});

export type SequenceInput = z.infer<typeof sequenceInput>;

/* ---- Sync history ------------------------------------------------------- */

export type SyncBatch = {
  id: string;
  direction: "outbox" | "log";
  filename: string;
  rowCount: number;
  applied: number;
  ignored: number;
  unmatched: number;
  createdAt: string;
};

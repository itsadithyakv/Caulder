import { z } from "zod";

/**
 * Email that Caulder sends through the Google script.
 *
 * Pure: the shapes on both sides of the bridge, the input a person gives, and
 * the one rule that decides how a message's state moves when the script
 * reports on it. The sending is in electron/main/services/mail.ts and the
 * script itself in resources/appsscript/Caulder.gs.
 */

export type EmailStatus = "scheduled" | "sent" | "replied" | "failed" | "cancelled";
export type FollowUpStatus = "waiting" | "sent" | "skipped" | "cancelled" | "failed";

/** One message, as a contact's page shows it. */
export type EmailRecord = {
  id: string;
  leadId: string;
  to: string;
  subject: string;
  body: string;
  /** When it was set to go; null for a message sent at once. */
  sendAt: string | null;
  status: EmailStatus;
  sentAt: string | null;
  repliedAt: string | null;
  error: string | null;
  followUp: {
    days: number;
    status: FollowUpStatus;
    sentAt: string | null;
    error: string | null;
  } | null;
  createdAt: string;
};

/** A reply worth showing on Today. */
export type EmailReply = {
  emailId: string;
  leadId: string;
  leadName: string;
  subject: string;
  repliedAt: string;
};

/** Whether a contact's page can send from here, and if not, why not. */
export type MailState = {
  ready: boolean;
  reason: string | null;
  /** The Gmail address messages go out from. */
  address: string | null;
  /** Sends Gmail still allows today, as the script last reported it. */
  remaining: number | null;
};

/** Longest a follow-up may wait, in days. The script holds the same limit. */
export const FOLLOW_UP_MAX_DAYS = 60;

/** How far ahead a message may be scheduled, in days. */
export const SCHEDULE_MAX_DAYS = 60;

/** How long after sending a thread is watched for a reply, in days. */
const WATCH_DAYS = 30;

export const sendEmailInput = z.object({
  leadId: z.string().min(1, "Missing contact."),
  subject: z
    .string()
    .trim()
    .min(1, "Give the email a subject.")
    .max(250, "Keep the subject under 250 characters."),
  body: z
    .string()
    .trim()
    .min(1, "Write the message first.")
    .max(20_000, "That message is too long to send from here."),
  /** An instant with an offset, or null to send now. */
  sendAt: z
    .string()
    .refine((value) => !Number.isNaN(Date.parse(value)), "That send time is not a date.")
    .nullable(),
  followUp: z
    .object({
      days: z
        .number()
        .int("Give a whole number of days.")
        .min(1, "A follow-up waits at least a day.")
        .max(FOLLOW_UP_MAX_DAYS, `A follow-up waits at most ${FOLLOW_UP_MAX_DAYS} days.`),
      templateId: z.string().min(1, "Pick the template the follow-up uses."),
    })
    .nullable(),
});

export type SendEmailInput = z.input<typeof sendEmailInput>;

/** What the script says about one message. It never sends the body back. */
export type RemoteEmail = {
  id: string;
  status: EmailStatus | "missing";
  sentAt: string | null;
  repliedAt: string | null;
  error: string | null;
  followUp: { status: FollowUpStatus; sentAt: string | null; error: string | null } | null;
};

/** The parts of a stored message that the script can change. */
export type EmailProgress = {
  status: EmailStatus;
  sentAt: string | null;
  repliedAt: string | null;
  error: string | null;
  followUpStatus: FollowUpStatus | null;
  followUpSentAt: string | null;
  followUpError: string | null;
};

/** Something that happened, for the contact's history. */
export type EmailEvent = "sent" | "replied" | "failed" | "bounced" | "follow_up_sent" | "follow_up_failed";

type EmailChange = {
  next: EmailProgress;
  events: EmailEvent[];
  /** Nothing further can change, so the script can forget it. */
  settled: boolean;
};

const RANK: Record<EmailStatus, number> = {
  scheduled: 0,
  sent: 1,
  replied: 2,
  failed: 3,
  cancelled: 3,
};

const FINAL_FOLLOW_UP = new Set<FollowUpStatus>(["sent", "skipped", "cancelled", "failed"]);

/**
 * How a message moves when the script reports on it.
 *
 * Four rules:
 *
 *  - **It never goes backwards.** A report that is behind what Caulder already
 *    knows - a retried call, a report crossing a cancel - changes nothing, so
 *    reading the same status twice is harmless.
 *  - **Each event happens once.** "Sent" is written to the history when the
 *    message first becomes sent, not every time it is reported sent.
 *  - **A message the script has lost is said to have failed** if it was still
 *    waiting to go, because it never will. One already sent is left alone.
 *  - **Settled means nothing more can happen**: replied, failed or cancelled
 *    with no follow-up waiting, or sent long enough ago that nobody is
 *    watching for a reply any more.
 */
export function planEmailChange(
  current: EmailProgress,
  remote: RemoteEmail,
  now: Date,
): EmailChange {
  const events: EmailEvent[] = [];

  if (remote.status === "missing") {
    if (current.status !== "scheduled") {
      return { next: current, events, settled: true };
    }
    return {
      next: {
        ...current,
        status: "failed",
        error:
          "The Google script no longer has this message, so it was never sent. The script was probably set up again as a new project; send it again.",
        followUpStatus: current.followUpStatus === "waiting" ? "cancelled" : current.followUpStatus,
      },
      events: ["failed"],
      settled: true,
    };
  }

  let next: EmailProgress = { ...current };

  if (RANK[remote.status] > RANK[current.status]) {
    const wasSent = current.status !== "scheduled";
    next = {
      ...next,
      status: remote.status,
      sentAt: remote.sentAt ?? current.sentAt,
      repliedAt: remote.repliedAt ?? current.repliedAt,
      error: remote.error ?? current.error,
    };
    if (!wasSent && remote.sentAt) events.push("sent");
    if (remote.status === "replied") events.push("replied");
    if (remote.status === "failed") {
      events.push(remote.error?.startsWith("It bounced") ? "bounced" : "failed");
    }
  }

  if (
    remote.followUp &&
    current.followUpStatus &&
    !FINAL_FOLLOW_UP.has(current.followUpStatus) &&
    remote.followUp.status !== current.followUpStatus
  ) {
    next = {
      ...next,
      followUpStatus: remote.followUp.status,
      followUpSentAt: remote.followUp.sentAt,
      followUpError: remote.followUp.error,
    };
    if (remote.followUp.status === "sent") events.push("follow_up_sent");
    if (remote.followUp.status === "failed") events.push("follow_up_failed");
  }

  return { next, events, settled: isSettled(next, now) };
}

function isSettled(progress: EmailProgress, now: Date): boolean {
  if (progress.followUpStatus === "waiting") return false;
  if (progress.status === "scheduled") return false;
  if (progress.status !== "sent") return true;
  if (!progress.sentAt) return false;
  const watchedUntil = Date.parse(progress.sentAt) + WATCH_DAYS * 24 * 60 * 60 * 1000;
  return now.getTime() > watchedUntil;
}

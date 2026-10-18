/**
 * Who has been written to, and who has answered (PLAN.md, part eight, phase
 * 33).
 *
 * Read from a contact's history, which is where every way of writing to
 * somebody already puts a line - nothing here is kept anywhere else, so it
 * cannot disagree with the history.
 *
 *  - **Written to** is an email sent, or a message on WhatsApp, LinkedIn or
 *    Instagram that the person said went. Not a call: ringing somebody is
 *    reaching them, and is not a message waiting for an answer.
 *  - **An answer** is a reply the mail saw, a meeting, or "They answered" put
 *    on the history by hand - the only way Caulder can know about a reply on
 *    WhatsApp or LinkedIn, which it cannot read.
 *  - It is the **last** message that counts. Somebody who answered in March
 *    and has said nothing to what was sent on Monday is waiting again.
 *
 * With the stage filter and *Write to them*, the middle one is a second
 * message to everybody who ignored the first, without a campaign to set up.
 */

/** What counts as having written to somebody. */
export const WRITTEN_KINDS = ["email_sent", "whatsapp", "linkedin", "instagram"] as const;
/** What counts as their having answered. */
export const ANSWER_KINDS = ["email_replied", "replied", "meeting"] as const;

/** How long a message is given before its silence is an answer of its own. */
export const REPLY_WAIT_DAYS = 3;

export const REACHED = ["never", "waiting", "answered"] as const;
export type Reached = (typeof REACHED)[number];

export const REACHED_LABEL: Record<Reached, string> = {
  never: "Not written to",
  waiting: `No answer in ${REPLY_WAIT_DAYS} days`,
  answered: "Answered",
};

/* ---- Working through a list ---------------------------------------------- */

/** The places a message is written by hand: Caulder opens them and cannot send there. */
export const WALK_CHANNELS = ["whatsapp", "linkedin", "instagram"] as const;
export type WalkChannel = (typeof WALK_CHANNELS)[number];

export const WALK_LABEL: Record<WalkChannel, string> = {
  whatsapp: "WhatsApp",
  linkedin: "LinkedIn",
  instagram: "Instagram",
};

type Reachable = {
  name: string;
  phone: string | null;
  linkedin: string | null;
  instagram: string | null;
  doNotContact: boolean;
};

/** Why this contact cannot be written to there, in a few words, or null when they can. */
export function cannotReach(channel: WalkChannel, lead: Reachable): string | null {
  if (lead.doNotContact) return "marked do not contact";
  if (channel === "whatsapp") return lead.phone ? null : "no phone number";
  return lead[channel] ? null : `no ${WALK_LABEL[channel]} profile`;
}

/**
 * Who a walk goes through, in the order they were listed, and who is left
 * out of it and why - said before it starts, so nobody is skipped silently.
 */
export function queueFor<T extends Reachable>(channel: WalkChannel, leads: readonly T[]): { queue: T[]; leftOut: { lead: T; why: string }[] } {
  const queue: T[] = [];
  const leftOut: { lead: T; why: string }[] = [];
  for (const lead of leads) {
    const why = cannotReach(channel, lead);
    if (why === null) queue.push(lead);
    else leftOut.push({ lead, why });
  }
  return { queue, leftOut };
}

/* ---- What is waiting on them, for Today ----------------------------------- */

/** The people written to in the last seven days, and what came back. */
export type Sent = {
  /** People, not messages: three emails to one contact is one person. */
  people: number;
  answered: number;
  waiting: number;
  /** How many days the longest-waiting of them has had, or null when nobody is waiting. */
  oldestDays: number | null;
};

export const NOBODY_SENT: Sent = { people: 0, answered: 0, waiting: 0, oldestDays: null };

/** "6 written to this week: 2 answered, 4 waiting - the oldest 9 days." Empty when nobody was written to. */
export function saySent(sent: Sent): string {
  if (sent.people === 0) return "";
  const parts = [`${sent.answered} answered`, `${sent.waiting} waiting`];
  const oldest =
    sent.waiting > 0 && sent.oldestDays !== null && sent.oldestDays > 0
      ? ` - the oldest ${sent.oldestDays} ${sent.oldestDays === 1 ? "day" : "days"}`
      : "";
  return `${sent.people} written to this week: ${parts.join(", ")}${oldest}.`;
}

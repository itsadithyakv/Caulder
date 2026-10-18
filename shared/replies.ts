/**
 * Who answered, worked out from the headers of an inbox (PLAN.md, part eight).
 *
 * A mail account that is not the Google script - Zoho, Outlook, a domain of
 * your own - can be asked for its inbox, and that is the only way Caulder can
 * know somebody wrote back to a message that went from it. Pure: the lines a
 * mail server hands over are read here, and matched against what was sent.
 * The asking is `electron/main/services/inbox.ts`.
 *
 * **Only headers are ever read.** Who it is from, when, and which message it
 * answers. Never the subject, never the text. That is all "they replied"
 * needs, and what is not fetched cannot be kept, shown or leaked.
 */

/** The headers asked for, and nothing else. `services/inbox.ts` names these to the server. */
export const INBOX_HEADERS = ["FROM", "DATE", "MESSAGE-ID", "IN-REPLY-TO", "REFERENCES", "AUTO-SUBMITTED", "PRECEDENCE"] as const;

/** One message in an inbox, as far as Caulder looks at it. */
export type InboxHeaders = {
  /** The address it is from, lower case. */
  from: string | null;
  /** When it says it was sent, as an ISO moment; null when the date cannot be read. */
  date: string | null;
  /** The messages it says it answers, each as `<id@host>`. */
  answers: string[];
  /** Sent by a machine: an out-of-office, a bounce, a list. Not somebody answering. */
  auto: boolean;
};

const IDS = /<[^<>\s]+>/g;

/** A header's value with its folded lines joined, or null when the header is not there. */
function valueOf(lines: readonly string[], name: string): string | null {
  const head = `${name.toLowerCase()}:`;
  const line = lines.find((each) => each.toLowerCase().startsWith(head));
  return line ? line.slice(head.length).trim() : null;
}

/** The address in a From header: the part in angle brackets, or the whole of a bare one. */
function addressOf(from: string | null): string | null {
  if (!from) return null;
  const inBrackets = /<([^<>\s]+@[^<>\s]+)>/.exec(from);
  const bare = /([^\s<>"(),;:]+@[^\s<>"(),;:]+)/.exec(from);
  return (inBrackets?.[1] ?? bare?.[1] ?? null)?.toLowerCase() ?? null;
}

/** An RFC 5322 date as an ISO moment. A trailing "(IST)" is a comment, and is taken off first. */
function momentOf(date: string | null): string | null {
  if (!date) return null;
  const at = Date.parse(date.replace(/\s*\([^)]*\)\s*$/, ""));
  return Number.isFinite(at) ? new Date(at).toISOString() : null;
}

/** One message's headers, as the server sent them, read. */
export function readHeaders(block: string): InboxHeaders {
  // A header may run over several lines; a line that starts with a space carries on the one before.
  const lines = block.replace(/\r?\n[ \t]+/g, " ").split(/\r?\n/);
  const from = addressOf(valueOf(lines, "From"));
  const submitted = valueOf(lines, "Auto-Submitted");
  const precedence = valueOf(lines, "Precedence");
  const answers = [...(valueOf(lines, "In-Reply-To")?.match(IDS) ?? []), ...(valueOf(lines, "References")?.match(IDS) ?? [])];
  return {
    from,
    date: momentOf(valueOf(lines, "Date")),
    answers: [...new Set(answers)],
    auto:
      (submitted !== null && submitted.toLowerCase() !== "no") ||
      (precedence !== null && /^(bulk|junk|list|auto_reply)$/i.test(precedence)) ||
      (from !== null && /^(mailer-daemon|postmaster|no-?reply|donotreply)@/i.test(from)),
  };
}

/** A message Caulder sent and is still listening for an answer to. */
export type SentMessage = {
  id: string;
  /** The Message-ID it went out with, as `<id@host>`; null for one sent before Caulder kept them. */
  messageId: string | null;
  /** Who it went to. */
  to: string;
  sentAt: string;
};

/** A clock on somebody else's server can be a little behind ours. */
const SKEW_MS = 2 * 60 * 1000;

/**
 * Which of the sent messages were answered, and when: the id of each, and the
 * moment of the first answer to it.
 *
 * **By thread first.** A reply names the message it answers, and that cannot
 * be mistaken. **Then by who it is from**: a message from the address we
 * wrote to, dated after we wrote, is them writing back even when their mail
 * program started a new thread - and it is counted against the latest thing
 * we sent them before it. A machine's answer - an out-of-office, a bounce -
 * is never somebody answering, and a follow-up should still go.
 */
export function repliesAmong(sent: readonly SentMessage[], inbox: readonly InboxHeaders[]): Map<string, string> {
  const replied = new Map<string, string>();
  const note = (id: string, at: string) => {
    const had = replied.get(id);
    if (!had || at < had) replied.set(id, at);
  };
  const byMessageId = new Map(sent.filter((each) => each.messageId).map((each) => [each.messageId as string, each]));

  for (const message of inbox) {
    if (message.auto || !message.date) continue;
    const at = Date.parse(message.date);

    const inThread = message.answers.map((id) => byMessageId.get(id)).find((each) => each && at >= Date.parse(each.sentAt) - SKEW_MS);
    if (inThread) {
      note(inThread.id, message.date);
      continue;
    }

    if (!message.from) continue;
    const latest = sent
      .filter((each) => each.to.toLowerCase() === message.from && Date.parse(each.sentAt) <= at)
      .sort((a, b) => b.sentAt.localeCompare(a.sentAt))[0];
    if (latest) note(latest.id, message.date);
  }
  return replied;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** A day the way a mail server is asked for it: 9-Oct-2026. The day before, so no time zone can cut a reply off. */
export function sinceDay(oldestSentAt: string): string {
  const day = new Date(Date.parse(oldestSentAt) - 24 * 60 * 60 * 1000);
  return `${day.getUTCDate()}-${MONTHS[day.getUTCMonth()]}-${day.getUTCFullYear()}`;
}

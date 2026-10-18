import { randomUUID } from "node:crypto";
import type { Db } from "../db/connection";
import type { Lead } from "@shared/domain";
import {
  SCHEDULE_MAX_DAYS,
  sendEmailInput,
  type EmailRecord,
  type MailState,
  type RemoteEmail,
} from "@shared/mail";
import { render } from "@shared/render";
import { MAIL_SINCE_VERSION, SCRIPT_VERSION } from "@shared/script";
import { findTemplate } from "../repositories/email";
import { findLead } from "../repositories/leads";
import {
  applyReport,
  dueAccountEmails,
  dueAccountFollowUps,
  findEmail,
  forgettableEmailIds,
  heldForBarred,
  keepMessageId,
  listEmailsForLead,
  markForgotten,
  recordEmail,
  settleAccountEmail,
  watchedEmailIds,
} from "../repositories/mail";
import { getSetting, setSetting } from "../repositories/settings";
import { isConnected } from "./credentials";
import { callScript, hello, type Hello } from "./gsync";
import { accountReadsReplies, checkReplies, inboxInOrder, mailSenders, newMessageId, sendFromAccount } from "./mailaccounts";
import { isFault, logProblem } from "../log";

/**
 * Sending email through the script in the user's own Google account.
 *
 * Caulder never holds a Gmail password or token. It hands a message to the
 * script, which sends it as the account it runs in, and asks later what
 * became of it. A message due now is sent while Caulder waits, so a mistake -
 * a full quota, a bad address - comes back on screen rather than later.
 */

/** What the script said about itself the last time Caulder asked. */
type ScriptInfo = {
  version: number;
  latest: number;
  address: string | null;
  remaining: number | null;
  mailError: string | null;
  checkedAt: string;
};

export function rememberScript(db: Db, said: Hello, now: Date = new Date()): void {
  const info: ScriptInfo = {
    // A script too old to say its version is the first one.
    version: said.version ?? 1,
    latest: SCRIPT_VERSION,
    address: said.mail?.address ?? null,
    remaining: said.mail?.remaining ?? null,
    mailError: said.mailError ?? null,
    checkedAt: now.toISOString(),
  };
  setSetting(db, "googleScript", JSON.stringify(info));
}

export function forgetScript(db: Db): void {
  setSetting(db, "googleScript", "");
}

export function scriptInfo(db: Db): ScriptInfo | null {
  const raw = getSetting(db, "googleScript");
  if (!raw) return null;
  try {
    return { ...(JSON.parse(raw) as ScriptInfo), latest: SCRIPT_VERSION };
  } catch {
    return null;
  }
}

function notReady(reason: string): Omit<MailState, "senders"> {
  return { ready: false, reason, address: null, remaining: null };
}

/**
 * Whether a contact's page can send from here.
 *
 * Answered from what was stored the last time the script was asked, so a
 * contact's page does not wait on Google to draw. Only a connection made
 * before this build - which never stored the answer - asks once.
 */
/**
 * Where a message can go from, and whether it can go at all. The script is
 * what sees replies, so it is first when it is ready; another account makes
 * sending possible without it.
 */
export async function mailState(db: Db): Promise<MailState> {
  const script = await scriptState(db);
  const senders = mailSenders(db, script);
  const first = senders[0];
  if (script.ready || !first) return { ...script, senders };
  return { ready: true, reason: null, address: first.address, remaining: null, senders };
}

async function scriptState(db: Db): Promise<Omit<MailState, "senders">> {
  if (!isConnected()) {
    return notReady("Connect Google in Settings to send from here and see replies.");
  }

  let info = scriptInfo(db);
  if (!info) {
    try {
      rememberScript(db, await hello());
      info = scriptInfo(db);
    } catch (error) {
      return notReady(error instanceof Error ? error.message : String(error));
    }
  }
  if (!info) return notReady("Caulder could not read what your Google script can do.");

  if (info.version < MAIL_SINCE_VERSION) {
    return notReady(
      "Your Google script is an older version that cannot send email. Settings shows how to update it in a minute.",
    );
  }
  if (info.mailError) return notReady(info.mailError);

  return { ready: true, reason: null, address: info.address, remaining: info.remaining };
}

/** Most the script is asked to hold for one message, body and follow-up together. */
const HOLD_LIMIT_BYTES = 6000;

const MINUTE = 60 * 1000;
const DAY = 24 * 60 * MINUTE;

/** Null for now; a time within the next minute is now as well. */
function scheduleFor(sendAt: string | null, now: Date): string | null {
  if (sendAt === null) return null;
  const at = new Date(sendAt);
  if (at.getTime() <= now.getTime() + MINUTE) return null;
  if (at.getTime() > now.getTime() + SCHEDULE_MAX_DAYS * DAY) {
    throw new Error(`Schedule it up to ${SCHEDULE_MAX_DAYS} days ahead.`);
  }
  return at.toISOString();
}

/** The follow-up's text, filled in for this contact now, so what goes is what was chosen. */
function followUpFor(
  db: Db,
  lead: Lead,
  choice: { days: number; templateId: string },
): { days: number; body: string } {
  const template = findTemplate(db, choice.templateId);
  if (!template || template.companyId !== lead.companyId) {
    throw new Error("That template no longer exists. Pick another for the follow-up.");
  }
  if (template.channel === "whatsapp") {
    throw new Error("That is a WhatsApp template. Pick an email one for the follow-up.");
  }

  const company = db.prepare(`SELECT name FROM companies WHERE id = ?`).get(lead.companyId) as
    | { name: string }
    | undefined;
  const body = render(template.body, {
    leadName: lead.name,
    leadContact: lead.contactPerson,
    leadCity: lead.city,
    companyName: company?.name ?? "",
  }).trim();
  if (body.length === 0) throw new Error("That template has no text to send as a follow-up.");

  return { days: choice.days, body };
}

/** The template a message says it came from, when it is one of this company's; otherwise none. */
function templateOf(db: Db, id: string | null, companyId: string): string | null {
  if (!id) return null;
  const template = findTemplate(db, id);
  return template && template.companyId === companyId ? template.id : null;
}

export async function sendEmail(db: Db, raw: unknown, now: Date = new Date()): Promise<EmailRecord[]> {
  const input = sendEmailInput.parse(raw);

  const lead = findLead(db, input.leadId);
  if (!lead) throw new Error("That contact no longer exists.");
  // Refused here, where the sending happens, whatever the screen shows.
  if (lead.doNotContact) throw new Error(`${lead.name} is marked do not contact.`);
  if (!lead.email) throw new Error(`${lead.name} has no email address.`);

  if (input.accountId) return sendByAccount(db, { ...input, accountId: input.accountId }, lead, now);

  const state = await scriptState(db);
  if (!state.ready) throw new Error(state.reason ?? "Email cannot be sent from here yet.");

  const sendAt = scheduleFor(input.sendAt, now);
  const followUp = input.followUp ? followUpFor(db, lead, input.followUp) : null;

  // The script keeps a waiting message in a store that holds about 9 kB an
  // entry. A message sent now is not kept there; only what has to wait is.
  const held = `${sendAt ? input.body : ""}${followUp?.body ?? ""}`;
  if (Buffer.byteLength(held, "utf8") > HOLD_LIMIT_BYTES) {
    throw new Error(
      "That is too long for your Google script to hold until it goes. Shorten the message or its follow-up, or send it now.",
    );
  }

  const id = randomUUID();
  const templateId = templateOf(db, input.templateId, lead.companyId);
  const remote = await callScript<RemoteEmail>("sendEmail", {
    id,
    to: lead.email,
    subject: input.subject,
    body: input.body,
    sendAt,
    followUp,
  });

  recordEmail(
    db,
    {
      id,
      templateId,
      companyId: lead.companyId,
      leadId: lead.id,
      to: lead.email,
      subject: input.subject,
      body: input.body,
      sendAt,
      followUpDays: followUp?.days ?? null,
      followUpBody: followUp?.body ?? null,
    },
    remote,
    new Date(),
  );
  return listEmailsForLead(db, lead.id);
}

/**
 * From Zoho, Outlook or any other account: sent now while Caulder waits, or
 * kept and sent by Caulder when it is due. A follow-up needs somebody to see
 * whether they answered, so it is taken only from an account whose inbox is
 * read - and refused in words otherwise, rather than quietly never going.
 */
async function sendByAccount(
  db: Db,
  input: { accountId: string; templateId: string | null; subject: string; body: string; sendAt: string | null; followUp: { days: number; templateId: string } | null },
  lead: Lead,
  now: Date,
): Promise<EmailRecord[]> {
  if (!db.prepare(`SELECT 1 FROM mail_accounts WHERE id = ?`).get(input.accountId)) throw new Error("That account is not connected any more.");
  if (input.followUp && !accountReadsReplies(db, input.accountId)) {
    throw new Error(
      "A follow-up needs Caulder to see whether they replied. Switch on See replies for that account in Settings, send this from Gmail, or follow up by hand.",
    );
  }
  const followUp = input.followUp ? followUpFor(db, lead, input.followUp) : null;
  const to = lead.email as string;
  const sendAt = scheduleFor(input.sendAt, now);
  const id = randomUUID();
  const messageId = newMessageId(db, input.accountId);
  // Sent before anything is written: a message the server refused is not a message that was sent.
  if (!sendAt) await sendFromAccount(db, input.accountId, { to, subject: input.subject, body: input.body, messageId });
  const at = new Date().toISOString();
  const waiting = followUp ? { status: "waiting" as const, sentAt: null, error: null } : null;
  recordEmail(
    db,
    {
      id,
      accountId: input.accountId,
      templateId: templateOf(db, input.templateId, lead.companyId),
      messageId,
      companyId: lead.companyId,
      leadId: lead.id,
      to,
      subject: input.subject,
      body: input.body,
      sendAt,
      followUpDays: followUp?.days ?? null,
      followUpBody: followUp?.body ?? null,
    },
    sendAt
      ? { id, status: "scheduled", sentAt: null, repliedAt: null, error: null, followUp: waiting }
      : { id, status: "sent", sentAt: at, repliedAt: null, error: null, followUp: waiting },
    new Date(),
  );
  if (!sendAt) settleAccountEmail(db, id);
  return listEmailsForLead(db, lead.id);
}

/**
 * What is due from the other accounts, sent. Each one is written down as sent
 * or failed on its own, so one refused address does not hold up the rest.
 */
export async function sendDueAccountMail(db: Db, now: Date = new Date()): Promise<number> {
  // Stopped here too, not only skipped: skipped, it would sit as "scheduled"
  // for ever. This part is local, so it costs nothing to do every minute.
  await stopBarredMail(db, { own: true });
  let sent = 0;
  for (const email of dueAccountEmails(db, now.toISOString())) {
    try {
      const messageId = newMessageId(db, email.accountId);
      await sendFromAccount(db, email.accountId, { ...email, messageId });
      keepMessageId(db, email.id, messageId);
      applyReport(db, { id: email.id, status: "sent", sentAt: new Date().toISOString(), repliedAt: null, error: null, followUp: null }, new Date());
      sent += 1;
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      applyReport(db, { id: email.id, status: "failed", sentAt: null, repliedAt: null, error: reason, followUp: null }, new Date());
    }
    settleAccountEmail(db, email.id);
  }
  return sent + (await sendDueFollowUps(db, now));
}

/**
 * Follow-ups to messages that went from an account, when their days are up
 * and nobody has answered.
 *
 * **The inbox is looked at first, every time.** A follow-up to somebody who
 * replied an hour ago is the one mistake this feature must not make, so
 * nothing goes on the strength of a look ten minutes old - and when the
 * inbox cannot be read, the follow-up waits rather than goes blind.
 */
async function sendDueFollowUps(db: Db, now: Date): Promise<number> {
  if (dueAccountFollowUps(db, now.toISOString()).length === 0) return 0;
  await checkReplies(db, now);
  let sent = 0;
  // Read again: whoever answered is no longer waiting for one.
  for (const due of dueAccountFollowUps(db, now.toISOString())) {
    if (!inboxInOrder(db, due.accountId)) continue;
    const report = (followUp: { status: "sent" | "failed"; sentAt: string | null; error: string | null }) =>
      applyReport(db, { id: due.id, status: "sent", sentAt: null, repliedAt: null, error: null, followUp }, new Date());
    try {
      await sendFromAccount(db, due.accountId, {
        to: due.to,
        subject: /^re:/i.test(due.subject) ? due.subject : `Re: ${due.subject}`,
        body: due.body,
        messageId: newMessageId(db, due.accountId),
        inReplyTo: due.messageId,
      });
      report({ status: "sent", sentAt: new Date().toISOString(), error: null });
      sent += 1;
    } catch (error) {
      report({ status: "failed", sentAt: null, error: error instanceof Error ? error.message : String(error) });
    }
  }
  return sent;
}

/**
 * Stops everything still waiting to go to contacts marked do not contact -
 * one contact's, just after it was marked, or everybody's on a background
 * pass. Each is stopped on its own, so a script that cannot be reached leaves
 * its messages for the next pass without holding up Caulder's own. Returns
 * how many were stopped.
 */
export async function stopBarredMail(db: Db, options: { leadId?: string; own?: boolean } = {}): Promise<number> {
  let stopped = 0;
  for (const id of heldForBarred(db, options)) {
    try {
      await cancelEmail(db, id);
      stopped += 1;
    } catch (error) {
      if (isFault(error)) logProblem("email", error);
    }
  }
  return stopped;
}

/** Stops a message that has not gone, or a follow-up that is still waiting. */
export async function cancelEmail(db: Db, id: string): Promise<EmailRecord[]> {
  const email = findEmail(db, id);
  if (!email) throw new Error("That email no longer exists.");
  if (email.status !== "scheduled" && email.followUp?.status !== "waiting") {
    throw new Error("Nothing about that email is still waiting to be sent.");
  }
  // Kept by Caulder, not the script: cancelled here, and nowhere else to ask.
  const own = db.prepare(`SELECT account_id FROM emails WHERE id = ?`).get(id) as { account_id: string | null } | undefined;
  if (own?.account_id) {
    // A message that has not gone is cancelled; one that has, and has a follow-up waiting, loses only the follow-up.
    const followUp = email.followUp?.status === "waiting" ? { status: "cancelled" as const, sentAt: null, error: null } : null;
    applyReport(
      db,
      { id, status: email.status === "scheduled" ? "cancelled" : email.status, sentAt: null, repliedAt: null, error: null, followUp },
      new Date(),
    );
    settleAccountEmail(db, id);
    return listEmailsForLead(db, email.leadId);
  }

  const remote = await callScript<RemoteEmail>("cancelEmail", { id });
  applyReport(db, remote, new Date());
  return listEmailsForLead(db, email.leadId);
}

/**
 * Asks the script what became of every message still in play, and tells it
 * which settled ones it can forget.
 *
 * Forgetting is only recorded once the script has answered, so a call lost
 * on the way simply asks again next time.
 */
export async function syncEmails(db: Db, now: Date = new Date()): Promise<number> {
  // A contact marked do not contact while the script was out of reach still
  // has mail waiting there; this is where that is stopped once it answers.
  await stopBarredMail(db);
  const ids = watchedEmailIds(db);
  const forget = forgettableEmailIds(db);
  if (ids.length === 0 && forget.length === 0) return 0;

  const reply = await callScript<{ emails: RemoteEmail[]; remaining: number | null }>(
    "emailStatus",
    { ids, ack: forget },
  );

  db.transaction(() => {
    markForgotten(db, forget);
    for (const remote of reply.emails) applyReport(db, remote, now);
  })();

  const info = scriptInfo(db);
  if (info && typeof reply.remaining === "number") {
    setSetting(db, "googleScript", JSON.stringify({ ...info, remaining: reply.remaining }));
  }
  return reply.emails.length;
}

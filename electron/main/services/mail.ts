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
  findEmail,
  forgettableEmailIds,
  listEmailsForLead,
  markForgotten,
  recordEmail,
  watchedEmailIds,
} from "../repositories/mail";
import { getSetting, setSetting } from "../repositories/settings";
import { isConnected } from "./credentials";
import { callScript, hello, type Hello } from "./gsync";

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

function notReady(reason: string): MailState {
  return { ready: false, reason, address: null, remaining: null };
}

/**
 * Whether a contact's page can send from here.
 *
 * Answered from what was stored the last time the script was asked, so a
 * contact's page does not wait on Google to draw. Only a connection made
 * before this build - which never stored the answer - asks once.
 */
export async function mailState(db: Db): Promise<MailState> {
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

export async function sendEmail(db: Db, raw: unknown, now: Date = new Date()): Promise<EmailRecord[]> {
  const input = sendEmailInput.parse(raw);

  const lead = findLead(db, input.leadId);
  if (!lead) throw new Error("That contact no longer exists.");
  // Refused here, where the sending happens, whatever the screen shows.
  if (lead.doNotContact) throw new Error(`${lead.name} is marked do not contact.`);
  if (!lead.email) throw new Error(`${lead.name} has no email address.`);

  const state = await mailState(db);
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

/** Stops a message that has not gone, or a follow-up that is still waiting. */
export async function cancelEmail(db: Db, id: string): Promise<EmailRecord[]> {
  const email = findEmail(db, id);
  if (!email) throw new Error("That email no longer exists.");
  if (email.status !== "scheduled" && email.followUp?.status !== "waiting") {
    throw new Error("Nothing about that email is still waiting to be sent.");
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

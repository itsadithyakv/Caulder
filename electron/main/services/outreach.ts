import { shell } from "electron";
import type { Db } from "../db/connection";
import { findLead, writeActivity } from "../repositories/leads";
import { getSetting, setSetting } from "../repositories/settings";
import { phoneKey } from "@shared/normalise";

/**
 * WhatsApp, without a URL ever crossing the bridge.
 *
 * Selling to schools in India, a principal answers on WhatsApp. Caulder's only
 * outbound path was email through a file bridge to Apps Script, which is the
 * channel that gets read least.
 *
 * The shape here is the one `attachments.open` already uses, and for the same
 * reason: **the renderer passes an opaque id and a body of text, never a
 * destination.** Main reads the lead's own phone number out of the database
 * and builds the address itself, so the renderer cannot be talked into opening
 * anything else — which matters more here than for a file, because this one
 * ends in a browser.
 */

/**
 * The country code assumed for a bare ten-digit number.
 *
 * `phoneKey` strips 91 for comparison, which is right for deciding whether two
 * rows are the same person and wrong for dialling: wa.me needs the full
 * international number. The same assumption the importer already makes, made
 * explicit here rather than hidden in a template string.
 */
const DEFAULT_COUNTRY = "91";

function whatsAppLink(phone: string | null): string | null {
  const digits = phoneKey(phone);
  if (digits === null) return null;
  return `https://wa.me/${DEFAULT_COUNTRY}${digits}`;
}

/**
 * Opens WhatsApp on a lead's own number.
 *
 * Nothing is sent and nothing is recorded here. Caulder cannot know whether
 * the message actually went, so the screen asks afterwards and writes the
 * timeline entry only if the answer is yes — the same standard as "ticking a
 * task is not proof the call happened".
 */
export function openWhatsApp(db: Db, leadId: string, message: string): void {
  const lead = findLead(db, leadId);
  if (!lead) throw new Error("That lead no longer exists.");
  if (lead.doNotContact) {
    throw new Error(`${lead.name} is marked do not contact.`);
  }

  const link = whatsAppLink(lead.phone);
  if (link === null) {
    throw new Error(`${lead.name} has no usable phone number.`);
  }

  const text = message.trim();
  void shell.openExternal(text.length === 0 ? link : `${link}?text=${encodeURIComponent(text)}`);
}

/**
 * A number as the computer's dialler wants it: as written when it already
 * carries its country, otherwise with the same default country WhatsApp uses.
 */
function dialLink(phone: string | null): string | null {
  if (phone === null) return null;
  const written = phone.trim();
  if (/^\+\d[\d\s().-]{6,}$/.test(written)) return `tel:${written.replace(/[\s().-]/g, "")}`;
  const digits = phoneKey(written);
  return digits === null ? null : `tel:+${DEFAULT_COUNTRY}${digits}`;
}

/**
 * Hands a contact's number to whatever places calls on this machine - Phone
 * Link, Teams, a softphone. Same shape as WhatsApp: the renderer names the
 * contact and which number, never the number itself. Nothing is recorded
 * here; the prompter asks how the call went.
 */
export function openDialler(db: Db, leadId: string, which: "phone" | "alt"): void {
  const lead = findLead(db, leadId);
  if (!lead) throw new Error("That contact no longer exists.");
  if (lead.doNotContact) throw new Error(`${lead.name} is marked do not contact.`);
  const link = dialLink(which === "alt" ? lead.altPhone : lead.phone);
  if (link === null) throw new Error(`${lead.name} has no number to dial.`);
  void shell.openExternal(link);
}

/**
 * Opens a message to a lead in whatever handles mail on this machine.
 *
 * The same shape as WhatsApp: the renderer never sees the address. Nothing is
 * sent and nothing is recorded here; `logEmailSent` is the person saying it
 * went.
 */
export function openMail(db: Db, leadId: string, subject: string, body: string): void {
  const lead = findLead(db, leadId);
  if (!lead) throw new Error("That lead no longer exists.");
  if (lead.doNotContact) {
    throw new Error(`${lead.name} is marked do not contact.`);
  }
  if (!lead.email) {
    throw new Error(`${lead.name} has no email address.`);
  }

  const query = new URLSearchParams();
  if (subject.trim().length > 0) query.set("subject", subject.trim());
  if (body.trim().length > 0) query.set("body", body);
  // URLSearchParams writes spaces as "+", which a mail client reads literally.
  const encoded = query.toString().replace(/\+/g, "%20");
  void shell.openExternal(`mailto:${encodeURIComponent(lead.email)}${encoded ? `?${encoded}` : ""}`);
}

/**
 * The person says the email went. That is contact, so last-contacted moves,
 * the same as a logged call - and the going-quiet list stays true.
 */
export function logEmailSent(db: Db, leadId: string, subject: string, body: string): void {
  const lead = findLead(db, leadId);
  if (!lead) throw new Error("That lead no longer exists.");
  const now = new Date().toISOString();
  const text = [subject.trim(), body.trim()].filter((part) => part.length > 0).join("\n\n");

  db.transaction(() => {
    writeActivity(db, {
      companyId: lead.companyId,
      leadId,
      kind: "email_sent",
      body: text.length > 0 ? text : null,
      occurredAt: now,
    });
    db.prepare(`UPDATE leads SET last_contacted_at = ?, updated_at = ? WHERE id = ?`).run(
      now,
      now,
      leadId,
    );
  })();
}

/** Never set means three days. Zero is off. */
const DEFAULT_FOLLOW_UP_DAYS = 3;

export function followUpDays(db: Db): number {
  const raw = getSetting(db, "followUpDays");
  if (raw === null) return DEFAULT_FOLLOW_UP_DAYS;
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : DEFAULT_FOLLOW_UP_DAYS;
}

export function setFollowUpDays(db: Db, days: number): number {
  if (!Number.isInteger(days) || days < 0 || days > 365) {
    throw new Error("Give a whole number of days, up to a year. Zero means never.");
  }
  setSetting(db, "followUpDays", String(days));
  return days;
}

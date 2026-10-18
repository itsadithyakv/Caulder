import { daysBetween } from "./dates";
import { documentNumber, type Invoice } from "./domain";

/**
 * Money that asks for itself (PLAN.md, part eight, phase 34).
 *
 * An unpaid invoice used to say it was late and stop. It can now be chased
 * from the row it is on: a reminder, written here and read before it goes,
 * sent the way any email to a contact is sent - so it is on their history,
 * a reply is seen where replies are seen, and somebody marked do not contact
 * is not written to. A second is offered a week after the first. Nothing is
 * ever sent by itself.
 *
 * Whether an invoice has been chased is read from the emails that went to
 * its contact with its number in the subject, not kept anywhere: so a
 * reminder written by hand from the contact's page counts too.
 */

/** How long after a reminder another is offered. */
const REMIND_AGAIN_DAYS = 7;

/** How many days past its due day an invoice is. Nought or less is not late. */
export function daysLate(invoice: Pick<Invoice, "dueOn">, day: string): number {
  return daysBetween(invoice.dueOn, day);
}

/**
 * What an overdue invoice's row offers: a first reminder, another once a
 * week has gone by, or nothing yet because one went lately.
 */
export function chaseOffer(invoice: Pick<Invoice, "status" | "dueOn" | "reminded">, day: string): "first" | "again" | "wait" | null {
  if (invoice.status !== "sent" || daysLate(invoice, day) <= 0) return null;
  if (!invoice.reminded) return "first";
  return daysBetween(invoice.reminded.at.slice(0, 10), day) >= REMIND_AGAIN_DAYS ? "again" : "wait";
}

/** The words of a reminder, for the person to read and change before it goes. */
export function reminderFor(told: {
  invoice: Pick<Invoice, "number" | "issuedOn" | "dueOn" | "total" | "paid" | "reminded">;
  company: string;
  /** Who it is written to, when the contact has a person named on it. */
  person: string | null;
  day: string;
  /** Money and days as they are written where the company is. */
  money: (value: number) => string;
  date: (day: string) => string;
}): { subject: string; body: string } {
  const { invoice } = told;
  const number = documentNumber("invoice", invoice.number);
  const late = daysLate(invoice, told.day);
  const again = (invoice.reminded?.times ?? 0) > 0;
  const owed = invoice.total - invoice.paid;
  const first = (told.person ?? "").trim().split(/\s+/)[0] ?? "";
  return {
    subject: `${again ? "Second reminder" : "Reminder"}: invoice ${number} from ${told.company}`,
    body: [
      first ? `Hello ${first},` : "Hello,",
      "",
      `${again ? "I wrote before about invoice" : "Invoice"} ${number} for ${told.money(invoice.total)}, issued on ${told.date(invoice.issuedOn)}${
        again ? ". It" : ","
      } was due on ${told.date(invoice.dueOn)}${late === 1 ? ", yesterday" : late > 1 ? `, ${late} days ago` : ""}.${
        invoice.paid > 0 ? ` ${told.money(invoice.paid)} has come in, and ${told.money(owed)} is still owed.` : ""
      }`,
      "",
      "Could you tell me when it will be paid? If it already has been, thank you, and please ignore this.",
      "",
      told.company,
    ].join("\n"),
  };
}

type Bucket = { count: number; amount: number };

/**
 * What is owed, by how late it is: not yet due, up to thirty days late, and
 * over thirty. Of invoices that were sent and are not paid, by what is still
 * owed on each.
 */
export function owedByAge(invoices: readonly Pick<Invoice, "status" | "dueOn" | "total" | "paid">[], day: string): { notDue: Bucket; late: Bucket; veryLate: Bucket; total: number } {
  const out = { notDue: { count: 0, amount: 0 }, late: { count: 0, amount: 0 }, veryLate: { count: 0, amount: 0 }, total: 0 };
  for (const invoice of invoices) {
    const owed = invoice.total - invoice.paid;
    if (invoice.status !== "sent" || owed <= 0) continue;
    const by = daysLate(invoice, day);
    const bucket = by <= 0 ? out.notDue : by <= 30 ? out.late : out.veryLate;
    bucket.count += 1;
    bucket.amount += owed;
    out.total += owed;
  }
  return out;
}

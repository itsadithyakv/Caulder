import type { Db } from "../db/connection";
import { shiftDay } from "@shared/dates";
import type { Invoice } from "@shared/domain";
import type { HoursToBill } from "@shared/hours";
import { rateOfHour, termsFor } from "./billing";
import { saveInvoice } from "./money";

/**
 * Hours to invoice (PLAN.md, part thirteen, phase 57): time set aside for a
 * contact and marked billable is offered on their page once it has
 * happened, and becomes the lines of a draft invoice - one a block, its
 * hours at the client's rate. A block is billed once: it keeps the invoice
 * that billed it, and comes back to be billed if that draft is deleted.
 *
 * Who a block is for is set apart from the block's own form, the way a
 * client's billing details are: a drag on the calendar or a sync from Google
 * saves a block too, and none of them should forget whom the time was for.
 */

/** Says whom a block's time is for, and whether it is billed by the hour. */
export function setBlockFor(db: Db, blockId: string, input: { leadId: string | null; billable: boolean }): void {
  const block = db.prepare(`SELECT company_id, invoice_id FROM blocks WHERE id = ?`).get(blockId) as { company_id: string; invoice_id: string | null } | undefined;
  if (!block) throw new Error("That block no longer exists.");
  if (input.leadId) {
    const lead = db.prepare(`SELECT 1 FROM leads WHERE id = ? AND company_id = ?`).get(input.leadId, block.company_id);
    if (!lead) throw new Error("That contact is not in this company.");
  }
  if (block.invoice_id) throw new Error("That time is on an invoice already. Delete the draft to change it.");
  db.prepare(`UPDATE blocks SET lead_id = ?, billable = ?, updated_at = ? WHERE id = ?`).run(
    input.leadId,
    input.leadId && input.billable ? 1 : 0,
    new Date().toISOString(),
    blockId,
  );
}

/** Billable time for a contact that has happened and is on no invoice: not skipped, and up to today. */
export function hoursToBill(db: Db, companyId: string, leadId: string, today: string): HoursToBill {
  const blocks = (
    db
      .prepare(
        `SELECT id, day, starts_at, minutes, title FROM blocks
          WHERE company_id = ? AND lead_id = ? AND billable = 1 AND invoice_id IS NULL
            AND day <= ? AND (outcome IS NULL OR outcome <> 'skipped')
          ORDER BY day, starts_at`,
      )
      .all(companyId, leadId, today) as { id: string; day: string; starts_at: string; minutes: number; title: string }[]
  ).map((row) => ({ id: row.id, day: row.day, startsAt: row.starts_at, minutes: row.minutes, title: row.title }));
  const minutes = blocks.reduce((sum, block) => sum + block.minutes, 0);
  const rate = rateOfHour(db, companyId, leadId);
  // What the invoice will say: a line a block, each rounded as a line is.
  const amount = rate === null ? null : blocks.reduce((sum, block) => sum + Math.round(hoursOf(block.minutes) * rate), 0);
  return { blocks, minutes, rate, amount };
}

/** A block's hours as a line's quantity: to the hundredth. */
const hoursOf = (minutes: number) => Math.round((minutes / 60) * 100) / 100;

/**
 * The hours as a draft invoice: a line a block, "Title, 14 Oct", its hours at
 * the rate. Refused, in a sentence, when there is no rate to bill them at.
 */
export function billHours(db: Db, companyId: string, leadId: string, today: string): Invoice {
  const hours = hoursToBill(db, companyId, leadId, today);
  if (hours.blocks.length === 0) throw new Error("There are no hours to bill for them.");
  if (hours.rate === null) throw new Error("Set an hourly rate first: on their page, or for every client in Settings.");
  const rate = hours.rate;
  return db.transaction(() => {
    const invoice = saveInvoice(db, companyId, null, {
      leadId,
      issuedOn: today,
      dueOn: shiftDay(today, termsFor(db, companyId, leadId)),
      notes: null,
      lines: hours.blocks.map((block) => ({
        description: `${block.title}, ${block.day}`,
        quantity: hoursOf(block.minutes),
        unitPrice: rate,
        productId: null,
      })),
    });
    const mark = db.prepare(`UPDATE blocks SET invoice_id = ?, updated_at = ? WHERE id = ?`);
    for (const block of hours.blocks) mark.run(invoice.id, new Date().toISOString(), block.id);
    return invoice;
  })();
}

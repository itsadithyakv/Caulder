import { randomUUID } from "node:crypto";
import type { Db } from "../db/connection";
import { addMonths, dayOf, shiftDay, today as todayIn } from "@shared/dates";
import { clientRegion, companyRegion, rateFor, taxed, treatmentFor, type TaxTreatment } from "@shared/tax";
import { clientTax, companyTax, termsFor } from "./billing";
import { listCosts } from "./costs";
import { aheadOf, clientsOf } from "@shared/insights";
import { readTaxRules, resolveTaxRules } from "@shared/taxrules";
import { formatInvoiceNumber, readInvoiceLook } from "@shared/invoicelook";
import type { TaxLine } from "@shared/tax";
import { findDeal, mainDeal, setDealValue } from "./deals";
import { productInCompany } from "./products";
import {
  INVOICE_REPEAT_MONTHS,
  documentNumber,
  isOverdueInvoice,
  type InvoiceRepeat,
  type Invoice,
  type InvoiceInput,
  type InvoiceStatus,
  type MoneyLine,
  type MoneyLineInput,
  type MoneyOverview,
  type PaidFromInput,
  type Payment,
  type PaymentInput,
  type Quote,
  type QuoteInput,
  type QuoteStatus,
  type SpendEntry,
  type SpendEntryInput,
} from "@shared/domain";

/**
 * Quotes, invoices, payments and spend.
 *
 * Three rules, and the third is the one that keeps the ledger honest:
 *
 *  1. **Every write returns the overview.** A payment changes the invoice,
 *     the month's paid figure and the overdue list; the screen re-reads all of
 *     it rather than patching three things by hand.
 *  2. **Numbers are per company and never reused.** `MAX + 1` inside the
 *     same transaction as the insert, with a UNIQUE constraint behind it.
 *  3. **Paid is derived from payments.** An invoice is paid when the payments
 *     cover the total, and stops being paid if one is removed. Nothing here
 *     lets a status be typed that the money does not support.
 */

type DocRow = {
  id: string;
  company_id: string;
  lead_id: string;
  lead_name: string;
  deal_id: string | null;
  deal_title: string | null;
  quote_id?: string | null;
  number: number;
  status: string;
  issued_on: string;
  due_on?: string;
  paid_on?: string | null;
  notes: string | null;
  created_at: string;
  repeats?: string | null;
  tax_treatment: string | null;
  tax_inclusive: number;
  tax_region: string | null;
  valid_until?: string | null;
  company_country: string | null;
  company_tax_rules: string | null;
  company_invoice_look: string | null;
};

type LineRow = {
  id: string;
  parent_id: string;
  description: string;
  quantity: number;
  unit_price: number;
  product_id: string | null;
  product_name: string | null;
  tax_rate: number | null;
};

type PaymentRow = {
  id: string;
  invoice_id: string;
  amount: number;
  withheld: number;
  paid_on: string;
  note: string | null;
};

const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);

/**
 * A document's money, with its tax, as it was taxed when it was made
 * (shared/tax.ts) and named as the company names it (shared/taxrules.ts) -
 * and its number as the company writes them.
 */
function moneyOf(row: DocRow, lines: MoneyLine[], kind: "quote" | "invoice") {
  const treatment = (row.tax_treatment ?? null) as TaxTreatment | null;
  const inclusive = row.tax_inclusive === 1;
  const rules = resolveTaxRules(row.company_country, readTaxRules(row.company_tax_rules));
  const money = taxed(lines, { treatment, inclusive, country: row.company_country, region: row.tax_region, name: rules.name });
  const label =
    kind === "quote"
      ? documentNumber("quote", row.number)
      : formatInvoiceNumber(readInvoiceLook(row.company_invoice_look).numbering, row.number, row.issued_on, rules.yearStarts);
  return { subtotal: money.subtotal, tax: money.tax, taxNote: money.note, taxTreatment: treatment, taxInclusive: inclusive, total: money.total, label };
}

function linesFor(db: Db, table: "quote_lines" | "invoice_lines", parentIds: string[]): Map<string, MoneyLine[]> {
  const byParent = new Map<string, MoneyLine[]>();
  if (parentIds.length === 0) return byParent;
  const column = table === "quote_lines" ? "quote_id" : "invoice_id";
  const rows = db
    .prepare(
      `SELECT t.id, t.${column} AS parent_id, t.description, t.quantity, t.unit_price,
              t.product_id, p.name AS product_name, t.tax_rate
         FROM ${table} t
         LEFT JOIN products p ON p.id = t.product_id
        WHERE t.${column} IN (${parentIds.map(() => "?").join(",")})
        ORDER BY t.position`,
    )
    .all(...parentIds) as LineRow[];
  for (const row of rows) {
    const list = byParent.get(row.parent_id) ?? [];
    list.push({
      id: row.id,
      description: row.description,
      quantity: row.quantity,
      unitPrice: row.unit_price,
      productId: row.product_id,
      productName: row.product_name,
      taxRate: row.tax_rate,
    });
    byParent.set(row.parent_id, list);
  }
  return byParent;
}

function paymentsFor(db: Db, invoiceIds: string[]): Map<string, Payment[]> {
  const byInvoice = new Map<string, Payment[]>();
  if (invoiceIds.length === 0) return byInvoice;
  const rows = db
    .prepare(
      `SELECT id, invoice_id, amount, withheld, paid_on, note FROM payments
        WHERE invoice_id IN (${invoiceIds.map(() => "?").join(",")})
        ORDER BY paid_on, created_at`,
    )
    .all(...invoiceIds) as PaymentRow[];
  for (const row of rows) {
    const list = byInvoice.get(row.invoice_id) ?? [];
    list.push({
      id: row.id,
      invoiceId: row.invoice_id,
      amount: row.amount,
      withheld: row.withheld,
      paidOn: row.paid_on,
      note: row.note,
    });
    byInvoice.set(row.invoice_id, list);
  }
  return byInvoice;
}

/* ---- Quotes ------------------------------------------------------------- */

const QUOTE_SELECT = `
  SELECT q.id, q.company_id, q.lead_id, l.name AS lead_name, q.deal_id, d.title AS deal_title,
         q.number, q.status, q.issued_on, q.notes, q.created_at,
         q.tax_treatment, q.tax_inclusive, q.tax_region, q.valid_until, c.country AS company_country,
         c.tax_rules AS company_tax_rules, c.invoice_look AS company_invoice_look
    FROM quotes q
    JOIN leads l ON l.id = q.lead_id
    JOIN companies c ON c.id = q.company_id
    LEFT JOIN deals d ON d.id = q.deal_id`;

function toQuotes(db: Db, rows: DocRow[]): Quote[] {
  const lines = linesFor(db, "quote_lines", rows.map((row) => row.id));
  return rows.map((row) => {
    const own = lines.get(row.id) ?? [];
    return {
      id: row.id,
      companyId: row.company_id,
      leadId: row.lead_id,
      leadName: row.lead_name,
      dealId: row.deal_id,
      dealTitle: row.deal_title,
      number: row.number,
      status: row.status as QuoteStatus,
      issuedOn: row.issued_on,
      notes: row.notes,
      lines: own,
      createdAt: row.created_at,
      validUntil: row.valid_until ?? null,
      ...moneyOf(row, own, "quote"),
    };
  });
}

function listQuotes(db: Db, companyId: string): Quote[] {
  const rows = db
    .prepare(`${QUOTE_SELECT} WHERE q.company_id = ? ORDER BY q.issued_on DESC, q.number DESC`)
    .all(companyId) as DocRow[];
  return toQuotes(db, rows);
}

export function findQuote(db: Db, id: string): Quote | null {
  const row = db.prepare(`${QUOTE_SELECT} WHERE q.id = ?`).get(id) as DocRow | undefined;
  return row ? (toQuotes(db, [row])[0] ?? null) : null;
}

function nextNumber(db: Db, table: "quotes" | "invoices", companyId: string): number {
  const row = db
    .prepare(`SELECT COALESCE(MAX(number), 0) + 1 AS next FROM ${table} WHERE company_id = ?`)
    .get(companyId) as { next: number };
  return row.next;
}

function writeLines(
  db: Db,
  table: "quote_lines" | "invoice_lines",
  companyId: string,
  parentId: string,
  lines: MoneyLineInput[],
  /** The rate a line takes when it says none: the client's usual, or null when no tax is charged. */
  usual: number | null = null,
): void {
  const column = table === "quote_lines" ? "quote_id" : "invoice_id";
  db.prepare(`DELETE FROM ${table} WHERE ${column} = ?`).run(parentId);
  const insert = db.prepare(
    `INSERT INTO ${table} (id, ${column}, position, description, quantity, unit_price, product_id, tax_rate)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  lines.forEach((line, index) => {
    const productId = line.productId ? productInCompany(db, companyId, line.productId) : null;
    // A line that does not say: the product's rate when it has one, else the client's usual.
    const own = productId ? (db.prepare(`SELECT tax_rate FROM products WHERE id = ?`).get(productId) as { tax_rate: number | null } | undefined)?.tax_rate : null;
    const rate = line.taxRate !== undefined ? line.taxRate : usual === null ? null : (own ?? usual);
    insert.run(randomUUID(), parentId, index, line.description, line.quantity, line.unitPrice, productId, rate);
  });
}

/**
 * How a document is taxed: as it says, or - new, and saying nothing - worked
 * out from the company's settings and where the client is. An edit that says
 * nothing keeps what it had.
 */
function taxFor(
  db: Db,
  companyId: string,
  leadId: string,
  said: QuoteInput["tax"],
  kept: { treatment: string | null; inclusive: number; region: string | null } | null,
): { treatment: TaxTreatment | null; inclusive: boolean; region: string | null; usual: number | null } {
  const company = companyTax(db, companyId);
  const client = clientTax(db, leadId);
  const region = company.country === "CA" || company.country === "IN" ? (clientRegion(client, company.country) ?? companyRegion(company)) : null;
  const treatment = said ? said.treatment : kept ? ((kept.treatment ?? null) as TaxTreatment | null) : treatmentFor(company, client);
  const inclusive = said ? said.inclusive : kept ? kept.inclusive === 1 : company.inclusive;
  return { treatment, inclusive, region: kept && !said ? kept.region : region, usual: rateFor(company, client, treatment) };
}

function assertLeadInCompany(db: Db, companyId: string, leadId: string): void {
  const row = db.prepare(`SELECT 1 FROM leads WHERE id = ? AND company_id = ?`).get(leadId, companyId);
  if (!row) throw new Error("That contact is not in this company.");
}

/**
 * The deal a quote or an invoice is for: the one named, which has to be the
 * contact's. Failing that, an edit keeps the deal the document already had,
 * so fixing a typo does not move it onto whichever deal is newest; and a new
 * document goes on the contact's main deal - or none, for a contact with no
 * deals at all.
 */
function dealFor(
  db: Db,
  table: "quotes" | "invoices",
  id: string | null,
  leadId: string,
  dealId: string | null | undefined,
): string | null {
  if (dealId) {
    const deal = findDeal(db, dealId);
    if (!deal || deal.leadId !== leadId) throw new Error("That deal is not this contact's.");
    return deal.id;
  }
  if (id !== null) {
    const kept = db
      .prepare(`SELECT d.id FROM ${table} x JOIN deals d ON d.id = x.deal_id WHERE x.id = ? AND d.lead_id = ?`)
      .get(id, leadId) as { id: string } | undefined;
    if (kept) return kept.id;
  }
  return mainDeal(db, leadId)?.id ?? null;
}

export function saveQuote(db: Db, companyId: string, id: string | null, input: QuoteInput): Quote {
  assertLeadInCompany(db, companyId, input.leadId);
  const now = new Date().toISOString();
  const dealId = dealFor(db, "quotes", id, input.leadId, input.dealId);

  const quoteId = db.transaction(() => {
    if (id === null) {
      const created = randomUUID();
      const tax = taxFor(db, companyId, input.leadId, input.tax, null);
      db.prepare(
        `INSERT INTO quotes (id, company_id, lead_id, deal_id, number, status, issued_on, notes, valid_until, tax_treatment, tax_inclusive, tax_region, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        created,
        companyId,
        input.leadId,
        dealId,
        nextNumber(db, "quotes", companyId),
        input.issuedOn,
        input.notes ?? null,
        input.validUntil ?? null,
        tax.treatment,
        tax.inclusive ? 1 : 0,
        tax.region,
        now,
        now,
      );
      writeLines(db, "quote_lines", companyId, created, input.lines, tax.usual);
      return created;
    }
    const kept = db.prepare(`SELECT tax_treatment AS treatment, tax_inclusive AS inclusive, tax_region AS region FROM quotes WHERE id = ? AND company_id = ?`).get(id, companyId) as
      | { treatment: string | null; inclusive: number; region: string | null }
      | undefined;
    if (!kept) throw new Error("That quote no longer exists.");
    const tax = taxFor(db, companyId, input.leadId, input.tax, kept);
    db.prepare(
      `UPDATE quotes SET lead_id = ?, deal_id = ?, issued_on = ?, notes = ?, valid_until = ?, tax_treatment = ?, tax_inclusive = ?, tax_region = ?, updated_at = ?
        WHERE id = ? AND company_id = ?`,
    ).run(input.leadId, dealId, input.issuedOn, input.notes ?? null, input.validUntil ?? null, tax.treatment, tax.inclusive ? 1 : 0, tax.region, now, id, companyId);
    writeLines(db, "quote_lines", companyId, id, input.lines, tax.usual);
    return id;
  })();

  const saved = findQuote(db, quoteId);
  if (!saved) throw new Error("The quote vanished immediately after being saved.");
  return saved;
}

export function setQuoteStatus(db: Db, companyId: string, id: string, status: QuoteStatus): void {
  const changed = db
    .prepare(`UPDATE quotes SET status = ?, updated_at = ? WHERE id = ? AND company_id = ?`)
    .run(status, new Date().toISOString(), id, companyId).changes;
  if (changed === 0) throw new Error("That quote no longer exists.");
}

export function deleteQuote(db: Db, companyId: string, id: string): void {
  db.prepare(`DELETE FROM quotes WHERE id = ? AND company_id = ?`).run(id, companyId);
}

/**
 * Accepting a quote makes the invoice, due a fortnight on, and gives the deal
 * a value if it had none. It does not overwrite a value somebody typed: the
 * quote is what was asked, and the value may already be what was agreed.
 */
export function acceptQuote(db: Db, companyId: string, id: string, now: Date = new Date()): Invoice {
  const quote = findQuote(db, id);
  if (!quote || quote.companyId !== companyId) throw new Error("That quote no longer exists.");

  return db.transaction(() => {
    setQuoteStatus(db, companyId, id, "accepted");
    const timezone = companyTimezone(db, companyId);
    const day = todayIn(timezone, now);
    const invoice = saveInvoice(db, companyId, null, {
      leadId: quote.leadId,
      dealId: quote.dealId,
      issuedOn: day,
      // Due when the client's terms say (phase 53); a fortnight when nobody has said.
      dueOn: shiftDay(day, termsFor(db, companyId, quote.leadId)),
      notes: quote.notes,
      lines: quote.lines.map((line) => ({
        description: line.description,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        productId: line.productId,
        taxRate: line.taxRate,
      })),
      tax: { treatment: quote.taxTreatment, inclusive: quote.taxInclusive },
    });
    db.prepare(`UPDATE invoices SET quote_id = ? WHERE id = ?`).run(id, invoice.id);
    const deal = quote.dealId ? findDeal(db, quote.dealId) : null;
    if (deal && deal.value === null) setDealValue(db, deal.id, quote.total, now.toISOString());
    return { ...invoice, quoteId: id };
  })();
}

/** How long a sent quote goes unanswered before Today asks after it. */
const QUOTE_WAIT_DAYS = 7;

/**
 * Quotes still out (phase 52): sent, neither accepted nor declined, and sent
 * a week ago or more - or past the day they were good until. Oldest first.
 */
export function listQuotesWaiting(db: Db, companyId: string, day: string): Quote[] {
  return listQuotes(db, companyId)
    .filter((quote) => quote.status === "sent" && (quote.issuedOn <= shiftDay(day, -QUOTE_WAIT_DAYS) || (quote.validUntil !== null && quote.validUntil < day)))
    .sort((a, b) => a.issuedOn.localeCompare(b.issuedOn));
}

/* ---- Invoices ----------------------------------------------------------- */

const INVOICE_SELECT = `
  SELECT i.id, i.company_id, i.lead_id, l.name AS lead_name, i.deal_id, d.title AS deal_title,
         i.quote_id, i.number, i.status, i.issued_on, i.due_on, i.paid_on, i.notes, i.created_at, i.repeats,
         i.tax_treatment, i.tax_inclusive, i.tax_region, c.country AS company_country,
         c.tax_rules AS company_tax_rules, c.invoice_look AS company_invoice_look
    FROM invoices i
    JOIN leads l ON l.id = i.lead_id
    JOIN companies c ON c.id = i.company_id
    LEFT JOIN deals d ON d.id = i.deal_id`;

/**
 * The reminders that went about invoices still owed: every email sent to an
 * invoice's contact with its number in the subject, after the day it was due.
 * Read, never kept - so one written by hand from the contact's page counts as
 * well as one from Money. Not before it was due: the email that sent the
 * invoice is not a reminder, and counted as one it made the first chase a
 * "second reminder". The number whole, so INV-1000 is not INV-10001.
 */
function remindersFor(db: Db, rows: DocRow[]): Map<string, { at: string; times: number }> {
  const owed = rows.filter((row) => row.status === "sent");
  const out = new Map<string, { at: string; times: number }>();
  if (owed.length === 0) return out;
  const leads = [...new Set(owed.map((row) => row.lead_id))];
  const sent = db
    .prepare(
      `SELECT lead_id, subject, COALESCE(sent_at, created_at) AS at FROM emails
        WHERE status IN ('sent', 'replied') AND lead_id IN (${leads.map(() => "?").join(", ")})
        ORDER BY at`,
    )
    .all(...leads) as { lead_id: string; subject: string; at: string }[];
  for (const row of owed) {
    // As the company writes its numbers: "PK/26-27/0042" has a slash, which is nothing to a pattern once escaped.
    const number = moneyOf(row, [], "invoice").label.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
    const whole = new RegExp(`(^|[^0-9A-Za-z])${number}($|[^0-9])`);
    const timezone = companyTimezone(db, row.company_id);
    const mine = sent.filter(
      (email) => email.lead_id === row.lead_id && whole.test(email.subject) && (!row.due_on || dayOf(email.at, timezone) > row.due_on),
    );
    const last = mine.at(-1);
    if (last) out.set(row.id, { at: last.at, times: mine.length });
  }
  return out;
}

function toInvoices(db: Db, rows: DocRow[]): Invoice[] {
  const ids = rows.map((row) => row.id);
  const lines = linesFor(db, "invoice_lines", ids);
  const payments = paymentsFor(db, ids);
  const reminded = remindersFor(db, rows);
  return rows.map((row) => {
    const own = lines.get(row.id) ?? [];
    const paid = payments.get(row.id) ?? [];
    return {
      id: row.id,
      companyId: row.company_id,
      leadId: row.lead_id,
      leadName: row.lead_name,
      dealId: row.deal_id,
      dealTitle: row.deal_title,
      quoteId: row.quote_id ?? null,
      number: row.number,
      status: row.status as InvoiceStatus,
      issuedOn: row.issued_on,
      dueOn: row.due_on ?? row.issued_on,
      paidOn: row.paid_on ?? null,
      notes: row.notes,
      ...moneyOf(row, own, "invoice"),
      // Tax a client withheld pays the invoice as much as money in: it is paid to the government in the company's name.
      paid: sum(paid.map((payment) => payment.amount + payment.withheld)),
      lines: own,
      payments: paid,
      createdAt: row.created_at,
      repeats: (row.repeats ?? null) as InvoiceRepeat | null,
      reminded: reminded.get(row.id) ?? null,
    };
  });
}

export function listInvoices(db: Db, companyId: string): Invoice[] {
  const rows = db
    .prepare(`${INVOICE_SELECT} WHERE i.company_id = ? ORDER BY i.issued_on DESC, i.number DESC`)
    .all(companyId) as DocRow[];
  return toInvoices(db, rows);
}

export function findInvoice(db: Db, id: string): Invoice | null {
  const row = db.prepare(`${INVOICE_SELECT} WHERE i.id = ?`).get(id) as DocRow | undefined;
  return row ? (toInvoices(db, [row])[0] ?? null) : null;
}

export function saveInvoice(db: Db, companyId: string, id: string | null, input: InvoiceInput): Invoice {
  assertLeadInCompany(db, companyId, input.leadId);
  const now = new Date().toISOString();
  const dealId = dealFor(db, "invoices", id, input.leadId, input.dealId);

  const invoiceId = db.transaction(() => {
    if (id === null) {
      const created = randomUUID();
      db.prepare(
        `INSERT INTO invoices (id, company_id, lead_id, deal_id, number, status, issued_on, due_on, notes, repeats, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?)`,
      ).run(created, companyId, input.leadId, dealId, nextNumber(db, "invoices", companyId), input.issuedOn, input.dueOn, input.notes ?? null, input.repeats ?? null, now, now);
      if (input.repeats) db.prepare(`UPDATE invoices SET repeat_day = ? WHERE id = ?`).run(Number(input.issuedOn.slice(8, 10)), created);
      const tax = taxFor(db, companyId, input.leadId, input.tax, null);
      db.prepare(`UPDATE invoices SET tax_treatment = ?, tax_inclusive = ?, tax_region = ? WHERE id = ?`).run(tax.treatment, tax.inclusive ? 1 : 0, tax.region, created);
      writeLines(db, "invoice_lines", companyId, created, input.lines, tax.usual);
      return created;
    }
    const existing = findInvoice(db, id);
    if (!existing || existing.companyId !== companyId) throw new Error("That invoice no longer exists.");
    if (existing.status === "paid" || existing.status === "void") {
      throw new Error("A paid or void invoice cannot be edited. Make a new one.");
    }
    db.prepare(
      `UPDATE invoices SET lead_id = ?, deal_id = ?, issued_on = ?, due_on = ?, notes = ?, repeats = ?,
         repeat_day = CASE WHEN ? IS NULL THEN NULL WHEN issued_on = ? AND repeat_day IS NOT NULL THEN repeat_day ELSE ? END,
         updated_at = ? WHERE id = ?`,
    ).run(
      input.leadId,
      dealId,
      input.issuedOn,
      input.dueOn,
      input.notes ?? null,
      input.repeats ?? null,
      input.repeats ?? null,
      input.issuedOn,
      Number(input.issuedOn.slice(8, 10)),
      now,
      id,
    );
    const kept = db.prepare(`SELECT tax_treatment AS treatment, tax_inclusive AS inclusive, tax_region AS region FROM invoices WHERE id = ?`).get(id) as {
      treatment: string | null;
      inclusive: number;
      region: string | null;
    };
    const tax = taxFor(db, companyId, input.leadId, input.tax, kept);
    db.prepare(`UPDATE invoices SET tax_treatment = ?, tax_inclusive = ?, tax_region = ? WHERE id = ?`).run(tax.treatment, tax.inclusive ? 1 : 0, tax.region, id);
    writeLines(db, "invoice_lines", companyId, id, input.lines, tax.usual);
    settle(db, id);
    return id;
  })();

  const saved = findInvoice(db, invoiceId);
  if (!saved) throw new Error("The invoice vanished immediately after being saved.");
  return saved;
}

/**
 * Paid, or not, from the payments. Called after anything that changes either
 * side: a payment in, a payment removed, a line edited.
 */
/** The same day so many months on, or the month's last day when it has no such day: the 31st, a month on, is the 30th. */
function monthsOn(day: string, months: number, onDay?: number | null): string {
  const [year = 2000, month = 1, parsed = 1] = day.split("-").map(Number);
  const date = onDay ?? parsed;
  const first = new Date(Date.UTC(year, month - 1 + months, 1));
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  return `${first.getUTCFullYear()}-${String(first.getUTCMonth() + 1).padStart(2, "0")}-${String(Math.min(date, last)).padStart(2, "0")}`;
}

/**
 * Retainers, drafted (phase 34): for every invoice that repeats, has been
 * sent, and whose next one is due to be written, a draft made from it - the
 * same contact, deal, lines and notes, issued on the day it falls, due as
 * long after as the last was. The saying moves to the draft, so the run goes
 * on from there and nothing is drafted twice.
 *
 * One at a time: nothing is drafted from a draft, so a run never has more
 * than one invoice waiting to be sent, however long Caulder was shut. A
 * draft is all it ever makes - sending is the owner's - and a void invoice
 * ends its run.
 *
 * Called when Today and Money are read, which is when the draft is wanted;
 * it writes only when something is due, so reading twice changes nothing.
 */
export function draftRepeats(db: Db, companyId: string, day: string): number {
  const due = (
    db
      .prepare(`SELECT id, issued_on, repeats, repeat_day FROM invoices WHERE company_id = ? AND repeats IS NOT NULL AND status IN ('sent', 'paid')`)
      .all(companyId) as { id: string; issued_on: string; repeats: InvoiceRepeat; repeat_day: number | null }[]
  ).filter((row) => monthsOn(row.issued_on, INVOICE_REPEAT_MONTHS[row.repeats], row.repeat_day) <= day);
  if (due.length === 0) return 0;
  return db.transaction(() => {
    let made = 0;
    for (const row of due) {
      const last = findInvoice(db, row.id);
      if (!last) continue;
      const issuedOn = monthsOn(row.issued_on, INVOICE_REPEAT_MONTHS[row.repeats], row.repeat_day);
      const term = Math.max(0, Math.round((Date.parse(`${last.dueOn}T00:00:00Z`) - Date.parse(`${last.issuedOn}T00:00:00Z`)) / 86_400_000));
      const now = new Date().toISOString();
      const id = randomUUID();
      db.prepare(
        `INSERT INTO invoices (id, company_id, lead_id, deal_id, number, status, issued_on, due_on, notes, repeats, repeat_day, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?)`,
      ).run(id, companyId, last.leadId, last.dealId, nextNumber(db, "invoices", companyId), issuedOn, shiftDay(issuedOn, term), last.notes, row.repeats, row.repeat_day ?? Number(row.issued_on.slice(8, 10)), now, now);
      writeLines(
        db,
        "invoice_lines",
        companyId,
        id,
        last.lines.map((line) => ({ description: line.description, quantity: line.quantity, unitPrice: line.unitPrice, productId: line.productId, taxRate: line.taxRate })),
      );
      db.prepare(`UPDATE invoices SET tax_treatment = ?, tax_inclusive = ?, tax_region = (SELECT tax_region FROM invoices WHERE id = ?) WHERE id = ?`).run(
        last.taxTreatment,
        last.taxInclusive ? 1 : 0,
        row.id,
        id,
      );
      db.prepare(`UPDATE invoices SET repeats = NULL, updated_at = ? WHERE id = ?`).run(now, row.id);
      made += 1;
    }
    return made;
  })();
}

/** Retainer invoices that were drafted and are waiting to be looked at and sent. */
export function listDraftedRepeats(db: Db, companyId: string): Invoice[] {
  return listInvoices(db, companyId).filter((invoice) => invoice.status === "draft" && invoice.repeats !== null);
}

function settle(db: Db, invoiceId: string): void {
  const invoice = findInvoice(db, invoiceId);
  if (!invoice || invoice.status === "void") return;
  const covered = invoice.total > 0 ? invoice.paid >= invoice.total : invoice.paid > 0;
  const now = new Date().toISOString();
  if (covered && invoice.status !== "paid") {
    const last = invoice.payments[invoice.payments.length - 1];
    db.prepare(`UPDATE invoices SET status = 'paid', paid_on = ?, updated_at = ? WHERE id = ?`).run(
      last?.paidOn ?? now.slice(0, 10),
      now,
      invoiceId,
    );
  } else if (!covered && invoice.status === "paid") {
    db.prepare(`UPDATE invoices SET status = 'sent', paid_on = NULL, updated_at = ? WHERE id = ?`).run(
      now,
      invoiceId,
    );
  }
}

export function setInvoiceStatus(db: Db, companyId: string, id: string, status: InvoiceStatus): void {
  const invoice = findInvoice(db, id);
  if (!invoice || invoice.companyId !== companyId) throw new Error("That invoice no longer exists.");
  // Paid is what the payments say, never what somebody types.
  if (status === "paid") throw new Error("Record a payment instead.");
  if (invoice.status === "paid" && status !== "void") {
    throw new Error("A paid invoice stays paid. Remove the payment to reopen it.");
  }
  db.prepare(`UPDATE invoices SET status = ?, updated_at = ? WHERE id = ?`).run(
    status,
    new Date().toISOString(),
    id,
  );
}

/**
 * Only a draft goes. An invoice that was sent is a record somebody else
 * holds a copy of, with a number that must never be used again and payments
 * that may hang off it: it is voided, not deleted. The screen offers Delete
 * only on a draft; this is the same rule where it cannot be walked round
 * (phase 25).
 */
export function deleteInvoice(db: Db, companyId: string, id: string): void {
  const invoice = findInvoice(db, id);
  if (!invoice || invoice.companyId !== companyId) throw new Error("That invoice no longer exists.");
  if (invoice.status !== "draft") {
    throw new Error("Only a draft can be deleted. An invoice that was sent is voided instead, so its number is never used twice.");
  }
  db.prepare(`DELETE FROM invoices WHERE id = ? AND company_id = ?`).run(id, companyId);
}

/* ---- Payments ----------------------------------------------------------- */

export function addPayment(db: Db, companyId: string, invoiceId: string, input: PaymentInput): Payment {
  const invoice = findInvoice(db, invoiceId);
  if (!invoice || invoice.companyId !== companyId) throw new Error("That invoice no longer exists.");
  if (invoice.status === "void") throw new Error("A void invoice cannot be paid.");
  if (invoice.status === "draft") throw new Error("Send the invoice before recording a payment.");

  const id = randomUUID();
  db.transaction(() => {
    db.prepare(
      `INSERT INTO payments (id, company_id, invoice_id, amount, withheld, paid_on, note, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(id, companyId, invoiceId, input.amount, input.withheld ?? 0, input.paidOn, input.note ?? null, new Date().toISOString());
    settle(db, invoiceId);
  })();

  return { id, invoiceId, amount: input.amount, withheld: input.withheld ?? 0, paidOn: input.paidOn, note: input.note ?? null };
}

/** The remainder, dated today. What "Mark as paid" means. */
export function markPaid(db: Db, companyId: string, invoiceId: string, now: Date = new Date()): void {
  const invoice = findInvoice(db, invoiceId);
  if (!invoice || invoice.companyId !== companyId) throw new Error("That invoice no longer exists.");
  const owed = invoice.total - invoice.paid;
  if (owed <= 0) throw new Error("Nothing is owed on that invoice.");
  addPayment(db, companyId, invoiceId, {
    amount: owed,
    paidOn: todayIn(companyTimezone(db, companyId), now),
    note: null,
  });
}

/**
 * Money in from a contact, said to the line (PLAN.md, part twelve, phase 49):
 * "got 2400 from harbour" marks their open invoice of 2,400 paid; a sum short
 * of the only one open is a payment against it; "harbour paid" marks the only
 * one open. With more than one open and none that sum, it says so rather than
 * guess which.
 */
export function paidFrom(db: Db, companyId: string, input: PaidFromInput, now: Date = new Date()): { say: string } {
  const lead = db.prepare(`SELECT name FROM leads WHERE id = ? AND company_id = ?`).get(input.leadId, companyId) as { name: string } | undefined;
  if (!lead) throw new Error("That contact is not in this company.");
  const open = listInvoices(db, companyId).filter((invoice) => invoice.leadId === input.leadId && invoice.status === "sent" && invoice.total - invoice.paid > 0);
  const owed = (invoice: Invoice) => invoice.total - invoice.paid;
  if (open.length === 0) throw new Error(`${lead.name} has no invoice waiting to be paid.`);
  const number = (invoice: Invoice) => invoice.label;
  const exact = input.amount === null ? null : (open.find((invoice) => owed(invoice) === input.amount) ?? null);
  const only = open.length === 1 ? open[0]! : null;
  const target = exact ?? only;
  if (!target) {
    throw new Error(
      input.amount === null
        ? `${lead.name} has ${open.length} invoices open. Say how much came in, or mark the one on Money.`
        : `None of ${lead.name}'s ${open.length} open invoices is for that. Mark the one on Money.`,
    );
  }
  if (input.amount !== null && input.amount < owed(target)) {
    addPayment(db, companyId, target.id, { amount: input.amount, paidOn: todayIn(companyTimezone(db, companyId), now), note: null });
    return { say: `Recorded against ${number(target)}, with ${owed(target) - input.amount} still owed` };
  }
  markPaid(db, companyId, target.id, now);
  return { say: `Marked ${number(target)} paid` };
}

export function deletePayment(db: Db, companyId: string, id: string): void {
  const row = db.prepare(`SELECT invoice_id FROM payments WHERE id = ? AND company_id = ?`).get(id, companyId) as
    | { invoice_id: string }
    | undefined;
  if (!row) return;
  db.transaction(() => {
    db.prepare(`DELETE FROM payments WHERE id = ?`).run(id);
    settle(db, row.invoice_id);
  })();
}

/* ---- Spend -------------------------------------------------------------- */

function listSpend(db: Db, companyId: string): SpendEntry[] {
  const rows = db
    .prepare(
      `SELECT s.id, s.spent_on, s.amount, s.what
         FROM spend s
        WHERE s.company_id = ?
        ORDER BY s.spent_on DESC, s.created_at DESC`,
    )
    .all(companyId) as {
    id: string;
    spent_on: string;
    amount: number;
    what: string;
  }[];
  return rows.map((row) => ({
    id: row.id,
    spentOn: row.spent_on,
    amount: row.amount,
    what: row.what,
  }));
}

export function addSpend(db: Db, companyId: string, input: SpendEntryInput): void {
  db.prepare(
    `INSERT INTO spend (id, company_id, spent_on, amount, what, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(
    randomUUID(),
    companyId,
    input.spentOn,
    input.amount,
    input.what,
    new Date().toISOString(),
  );
}

export function deleteSpend(db: Db, companyId: string, id: string): void {
  db.prepare(`DELETE FROM spend WHERE id = ? AND company_id = ?`).run(id, companyId);
}

/* ---- The overview ------------------------------------------------------- */

function companyTimezone(db: Db, companyId: string): string {
  const row = db.prepare(`SELECT timezone FROM companies WHERE id = ?`).get(companyId) as
    | { timezone: string }
    | undefined;
  return row?.timezone ?? "UTC";
}

/** Sent and past due. On Today as well as on Money. */
export function listOverdueInvoices(db: Db, companyId: string, day: string): Invoice[] {
  return listInvoices(db, companyId)
    .filter((invoice) => isOverdueInvoice(invoice, day))
    .sort((a, b) => a.dueOn.localeCompare(b.dueOn));
}

export function buildMoney(db: Db, companyId: string, now: Date = new Date()): MoneyOverview {
  const company = db
    .prepare(`SELECT timezone, currency, goal_value, goal_period FROM companies WHERE id = ?`)
    .get(companyId) as
    | { timezone: string; currency: string; goal_value: number | null; goal_period: string | null }
    | undefined;
  if (!company) throw new Error("That company no longer exists.");

  const day = todayIn(company.timezone, now);
  const month = day.slice(0, 7);
  const inMonth = (date: string) => date.startsWith(month);

  const quotes = listQuotes(db, companyId);
  const invoices = listInvoices(db, companyId);
  const spend = listSpend(db, companyId);

  const paidThisMonth = sum(
    invoices.flatMap((invoice) =>
      invoice.payments.filter((payment) => inMonth(payment.paidOn)).map((payment) => payment.amount),
    ),
  );

  // The quarter's tax, by component and rate, on what went out in it: what a return asks for.
  const quarterStart = `${month.slice(0, 5)}${String(Math.floor((Number(month.slice(5, 7)) - 1) / 3) * 3 + 1).padStart(2, "0")}-01`;
  const quarterEnd = shiftDay(addMonths(quarterStart, 3), -1);
  const taxLines = new Map<string, TaxLine>();
  for (const invoice of invoices) {
    if (invoice.status === "draft" || invoice.status === "void" || invoice.issuedOn < quarterStart || invoice.issuedOn > quarterEnd) continue;
    for (const line of invoice.tax) {
      const held = taxLines.get(line.label);
      taxLines.set(line.label, held ? { ...held, amount: held.amount + line.amount } : { ...line });
    }
  }

  return {
    month,
    currency: company.currency,
    taxQuarter: { from: quarterStart, to: quarterEnd, lines: [...taxLines.values()] },
    ahead: aheadOf({ day, invoices, costs: listCosts(db, companyId) }),
    clients: clientsOf(invoices, day),
    quoted: sum(quotes.filter((q) => q.status !== "declined" && inMonth(q.issuedOn)).map((q) => q.total)),
    invoiced: sum(
      invoices.filter((i) => i.status !== "void" && i.status !== "draft" && inMonth(i.issuedOn)).map((i) => i.total),
    ),
    paid: paidThisMonth,
    spent: sum(spend.filter((entry) => inMonth(entry.spentOn)).map((entry) => entry.amount)),
    target: company.goal_period === "month" ? company.goal_value : null,
    invoices,
    quotes,
    spend,
    overdue: invoices.filter((invoice) => isOverdueInvoice(invoice, day)),
  };
}

/** What one contact has been quoted and invoiced. */
export function moneyForLead(db: Db, leadId: string): { quotes: Quote[]; invoices: Invoice[] } {
  const quotes = toQuotes(
    db,
    db.prepare(`${QUOTE_SELECT} WHERE q.lead_id = ? ORDER BY q.issued_on DESC`).all(leadId) as DocRow[],
  );
  const invoices = toInvoices(
    db,
    db.prepare(`${INVOICE_SELECT} WHERE i.lead_id = ? ORDER BY i.issued_on DESC`).all(leadId) as DocRow[],
  );
  return { quotes, invoices };
}

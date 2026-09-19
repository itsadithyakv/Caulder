import { randomUUID } from "node:crypto";
import type { Db } from "../db/connection";
import { shiftDay, today as todayIn } from "@shared/dates";
import { findDeal, mainDeal, setDealValue } from "./deals";
import { productInCompany } from "./products";
import {
  isOverdueInvoice,
  type Invoice,
  type InvoiceInput,
  type InvoiceStatus,
  type MoneyLine,
  type MoneyLineInput,
  type MoneyOverview,
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
};

type LineRow = {
  id: string;
  parent_id: string;
  description: string;
  quantity: number;
  unit_price: number;
  product_id: string | null;
  product_name: string | null;
};

type PaymentRow = {
  id: string;
  invoice_id: string;
  amount: number;
  paid_on: string;
  note: string | null;
};

const lineTotal = (line: MoneyLine) => Math.round(line.quantity * line.unitPrice);
const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);

function linesFor(db: Db, table: "quote_lines" | "invoice_lines", parentIds: string[]): Map<string, MoneyLine[]> {
  const byParent = new Map<string, MoneyLine[]>();
  if (parentIds.length === 0) return byParent;
  const column = table === "quote_lines" ? "quote_id" : "invoice_id";
  const rows = db
    .prepare(
      `SELECT t.id, t.${column} AS parent_id, t.description, t.quantity, t.unit_price,
              t.product_id, p.name AS product_name
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
      `SELECT id, invoice_id, amount, paid_on, note FROM payments
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
         q.number, q.status, q.issued_on, q.notes, q.created_at
    FROM quotes q
    JOIN leads l ON l.id = q.lead_id
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
      total: sum(own.map(lineTotal)),
      lines: own,
      createdAt: row.created_at,
    };
  });
}

function listQuotes(db: Db, companyId: string): Quote[] {
  const rows = db
    .prepare(`${QUOTE_SELECT} WHERE q.company_id = ? ORDER BY q.issued_on DESC, q.number DESC`)
    .all(companyId) as DocRow[];
  return toQuotes(db, rows);
}

function findQuote(db: Db, id: string): Quote | null {
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
): void {
  const column = table === "quote_lines" ? "quote_id" : "invoice_id";
  db.prepare(`DELETE FROM ${table} WHERE ${column} = ?`).run(parentId);
  const insert = db.prepare(
    `INSERT INTO ${table} (id, ${column}, position, description, quantity, unit_price, product_id)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );
  lines.forEach((line, index) =>
    insert.run(
      randomUUID(),
      parentId,
      index,
      line.description,
      line.quantity,
      line.unitPrice,
      line.productId ? productInCompany(db, companyId, line.productId) : null,
    ),
  );
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
      db.prepare(
        `INSERT INTO quotes (id, company_id, lead_id, deal_id, number, status, issued_on, notes, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?)`,
      ).run(created, companyId, input.leadId, dealId, nextNumber(db, "quotes", companyId), input.issuedOn, input.notes ?? null, now, now);
      writeLines(db, "quote_lines", companyId, created, input.lines);
      return created;
    }
    const changed = db
      .prepare(
        `UPDATE quotes SET lead_id = ?, deal_id = ?, issued_on = ?, notes = ?, updated_at = ?
          WHERE id = ? AND company_id = ?`,
      )
      .run(input.leadId, dealId, input.issuedOn, input.notes ?? null, now, id, companyId).changes;
    if (changed === 0) throw new Error("That quote no longer exists.");
    writeLines(db, "quote_lines", companyId, id, input.lines);
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
      dueOn: shiftDay(day, 14),
      notes: quote.notes,
      lines: quote.lines.map((line) => ({
        description: line.description,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        productId: line.productId,
      })),
    });
    db.prepare(`UPDATE invoices SET quote_id = ? WHERE id = ?`).run(id, invoice.id);
    const deal = quote.dealId ? findDeal(db, quote.dealId) : null;
    if (deal && deal.value === null) setDealValue(db, deal.id, quote.total, now.toISOString());
    return { ...invoice, quoteId: id };
  })();
}

/* ---- Invoices ----------------------------------------------------------- */

const INVOICE_SELECT = `
  SELECT i.id, i.company_id, i.lead_id, l.name AS lead_name, i.deal_id, d.title AS deal_title,
         i.quote_id, i.number, i.status, i.issued_on, i.due_on, i.paid_on, i.notes, i.created_at
    FROM invoices i
    JOIN leads l ON l.id = i.lead_id
    LEFT JOIN deals d ON d.id = i.deal_id`;

function toInvoices(db: Db, rows: DocRow[]): Invoice[] {
  const ids = rows.map((row) => row.id);
  const lines = linesFor(db, "invoice_lines", ids);
  const payments = paymentsFor(db, ids);
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
      total: sum(own.map(lineTotal)),
      paid: sum(paid.map((payment) => payment.amount)),
      lines: own,
      payments: paid,
      createdAt: row.created_at,
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
        `INSERT INTO invoices (id, company_id, lead_id, deal_id, number, status, issued_on, due_on, notes, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?)`,
      ).run(created, companyId, input.leadId, dealId, nextNumber(db, "invoices", companyId), input.issuedOn, input.dueOn, input.notes ?? null, now, now);
      writeLines(db, "invoice_lines", companyId, created, input.lines);
      return created;
    }
    const existing = findInvoice(db, id);
    if (!existing || existing.companyId !== companyId) throw new Error("That invoice no longer exists.");
    if (existing.status === "paid" || existing.status === "void") {
      throw new Error("A paid or void invoice cannot be edited. Make a new one.");
    }
    db.prepare(
      `UPDATE invoices SET lead_id = ?, deal_id = ?, issued_on = ?, due_on = ?, notes = ?, updated_at = ? WHERE id = ?`,
    ).run(input.leadId, dealId, input.issuedOn, input.dueOn, input.notes ?? null, now, id);
    writeLines(db, "invoice_lines", companyId, id, input.lines);
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

export function deleteInvoice(db: Db, companyId: string, id: string): void {
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
      `INSERT INTO payments (id, company_id, invoice_id, amount, paid_on, note, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(id, companyId, invoiceId, input.amount, input.paidOn, input.note ?? null, new Date().toISOString());
    settle(db, invoiceId);
  })();

  return { id, invoiceId, amount: input.amount, paidOn: input.paidOn, note: input.note ?? null };
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
      `SELECT s.id, s.spent_on, s.amount, s.what, s.campaign_id, c.name AS campaign_name
         FROM spend s
         LEFT JOIN campaigns c ON c.id = s.campaign_id
        WHERE s.company_id = ?
        ORDER BY s.spent_on DESC, s.created_at DESC`,
    )
    .all(companyId) as {
    id: string;
    spent_on: string;
    amount: number;
    what: string;
    campaign_id: string | null;
    campaign_name: string | null;
  }[];
  return rows.map((row) => ({
    id: row.id,
    spentOn: row.spent_on,
    amount: row.amount,
    what: row.what,
    campaignId: row.campaign_id,
    campaignName: row.campaign_name,
  }));
}

export function addSpend(db: Db, companyId: string, input: SpendEntryInput): void {
  db.prepare(
    `INSERT INTO spend (id, company_id, spent_on, amount, what, campaign_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    randomUUID(),
    companyId,
    input.spentOn,
    input.amount,
    input.what,
    input.campaignId ?? null,
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

  return {
    month,
    currency: company.currency,
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

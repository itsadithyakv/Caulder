import { beforeEach, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { MIGRATIONS, migrate } from "../db/migrations";
import { createCompany } from "./companies";
import { createLead, findLead } from "./leads";
import {
  acceptQuote,
  addPayment,
  addSpend,
  buildMoney,
  deletePayment,
  listOverdueInvoices,
  markPaid,
  moneyForLead,
  saveInvoice,
  saveQuote,
  setInvoiceStatus,
} from "./money";
import { buildToday } from "../services/today";
import { leadInput, type Company } from "@shared/domain";

/**
 * Money, against a real database.
 *
 * The rules worth a test are the ones a spreadsheet gets wrong: a number is
 * never reused, paid is what the payments say, and overdue is a fact about
 * today rather than a status somebody set.
 */

const NOW = new Date("2026-09-14T06:00:00Z");
const TZ = "Asia/Kolkata";

let db: Database.Database;
let company: Company;
let leadId: string;

beforeEach(() => {
  db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  migrate(db);
  company = createCompany(db, { name: "Unifloe", accent: "blue", timezone: TZ });
  leadId = createLead(db, company.id, leadInput.parse({ name: "Oakridge" })).id;
});

const lines = [
  { description: "Workshop", quantity: 2, unitPrice: 15000 },
  { description: "Travel", quantity: 1, unitPrice: 2500 },
];

describe("invoices", () => {
  it("numbers per company from one, and totals its lines", () => {
    const first = saveInvoice(db, company.id, null, { leadId, issuedOn: "2026-09-14", dueOn: "2026-09-28", notes: null, lines });
    const second = saveInvoice(db, company.id, null, { leadId, issuedOn: "2026-09-14", dueOn: "2026-09-28", notes: null, lines });
    expect(first.number).toBe(1);
    expect(second.number).toBe(2);
    expect(first.total).toBe(32500);
    expect(first.status).toBe("draft");

    const other = createCompany(db, { name: "PaperKite", accent: "teal", timezone: TZ });
    const otherLead = createLead(db, other.id, leadInput.parse({ name: "Someone" })).id;
    expect(
      saveInvoice(db, other.id, null, { leadId: otherLead, issuedOn: "2026-09-14", dueOn: "2026-09-28", notes: null, lines })
        .number,
    ).toBe(1);
  });

  it("refuses a contact from another company", () => {
    const other = createCompany(db, { name: "PaperKite", accent: "teal", timezone: TZ });
    expect(() =>
      saveInvoice(db, other.id, null, { leadId, issuedOn: "2026-09-14", dueOn: "2026-09-28", notes: null, lines }),
    ).toThrow(/not in this company/);
  });

  it("is paid when the payments cover it, and not before", () => {
    const invoice = saveInvoice(db, company.id, null, { leadId, issuedOn: "2026-09-01", dueOn: "2026-09-15", notes: null, lines });
    expect(() => addPayment(db, company.id, invoice.id, { amount: 1000, paidOn: "2026-09-02", note: null })).toThrow(
      /Send the invoice/,
    );
    setInvoiceStatus(db, company.id, invoice.id, "sent");

    addPayment(db, company.id, invoice.id, { amount: 10000, paidOn: "2026-09-02", note: null });
    let money = buildMoney(db, company.id, NOW);
    expect(money.invoices[0]?.status).toBe("sent");
    expect(money.invoices[0]?.paid).toBe(10000);

    addPayment(db, company.id, invoice.id, { amount: 22500, paidOn: "2026-09-10", note: null });
    money = buildMoney(db, company.id, NOW);
    expect(money.invoices[0]?.status).toBe("paid");
    expect(money.invoices[0]?.paidOn).toBe("2026-09-10");
    expect(money.paid).toBe(32500);

    // Typing "paid" is refused; the payments decide.
    expect(() => setInvoiceStatus(db, company.id, invoice.id, "paid")).toThrow(/Record a payment/);

    // Remove a payment and it is owed again.
    const last = money.invoices[0]?.payments[1];
    if (!last) throw new Error("expected two payments");
    deletePayment(db, company.id, last.id);
    money = buildMoney(db, company.id, NOW);
    expect(money.invoices[0]?.status).toBe("sent");
    expect(money.invoices[0]?.paidOn).toBeNull();
  });

  it("mark paid records the remainder, dated today", () => {
    const invoice = saveInvoice(db, company.id, null, { leadId, issuedOn: "2026-09-01", dueOn: "2026-09-15", notes: null, lines });
    setInvoiceStatus(db, company.id, invoice.id, "sent");
    addPayment(db, company.id, invoice.id, { amount: 500, paidOn: "2026-09-02", note: null });
    markPaid(db, company.id, invoice.id, NOW);
    const money = buildMoney(db, company.id, NOW);
    expect(money.invoices[0]?.status).toBe("paid");
    expect(money.invoices[0]?.payments.map((p) => p.amount)).toEqual([500, 32000]);
    expect(money.invoices[0]?.payments[1]?.paidOn).toBe("2026-09-14");
  });

  it("is overdue when sent and past due, on Money and on Today", () => {
    const late = saveInvoice(db, company.id, null, { leadId, issuedOn: "2026-08-01", dueOn: "2026-08-15", notes: null, lines });
    const draft = saveInvoice(db, company.id, null, { leadId, issuedOn: "2026-08-01", dueOn: "2026-08-15", notes: null, lines });
    const fine = saveInvoice(db, company.id, null, { leadId, issuedOn: "2026-09-10", dueOn: "2026-09-30", notes: null, lines });
    setInvoiceStatus(db, company.id, late.id, "sent");
    setInvoiceStatus(db, company.id, fine.id, "sent");
    void draft;

    expect(listOverdueInvoices(db, company.id, "2026-09-14").map((i) => i.id)).toEqual([late.id]);
    expect(buildMoney(db, company.id, NOW).overdue.map((i) => i.id)).toEqual([late.id]);
    expect(buildToday(db, company.id, NOW).unpaid.map((i) => i.id)).toEqual([late.id]);

    // Paying it takes it off the list without anything being "un-overdued".
    markPaid(db, company.id, late.id, NOW);
    expect(buildToday(db, company.id, NOW).unpaid).toEqual([]);
  });
});

describe("quotes", () => {
  it("accepting makes the invoice and gives the deal a value it did not have", () => {
    const quote = saveQuote(db, company.id, null, { leadId, issuedOn: "2026-09-14", notes: "Half up front", lines });
    expect(quote.number).toBe(1);
    expect(quote.total).toBe(32500);

    const invoice = acceptQuote(db, company.id, quote.id, NOW);
    expect(invoice.quoteId).toBe(quote.id);
    expect(invoice.total).toBe(32500);
    expect(invoice.dueOn).toBe("2026-09-28");
    expect(invoice.notes).toBe("Half up front");
    expect(findLead(db, leadId)?.value).toBe(32500);

    const money = buildMoney(db, company.id, NOW);
    expect(money.quotes[0]?.status).toBe("accepted");
    expect(money.quoted).toBe(32500);

    const mine = moneyForLead(db, leadId);
    expect(mine.quotes).toHaveLength(1);
    expect(mine.invoices).toHaveLength(1);
  });

  it("does not overwrite a value somebody typed", () => {
    db.prepare(`UPDATE leads SET value = 99999 WHERE id = ?`).run(leadId);
    const quote = saveQuote(db, company.id, null, { leadId, issuedOn: "2026-09-14", notes: null, lines });
    acceptQuote(db, company.id, quote.id, NOW);
    expect(findLead(db, leadId)?.value).toBe(99999);
  });
});

describe("the month", () => {
  it("adds up what happened this month and leaves the rest out", () => {
    const thisMonth = saveInvoice(db, company.id, null, { leadId, issuedOn: "2026-09-02", dueOn: "2026-09-16", notes: null, lines });
    setInvoiceStatus(db, company.id, thisMonth.id, "sent");
    const lastMonth = saveInvoice(db, company.id, null, { leadId, issuedOn: "2026-08-02", dueOn: "2026-08-16", notes: null, lines });
    setInvoiceStatus(db, company.id, lastMonth.id, "sent");
    // Paid this month for last month's invoice still counts as paid this month.
    addPayment(db, company.id, lastMonth.id, { amount: 32500, paidOn: "2026-09-05", note: null });
    addSpend(db, company.id, { spentOn: "2026-09-03", amount: 1200, what: "Domain", campaignId: null });
    addSpend(db, company.id, { spentOn: "2026-08-03", amount: 5000, what: "Ads", campaignId: null });

    const money = buildMoney(db, company.id, NOW);
    expect(money.month).toBe("2026-09");
    expect(money.invoiced).toBe(32500);
    expect(money.paid).toBe(32500);
    expect(money.spent).toBe(1200);
    expect(money.target).toBeNull();
  });

  it("carries the old campaign spend across", () => {
    // A workspace from before migration 17, with spend against a campaign.
    const old = new Database(":memory:");
    old.pragma("foreign_keys = ON");
    for (const migration of MIGRATIONS.filter((m) => m.version <= 16)) old.exec(migration.sql);
    old.pragma("user_version = 16");
    const c = createCompany(old, { name: "Old", accent: "blue", timezone: TZ });
    old.prepare(
      `INSERT INTO campaigns (id, company_id, name, starts_on, is_archived, created_at) VALUES ('camp', ?, 'Fair', '2026-08-01', 0, '2026-08-01')`,
    ).run(c.id);
    old.prepare(
      `INSERT INTO campaign_spend (id, company_id, campaign_id, spent_on, amount, note, created_at) VALUES ('sp', ?, 'camp', '2026-08-02', 4000, NULL, '2026-08-02')`,
    ).run(c.id);
    migrate(old);
    const money = buildMoney(old, c.id, NOW);
    expect(money.spend).toEqual([
      { id: "sp", spentOn: "2026-08-02", amount: 4000, what: "Fair", campaignId: "camp", campaignName: "Fair" },
    ]);
  });
});

import { beforeEach, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { migrate } from "./db/migrations";
import { createCompany, setCompanyCountry } from "./repositories/companies";
import { createLead } from "./repositories/leads";
import { acceptQuote, findInvoice, listQuotesWaiting, saveInvoice, saveQuote, setQuoteStatus } from "./repositories/money";
import { setClientBilling, setCompanyBilling } from "./repositories/billing";
import { createBlock } from "./repositories/blocks";
import { billHours, hoursToBill, setBlockFor } from "./repositories/hours";
import { periodDays } from "@shared/accountant";
import { invoiceHtml } from "./services/invoice-html";
import { blockInput, leadInput, type Company } from "@shared/domain";

/** Part thirteen (PLAN.md): tax on the invoice, terms, quotes that wait, hours billed, the accountant's pack. */

let db: Database.Database;
let company: Company;
let lead: string;

const noBilling = { taxNumber: null, taxCountry: null, taxRegion: null, paymentTerms: null, hourlyRate: null };
const line = (unitPrice: number) => ({ description: "Design", quantity: 1, unitPrice, productId: null });

beforeEach(() => {
  db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  migrate(db);
  company = createCompany(db, { name: "Unifloe", accent: "blue", timezone: "Asia/Kolkata" });
  setCompanyCountry(db, company.id, "IN");
  lead = createLead(db, company.id, leadInput.parse({ name: "Harbour Coffee" })).id;
});

const gst = (number = "29ABCDE1234F1Z5") =>
  setCompanyBilling(db, company.id, { taxOn: true, taxRate: 18, taxInclusive: false, taxRegion: null, taxNumber: number, paymentTerms: null, hourlyRate: null });

describe("tax on an invoice", () => {
  it("charges nothing until the company does, so no total changes underneath anybody", () => {
    const invoice = saveInvoice(db, company.id, null, { leadId: lead, issuedOn: "2026-10-01", dueOn: "2026-10-15", notes: null, lines: [line(10000)] });
    expect(invoice).toMatchObject({ subtotal: 10000, tax: [], total: 10000, taxTreatment: null });
  });

  it("splits GST into CGST and SGST for a client in the company's state, and IGST for one in another", () => {
    gst();
    setClientBilling(db, company.id, lead, { ...noBilling, taxNumber: "29AAACR5055K1Z5" });
    const same = saveInvoice(db, company.id, null, { leadId: lead, issuedOn: "2026-10-01", dueOn: "2026-10-15", notes: null, lines: [line(10000)] });
    expect(same).toMatchObject({ taxTreatment: "india-intra", subtotal: 10000, total: 11800 });
    expect(same.tax.map((each) => each.label)).toEqual(["CGST 9%", "SGST 9%"]);

    setClientBilling(db, company.id, lead, { ...noBilling, taxNumber: "27AAACR5055K1Z5" });
    const other = saveInvoice(db, company.id, null, { leadId: lead, issuedOn: "2026-10-01", dueOn: "2026-10-15", notes: null, lines: [line(10000)] });
    expect(other.tax).toEqual([{ label: "IGST 18%", rate: 18, amount: 1800 }]);
  });

  it("keeps how an invoice was taxed when the company's settings change after", () => {
    gst();
    const sent = saveInvoice(db, company.id, null, { leadId: lead, issuedOn: "2026-10-01", dueOn: "2026-10-15", notes: null, lines: [line(10000)] });
    setCompanyBilling(db, company.id, { taxOn: false, taxRate: null, taxInclusive: false, taxRegion: null, taxNumber: null, paymentTerms: null, hourlyRate: null });
    expect(findInvoice(db, sent.id)?.total).toBe(11800);
  });

  it("is a reverse charge to a business elsewhere in the European Union", () => {
    setCompanyCountry(db, company.id, "DE");
    setCompanyBilling(db, company.id, { taxOn: true, taxRate: 19, taxInclusive: false, taxRegion: null, taxNumber: "DE123456789", paymentTerms: null, hourlyRate: null });
    setClientBilling(db, company.id, lead, { ...noBilling, taxNumber: "FR12345678901" });
    const invoice = saveInvoice(db, company.id, null, { leadId: lead, issuedOn: "2026-10-01", dueOn: "2026-10-15", notes: null, lines: [line(1000)] });
    expect(invoice).toMatchObject({ taxTreatment: "reverse", total: 1000 });
    expect(invoice.taxNote).toMatch(/^Reverse charge/);
  });
});

describe("a quote", () => {
  it("accepted, makes an invoice with the same tax, due by the client's terms", () => {
    gst();
    setClientBilling(db, company.id, lead, { ...noBilling, paymentTerms: 30 });
    const quote = saveQuote(db, company.id, null, { leadId: lead, issuedOn: "2026-10-01", notes: null, lines: [line(5000)] });
    const invoice = acceptQuote(db, company.id, quote.id, new Date("2026-10-23T06:00:00Z"));
    expect(invoice).toMatchObject({ issuedOn: "2026-10-23", dueOn: "2026-11-22", total: 5900, taxTreatment: "india-intra" });
  });

  it("not answered in a week, or past its last day, is asked after", () => {
    const old = saveQuote(db, company.id, null, { leadId: lead, issuedOn: "2026-10-10", notes: null, lines: [line(100)] });
    const fresh = saveQuote(db, company.id, null, { leadId: lead, issuedOn: "2026-10-20", notes: null, lines: [line(100)] });
    const ended = saveQuote(db, company.id, null, { leadId: lead, issuedOn: "2026-10-20", notes: null, lines: [line(100)], validUntil: "2026-10-22" });
    const answered = saveQuote(db, company.id, null, { leadId: lead, issuedOn: "2026-10-01", notes: null, lines: [line(100)] });
    for (const quote of [old, fresh, ended, answered]) setQuoteStatus(db, company.id, quote.id, "sent");
    setQuoteStatus(db, company.id, answered.id, "declined");
    expect(listQuotesWaiting(db, company.id, "2026-10-23").map((quote) => quote.id)).toEqual([old.id, ended.id]);
  });
});

describe("hours to invoice", () => {
  it("bills the billable time that happened, once, at the client's rate", () => {
    setClientBilling(db, company.id, lead, { ...noBilling, hourlyRate: 2000 });
    const block = (day: string, minutes: number) => createBlock(db, company.id, blockInput.parse({ day, startsAt: "10:00", minutes, title: "Brand workshop" }));
    const done = block("2026-10-20", 90);
    const notYet = block("2026-10-30", 60);
    const unbilled = block("2026-10-21", 60);
    setBlockFor(db, done.id, { leadId: lead, billable: true });
    setBlockFor(db, notYet.id, { leadId: lead, billable: true });
    setBlockFor(db, unbilled.id, { leadId: lead, billable: false });

    expect(hoursToBill(db, company.id, lead, "2026-10-23")).toMatchObject({ minutes: 90, rate: 2000, amount: 3000 });
    const invoice = billHours(db, company.id, lead, "2026-10-23");
    expect(invoice.lines).toMatchObject([{ description: "Brand workshop, 2026-10-20", quantity: 1.5, unitPrice: 2000 }]);
    expect(invoice.total).toBe(3000);
    expect(hoursToBill(db, company.id, lead, "2026-10-23").blocks).toEqual([]);
  });

  it("says the amount the invoice will come to, rounding as its lines do", () => {
    setClientBilling(db, company.id, lead, { ...noBilling, hourlyRate: 100 });
    for (const day of ["2026-10-19", "2026-10-20", "2026-10-21"]) {
      const made = createBlock(db, company.id, blockInput.parse({ day, startsAt: "10:00", minutes: 20, title: "Check-in" }));
      setBlockFor(db, made.id, { leadId: lead, billable: true });
    }
    const said = hoursToBill(db, company.id, lead, "2026-10-23").amount;
    expect(billHours(db, company.id, lead, "2026-10-23").total).toBe(said);
  });

  it("asks for a rate rather than billing nothing an hour", () => {
    const made = createBlock(db, company.id, blockInput.parse({ day: "2026-10-20", startsAt: "10:00", minutes: 60, title: "Call" }));
    setBlockFor(db, made.id, { leadId: lead, billable: true });
    expect(() => billHours(db, company.id, lead, "2026-10-23")).toThrow(/hourly rate/);
  });

  it("can be for a client from the moment a block is made, every one of a repeat, and only for this company's contacts", () => {
    setClientBilling(db, company.id, lead, { ...noBilling, hourlyRate: 1000 });
    createBlock(db, company.id, blockInput.parse({ day: "2026-10-05", startsAt: "09:00", minutes: 30, title: "Weekly call", forClient: { leadId: lead, billable: true }, repeat: { weekdays: [1], until: "2026-10-19" } }));
    expect(hoursToBill(db, company.id, lead, "2026-10-23")).toMatchObject({ minutes: 90, amount: 1500 });
    const other = createCompany(db, { name: "Elsewhere", accent: "teal", timezone: "Asia/Kolkata" });
    expect(() => createBlock(db, other.id, blockInput.parse({ day: "2026-10-05", startsAt: "09:00", minutes: 30, title: "Call", forClient: { leadId: lead, billable: true } }))).toThrow(/not in this company/);
  });
});

describe("the accountant's pack", () => {
  it("covers calendar quarters and years", () => {
    expect(periodDays("this-quarter", "2026-10-23")).toEqual({ from: "2026-10-01", to: "2026-12-31", label: "2026 Q4" });
    expect(periodDays("last-quarter", "2026-02-10")).toEqual({ from: "2025-10-01", to: "2025-12-31", label: "2025 Q4" });
    expect(periodDays("last-year", "2026-10-23")).toMatchObject({ from: "2025-01-01", to: "2025-12-31" });
    // India's year runs April to March, Australia's July to June.
    expect(periodDays("this-year", "2026-10-23", 4)).toEqual({ from: "2026-04-01", to: "2027-03-31", label: "FY 2026-27" });
    expect(periodDays("last-year", "2026-02-10", 4)).toEqual({ from: "2024-04-01", to: "2025-03-31", label: "FY 2024-25" });
    expect(periodDays("this-year", "2026-06-30", 7)).toMatchObject({ from: "2025-07-01", to: "2026-06-30" });
  });
});

describe("the invoice as a page", () => {
  it("says the tax by component, the client's number, and a tax invoice where the law asks", () => {
    const html = invoiceHtml({
      title: "Tax invoice",
      from: { name: "Unifloe", address: null, gstin: "29ABCDE1234F1Z5", taxLabel: "GSTIN", email: null, phone: null, payTo: [] },
      number: "INV-0001",
      issuedOn: "2026-10-01",
      dueOn: "2026-10-15",
      to: ["Harbour Coffee"],
      toTax: "GSTIN 27AAACR5055K1Z5",
      lines: [{ description: "Design", quantity: 1, unitPrice: "₹10,000", total: "₹10,000", taxRate: "18%", code: "998391" }],
      subtotal: "₹10,000",
      tax: [{ label: "IGST 18%", amount: "₹1,800" }],
      total: "₹11,800",
      paid: null,
      owed: "₹11,800",
      notes: null,
    });
    expect(html).toContain("<h1>Tax invoice</h1>");
    expect(html).toContain("GSTIN 27AAACR5055K1Z5");
    expect(html).toContain("IGST 18%");
    expect(html).toContain("HSN/SAC");
    expect(html).toContain("Subtotal");
  });
});


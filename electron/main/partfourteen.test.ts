import { beforeEach, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { migrate } from "./db/migrations";
import { createCompany, setCompanyCountry } from "./repositories/companies";
import { createLead } from "./repositories/leads";
import { addPayment, findInvoice, saveInvoice, setInvoiceStatus } from "./repositories/money";
import { companyBilling, invoiceLook, setCompanyBilling, setInvoiceLook, setTaxRules, taxRules } from "./repositories/billing";
import { leadInput, type Company } from "@shared/domain";

/** Part fourteen (PLAN.md): rules of the company's own, TDS withheld, composition, numbers as the company writes them. */

let db: Database.Database;
let company: Company;
let lead: string;

const none = { taxOn: false, taxRate: null, taxInclusive: false, taxRegion: null, taxNumber: null, paymentTerms: null, hourlyRate: null };

beforeEach(() => {
  db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  migrate(db);
  company = createCompany(db, { name: "PaperKite", accent: "blue", timezone: "Asia/Kolkata" });
  setCompanyCountry(db, company.id, "IN");
  lead = createLead(db, company.id, leadInput.parse({ name: "Leaflet Studio" })).id;
});

const invoice = (unitPrice = 100000) => {
  const made = saveInvoice(db, company.id, null, { leadId: lead, issuedOn: "2026-10-01", dueOn: "2026-10-15", notes: null, lines: [{ description: "Design", quantity: 1, unitPrice, productId: null }] });
  setInvoiceStatus(db, company.id, made.id, "sent");
  return made;
};

describe("tax a client withheld", () => {
  it("pays the invoice with what came in, so 90% received and 10% TDS is paid", () => {
    const made = invoice();
    addPayment(db, company.id, made.id, { amount: 90000, withheld: 10000, paidOn: "2026-10-20", note: null });
    expect(findInvoice(db, made.id)).toMatchObject({ status: "paid", paid: 100000 });
    expect(findInvoice(db, made.id)?.payments[0]).toMatchObject({ amount: 90000, withheld: 10000 });
  });
});

describe("the company's own rules", () => {
  it("keep only what differs from the country's, and go back to it when cleared", () => {
    const kept = setTaxRules(db, company.id, { ...taxRules(db, company.id).rules, rates: [18, 12, 5], name: "GST" });
    expect(kept.changes).toEqual({ rates: [18, 12, 5] });
    expect(companyBilling(db, company.id).rules.rates).toEqual([18, 12, 5]);
    expect(setTaxRules(db, company.id, {}).changes).toEqual({});
    expect(companyBilling(db, company.id).rules.rates).toEqual([18, 5, 40, 0]);
  });

  it("are on composition only when not charging, never both", () => {
    expect(setCompanyBilling(db, company.id, { ...none, composition: true }).composition).toBe(true);
    expect(setCompanyBilling(db, company.id, { ...none, taxOn: true, taxRate: 18, composition: true }).composition).toBe(false);
  });
});

describe("an invoice's number as the company writes it", () => {
  it("carries the financial year, and the count goes on", () => {
    setInvoiceLook(db, company.id, { ...invoiceLook(db, company.id), numbering: { prefix: "PK", year: "financial", digits: 4 } });
    expect(invoice().label).toBe("PK/26-27/0001");
    expect(invoice().label).toBe("PK/26-27/0002");
  });
});

import type { Db } from "../db/connection";
import { companyCountry } from "./companies";
import type { ClientTax, CompanyTax } from "@shared/tax";
import type { ClientBilling, CompanyBilling, CompanyBillingChanges } from "@shared/billing";
import { invoiceLookInput, readInvoiceLook, type InvoiceLook } from "@shared/invoicelook";
import { defaultTaxRules, readTaxRules, resolveTaxRules, taxRulesInput, type TaxRules, type TaxRulesChanges } from "@shared/taxrules";

/**
 * What a company charges and how it is paid, and the same of each client
 * (PLAN.md, part thirteen): tax, payment terms, an hourly rate.
 *
 * A client's are kept apart from the contact's form on purpose: the form,
 * Import, the contacts sheet and the line all save a contact through
 * `leadInput`, and none of them should be able to clear a GSTIN.
 */

type CompanyRow = {
  country: string | null;
  tax_on: number;
  tax_rate: number | null;
  tax_inclusive: number;
  tax_region: string | null;
  tax_number: string | null;
  payment_terms: number | null;
  hourly_rate: number | null;
  tax_scheme: string | null;
  tax_rules: string | null;
};

/** Days to pay when nobody has said: a fortnight, as accepting a quote always gave. */
const DEFAULT_TERMS = 14;

export function companyBilling(db: Db, companyId: string): CompanyBilling {
  const row = db
    .prepare(`SELECT country, tax_on, tax_rate, tax_inclusive, tax_region, tax_number, payment_terms, hourly_rate, tax_scheme, tax_rules FROM companies WHERE id = ?`)
    .get(companyId) as CompanyRow | undefined;
  if (!row) throw new Error("That company no longer exists.");
  // Where it is, said or worked out from its money and its clock, as everything else reads it.
  const country = companyCountry(db, companyId);
  return {
    country,
    taxOn: row.tax_on === 1,
    taxRate: row.tax_rate,
    taxInclusive: row.tax_inclusive === 1,
    taxRegion: row.tax_region,
    taxNumber: row.tax_number,
    paymentTerms: row.payment_terms,
    hourlyRate: row.hourly_rate,
    composition: row.tax_scheme === "composition",
    rules: resolveTaxRules(country, readTaxRules(row.tax_rules)),
  };
}

export function setCompanyBilling(db: Db, companyId: string, input: CompanyBillingChanges): CompanyBilling {
  // Registered and charging, or on composition: never both.
  const composition = input.composition === true && !input.taxOn;
  const changed = db
    .prepare(
      `UPDATE companies SET tax_on = ?, tax_rate = ?, tax_inclusive = ?, tax_region = ?, tax_number = ?, payment_terms = ?, hourly_rate = ?, tax_scheme = ?, updated_at = ?
        WHERE id = ?`,
    )
    .run(
      input.taxOn ? 1 : 0,
      input.taxRate,
      input.taxInclusive ? 1 : 0,
      input.taxRegion,
      input.taxNumber,
      input.paymentTerms,
      input.hourlyRate,
      composition ? "composition" : null,
      new Date().toISOString(),
      companyId,
    ).changes;
  if (changed === 0) throw new Error("That company no longer exists.");
  return companyBilling(db, companyId);
}

/** The company's rules: what it changed, what applies, and what its country starts from - for Settings to show and reset. */
export function taxRules(db: Db, companyId: string): { changes: TaxRulesChanges; rules: TaxRules; defaults: TaxRules } {
  const row = db.prepare(`SELECT country, tax_rules FROM companies WHERE id = ?`).get(companyId) as { country: string | null; tax_rules: string | null } | undefined;
  if (!row) throw new Error("That company no longer exists.");
  const changes = readTaxRules(row.tax_rules);
  const country = companyCountry(db, companyId);
  return { changes, rules: resolveTaxRules(country, changes), defaults: defaultTaxRules(country) };
}

/** Keeps the company's own rules. Only what differs from its country's is kept, so a corrected default still reaches it. */
export function setTaxRules(db: Db, companyId: string, raw: unknown): { changes: TaxRulesChanges; rules: TaxRules; defaults: TaxRules } {
  const input = taxRulesInput.parse(raw);
  const row = db.prepare(`SELECT country FROM companies WHERE id = ?`).get(companyId) as { country: string | null } | undefined;
  if (!row) throw new Error("That company no longer exists.");
  const defaults = defaultTaxRules(companyCountry(db, companyId)) as Record<string, unknown>;
  const changes = Object.fromEntries(
    Object.entries(input).filter(([key, value]) => value !== undefined && JSON.stringify(value) !== JSON.stringify(defaults[key])),
  );
  db.prepare(`UPDATE companies SET tax_rules = ?, updated_at = ? WHERE id = ?`).run(
    Object.keys(changes).length > 0 ? JSON.stringify(changes) : null,
    new Date().toISOString(),
    companyId,
  );
  return taxRules(db, companyId);
}

/** The company's settings as the tax rules read them. */
export function companyTax(db: Db, companyId: string): CompanyTax {
  const billing = companyBilling(db, companyId);
  return {
    country: billing.country,
    on: billing.taxOn,
    rate: billing.taxRate,
    inclusive: billing.taxInclusive,
    region: billing.taxRegion,
    number: billing.taxNumber,
    rules: billing.rules,
  };
}

export function clientBilling(db: Db, leadId: string): ClientBilling {
  const row = db.prepare(`SELECT tax_number, tax_country, tax_region, payment_terms, hourly_rate FROM leads WHERE id = ?`).get(leadId) as
    | { tax_number: string | null; tax_country: string | null; tax_region: string | null; payment_terms: number | null; hourly_rate: number | null }
    | undefined;
  if (!row) throw new Error("That contact no longer exists.");
  return {
    taxNumber: row.tax_number,
    taxCountry: row.tax_country,
    taxRegion: row.tax_region,
    paymentTerms: row.payment_terms,
    hourlyRate: row.hourly_rate,
  };
}

export function setClientBilling(db: Db, companyId: string, leadId: string, input: ClientBilling): ClientBilling {
  const changed = db
    .prepare(
      `UPDATE leads SET tax_number = ?, tax_country = ?, tax_region = ?, payment_terms = ?, hourly_rate = ?, updated_at = ?
        WHERE id = ? AND company_id = ?`,
    )
    .run(input.taxNumber, input.taxCountry, input.taxRegion, input.paymentTerms, input.hourlyRate, new Date().toISOString(), leadId, companyId).changes;
  if (changed === 0) throw new Error("That contact is not in this company.");
  return clientBilling(db, leadId);
}

export function clientTax(db: Db, leadId: string): ClientTax {
  const billing = clientBilling(db, leadId);
  return { country: billing.taxCountry, region: billing.taxRegion, number: billing.taxNumber };
}

/** Days a client has to pay: their own terms, else the company's, else a fortnight. */
export function termsFor(db: Db, companyId: string, leadId: string): number {
  return clientBilling(db, leadId).paymentTerms ?? companyBilling(db, companyId).paymentTerms ?? DEFAULT_TERMS;
}

/** What an hour of a client's time is billed at: their own rate, else the company's; null when neither is said. */
export function rateOfHour(db: Db, companyId: string, leadId: string): number | null {
  return clientBilling(db, leadId).hourlyRate ?? companyBilling(db, companyId).hourlyRate;
}

/** How the company's invoices look and where their copies go (part fourteen); the default when never set. */
export function invoiceLook(db: Db, companyId: string): InvoiceLook {
  const row = db.prepare(`SELECT invoice_look FROM companies WHERE id = ?`).get(companyId) as { invoice_look: string | null } | undefined;
  if (!row) throw new Error("That company no longer exists.");
  return readInvoiceLook(row.invoice_look);
}

export function setInvoiceLook(db: Db, companyId: string, raw: unknown): InvoiceLook {
  const look = invoiceLookInput.parse(raw);
  const changed = db
    .prepare(`UPDATE companies SET invoice_look = ?, updated_at = ? WHERE id = ?`)
    .run(JSON.stringify(look), new Date().toISOString(), companyId).changes;
  if (changed === 0) throw new Error("That company no longer exists.");
  return look;
}

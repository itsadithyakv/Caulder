import { z } from "zod";
import { isCountry } from "./countries";
import type { TaxRules } from "./taxrules";

/**
 * What a company charges and how it is paid, and the same of a client
 * (PLAN.md, part thirteen): tax (shared/tax.ts), payment terms, an hourly
 * rate. Kept by electron/main/repositories/billing.ts.
 */

export type CompanyBilling = {
  /** Where the company is: decides which tax, and its name. */
  country: string | null;
  /** Registered, and charging its country's tax. */
  taxOn: boolean;
  /** The rate a new line starts at, as a percentage. */
  taxRate: number | null;
  /** Prices said with the tax in them. */
  taxInclusive: boolean;
  /** India's state or Canada's province, when the tax number does not say. */
  taxRegion: string | null;
  /** The company's own tax number: a GSTIN, a VAT number, an ABN. */
  taxNumber: string | null;
  /** Days a client has to pay, unless their own say otherwise. */
  paymentTerms: number | null;
  /** What an hour is billed at, in whole units, unless the client's own says otherwise. */
  hourlyRate: number | null;
  /** On a scheme that charges no tax and writes its own document: India's composition (migration 62). */
  composition: boolean;
  /** Its tax and invoicing rules as they apply: the country's, with its own changes (shared/taxrules.ts). Read only here. */
  rules: TaxRules;
};

/** What Settings saves: everything but the country and the rules, which have their own; composition may be left out. */
export type CompanyBillingChanges = Omit<CompanyBilling, "country" | "rules" | "composition"> & { composition?: boolean };

export type ClientBilling = {
  taxNumber: string | null;
  /** The country they are in, for tax: a client abroad is not charged. */
  taxCountry: string | null;
  /** Their state or province, where it changes the tax. */
  taxRegion: string | null;
  paymentTerms: number | null;
  hourlyRate: number | null;
};

const text = (most: number) =>
  z
    .string()
    .trim()
    .max(most, `Keep it under ${most} characters.`)
    .nullable()
    .transform((value) => (value ? value : null));

const terms = z
  .number()
  .int("Days, as a whole number.")
  .min(0, "Days cannot be fewer than none.")
  .max(365, "A year is the most.")
  .nullable();
const hourly = z.number().int("Whole units of the currency.").min(0, "A rate cannot be negative.").nullable();

export const companyBillingInput = z.object({
  taxOn: z.boolean(),
  taxRate: z.number().min(0, "A tax rate cannot be negative.").max(100, "A tax rate is at most 100%.").nullable(),
  taxInclusive: z.boolean(),
  taxRegion: text(20),
  taxNumber: text(40),
  paymentTerms: terms,
  hourlyRate: hourly,
  composition: z.boolean().default(false),
});

export const clientBillingInput = z.object({
  taxNumber: text(40).transform((value) => (value ? value.toUpperCase().replace(/\s+/g, "") : null)),
  taxCountry: z
    .string()
    .nullable()
    .refine((value) => value === null || isCountry(value), "That is not a country."),
  taxRegion: text(20),
  paymentTerms: terms,
  hourlyRate: hourly,
});

/** How payment terms are said: "On receipt", "7 days". */
export function sayTerms(days: number): string {
  return days === 0 ? "On receipt" : days === 1 ? "1 day" : `${days} days`;
}

/** The terms offered as chips; any other number can be typed. */
export const TERMS_OFFERED = [0, 7, 14, 30, 45, 60] as const;

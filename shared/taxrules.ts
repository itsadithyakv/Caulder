import { z } from "zod";
import { taxSystemFor } from "./tax";
import { COMPOSITION, INDIA_TDS_RATE, invoiceRulesFor } from "./invoicerules";
import { yearStartsIn } from "./accountant";

/**
 * A company's tax and invoicing rules, as it keeps them (PLAN.md, part
 * fourteen). What Caulder knows of a country - shared/tax.ts and
 * shared/invoicerules.ts - is only where they start: every value here can be
 * changed in Settings, so a new rate or new words in the law are typed in the
 * day they come, not waited for in an update. A country Caulder knows nothing
 * of starts blank, and this is how its invoices are built.
 *
 * Kept as the changes alone (`companies.tax_rules`, migration 62), so a
 * company that changed nothing follows the defaults as they are corrected.
 *
 * What stays fixed is the shape of each law, not its numbers: GST split as
 * CGST and SGST in the same Indian state, a reverse charge inside the EU.
 */

export type TaxRules = {
  /** What the tax is called: GST, VAT, IVA. */
  name: string;
  /** What the company's tax number is called: GSTIN, VAT number, ABN. */
  numberLabel: string;
  /** The rates offered, the usual one first. */
  rates: number[];
  /** A document that charges tax: "Tax invoice" where the law asks for the words. */
  title: string;
  /** One that charges none. */
  plainTitle: string;
  /** What a document from a business that has not registered says, where the law gives words; null for nothing. */
  exemptNote: string | null;
  /** Under what a business need not register, for Settings to say. */
  threshold: string | null;
  /** The same as a sum, for Money to measure the year's turnover against. Null for none. */
  thresholdAmount: number | null;
  /** A scheme where a small business charges no tax and writes a different document: India's composition. */
  composition: { title: string; note: string } | null;
  /** Tax a client keeps back from a payment and pays in the company's name: India's TDS. */
  withholding: { name: string; rate: number } | null;
  /** The month the financial year starts, 1 to 12. */
  yearStarts: number;
  /** The numbers a business usually prints beside its name. */
  ids: string[];
};

const rate = z.number().min(0, "A rate cannot be negative.").max(100, "A rate is a percentage.");
const text = (max: number) => z.string().trim().max(max);

/** What a company changed. Every field may be left out, and then the country's is used. */
export const taxRulesInput = z.object({
  name: text(30).min(1, "Name the tax.").optional(),
  numberLabel: text(40).min(1, "Name the tax number.").optional(),
  rates: z.array(rate).max(12, "Twelve rates is plenty.").optional(),
  title: text(40).min(1, "Give the document a title.").optional(),
  plainTitle: text(40).min(1, "Give the document a title.").optional(),
  exemptNote: text(300).nullable().optional(),
  threshold: text(160).nullable().optional(),
  thresholdAmount: z.number().int().min(0).nullable().optional(),
  composition: z.object({ title: text(40).min(1), note: text(300).min(1) }).nullable().optional(),
  withholding: z.object({ name: text(20).min(1, "Name the tax withheld."), rate }).nullable().optional(),
  yearStarts: z.number().int().min(1).max(12).optional(),
  ids: z.array(text(30).min(1)).max(6).optional(),
});
export type TaxRulesChanges = z.infer<typeof taxRulesInput>;

/** The rules a country starts with. */
export function defaultTaxRules(country: string | null | undefined): TaxRules {
  const system = taxSystemFor(country);
  const more = invoiceRulesFor(country);
  const home = (country ?? "").toUpperCase();
  return {
    name: system.name,
    numberLabel: system.numberLabel,
    rates: [...system.rates],
    title: system.invoiceTitle,
    plainTitle: "Invoice",
    exemptNote: more.exemptNote ?? null,
    threshold: more.threshold ?? null,
    thresholdAmount: more.thresholdAmount ?? null,
    composition: home === "IN" ? { ...COMPOSITION } : null,
    withholding: home === "IN" ? { name: "TDS", rate: INDIA_TDS_RATE } : null,
    yearStarts: yearStartsIn(country),
    ids: [...(more.ids ?? [])],
  };
}

/** The changes a company kept, read safely: anything unreadable is no change. */
export function readTaxRules(raw: string | null): TaxRulesChanges {
  if (!raw) return {};
  try {
    const parsed = taxRulesInput.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : {};
  } catch {
    return {};
  }
}

/** The rules as they apply: the country's, with what the company changed on top. */
export function resolveTaxRules(country: string | null | undefined, changes: TaxRulesChanges): TaxRules {
  const base = defaultTaxRules(country);
  const defined = Object.fromEntries(Object.entries(changes).filter(([, value]) => value !== undefined)) as Partial<TaxRules>;
  return { ...base, ...defined };
}

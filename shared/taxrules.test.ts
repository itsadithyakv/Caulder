import { describe, expect, it } from "vitest";
import { defaultTaxRules, readTaxRules, resolveTaxRules } from "./taxrules";
import { formatInvoiceNumber } from "./invoicelook";
import { taxed } from "./tax";

describe("a company's own tax rules", () => {
  it("start from the country's, India's with composition, TDS and an April year", () => {
    expect(defaultTaxRules("IN")).toMatchObject({
      name: "GST",
      numberLabel: "GSTIN",
      title: "Tax invoice",
      composition: { title: "Bill of supply" },
      withholding: { name: "TDS", rate: 10 },
      yearStarts: 4,
      thresholdAmount: 2000000,
      ids: ["PAN", "Udyam"],
    });
    expect(defaultTaxRules("FR").exemptNote).toBe("TVA non applicable, art. 293 B du CGI.");
  });

  it("start blank where Caulder knows nothing, to be built by hand", () => {
    expect(defaultTaxRules("ZZ")).toMatchObject({ name: "Tax", rates: [], exemptNote: null, composition: null, withholding: null, yearStarts: 1 });
  });

  it("take what the company changed over the country's, so a new rate is typed and not waited for", () => {
    const rules = resolveTaxRules("IN", { rates: [18, 12, 5], withholding: { name: "TDS", rate: 2 } });
    expect(rules.rates).toEqual([18, 12, 5]);
    expect(rules.withholding).toEqual({ name: "TDS", rate: 2 });
    expect(rules.name).toBe("GST");
    expect(taxed([{ quantity: 1, unitPrice: 1000, taxRate: 10 }], { treatment: "standard", inclusive: false, country: "ZZ", name: "Sales tax" }).tax[0]?.label).toBe("Sales tax 10%");
  });

  it("read nothing unreadable as a change", () => {
    expect(readTaxRules("not json")).toEqual({});
    expect(readTaxRules(JSON.stringify({ rates: ["lots"] }))).toEqual({});
  });
});

describe("an invoice's number as the company writes it", () => {
  it("is INV-0042 as it always was, or carries the year it was issued in", () => {
    expect(formatInvoiceNumber({ prefix: "INV", year: "none", digits: 4 }, 42, "2026-10-25", 4)).toBe("INV-0042");
    expect(formatInvoiceNumber({ prefix: "PK", year: "financial", digits: 4 }, 42, "2026-10-25", 4)).toBe("PK/26-27/0042");
    expect(formatInvoiceNumber({ prefix: "PK", year: "financial", digits: 4 }, 43, "2027-02-01", 4)).toBe("PK/26-27/0043");
    expect(formatInvoiceNumber({ prefix: "", year: "calendar", digits: 5 }, 7, "2026-10-25", 1)).toBe("2026/00007");
    // A financial year that is the calendar's is said as the year.
    expect(formatInvoiceNumber({ prefix: "INV", year: "financial", digits: 3 }, 7, "2026-10-25", 1)).toBe("INV/2026/007");
  });

  it("fits in sixteen characters, as India's rule 46 asks, at its longest", () => {
    expect(formatInvoiceNumber({ prefix: "ABCDE", year: "financial", digits: 4 }, 9999, "2026-10-25", 4).length).toBeLessThanOrEqual(16);
  });
});

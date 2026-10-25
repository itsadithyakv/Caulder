import { describe, expect, it } from "vitest";
import { rateFor, taxKnown, taxSystemFor, taxed, treatmentFor, type CompanyTax } from "./tax";

const company = (over: Partial<CompanyTax> = {}): CompanyTax => ({
  country: "IN",
  on: true,
  rate: 18,
  inclusive: false,
  region: null,
  number: "29ABCDE1234F1Z5",
  ...over,
});
const line = (unitPrice: number, taxRate: number | null = 18, quantity = 1) => ({ quantity, unitPrice, taxRate });

describe("each country's tax", () => {
  it("is named, numbered and rated where it is known, and typed anywhere else", () => {
    expect(taxSystemFor("IN")).toMatchObject({ name: "GST", numberLabel: "GSTIN", invoiceTitle: "Tax invoice" });
    expect(taxSystemFor("DE")).toMatchObject({ name: "VAT", rates: [19, 7], eu: true });
    expect(taxSystemFor("AU")).toMatchObject({ name: "GST", numberLabel: "ABN", inclusive: true });
    expect(taxSystemFor("AE")).toMatchObject({ name: "VAT", numberLabel: "TRN" });
    expect(taxSystemFor("MX")).toMatchObject({ name: "IVA", numberLabel: "RFC", rates: [16, 8, 0] });
    expect(taxKnown("FJ")).toBe(false);
    expect(taxSystemFor("FJ")).toMatchObject({ name: "Tax", rates: [] });
  });

  it("knows every member of the European Union", () => {
    for (const code of ["AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU", "IE", "IT", "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK", "SI", "ES", "SE"]) {
      expect(taxSystemFor(code).eu, code).toBe(true);
    }
    expect(taxSystemFor("GB").eu).toBeUndefined();
  });
});

describe("India", () => {
  it("splits GST into CGST and SGST in the company's own state", () => {
    const client = { country: null, region: null, number: "29AAACR5055K1Z5" };
    expect(treatmentFor(company(), client)).toBe("india-intra");
    const money = taxed([line(10000), line(5000)], { treatment: "india-intra", inclusive: false, country: "IN" });
    expect(money).toEqual({
      subtotal: 15000,
      tax: [
        { label: "CGST 9%", rate: 9, amount: 1350 },
        { label: "SGST 9%", rate: 9, amount: 1350 },
      ],
      total: 17700,
      note: null,
    });
  });

  it("charges IGST to a client in another state, read from their GSTIN", () => {
    const client = { country: null, region: null, number: "27AAACR5055K1Z5" };
    expect(treatmentFor(company(), client)).toBe("india-inter");
    expect(taxed([line(10000)], { treatment: "india-inter", inclusive: false, country: "IN" }).tax).toEqual([{ label: "IGST 18%", rate: 18, amount: 1800 }]);
  });

  it("charges nothing on an export, and says why", () => {
    const client = { country: "US", region: null, number: null };
    expect(treatmentFor(company(), client)).toBe("export");
    const money = taxed([line(10000)], { treatment: "export", inclusive: false, country: "IN" });
    expect(money.total).toBe(10000);
    expect(money.note).toMatch(/Export of services/);
  });
});

describe("the European Union", () => {
  const berlin = company({ country: "DE", rate: 19, number: "DE123456789" });

  it("charges VAT at home, and to a consumer elsewhere in the Union", () => {
    expect(treatmentFor(berlin, { country: null, region: null, number: null })).toBe("standard");
    expect(treatmentFor(berlin, { country: "FR", region: null, number: null })).toBe("standard");
  });

  it("is a reverse charge to a business elsewhere in the Union, read from its VAT number", () => {
    expect(treatmentFor(berlin, { country: null, region: null, number: "FR12345678901" })).toBe("reverse");
    expect(treatmentFor(berlin, { country: null, region: null, number: "EL123456789" })).toBe("reverse");
    const money = taxed([line(1000, 19)], { treatment: "reverse", inclusive: false, country: "DE" });
    expect(money).toMatchObject({ subtotal: 1000, tax: [], total: 1000 });
    expect(money.note).toMatch(/^Reverse charge/);
  });

  it("is not charged to a client outside it", () => {
    expect(treatmentFor(berlin, { country: "US", region: null, number: null })).toBe("export");
  });
});

describe("Canada", () => {
  const toronto = company({ country: "CA", rate: 13, region: "ON", number: "123456789RT0001" });

  it("takes the client's province's rate, and writes HST in one line", () => {
    const ontario = { country: null, region: "ON", number: null };
    expect(rateFor(toronto, ontario, treatmentFor(toronto, ontario))).toBe(13);
    expect(taxed([line(1000, 13)], { treatment: "canada", inclusive: false, country: "CA", region: "ON" }).tax).toEqual([{ label: "HST 13%", rate: 13, amount: 130 }]);
  });

  it("writes GST and QST apart for Quebec", () => {
    const quebec = { country: null, region: "QC", number: null };
    expect(rateFor(toronto, quebec, "canada")).toBe(14.975);
    expect(taxed([line(1000, 14.975)], { treatment: "canada", inclusive: false, country: "CA", region: "QC" }).tax).toEqual([
      { label: "GST 5%", rate: 5, amount: 50 },
      { label: "QST 9.975%", rate: 9.975, amount: 100 },
    ]);
  });

  it("charges only GST in Alberta", () => {
    expect(taxed([line(1000, 5)], { treatment: "canada", inclusive: false, country: "CA", region: "AB" }).tax).toEqual([{ label: "GST 5%", rate: 5, amount: 50 }]);
  });
});

describe("prices with the tax in", () => {
  it("take the tax out of the amount rather than adding it", () => {
    const money = taxed([line(110, 10)], { treatment: "standard", inclusive: true, country: "AU" });
    expect(money).toMatchObject({ subtotal: 100, tax: [{ label: "GST 10%", amount: 10 }], total: 110 });
  });
});

describe("a company that charges nothing", () => {
  it("has no treatment, and a document's total is its lines", () => {
    expect(treatmentFor(company({ on: false }), { country: null, region: null, number: null })).toBeNull();
    expect(taxed([line(500, 18), line(250, null)], { treatment: null, inclusive: false, country: "IN" })).toEqual({ subtotal: 750, tax: [], total: 750, note: null });
  });

  it("leaves a line with no rate untaxed, and groups the rest by rate", () => {
    const money = taxed([line(1000, 20), line(1000, 5), line(1000, null), line(500, 20)], { treatment: "standard", inclusive: false, country: "GB" });
    expect(money.tax).toEqual([
      { label: "VAT 20%", rate: 20, amount: 300 },
      { label: "VAT 5%", rate: 5, amount: 50 },
    ]);
    expect(money.total).toBe(3850);
  });
});

describe("the tax's rounding", () => {
  it("rounds once a rate rather than once a line", () => {
    const money = taxed([line(99, 21), line(99, 21), line(99, 21)], { treatment: "standard", inclusive: false, country: "NL" });
    expect(money.tax).toEqual([{ label: "VAT 21%", rate: 21, amount: 62 }]);
    expect(money.total).toBe(359);
  });

  it("writes British Columbia's GST once when lines with and without PST sit together", () => {
    const money = taxed([line(1000, 12), line(500, 5)], { treatment: "canada", inclusive: false, country: "CA", region: "BC" });
    expect(money.tax).toEqual([
      { label: "GST 5%", rate: 5, amount: 75 },
      { label: "PST 7%", rate: 7, amount: 70 },
    ]);
    expect(money.total).toBe(1645);
  });
});

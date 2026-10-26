import { countryName } from "./countries";
import type { TaxRules } from "./taxrules";

/**
 * Tax on a quote or an invoice (PLAN.md, part thirteen, phase 51): what it is
 * called where the company is, its usual rates, and how a document's tax is
 * worked out and written.
 *
 * **The rate is the line's**, kept on it when it is saved, and **the
 * treatment is the document's** - charged as usual, split between centre and
 * state, reverse charge, not charged on an export - decided when it is made
 * and kept with it. So a change to the company's settings next year never
 * rewrites an invoice already sent.
 *
 * Rates are as they stood in 2026. They change, and some depend on what is
 * sold: every one can be typed instead, and the setting says so. Nothing here
 * is advice; an accountant has the last word.
 */

type TaxRegion = {
  code: string;
  name: string;
  /** The rate a client here usually pays, where the region decides it (Canada). */
  rate?: number;
  /** Canada: how the rate is written - HST as one, or GST and the province's own. */
  provincial?: { name: string; rate: number } | "hst";
};

type TaxSystem = {
  country: string;
  /** What the tax is called: GST, VAT, IVA, Sales tax. */
  name: string;
  /** What the company's tax number is called: GSTIN, VAT number, ABN. */
  numberLabel: string;
  /** The usual rates, the standard one first. */
  rates: readonly number[];
  /** "Tax invoice" where the law asks for the words; "Invoice" elsewhere. */
  invoiceTitle: string;
  /** Places within the country that change the tax: India's states, Canada's provinces. */
  regions?: readonly TaxRegion[];
  /** In the European Union, where a business client elsewhere in it pays the VAT themselves. */
  eu?: boolean;
  /** The two letters an EU VAT number starts with, when they are not the country's own (Greece is EL). */
  vatPrefix?: string;
  /** Whether prices there are usually said with the tax in. */
  inclusive?: boolean;
};

/** India's states and union territories, by the two digits a GSTIN starts with. */
const INDIA_STATES: readonly TaxRegion[] = (
  "01 Jammu and Kashmir|02 Himachal Pradesh|03 Punjab|04 Chandigarh|05 Uttarakhand|06 Haryana|07 Delhi|08 Rajasthan|" +
  "09 Uttar Pradesh|10 Bihar|11 Sikkim|12 Arunachal Pradesh|13 Nagaland|14 Manipur|15 Mizoram|16 Tripura|17 Meghalaya|" +
  "18 Assam|19 West Bengal|20 Jharkhand|21 Odisha|22 Chhattisgarh|23 Madhya Pradesh|24 Gujarat|" +
  "26 Dadra and Nagar Haveli and Daman and Diu|27 Maharashtra|29 Karnataka|30 Goa|31 Lakshadweep|32 Kerala|33 Tamil Nadu|" +
  "34 Puducherry|35 Andaman and Nicobar Islands|36 Telangana|37 Andhra Pradesh|38 Ladakh|97 Other Territory"
)
  .split("|")
  .map((entry) => ({ code: entry.slice(0, 2), name: entry.slice(3) }));

/** Canada's provinces and territories: HST in one line, or GST and the province's own beside it. */
const CANADA_PROVINCES: readonly TaxRegion[] = [
  { code: "AB", name: "Alberta", rate: 5 },
  { code: "BC", name: "British Columbia", rate: 5, provincial: { name: "PST", rate: 7 } },
  { code: "MB", name: "Manitoba", rate: 5, provincial: { name: "RST", rate: 7 } },
  { code: "NB", name: "New Brunswick", rate: 15, provincial: "hst" },
  { code: "NL", name: "Newfoundland and Labrador", rate: 15, provincial: "hst" },
  { code: "NS", name: "Nova Scotia", rate: 14, provincial: "hst" },
  { code: "NT", name: "Northwest Territories", rate: 5 },
  { code: "NU", name: "Nunavut", rate: 5 },
  { code: "ON", name: "Ontario", rate: 13, provincial: "hst" },
  { code: "PE", name: "Prince Edward Island", rate: 15, provincial: "hst" },
  { code: "QC", name: "Quebec", rate: 14.975, provincial: { name: "QST", rate: 9.975 } },
  { code: "SK", name: "Saskatchewan", rate: 5, provincial: { name: "PST", rate: 6 } },
  { code: "YT", name: "Yukon", rate: 5 },
];

/** The European Union's VAT, by country: the standard rate first, then the reduced ones. */
const EU =
  "AT 20 10 13|BE 21 6 12|BG 20 9|HR 25 5 13|CY 19 5 9|CZ 21 12|DK 25|EE 24 9 13|FI 25.5 10 14|FR 20 5.5 10|DE 19 7|" +
  "GR 24 6 13|HU 27 5 18|IE 23 9 13.5|IT 22 5 10|LV 21 12|LT 21 9|LU 17 8 14|MT 18 5 7|NL 21 9|PL 23 5 8|PT 23 6 13|" +
  "RO 21 11|SK 23 19 5|SI 22 9.5|ES 21 10|SE 25 6 12";

/** Everywhere else with a tax worth naming: country, name, number label, title, rates. */
const OTHERS: readonly Omit<TaxSystem, "regions" | "eu">[] = [
  { country: "GB", name: "VAT", numberLabel: "VAT number", invoiceTitle: "Invoice", rates: [20, 5, 0] },
  { country: "CH", name: "VAT", numberLabel: "VAT number", invoiceTitle: "Invoice", rates: [8.1, 2.6, 3.8] },
  { country: "LI", name: "VAT", numberLabel: "VAT number", invoiceTitle: "Invoice", rates: [8.1, 2.6, 3.8] },
  { country: "NO", name: "VAT", numberLabel: "VAT number", invoiceTitle: "Invoice", rates: [25, 15, 12] },
  { country: "IS", name: "VAT", numberLabel: "VAT number", invoiceTitle: "Invoice", rates: [24, 11] },
  { country: "TR", name: "VAT", numberLabel: "Tax number", invoiceTitle: "Invoice", rates: [20, 10, 1] },
  { country: "RS", name: "VAT", numberLabel: "PIB", invoiceTitle: "Invoice", rates: [20, 10] },
  { country: "UA", name: "VAT", numberLabel: "Tax number", invoiceTitle: "Invoice", rates: [20, 14, 7] },
  { country: "ME", name: "VAT", numberLabel: "Tax number", invoiceTitle: "Invoice", rates: [21, 7, 15] },
  { country: "MK", name: "VAT", numberLabel: "Tax number", invoiceTitle: "Invoice", rates: [18, 5, 10] },
  { country: "AL", name: "VAT", numberLabel: "NIPT", invoiceTitle: "Invoice", rates: [20, 6] },
  { country: "BA", name: "VAT", numberLabel: "Tax number", invoiceTitle: "Invoice", rates: [17] },
  { country: "MD", name: "VAT", numberLabel: "Tax number", invoiceTitle: "Invoice", rates: [20, 8] },
  { country: "GE", name: "VAT", numberLabel: "Tax number", invoiceTitle: "Invoice", rates: [18] },
  { country: "AM", name: "VAT", numberLabel: "Tax number", invoiceTitle: "Invoice", rates: [20] },
  { country: "AU", name: "GST", numberLabel: "ABN", invoiceTitle: "Tax invoice", rates: [10, 0], inclusive: true },
  { country: "NZ", name: "GST", numberLabel: "GST number", invoiceTitle: "Tax invoice", rates: [15, 0], inclusive: true },
  { country: "SG", name: "GST", numberLabel: "GST reg. no.", invoiceTitle: "Tax invoice", rates: [9, 0] },
  { country: "MY", name: "Service tax", numberLabel: "SST no.", invoiceTitle: "Invoice", rates: [8, 6] },
  { country: "TH", name: "VAT", numberLabel: "Tax ID", invoiceTitle: "Tax invoice", rates: [7] },
  { country: "VN", name: "VAT", numberLabel: "Tax code", invoiceTitle: "Invoice", rates: [10, 8, 5] },
  { country: "PH", name: "VAT", numberLabel: "TIN", invoiceTitle: "Invoice", rates: [12, 0] },
  { country: "ID", name: "VAT", numberLabel: "NPWP", invoiceTitle: "Invoice", rates: [12, 11] },
  { country: "JP", name: "Consumption tax", numberLabel: "Registration number", invoiceTitle: "Invoice", rates: [10, 8] },
  { country: "KR", name: "VAT", numberLabel: "Business registration no.", invoiceTitle: "Invoice", rates: [10] },
  { country: "TW", name: "Business tax", numberLabel: "Unified business no.", invoiceTitle: "Invoice", rates: [5] },
  { country: "CN", name: "VAT", numberLabel: "Taxpayer ID", invoiceTitle: "Invoice", rates: [6, 13, 9] },
  { country: "PK", name: "Sales tax", numberLabel: "NTN", invoiceTitle: "Invoice", rates: [18, 16, 13] },
  { country: "BD", name: "VAT", numberLabel: "BIN", invoiceTitle: "Invoice", rates: [15, 5] },
  { country: "LK", name: "VAT", numberLabel: "VAT number", invoiceTitle: "Tax invoice", rates: [18] },
  { country: "NP", name: "VAT", numberLabel: "PAN", invoiceTitle: "Tax invoice", rates: [13] },
  { country: "AE", name: "VAT", numberLabel: "TRN", invoiceTitle: "Tax invoice", rates: [5, 0] },
  { country: "SA", name: "VAT", numberLabel: "VAT number", invoiceTitle: "Tax invoice", rates: [15, 0] },
  { country: "BH", name: "VAT", numberLabel: "VAT number", invoiceTitle: "Tax invoice", rates: [10, 0] },
  { country: "OM", name: "VAT", numberLabel: "VAT number", invoiceTitle: "Tax invoice", rates: [5, 0] },
  { country: "EG", name: "VAT", numberLabel: "Tax number", invoiceTitle: "Tax invoice", rates: [14] },
  { country: "IL", name: "VAT", numberLabel: "VAT number", invoiceTitle: "Tax invoice", rates: [18] },
  { country: "JO", name: "Sales tax", numberLabel: "Tax number", invoiceTitle: "Invoice", rates: [16] },
  { country: "ZA", name: "VAT", numberLabel: "VAT number", invoiceTitle: "Tax invoice", rates: [15, 0] },
  { country: "NG", name: "VAT", numberLabel: "TIN", invoiceTitle: "Invoice", rates: [7.5] },
  { country: "KE", name: "VAT", numberLabel: "KRA PIN", invoiceTitle: "Tax invoice", rates: [16, 8, 0] },
  { country: "TZ", name: "VAT", numberLabel: "TIN", invoiceTitle: "Tax invoice", rates: [18] },
  { country: "UG", name: "VAT", numberLabel: "TIN", invoiceTitle: "Tax invoice", rates: [18] },
  { country: "RW", name: "VAT", numberLabel: "TIN", invoiceTitle: "Invoice", rates: [18] },
  { country: "MA", name: "VAT", numberLabel: "ICE", invoiceTitle: "Invoice", rates: [20, 14, 10, 7] },
  { country: "TN", name: "VAT", numberLabel: "Tax number", invoiceTitle: "Invoice", rates: [19, 13, 7] },
  { country: "DZ", name: "VAT", numberLabel: "NIF", invoiceTitle: "Invoice", rates: [19, 9] },
  { country: "MX", name: "IVA", numberLabel: "RFC", invoiceTitle: "Invoice", rates: [16, 8, 0] },
  { country: "AR", name: "IVA", numberLabel: "CUIT", invoiceTitle: "Invoice", rates: [21, 10.5, 27] },
  { country: "CL", name: "IVA", numberLabel: "RUT", invoiceTitle: "Invoice", rates: [19] },
  { country: "CO", name: "IVA", numberLabel: "NIT", invoiceTitle: "Invoice", rates: [19, 5] },
  { country: "PE", name: "IGV", numberLabel: "RUC", invoiceTitle: "Invoice", rates: [18] },
  { country: "UY", name: "IVA", numberLabel: "RUT", invoiceTitle: "Invoice", rates: [22, 10] },
  { country: "EC", name: "IVA", numberLabel: "RUC", invoiceTitle: "Invoice", rates: [15, 0] },
  { country: "CR", name: "IVA", numberLabel: "Cédula jurídica", invoiceTitle: "Invoice", rates: [13, 4, 2] },
  { country: "DO", name: "ITBIS", numberLabel: "RNC", invoiceTitle: "Invoice", rates: [18, 16] },
  { country: "GT", name: "IVA", numberLabel: "NIT", invoiceTitle: "Invoice", rates: [12] },
  { country: "PA", name: "ITBMS", numberLabel: "RUC", invoiceTitle: "Invoice", rates: [7] },
  { country: "PY", name: "IVA", numberLabel: "RUC", invoiceTitle: "Invoice", rates: [10, 5] },
  { country: "BO", name: "IVA", numberLabel: "NIT", invoiceTitle: "Invoice", rates: [13] },
  { country: "US", name: "Sales tax", numberLabel: "Tax ID", invoiceTitle: "Invoice", rates: [] },
];

const SYSTEMS: ReadonlyMap<string, TaxSystem> = new Map<string, TaxSystem>([
  ["IN", { country: "IN", name: "GST", numberLabel: "GSTIN", invoiceTitle: "Tax invoice", rates: [18, 5, 40, 0], regions: INDIA_STATES }],
  ["CA", { country: "CA", name: "GST", numberLabel: "GST/HST number", invoiceTitle: "Invoice", rates: [5, 13, 14, 15, 14.975], regions: CANADA_PROVINCES }],
  ...EU.split("|").map((entry): [string, TaxSystem] => {
    const [country = "", ...rates] = entry.split(" ");
    return [
      country,
      { country, name: "VAT", numberLabel: "VAT number", invoiceTitle: "Invoice", rates: rates.map(Number), eu: true, ...(country === "GR" ? { vatPrefix: "EL" } : {}) },
    ];
  }),
  ...OTHERS.map((system): [string, TaxSystem] => [system.country, system]),
]);

/** The tax where the company is, or a plain "Tax" anywhere without one named here - typed, never refused. */
export function taxSystemFor(country: string | null | undefined): TaxSystem {
  const known = country ? SYSTEMS.get(country.toUpperCase()) : undefined;
  return known ?? { country: (country ?? "").toUpperCase(), name: "Tax", numberLabel: "Tax number", invoiceTitle: "Invoice", rates: [] };
}

/** Whether Caulder knows this country's tax by name and rates, rather than offering a typed one. */
export function taxKnown(country: string | null | undefined): boolean {
  return Boolean(country && SYSTEMS.has(country.toUpperCase()));
}

/* ---- How a document is taxed ------------------------------------------- */

/**
 * How a document's tax is written:
 * - `standard` - the country's tax, by rate;
 * - `india-intra` / `india-inter` - CGST and SGST in half each, or IGST,
 *   as the client is in the company's state or another;
 * - `canada` - HST in one line, or GST and the province's tax;
 * - `reverse` - a business client in another EU country pays the VAT;
 * - `export` - a client abroad: not charged.
 */
export const TAX_TREATMENTS = ["standard", "india-intra", "india-inter", "canada", "reverse", "export"] as const;
export type TaxTreatment = (typeof TAX_TREATMENTS)[number];

/** What a company charges: nothing at all, or its country's tax at a default rate. */
export type CompanyTax = {
  country: string | null;
  /** Registered and charging. */
  on: boolean;
  /** The rate a new line starts at. */
  rate: number | null;
  /** Prices said with the tax in them. */
  inclusive: boolean;
  /** India's state or Canada's province the company is in, when its tax number does not say. */
  region: string | null;
  /** The company's own tax number. */
  number: string | null;
  /** Its rules as it keeps them (shared/taxrules.ts): the rates offered, the name. Left out, the country's. */
  rules?: Pick<TaxRules, "name" | "rates">;
};

/** What is known about a client for tax: where they are, and their own number. */
export type ClientTax = { country: string | null; region: string | null; number: string | null };

/** EU VAT numbers start with their country's two letters (Greece's with EL). */
function euCountryOfNumber(number: string | null): string | null {
  const prefix = number?.trim().toUpperCase().slice(0, 2);
  if (!prefix || !/^[A-Z]{2}$/.test(prefix)) return null;
  if (prefix === "EL") return "GR";
  return SYSTEMS.get(prefix)?.eu ? prefix : null;
}

/** A GSTIN starts with its state's two digits. */
function indianStateOfNumber(number: string | null): string | null {
  const digits = number?.trim().slice(0, 2);
  return digits && /^\d{2}$/.test(digits) && INDIA_STATES.some((state) => state.code === digits) ? digits : null;
}

/** Where a client is, for tax: what was said, else what their number says. */
function clientCountry(client: ClientTax, home: string | null): string | null {
  if (client.country) return client.country.toUpperCase();
  if (indianStateOfNumber(client.number) && home === "IN") return "IN";
  return euCountryOfNumber(client.number);
}

export function companyRegion(company: CompanyTax): string | null {
  if (company.country === "IN") return indianStateOfNumber(company.number) ?? company.region;
  return company.region;
}

export function clientRegion(client: ClientTax, home: string | null): string | null {
  if (home === "IN") return indianStateOfNumber(client.number) ?? client.region;
  return client.region;
}

/**
 * How a new document for this client is taxed, worked out from where both
 * are. Null when the company charges nothing. A client whose place is not
 * known is taken to be at home - the usual case, and the one that charges.
 */
export function treatmentFor(company: CompanyTax, client: ClientTax): TaxTreatment | null {
  if (!company.on || !company.country) return null;
  const home = company.country.toUpperCase();
  const system = taxSystemFor(home);
  const there = clientCountry(client, home) ?? home;
  if (there !== home) {
    if (system.eu && SYSTEMS.get(there)?.eu) return client.number ? "reverse" : "standard";
    return "export";
  }
  if (home === "IN") {
    const ours = companyRegion(company);
    const theirs = clientRegion(client, home);
    return ours && theirs && ours !== theirs ? "india-inter" : "india-intra";
  }
  if (home === "CA") return "canada";
  return "standard";
}

/** The rate a new line starts at for this client: Canada's by the client's province, else the company's. */
export function rateFor(company: CompanyTax, client: ClientTax, treatment: TaxTreatment | null): number | null {
  if (!treatment || treatment === "export" || treatment === "reverse") return null;
  if (treatment === "canada") {
    const province = CANADA_PROVINCES.find((each) => each.code === (clientRegion(client, "CA") ?? companyRegion(company)));
    if (province?.rate !== undefined) return province.rate;
  }
  return company.rate ?? (company.rules ?? taxSystemFor(company.country)).rates[0] ?? null;
}

export type TaxLine = { label: string; rate: number; amount: number };
type Taxed = {
  /** Before tax. */
  subtotal: number;
  /** One line a component and a rate: "CGST 9%", "VAT 20%", "QST 9.975%". */
  tax: TaxLine[];
  /** What is owed: the subtotal and the tax. */
  total: number;
  /** Said on the document when tax is not charged, and why. */
  note: string | null;
};

type TaxableLine = { quantity: number; unitPrice: number; taxRate: number | null };

const rateText = (rate: number) => `${Number(rate.toFixed(3))}%`;

/**
 * A document's money: each line's amount, the tax on all the lines at each
 * rate, and the tax written as the treatment says. Whole units: a line's
 * amount is rounded as it always was, and the tax once for each rate rather
 * than once a line, so it is never more than half a unit from the exact sum.
 * The total is the sum of what is printed.
 *
 * With prices said tax-in, the amounts at a rate are the total and the tax is
 * taken out of them; otherwise the tax goes on top.
 */
export function taxed(
  lines: readonly TaxableLine[],
  doc: {
    treatment: TaxTreatment | null;
    inclusive: boolean;
    country: string | null;
    region?: string | null;
    /** What the company calls the tax, as its rules say; left out, the country's. */
    name?: string;
  },
): Taxed {
  const charging = doc.treatment !== null && doc.treatment !== "export" && doc.treatment !== "reverse";
  let subtotal = 0;
  const atRate = new Map<number, number>();
  for (const line of lines) {
    const amount = Math.round(line.quantity * line.unitPrice);
    const rate = charging ? (line.taxRate ?? 0) : 0;
    if (rate <= 0) subtotal += amount;
    else atRate.set(rate, (atRate.get(rate) ?? 0) + amount);
  }
  const byRate = new Map<number, number>();
  for (const [rate, amount] of atRate) {
    const tax = doc.inclusive ? amount - Math.round((amount * 100) / (100 + rate)) : Math.round((amount * rate) / 100);
    subtotal += doc.inclusive ? amount - tax : amount;
    byRate.set(rate, tax);
  }

  const name = doc.name ?? taxSystemFor(doc.country).name;
  const tax: TaxLine[] = [];
  for (const [rate, amount] of [...byRate.entries()].sort((a, b) => b[0] - a[0])) {
    if (doc.treatment === "india-intra") {
      const half = Math.round(amount / 2);
      tax.push({ label: `CGST ${rateText(rate / 2)}`, rate: rate / 2, amount: half });
      tax.push({ label: `SGST ${rateText(rate / 2)}`, rate: rate / 2, amount: amount - half });
    } else if (doc.treatment === "india-inter") {
      tax.push({ label: `IGST ${rateText(rate)}`, rate, amount });
    } else if (doc.treatment === "canada") {
      // HST provinces write one line; Quebec, BC, Manitoba and Saskatchewan write GST and their own;
      // a rate over 5 with no province known is HST, the usual case.
      const province = CANADA_PROVINCES.find((each) => each.code === doc.region);
      const own = province?.provincial;
      if (own === "hst" || (!province && rate > 5)) {
        tax.push({ label: `HST ${rateText(rate)}`, rate, amount });
      } else if (own && rate > 5) {
        const gst = Math.round((amount * 5) / rate);
        tax.push({ label: `GST ${rateText(5)}`, rate: 5, amount: gst });
        tax.push({ label: `${own.name} ${rateText(rate - 5)}`, rate: rate - 5, amount: amount - gst });
      } else {
        tax.push({ label: `GST ${rateText(rate)}`, rate, amount });
      }
    } else {
      tax.push({ label: `${name} ${rateText(rate)}`, rate, amount });
    }
  }
  // Canada's 5% and 13% lines in British Columbia both carry a GST 5%: one line for each label.
  const merged: TaxLine[] = [];
  for (const line of tax) {
    const same = merged.find((each) => each.label === line.label);
    if (same) same.amount += line.amount;
    else merged.push({ ...line });
  }
  const taxTotal = merged.reduce((sum, line) => sum + line.amount, 0);
  return { subtotal, tax: merged, total: subtotal + taxTotal, note: noteFor(doc.treatment, doc.country, name) };
}

/** What a document says when it charges no tax, and why. */
function noteFor(treatment: TaxTreatment | null, country: string | null, name: string): string | null {
  if (treatment === "reverse") return `Reverse charge: the customer accounts for the ${name} (Article 196, Council Directive 2006/112/EC).`;
  if (treatment === "export") {
    if (country === "IN") return "Export of services: supply without payment of IGST, under letter of undertaking.";
    return `${name} not charged: the customer is outside ${country ? countryName(country, "en") : "the country"}.`;
  }
  return null;
}

/** How each treatment is said in a picker. */
export function treatmentLabel(treatment: TaxTreatment, country: string | null, called?: string): string {
  const name = called ?? taxSystemFor(country).name;
  switch (treatment) {
    case "standard":
      return `${name} charged`;
    case "india-intra":
      return "CGST and SGST (same state)";
    case "india-inter":
      return "IGST (another state)";
    case "canada":
      return "GST/HST by province";
    case "reverse":
      return "Reverse charge (EU business)";
    case "export":
      return `No ${name}: customer abroad`;
  }
}

/** The treatments that make sense for a company's country, for the picker. */
export function treatmentsFor(country: string | null): TaxTreatment[] {
  const home = (country ?? "").toUpperCase();
  if (home === "IN") return ["india-intra", "india-inter", "export"];
  if (home === "CA") return ["canada", "export"];
  if (SYSTEMS.get(home)?.eu) return ["standard", "reverse", "export"];
  return ["standard", "export"];
}

export function regionsFor(country: string | null): readonly TaxRegion[] {
  return taxSystemFor(country).regions ?? [];
}

/**
 * What an invoice has to say where the company is, beyond the tax itself
 * (shared/tax.ts): the turnover under which a business need not register,
 * the words an invoice from one that has not must carry, the numbers a
 * business there usually prints, and India's composition scheme (PLAN.md,
 * part fourteen).
 *
 * As they stood in October 2026, from each country's rules and the EY
 * Worldwide VAT guide. Every one of them is a starting point the company can
 * change in Settings - the words, the numbers, the title - and anywhere not
 * listed here is built the same way by hand. Not advice.
 */

type Rules = {
  /** Under what a business need not register, in a sentence's middle: "£90,000 a year". */
  threshold?: string;
  /** The same as a sum in the country's currency, for a year's turnover to be measured against: the lower where there are two. */
  thresholdAmount?: number;
  /** What an invoice from a business that has not registered must say, where the law gives words. */
  exemptNote?: string;
  /** The numbers a business there usually prints beside its name: PAN, ABN, SIRET. */
  ids?: readonly string[];
};

const RULES: Readonly<Record<string, Rules>> = {
  IN: { threshold: "₹20 lakh a year for services, ₹40 lakh for goods alone", thresholdAmount: 2000000, ids: ["PAN", "Udyam"] },
  GB: { threshold: "£90,000 a year", thresholdAmount: 90000, ids: ["Company number"] },
  IE: { threshold: "€42,500 a year for services, €85,000 for goods", thresholdAmount: 42500, ids: ["Company number"] },
  DE: { threshold: "€25,000 last year and €100,000 this year", thresholdAmount: 25000, exemptNote: "Gemäß § 19 UStG wird keine Umsatzsteuer berechnet.", ids: ["Steuernummer"] },
  AT: { threshold: "€55,000 a year", thresholdAmount: 55000, exemptNote: "Umsatzsteuerfrei aufgrund der Kleinunternehmerregelung gemäß § 6 Abs. 1 Z 27 UStG.", ids: ["Steuernummer"] },
  FR: { threshold: "€37,500 a year for services, €85,000 for goods", thresholdAmount: 37500, exemptNote: "TVA non applicable, art. 293 B du CGI.", ids: ["SIRET"] },
  BE: {
    threshold: "€25,000 a year",
    thresholdAmount: 25000,
    exemptNote: "Régime particulier de franchise des petites entreprises / Bijzondere vrijstellingsregeling kleine ondernemingen.",
    ids: ["Enterprise number"],
  },
  NL: { threshold: "€20,000 a year, under the KOR", thresholdAmount: 20000, exemptNote: "Vrijgesteld van btw op grond van de kleineondernemersregeling (KOR).", ids: ["KvK number"] },
  IT: {
    threshold: "€85,000 a year, under the regime forfettario",
    thresholdAmount: 85000,
    exemptNote: "Operazione in franchigia da IVA ai sensi dell'art. 1, commi da 54 a 89, della Legge n. 190/2014.",
    ids: ["Codice fiscale"],
  },
  PT: { threshold: "€15,000 a year", thresholdAmount: 15000, exemptNote: "IVA - regime de isenção, artigo 53.º do CIVA.", ids: ["NIF"] },
  ES: { ids: ["NIF"] },
  AU: { threshold: "A$75,000 a year", thresholdAmount: 75000, ids: ["ABN"] },
  NZ: { threshold: "NZ$60,000 a year", thresholdAmount: 60000, ids: ["NZBN"] },
  CA: { threshold: "C$30,000 over four quarters", thresholdAmount: 30000, ids: ["Business number"] },
  SG: { threshold: "S$1 million a year", thresholdAmount: 1000000, ids: ["UEN"] },
  MY: { threshold: "RM500,000 a year", thresholdAmount: 500000, ids: ["Company no."] },
  AE: { threshold: "AED 375,000 a year", thresholdAmount: 375000, ids: ["Trade licence no."] },
  SA: { threshold: "SAR 375,000 a year", thresholdAmount: 375000, ids: ["CR number"] },
  ZA: { threshold: "R1 million a year", thresholdAmount: 1000000, ids: ["Company registration no."] },
  PH: { threshold: "₱3 million a year", thresholdAmount: 3000000, ids: ["TIN"] },
  JP: { threshold: "¥10 million a year", thresholdAmount: 10000000 },
  US: { ids: ["EIN"] },
};

export function invoiceRulesFor(country: string | null | undefined): Rules {
  return (country && RULES[country.toUpperCase()]) || {};
}

/**
 * India's composition scheme: a small business pays a flat rate on its
 * turnover and may not charge GST, so it writes a bill of supply with these
 * words (CGST Rules, rule 46 and 49).
 */
export const COMPOSITION = {
  title: "Bill of supply",
  note: "Composition taxable person, not eligible to collect tax on supplies.",
} as const;

/** India's TDS on professional fees (section 194J): 10% once a client's payments pass ₹50,000 in a year. */
export const INDIA_TDS_RATE = 10;

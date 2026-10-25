import { addMonths, shiftDay } from "./dates";

/** The accountant's pack (PLAN.md, part thirteen, phase 56). Written by electron/main/services/accountant.ts. */

export const ACCOUNTANT_PERIODS = ["this-quarter", "last-quarter", "this-year", "last-year"] as const;
export type AccountantPeriod = (typeof ACCOUNTANT_PERIODS)[number];

/**
 * The month a country's financial year starts in, where it is not January:
 * India's runs April to March, Australia's July to June. Quarters are the
 * calendar's everywhere, which is what each of these files tax by too.
 */
const YEAR_STARTS: Readonly<Record<string, number>> = { IN: 4, JP: 4, HK: 4, NZ: 4, AU: 7, PK: 7, BD: 7, EG: 7, KE: 7 };

export function yearStartsIn(country: string | null | undefined): number {
  return (country && YEAR_STARTS[country.toUpperCase()]) || 1;
}

/** How a period is offered; `starts` is the month the company's financial year starts (its tax rules). */
export function periodLabel(period: AccountantPeriod, starts: number): string {
  const financial = starts !== 1;
  switch (period) {
    case "this-quarter":
      return "This quarter";
    case "last-quarter":
      return "Last quarter";
    case "this-year":
      return financial ? "This financial year" : "This year";
    case "last-year":
      return financial ? "Last financial year" : "Last year";
  }
}

/** The days a period covers, from the company's today. */
export function periodDays(period: AccountantPeriod, day: string, starts = 1): { from: string; to: string; label: string } {
  const year = Number(day.slice(0, 4));
  const month = Number(day.slice(5, 7));
  const quarterOf = (m: number) => Math.floor((m - 1) / 3);
  const quarterStart = (y: number, q: number) => `${y}-${String(q * 3 + 1).padStart(2, "0")}-01`;
  const thisQuarter = quarterOf(month);
  const yearOf = (y: number) => {
    const from = `${y}-${String(starts).padStart(2, "0")}-01`;
    const label = starts === 1 ? String(y) : `FY ${y}-${String((y + 1) % 100).padStart(2, "0")}`;
    return { from, to: shiftDay(addMonths(from, 12), -1), label };
  };
  const thisYear = month >= starts ? year : year - 1;
  switch (period) {
    case "this-quarter": {
      const from = quarterStart(year, thisQuarter);
      return { from, to: shiftDay(addMonths(from, 3), -1), label: `${year} Q${thisQuarter + 1}` };
    }
    case "last-quarter": {
      const y = thisQuarter === 0 ? year - 1 : year;
      const q = thisQuarter === 0 ? 3 : thisQuarter - 1;
      const from = quarterStart(y, q);
      return { from, to: shiftDay(addMonths(from, 3), -1), label: `${y} Q${q + 1}` };
    }
    case "this-year":
      return yearOf(thisYear);
    case "last-year":
      return yearOf(thisYear - 1);
  }
}

export type AccountantPack = {
  /** Where it was written. */
  folder: string;
  /** How many invoices went in it. */
  invoices: number;
  /** "2026 Q3", "2025", "FY 2026-27". */
  label: string;
};

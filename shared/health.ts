/**
 * How the company is doing with money, at a glance (PLAN.md, part
 * fourteen): a year of money in and what was left each month, the financial
 * year's turnover against the turnover that makes registering for tax
 * necessary, the tax charged and the tax clients withheld, and the next tax
 * filings. Worked out when read, from what Money and Deadlines already hold;
 * every threshold and date comes from the company's own rules and calendar,
 * so none of it is Caulder's to keep up to date.
 */

export type HealthMonth = { month: string; paidIn: number; spent: number };

export type Health = {
  /** The last twelve months, oldest first, this one last. */
  months: HealthMonth[];
  /** The financial year so far, by the company's own year (its tax rules). */
  year: { from: string; to: string; turnover: number; taxCharged: number; withheld: number };
  /** For a company not registered: how near the year's turnover is to where registering is needed. Null otherwise. */
  threshold: { amount: number; said: string | null; share: number; reachedBy: string | null } | null;
  /** The next tax filings on the company's calendar (Deadlines). */
  filings: { title: string; dueOn: string }[];
  /** What the tax withheld is called: "TDS". Null where clients withhold none. */
  withheldName: string | null;
};

/** "2026-10" for the month `back` months before `day`'s. */
function monthBefore(day: string, back: number): string {
  const year = Number(day.slice(0, 4));
  const month = Number(day.slice(5, 7)) - 1 - back;
  const date = new Date(Date.UTC(year, month, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** The financial year `day` falls in, when it starts in month `starts`. */
export function financialYear(day: string, starts: number): { from: string; to: string } {
  const year = Number(day.slice(0, 4));
  const first = Number(day.slice(5, 7)) >= starts ? year : year - 1;
  const from = `${first}-${String(starts).padStart(2, "0")}-01`;
  const end = new Date(Date.UTC(first + 1, starts - 1, 0));
  return { from, to: end.toISOString().slice(0, 10) };
}

export function healthOf(input: {
  day: string;
  yearStarts: number;
  /** Money in and money out, by "YYYY-MM". */
  paidByMonth: ReadonlyMap<string, number>;
  spentByMonth: ReadonlyMap<string, number>;
  /** Invoices sent or paid: issued on, before tax, the tax on them. */
  invoices: readonly { issuedOn: string; subtotal: number; tax: number }[];
  /** Tax withheld by clients, by the day it was paid. */
  withheld: readonly { paidOn: string; amount: number }[];
  registered: boolean;
  thresholdAmount: number | null;
  threshold: string | null;
  withheldName: string | null;
  filings: readonly { title: string; dueOn: string | null }[];
}): Health {
  const months = Array.from({ length: 12 }, (_, index) => {
    const month = monthBefore(input.day, 11 - index);
    return { month, paidIn: input.paidByMonth.get(month) ?? 0, spent: input.spentByMonth.get(month) ?? 0 };
  });
  const { from, to } = financialYear(input.day, input.yearStarts);
  const within = (date: string) => date >= from && date <= to;
  const year = input.invoices.filter((invoice) => within(invoice.issuedOn));
  const turnover = year.reduce((sum, invoice) => sum + invoice.subtotal, 0);
  const taxCharged = year.reduce((sum, invoice) => sum + invoice.tax, 0);
  const withheld = input.withheld.filter((each) => within(each.paidOn)).reduce((sum, each) => sum + each.amount, 0);

  let threshold: Health["threshold"] = null;
  if (!input.registered && input.thresholdAmount && input.thresholdAmount > 0) {
    // At the year's pace so far, the month the turnover would reach it - if it would before the year ends.
    const fromMonth = Number(from.slice(0, 4)) * 12 + Number(from.slice(5, 7)) - 1;
    const nowMonth = Number(input.day.slice(0, 4)) * 12 + Number(input.day.slice(5, 7)) - 1;
    const elapsed = nowMonth - fromMonth + 1;
    const perMonth = turnover / elapsed;
    let reachedBy: string | null = null;
    if (turnover >= input.thresholdAmount) reachedBy = input.day.slice(0, 7);
    else if (perMonth > 0) {
      const at = fromMonth + Math.ceil(input.thresholdAmount / perMonth) - 1;
      const month = `${Math.floor(at / 12)}-${String((at % 12) + 1).padStart(2, "0")}`;
      if (`${month}-01` <= to) reachedBy = month;
    }
    threshold = { amount: input.thresholdAmount, said: input.threshold, share: Math.min(1, turnover / input.thresholdAmount), reachedBy };
  }

  const filings = input.filings
    .filter((each): each is { title: string; dueOn: string } => each.dueOn !== null && each.dueOn >= input.day)
    .sort((a, b) => a.dueOn.localeCompare(b.dueOn))
    .slice(0, 4);

  return { months, year: { from, to, turnover, taxCharged, withheld }, threshold, filings, withheldName: input.withheldName };
}

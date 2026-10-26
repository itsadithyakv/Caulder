import { describe, expect, it } from "vitest";
import { financialYear, healthOf } from "./health";

const base = {
  day: "2026-10-25",
  yearStarts: 4,
  paidByMonth: new Map([["2026-10", 50000], ["2026-05", 20000]]),
  spentByMonth: new Map([["2026-10", 8000]]),
  invoices: [
    { issuedOn: "2026-05-10", subtotal: 400000, tax: 0 },
    { issuedOn: "2026-09-01", subtotal: 300000, tax: 0 },
    { issuedOn: "2026-02-01", subtotal: 999999, tax: 0 },
  ],
  withheld: [{ paidOn: "2026-06-01", amount: 5000 }],
  registered: false,
  thresholdAmount: 2000000,
  threshold: "₹20 lakh a year",
  withheldName: "TDS",
  filings: [
    { title: "GSTR-1", dueOn: "2026-11-11" },
    { title: "Old", dueOn: "2026-01-01" },
    { title: "Advance tax", dueOn: "2026-12-15" },
  ],
};

describe("how the company is doing with money", () => {
  it("draws the last twelve months, this one last", () => {
    const health = healthOf(base);
    expect(health.months).toHaveLength(12);
    expect(health.months.at(-1)).toEqual({ month: "2026-10", paidIn: 50000, spent: 8000 });
    expect(health.months[0]?.month).toBe("2025-11");
  });

  it("counts the turnover of the company's own financial year, and the TDS withheld in it", () => {
    const health = healthOf(base);
    expect(financialYear("2026-10-25", 4)).toEqual({ from: "2026-04-01", to: "2027-03-31" });
    expect(health.year).toMatchObject({ turnover: 700000, withheld: 5000 });
  });

  it("says when, at this pace, an unregistered company reaches the threshold - or that it will not this year", () => {
    expect(healthOf(base).threshold).toMatchObject({ amount: 2000000, share: 0.35, reachedBy: null });
    const busy = healthOf({ ...base, invoices: [{ issuedOn: "2026-05-01", subtotal: 1400000, tax: 0 }] });
    // 14 lakh in seven months is 2 lakh a month: 20 lakh by the tenth month of the year, January.
    expect(busy.threshold?.reachedBy).toBe("2027-01");
    expect(healthOf({ ...base, registered: true }).threshold).toBeNull();
  });

  it("lists the next filings, soonest first, and none that has gone", () => {
    expect(healthOf(base).filings.map((each) => each.title)).toEqual(["GSTR-1", "Advance tax"]);
  });
});

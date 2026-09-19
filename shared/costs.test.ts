import { describe, expect, it } from "vitest";
import {
  cashBalanceInput,
  costOf,
  describeRenewal,
  describeRunway,
  monthlyOf,
  nextAfter,
  renewalsDue,
  runwayOf,
  type RunningCost,
} from "./costs";

const page = (template: string, fields: Record<string, string | number | boolean | null>, title = "Thing") => ({
  id: title,
  title,
  template,
  section: "tools" as const,
  fields,
});

describe("reading a cost off a page", () => {
  it("knows a tool, a domain and a running cost, and nothing else", () => {
    expect(costOf(page("tool", { cost: 1200, cycle: "monthly", renewsOn: "2026-10-01" }))).toMatchObject({
      amount: 1200,
      cycle: "monthly",
      nextOn: "2026-10-01",
      monthly: 1200,
      category: "tool",
    });
    // A domain is yearly without saying so.
    expect(costOf(page("domain", { cost: 1200, renewsOn: "2027-07-14" }))).toMatchObject({
      cycle: "yearly",
      monthly: 100,
      nextOn: "2027-07-14",
    });
    expect(
      costOf(page("running-cost", { amount: 30000, cycle: "quarterly", dueOn: "2026-10-05", category: "rent" })),
    ).toMatchObject({ monthly: 10000, category: "rent" });
    expect(costOf(page("playbook", { cost: 5 }))).toBeNull();
  });

  it("counts nothing a month for a one-off, a free tool or a cost nobody priced", () => {
    expect(costOf(page("tool", { cost: 900, cycle: "free" }))).toMatchObject({ amount: 0, monthly: 0 });
    expect(costOf(page("running-cost", { amount: 50000, cycle: "once" }))?.monthly).toBe(0);
    expect(costOf(page("tool", { cycle: "monthly" }))).toMatchObject({ amount: null, monthly: 0 });
    expect(monthlyOf(1000, "yearly")).toBe(83);
  });

  it("moves a date on by its cycle, and ends a one-off", () => {
    expect(nextAfter("2026-07-14", "yearly")).toBe("2027-07-14");
    expect(nextAfter("2026-01-31", "monthly")).toBe("2026-02-28");
    expect(nextAfter("2026-01-31", "quarterly")).toBe("2026-04-30");
    expect(nextAfter("2026-01-31", "once")).toBeNull();
  });
});

describe("what renews soon", () => {
  const cost = (title: string, cycle: RunningCost["cycle"], nextOn: string | null): RunningCost => ({
    pageId: title,
    title,
    template: "tool",
    section: "tools",
    amount: 100,
    cycle,
    nextOn,
    category: null,
    monthly: 100,
  });

  it("gives a yearly renewal a month's notice and a monthly bill three days", () => {
    const day = "2026-09-17";
    const due = renewalsDue(
      [
        cost("Domain", "yearly", "2026-10-10"),
        cost("Far domain", "yearly", "2026-11-30"),
        cost("Server", "monthly", "2026-09-19"),
        cost("Later server", "monthly", "2026-09-25"),
        cost("Late", "quarterly", "2026-09-01"),
        cost("Free", "free", "2026-09-18"),
        cost("Undated", "monthly", null),
      ],
      day,
    );
    expect(due.map((renewal) => [renewal.title, renewal.daysLeft])).toEqual([
      ["Late", -16],
      ["Server", 2],
      ["Domain", 23],
    ]);
  });
});

describe("saying when", () => {
  it("reads as the end of a sentence, and says a date as one", () => {
    const day = "2026-09-17";
    expect(describeRenewal({ nextOn: "2026-09-18", cycle: "monthly" }, day)).toBe("renews tomorrow");
    expect(describeRenewal({ nextOn: "2026-09-20", cycle: "monthly" }, day)).toBe("renews in 3 days");
    expect(describeRenewal({ nextOn: "2026-09-17", cycle: "once" }, day)).toBe("due today");
    expect(describeRenewal({ nextOn: "2026-09-15", cycle: "yearly" }, day)).toBe("was due 2 days ago");
    // A date keeps its capital: "on Oct 10", never "oct 10".
    expect(describeRenewal({ nextOn: "2026-10-10", cycle: "yearly" }, day)).toMatch(/^renews on \S*[A-Z0-9]/);
  });
});

describe("runway", () => {
  it("is cash over what goes out less what comes in, from the day the cash was true", () => {
    const runway = runwayOf({
      cash: 600000,
      cashOn: "2026-09-01",
      running: 40000,
      oneOffByMonth: [20000, 30000, 10000],
      incomeByMonth: [0, 0, 0],
    });
    expect(runway).toMatchObject({ oneOff: 20000, income: 0, burn: 60000, months: 10, basis: 3 });
    expect(runway.runsOutOn).toBe("2027-07-01");
    expect(describeRunway(runway.months!)).toBe("about 10 months");
  });

  it("is not a number when nothing is burning or the cash is not known", () => {
    expect(
      runwayOf({ cash: 1000, cashOn: "2026-09-01", running: 100, oneOffByMonth: [0], incomeByMonth: [500] }),
    ).toMatchObject({ burn: -400, months: null, runsOutOn: null });
    expect(runwayOf({ cash: null, cashOn: null, running: 100, oneOffByMonth: [], incomeByMonth: [] })).toMatchObject({
      burn: 100,
      months: null,
      basis: 0,
    });
  });

  it("counts part months in days, and says short runways in weeks", () => {
    const runway = runwayOf({ cash: 45000, cashOn: "2026-09-01", running: 30000, oneOffByMonth: [], incomeByMonth: [] });
    expect(runway.months).toBe(1.5);
    expect(runway.runsOutOn).toBe("2026-10-16");
    expect(describeRunway(1.5)).toBe("about 2 months");
    expect(describeRunway(1200)).toBe("more than ten years");
    expect(describeRunway(1)).toBe("about a month");
    expect(describeRunway(0.5)).toBe("about 2 weeks");
    expect(describeRunway(0.1)).toBe("under a week");
    expect(describeRunway(0)).toBe("under a week");
  });

  it("takes a balance as whole units on a real day", () => {
    expect(cashBalanceInput.parse({ amount: 250000, asOf: "2026-09-17", note: " " })).toEqual({
      amount: 250000,
      asOf: "2026-09-17",
      note: null,
    });
    expect(() => cashBalanceInput.parse({ amount: 10.5, asOf: "2026-09-17" })).toThrow("Whole units");
    expect(() => cashBalanceInput.parse({ amount: 10, asOf: "2026-02-30" })).toThrow("Pick the day");
  });
});

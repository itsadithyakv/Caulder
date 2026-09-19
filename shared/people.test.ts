import { describe, expect, it } from "vitest";
import {
  checklistSteps,
  describeVesting,
  equitySplit,
  personInput,
  statusOf,
  stepDueOn,
  vestingOf,
  wholeMonths,
} from "./people";

describe("vesting", () => {
  const founder = { equity: 48, vestingMonths: 48, cliffMonths: 12, startsOn: "2025-01-15" };

  it("counts whole months, keeping the day of the month", () => {
    expect(wholeMonths("2025-01-15", "2025-02-14")).toBe(0);
    expect(wholeMonths("2025-01-15", "2025-02-15")).toBe(1);
    expect(wholeMonths("2025-01-31", "2025-02-28")).toBe(1);
    expect(wholeMonths("2025-03-01", "2025-01-01")).toBe(0);
  });

  it("earns nothing before the cliff, the held-back months at it, then a month at a time", () => {
    expect(vestingOf(founder, "2026-01-14")).toMatchObject({ vested: 0, cliffOn: "2026-01-15", fullyOn: "2029-01-15" });
    expect(vestingOf(founder, "2026-01-15")?.vested).toBe(12);
    expect(vestingOf(founder, "2026-09-18")?.vested).toBe(20);
    expect(vestingOf(founder, "2031-01-01")?.vested).toBe(48);
  });

  it("gives everything from the start with no vesting, and nothing before it", () => {
    const all = { equity: 10, vestingMonths: null, cliffMonths: null, startsOn: "2026-10-01" };
    expect(vestingOf(all, "2026-09-18")?.vested).toBe(0);
    expect(vestingOf(all, "2026-10-01")?.vested).toBe(10);
    expect(vestingOf({ ...all, equity: null }, "2026-10-01")).toBeNull();
    expect(vestingOf({ ...all, startsOn: null }, "2026-10-01")).toBeNull();
  });

  it("says itself in words", () => {
    expect(describeVesting(48, 12)).toBe("4 years, 1-year cliff");
    expect(describeVesting(18, 6)).toBe("18 months, 6-month cliff");
    expect(describeVesting(24, null)).toBe("2 years, no cliff");
    expect(describeVesting(null, null)).toBe("no vesting");
  });
});

describe("a person", () => {
  it("is starting, here, gone or a candidate, by the day", () => {
    expect(statusOf({ kind: "candidate", startsOn: null, endsOn: null }, "2026-09-18")).toBe("candidate");
    expect(statusOf({ kind: "intern", startsOn: "2026-10-01", endsOn: null }, "2026-09-18")).toBe("starting");
    expect(statusOf({ kind: "intern", startsOn: "2026-06-01", endsOn: "2026-09-17" }, "2026-09-18")).toBe("past");
    expect(statusOf({ kind: "intern", startsOn: "2026-06-01", endsOn: "2026-09-18" }, "2026-09-18")).toBe("current");
  });

  it("refuses dates the wrong way round, a cliff past the vesting, and equity over 100%", () => {
    expect(personInput.safeParse({ name: "Asha", startsOn: "2026-09-01", endsOn: "2026-08-01" }).success).toBe(false);
    expect(personInput.safeParse({ name: "Asha", vestingMonths: 12, cliffMonths: 24 }).success).toBe(false);
    expect(personInput.safeParse({ name: "Asha", equity: 120 }).success).toBe(false);
    expect(personInput.safeParse({ name: "Asha", email: "not an email" }).success).toBe(false);
    expect(personInput.parse({ name: " Asha " })).toMatchObject({ name: "Asha", kind: "employee" });
  });
});

describe("the equity split", () => {
  it("counts the people here, not candidates or those who have left", () => {
    const split = equitySplit([
      { name: "Asha", equity: 45, status: "current" },
      { name: "Ravi", equity: 35, status: "current" },
      { name: "Meera", equity: 1.5, status: "starting" },
      { name: "Old co-founder", equity: 10, status: "past" },
      { name: "Hopeful", equity: 5, status: "candidate" },
    ]);
    expect(split.given).toBe(81.5);
    expect(split.holders.map((holder) => holder.name)).toEqual(["Asha", "Ravi", "Meera"]);
  });
});

describe("a checklist in a page", () => {
  it("is its - [ ] lines, with (day N) saying when", () => {
    const body = [
      "## Before they start",
      "- [ ] Offer letter signed",
      "- [x] Laptop ordered",
      "* [ ] Check in (day 14)",
      "- Not a step",
      "- [ ]   ",
    ].join("\n");
    expect(checklistSteps(body)).toEqual([
      { title: "Offer letter signed", day: 0 },
      { title: "Laptop ordered", day: 0 },
      { title: "Check in", day: 14 },
    ]);
  });

  it("falls due that many days after the start, never before today", () => {
    expect(stepDueOn("2026-10-01", 14, "2026-09-18")).toBe("2026-10-15");
    expect(stepDueOn("2026-01-01", 7, "2026-09-18")).toBe("2026-09-18");
    expect(stepDueOn(null, 3, "2026-09-18")).toBe("2026-09-21");
  });
});

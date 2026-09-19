import { describe, expect, it } from "vitest";
import {
  PRESET_SETS,
  describeDeadline,
  describeRule,
  dueRule,
  nextOccurrence,
  obligationInput,
  occurrences,
  offerPresets,
  openOccurrences,
  periodOf,
  presetById,
  spellDay,
} from "./deadlines";

describe("when something falls due", () => {
  it("falls on the same day every month, and on the last day of a short month", () => {
    expect(occurrences({ every: "month", day: 11 }, "2026-09-12", "2026-12-31")).toEqual([
      "2026-10-11",
      "2026-11-11",
      "2026-12-11",
    ]);
    expect(occurrences({ every: "month", day: 31 }, "2027-01-01", "2027-04-30")).toEqual([
      "2027-01-31",
      "2027-02-28",
      "2027-03-31",
      "2027-04-30",
    ]);
  });

  it("falls on set days each year, across a year's end, and once when once", () => {
    const advanceTax = {
      every: "year" as const,
      dates: [
        { month: 6, day: 15 },
        { month: 9, day: 15 },
        { month: 12, day: 15 },
        { month: 3, day: 15 },
      ],
    };
    expect(occurrences(advanceTax, "2026-09-18", "2027-06-30")).toEqual(["2026-12-15", "2027-03-15", "2027-06-15"]);
    expect(nextOccurrence(advanceTax, "2026-09-15")).toBe("2026-09-15");
    expect(occurrences({ every: "once", on: "2026-10-01" }, "2026-09-01", "2026-12-31")).toEqual(["2026-10-01"]);
    expect(occurrences({ every: "once", on: "2026-10-01" }, "2026-10-02", "2026-12-31")).toEqual([]);
    expect(nextOccurrence({ every: "once", on: "2020-01-01" }, "2026-09-18")).toBeNull();
  });

  it("says a rule and a day in words", () => {
    expect(describeRule({ every: "month", day: 11 })).toBe("the 11th of every month");
    expect(describeRule({ every: "month", day: 22 })).toBe("the 22nd of every month");
    expect(describeRule({ every: "year", dates: [{ month: 5, day: 30 }] })).toBe("every year on 30 May");
    expect(
      describeRule({ every: "year", dates: [{ month: 6, day: 15 }, { month: 9, day: 15 }, { month: 12, day: 15 }] }),
    ).toBe("every year on 15 Jun, 15 Sep and 15 Dec");
    expect(describeRule({ every: "once", on: "2027-05-30" })).toBe("once, on 30 May 2027");
    expect(spellDay("2026-01-02")).toBe("2 Jan 2026");
  });

  it("refuses a rule that is not one", () => {
    expect(() => dueRule.parse({ every: "month", day: 32 })).toThrow();
    expect(() => dueRule.parse({ every: "once", on: "2026-02-30" })).toThrow("Pick a date");
    expect(() => dueRule.parse({ every: "year", dates: [] })).toThrow();
  });
});

describe("which period an occurrence is for", () => {
  it("names the month, the quarter or the financial year before", () => {
    expect(periodOf("month-before", "2026-10-11")).toBe("Sep 2026");
    expect(periodOf("month-before", "2027-01-20")).toBe("Dec 2026");
    expect(periodOf("quarter-before", "2026-07-13")).toBe("Apr–Jun 2026");
    expect(periodOf("quarter-before", "2027-01-22")).toBe("Oct–Dec 2026");
    // A TDS return due in May is for January to March, not April to June.
    expect(periodOf("quarter-before", "2027-05-31")).toBe("Jan–Mar 2027");
    expect(periodOf("fy-before", "2026-10-30")).toBe("2025-26");
    expect(periodOf("fy-before", "2027-04-30")).toBe("2026-27");
    expect(periodOf("year-before", "2026-06-30")).toBe("2025");
    expect(periodOf("none", "2026-06-30")).toBeNull();
  });
});

describe("what is still to do", () => {
  const gstr1 = { rule: { every: "month" as const, day: 11 }, startsOn: "2026-08-01", endsOn: null, active: true };

  it("is every occurrence since it started that is not done, up to a day", () => {
    expect(openOccurrences(gstr1, new Set(["2026-08-11"]), "2026-10-15")).toEqual(["2026-09-11", "2026-10-11"]);
    expect(openOccurrences({ ...gstr1, endsOn: "2026-09-30" }, new Set(), "2026-12-31")).toEqual([
      "2026-08-11",
      "2026-09-11",
    ]);
    expect(openOccurrences({ ...gstr1, active: false }, new Set(), "2026-12-31")).toEqual([]);
  });

  it("says how far off it is", () => {
    expect(describeDeadline({ daysLeft: 0, doneOn: null })).toBe("due today");
    expect(describeDeadline({ daysLeft: 1, doneOn: null })).toBe("due tomorrow");
    expect(describeDeadline({ daysLeft: 5, doneOn: null })).toBe("due in 5 days");
    expect(describeDeadline({ daysLeft: -1, doneOn: null })).toBe("a day late");
    expect(describeDeadline({ daysLeft: -4, doneOn: null })).toBe("4 days late");
    expect(describeDeadline({ daysLeft: -4, doneOn: "2026-09-10" })).toBe("done");
  });

  it("takes an obligation with only a title and a rule", () => {
    expect(obligationInput.parse({ title: " GSTR-1 ", rule: { every: "month", day: 11 } })).toMatchObject({
      title: "GSTR-1",
      kind: "filing",
      period: "none",
      remindDays: 7,
      startsOn: null,
      active: true,
    });
    expect(() =>
      obligationInput.parse({ title: "x", rule: { every: "month", day: 1 }, startsOn: "2026-10-01", endsOn: "2026-09-01" }),
    ).toThrow("cannot stop before it starts");
  });
});

describe("the presets", () => {
  const offered = (set: "india" | "generic", entityType: string | null, gstStatus: string | null) =>
    offerPresets(set, { entityType, gstStatus }, new Set())
      .filter((offer) => offer.fits && !offer.preset.optional)
      .map((offer) => offer.preset.id);

  it("fit a private limited company filing GST monthly", () => {
    expect(offered("india", "private-limited-company", "regular-monthly-returns")).toEqual([
      "in-gstr1-monthly",
      "in-gstr3b-monthly",
      "in-advance-tax",
      "in-itr-company",
      "in-agm",
      "in-aoc4",
      "in-mgt7",
      "in-dir3-kyc",
    ]);
  });

  it("fit an LLP on the quarterly scheme, and a proprietor with no GST", () => {
    expect(offered("india", "llp", "regular-quarterly-returns-qrmp")).toEqual([
      "in-gstr1-qrmp",
      "in-gstr3b-qrmp",
      "in-pmt06",
      "in-advance-tax",
      "in-itr-firm",
      "in-dir3-kyc",
      "in-llp-form11",
      "in-llp-form8",
    ]);
    expect(offered("india", "sole-proprietorship", "not-registered")).toEqual(["in-advance-tax", "in-itr-proprietor"]);
  });

  it("offer only what fits everybody when nothing is known, and say what is already added", () => {
    expect(offered("india", null, null)).toEqual(["in-advance-tax"]);
    const offers = offerPresets("generic", { entityType: null, gstStatus: null }, new Set(["gen-income-tax"]));
    expect(offers.find((offer) => offer.preset.id === "gen-income-tax")?.added).toBe(true);
  });

  it("are all valid rules with unique ids and something to say", () => {
    const ids = PRESET_SETS.flatMap((set) => set.presets.map((preset) => preset.id));
    expect(new Set(ids).size).toBe(ids.length);
    for (const set of PRESET_SETS) {
      for (const preset of set.presets) {
        expect(() => dueRule.parse(preset.rule), preset.id).not.toThrow();
        expect(preset.note.length, preset.id).toBeGreaterThan(10);
      }
    }
    expect(presetById("in-gstr1-monthly")?.title).toBe("GSTR-1");
    expect(presetById("nope")).toBeNull();
  });
});

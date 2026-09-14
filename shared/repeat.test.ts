import { describe, it, expect } from "vitest";
import { occurrencesOf, checkRepeat, describeRepeat, MAX_OCCURRENCES } from "./repeat";
import { weekdayOf } from "./dates";

/**
 * Which days a repeat lands on.
 *
 * A student's term is the case this exists for, so the cases below are a term:
 * a Tuesday lecture, a Monday-Wednesday-Friday gym habit, and the two ways an
 * end date goes wrong.
 */

describe("which day of the week a day is", () => {
  it("counts Monday as one and Sunday as seven", () => {
    // 2026-09-07 is a Monday. JavaScript would call Sunday 0 and put the week
    // in the wrong order for a timetable.
    expect(weekdayOf("2026-09-07")).toBe(1);
    expect(weekdayOf("2026-09-13")).toBe(7);
  });
});

describe("a repeat that is asked for", () => {
  it("lands on every matching day, both ends included", () => {
    // The last Friday of term has to be in it. An off-by-one here is a
    // lecture nobody was told about.
    const days = occurrencesOf({
      weekdays: [2],
      from: "2026-09-01",
      until: "2026-09-29",
    });
    expect(days).toEqual([
      "2026-09-01",
      "2026-09-08",
      "2026-09-15",
      "2026-09-22",
      "2026-09-29",
    ]);
  });

  it("handles several days a week, in order", () => {
    const days = occurrencesOf({
      weekdays: [1, 3, 5],
      from: "2026-09-07",
      until: "2026-09-13",
    });
    expect(days).toEqual(["2026-09-07", "2026-09-09", "2026-09-11"]);
  });

  it("starts on the first matching day, not necessarily the first day", () => {
    const days = occurrencesOf({ weekdays: [5], from: "2026-09-07", until: "2026-09-20" });
    expect(days[0]).toBe("2026-09-11");
  });

  it("is empty when nothing between the dates matches", () => {
    // A Sunday repeat over a working week is not an error, it is just no days.
    expect(
      occurrencesOf({ weekdays: [7], from: "2026-09-07", until: "2026-09-11" }),
    ).toEqual([]);
  });
});

describe("a repeat that should be refused", () => {
  it("needs at least one day of the week", () => {
    const outcome = checkRepeat({ weekdays: [], from: "2026-09-07", until: "2026-12-01" });
    expect(outcome.ok).toBe(false);
  });

  it("refuses an end before the start", () => {
    const outcome = checkRepeat({
      weekdays: [1],
      from: "2026-09-07",
      until: "2026-09-01",
    });
    expect(outcome.ok).toBe(false);
  });

  it("refuses more than a year, so a mistyped date costs nothing", () => {
    // The guard that turns "2206" instead of "2026" into a sentence rather
    // than sixty thousand rows.
    const outcome = checkRepeat({
      weekdays: [1],
      from: "2026-09-07",
      until: "2206-09-07",
    });
    expect(outcome.ok).toBe(false);
  });

  it("never returns more occurrences than the cap", () => {
    const days = occurrencesOf({
      weekdays: [1, 2, 3, 4, 5, 6, 7],
      from: "2026-01-01",
      until: "2026-12-31",
    });
    expect(days.length).toBeLessThanOrEqual(MAX_OCCURRENCES);
  });
});

describe("how it reads back", () => {
  it("names the days", () => {
    expect(
      describeRepeat({ weekdays: [1, 3], from: "2026-09-07", until: "2026-12-01" }),
    ).toBe("Mon, Wed until 2026-12-01");
  });

  it("sorts them however they were picked", () => {
    expect(
      describeRepeat({ weekdays: [5, 1], from: "2026-09-07", until: "2026-12-01" }),
    ).toContain("Mon, Fri");
  });
});

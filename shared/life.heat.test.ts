import { describe, expect, it } from "vitest";
import { shiftDay, startOfWeek } from "./dates";
import { HEAT_WEEKS, heatLevel, heatWeeks } from "./life";

/** A hobby's half year, a day at a time. Thursday 10 September 2026. */

const TODAY = "2026-09-10";
const grid = (byDay: Record<string, number>, count?: number) =>
  heatWeeks(new Map(Object.entries(byDay)), TODAY, startOfWeek(TODAY), shiftDay, count);

describe("a hobby's grid", () => {
  it("is half a year of weeks, Monday first, ending with this one", () => {
    const weeks = grid({});
    expect(weeks).toHaveLength(HEAT_WEEKS);
    expect(weeks.every((week) => week.length === 7)).toBe(true);
    // This week: Monday to Thursday have happened, and nothing was kept on them.
    expect(weeks.at(-1)).toEqual([0, 0, 0, 0, null, null, null]);
  });

  it("puts each day's minutes in its own square", () => {
    const weeks = grid({ "2026-09-10": 120, "2026-09-07": 45, "2026-09-06": 30 }, 2);
    expect(weeks).toEqual([
      [0, 0, 0, 0, 0, 0, 30],
      [45, 0, 0, 120, null, null, null],
    ]);
  });

  it("leaves out what is older than the grid, and what has not happened", () => {
    const weeks = grid({ "2026-08-01": 60, "2026-09-12": 60 }, 2);
    expect(weeks.flat().filter((minutes) => minutes !== null && minutes > 0)).toEqual([]);
  });
});

describe("how full a square is", () => {
  it("goes by the time given, not against the most ever given", () => {
    expect([0, 10, 29, 30, 59, 60, 119, 120, 400].map(heatLevel)).toEqual([0, 1, 1, 2, 2, 3, 3, 4, 4]);
  });
});

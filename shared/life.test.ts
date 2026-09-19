import { describe, expect, it } from "vitest";
import { describeWeekdays, goalPercent, gradeAverage, journalRun } from "./life";
import { shiftDay } from "./dates";

describe("the average", () => {
  it("weights grade points by credits, on whatever scale they are", () => {
    expect(gradeAverage([
      { gradePoints: 9, credits: 4 },
      { gradePoints: 7, credits: 2 },
    ])).toEqual({ value: 8.33, credits: 6, courses: 2 });
    expect(gradeAverage([{ gradePoints: 3.7, credits: null }, { gradePoints: 3.3, credits: null }])?.value).toBe(3.5);
    expect(gradeAverage([{ gradePoints: null, credits: 4 }])).toBeNull();
  });
});

describe("a goal's progress", () => {
  it("needs a target to be part way, and is whole when done", () => {
    expect(goalPercent({ target: 12, progress: 3, done: false })).toBe(25);
    expect(goalPercent({ target: 12, progress: 30, done: false })).toBe(100);
    expect(goalPercent({ target: null, progress: 3, done: false })).toBeNull();
    expect(goalPercent({ target: null, progress: null, done: true })).toBe(100);
  });
});

describe("the journal's run", () => {
  it("counts back from today, or from yesterday while today is still to be written", () => {
    const days = new Set(["2026-09-15", "2026-09-16", "2026-09-17"]);
    expect(journalRun(days, "2026-09-18", shiftDay)).toBe(3);
    expect(journalRun(new Set([...days, "2026-09-18"]), "2026-09-18", shiftDay)).toBe(4);
    expect(journalRun(days, "2026-09-19", shiftDay)).toBe(0);
  });
});

describe("weekdays in words", () => {
  it("reads the way a timetable is said", () => {
    expect(describeWeekdays([5, 1, 3])).toBe("Mon, Wed and Fri");
    expect(describeWeekdays([1, 2, 3, 4, 5])).toBe("Weekdays");
    expect(describeWeekdays([1, 2, 3, 4, 5, 6, 7])).toBe("Every day");
    expect(describeWeekdays([6])).toBe("Sat");
  });
});

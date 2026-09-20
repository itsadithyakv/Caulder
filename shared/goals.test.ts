import { describe, expect, it } from "vitest";
import { checkInInput, daysInWords, goalPace, themeDaysKept, themeOn, weeklyTotals } from "./goals";

const base = { startedOn: "2026-01-01", startValue: 0, target: 12, byOn: "2026-12-31", today: "2026-07-01", done: false };

describe("a goal against its day", () => {
  it("is ahead, on pace or behind by days of the pace it needs", () => {
    // Half the year gone, half the books is on pace.
    expect(goalPace({ ...base, value: 6 })?.status).toBe("on-pace");
    const ahead = goalPace({ ...base, value: 8 });
    expect(ahead?.status).toBe("ahead");
    expect(ahead?.aheadDays).toBeGreaterThan(50);
    expect(goalPace({ ...base, value: 3 })?.status).toBe("behind");
  });

  it("says when it will be reached at the rate so far", () => {
    // 6 in 181 days: 6 more take another 181.
    expect(goalPace({ ...base, value: 6 })?.projectedOn).toBe("2026-12-29");
    expect(goalPace({ ...base, value: 0 })?.projectedOn).toBeNull();
  });

  it("counts down as well as up", () => {
    const weight = { startedOn: "2026-01-01", startValue: 80, target: 72, byOn: "2026-05-01", today: "2026-03-01", done: false };
    expect(goalPace({ ...weight, value: 76 })?.status).toBe("on-pace");
    expect(goalPace({ ...weight, value: 74 })?.status).toBe("ahead");
    expect(goalPace({ ...weight, value: 72 })?.status).toBe("done");
  });

  it("has no pace without a number, and none needed once reached or done", () => {
    expect(goalPace({ ...base, target: null, value: 3 })).toBeNull();
    expect(goalPace({ ...base, value: 12 })?.status).toBe("done");
    expect(goalPace({ ...base, value: 2, done: true })?.status).toBe("done");
    expect(goalPace({ ...base, byOn: null, value: 2 })?.status).toBe("no-date");
    expect(goalPace({ ...base, byOn: null, value: 0 })?.status).toBe("not-moving");
    // Set today: too soon to be ahead or behind of anything, however far it moved.
    expect(goalPace({ ...base, startedOn: "2026-07-01", value: 5 })?.status).toBe("new");
  });

  it("says stretches of days the way people do", () => {
    expect(daysInWords(14)).toBe("2 weeks");
    expect(daysInWords(-5)).toBe("5 days");
    expect(daysInWords(1)).toBe("1 day");
  });

  it("takes one kind of check-in at a time", () => {
    expect(checkInInput.safeParse({ add: 1 }).success).toBe(true);
    expect(checkInInput.safeParse({ setTo: 79, note: "after the run" }).success).toBe(true);
    expect(checkInInput.safeParse({ add: 1, setTo: 2 }).success).toBe(false);
    expect(checkInInput.safeParse({}).success).toBe(false);
    expect(checkInInput.safeParse({ add: 0 }).success).toBe(false);
  });
});

describe("a week's themes and a hobby's weeks", () => {
  const themes = [{ weekday: 2, label: "Guitar", pageId: "g", area: null }];

  it("finds the theme on a day by its weekday", () => {
    expect(themeOn(themes, "2026-09-22")?.label).toBe("Guitar"); // a Tuesday
    expect(themeOn(themes, "2026-09-23")).toBeNull();
  });

  it("totals a hobby's weeks, and says which is still going", () => {
    const weeks = [
      [30, 0, 0, 60, 0, 0, 0],
      [0, 45, 0, 0, 0, 30, null],
    ];
    expect(weeklyTotals(weeks, "2026-09-14", 2)).toEqual([
      { monday: "2026-09-07", minutes: 90, partial: false },
      { monday: "2026-09-14", minutes: 75, partial: true },
    ]);
  });

  it("counts the theme days a hobby got, of those already come", () => {
    const weeks = [
      [0, 40, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 20, 0],
      [0, 30, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, null, null],
    ];
    // Tuesdays and Saturdays: four Tuesdays come, three Saturdays; Tuesday twice and Saturday once.
    expect(themeDaysKept(weeks, [2, 6])).toEqual({ kept: 3, of: 7 });
  });
});

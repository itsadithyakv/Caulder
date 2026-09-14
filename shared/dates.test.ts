import { describe, expect, it } from "vitest";
import {
  dayOf,
  daysBetween,
  describeDue,
  isDay,
  periodStart,
  shiftDay,
  startOfWeek,
  today,
} from "./dates";

describe("today", () => {
  it("gives the day where the company is, not where the machine is", () => {
    // 18:00 UTC on the 3rd is already the 3rd in Kolkata (23:30) and still the
    // 3rd in New York (14:00) - but an hour later they disagree, which is the
    // case that matters.
    const evening = new Date("2026-09-03T19:00:00Z");
    expect(today("Asia/Kolkata", evening)).toBe("2026-09-04");
    expect(today("America/New_York", evening)).toBe("2026-09-03");
  });

  it("is the reason a due date is a day and not an instant", () => {
    // Any evening after 18:30 IST, a UTC comparison would call today's tasks
    // yesterday's - exactly when somebody checks what is left to do.
    const lateEvening = new Date("2026-09-03T18:45:00Z");
    expect(today("Asia/Kolkata", lateEvening)).toBe("2026-09-04");
    expect(today("UTC", lateEvening)).toBe("2026-09-03");
  });

  it("falls back to the machine's day rather than failing", () => {
    // An unrecognised timezone must not stop the app saying what is due.
    expect(isDay(today("Not/AZone", new Date("2026-09-03T12:00:00Z")))).toBe(true);
  });
});

describe("shiftDay", () => {
  it("moves forwards and backwards", () => {
    expect(shiftDay("2026-09-03", 1)).toBe("2026-09-04");
    expect(shiftDay("2026-09-03", -3)).toBe("2026-08-31");
    expect(shiftDay("2026-09-03", 0)).toBe("2026-09-03");
  });

  it("crosses months and years", () => {
    expect(shiftDay("2026-12-31", 1)).toBe("2027-01-01");
    expect(shiftDay("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("handles a leap day", () => {
    expect(shiftDay("2028-02-28", 1)).toBe("2028-02-29");
  });

  it("is not thrown by daylight saving", () => {
    // The arithmetic is in UTC on purpose. Local-time arithmetic lands on the
    // wrong date twice a year, because one day is not always 24 hours.
    expect(shiftDay("2026-03-28", 1)).toBe("2026-03-29");
    expect(shiftDay("2026-10-24", 1)).toBe("2026-10-25");
  });
});

describe("daysBetween", () => {
  it("counts forwards and backwards", () => {
    expect(daysBetween("2026-09-03", "2026-09-10")).toBe(7);
    expect(daysBetween("2026-09-10", "2026-09-03")).toBe(-7);
    expect(daysBetween("2026-09-03", "2026-09-03")).toBe(0);
  });

  it("counts across a daylight-saving boundary correctly", () => {
    expect(daysBetween("2026-03-28", "2026-03-30")).toBe(2);
  });
});

describe("dayOf", () => {
  it("puts an instant on the right calendar day for the company", () => {
    expect(dayOf("2026-09-03T19:30:00Z", "Asia/Kolkata")).toBe("2026-09-04");
    expect(dayOf("2026-09-03T19:30:00Z", "UTC")).toBe("2026-09-03");
  });
});

describe("describeDue", () => {
  const day = "2026-09-03";

  it("uses the words the eye looks for", () => {
    expect(describeDue("2026-09-03", day)).toBe("Today");
    expect(describeDue("2026-09-04", day)).toBe("Tomorrow");
    expect(describeDue("2026-09-02", day)).toBe("Yesterday");
  });

  it("counts days rather than naming dates nearby", () => {
    expect(describeDue("2026-08-30", day)).toBe("4 days ago");
    expect(describeDue("2026-09-06", day)).toBe("In 3 days");
  });

  it("falls back to a date once a count stops helping", () => {
    expect(describeDue("2026-11-20", day)).toMatch(/Nov/);
  });

  it("includes the year only when it differs", () => {
    expect(describeDue("2026-11-20", day)).not.toMatch(/2026/);
    expect(describeDue("2027-01-20", day)).toMatch(/2027/);
  });
});

describe("isDay", () => {
  it("accepts a calendar day and nothing else", () => {
    expect(isDay("2026-09-03")).toBe(true);
    expect(isDay("2026-9-3")).toBe(false);
    expect(isDay("2026-09-03T00:00:00Z")).toBe(false);
    expect(isDay(20260903)).toBe(false);
    expect(isDay(null)).toBe(false);
  });
});

describe("the Monday of a week", () => {
  it("stays put when the day already is one", () => {
    // 2026-09-07 is a Monday.
    expect(startOfWeek("2026-09-07")).toBe("2026-09-07");
  });

  it("reaches back six days from a Sunday, not forward one", () => {
    // The off-by-one that a Sunday-first week produces: 2026-09-13 is a
    // Sunday, and treating it as the start would put the week's own Monday in
    // the week before.
    expect(startOfWeek("2026-09-13")).toBe("2026-09-07");
  });

  it("crosses a month boundary", () => {
    // 2026-10-01 is a Thursday.
    expect(startOfWeek("2026-10-01")).toBe("2026-09-28");
  });

  it("crosses a year boundary", () => {
    // 2027-01-01 is a Friday.
    expect(startOfWeek("2027-01-01")).toBe("2026-12-28");
  });
});

describe("the start of a period", () => {
  it("finds the first of the month", () => {
    expect(periodStart("2026-09-08", "month")).toBe("2026-09-01");
    expect(periodStart("2026-09-01", "month")).toBe("2026-09-01");
  });

  it("finds the first of the quarter, which is not the first of the month", () => {
    // The one worth checking: every month in a quarter has to answer the same
    // day, and the boundaries are the months that look wrong.
    expect(periodStart("2026-01-05", "quarter")).toBe("2026-01-01");
    expect(periodStart("2026-03-31", "quarter")).toBe("2026-01-01");
    expect(periodStart("2026-04-01", "quarter")).toBe("2026-04-01");
    expect(periodStart("2026-09-08", "quarter")).toBe("2026-07-01");
    expect(periodStart("2026-12-31", "quarter")).toBe("2026-10-01");
  });

  it("finds the first of the year", () => {
    expect(periodStart("2026-12-31", "year")).toBe("2026-01-01");
  });
});

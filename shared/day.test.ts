import { describe, it, expect } from "vitest";
import { layOut, spentByKind, elapsedMinutes } from "./day";
import { minutesOf, timeOf, shiftTime, overlaps, minutesLeftInDay } from "./dates";
import type { Block } from "./domain";

/**
 * Laying out a day, checked against arrangements worked out by hand.
 *
 * The overlap cases are the whole point of this suite. Every one of them is a
 * shape a real diary produces - a meeting inside a work block, two things that
 * clash, a chain where the first and last never touch - and the naive version
 * of this algorithm gets each of them subtly wrong in a way that only shows on
 * screen as a block that is too wide or in the wrong place.
 */

let counter = 0;

function block(startsAt: string, minutes: number, kind: string | null = "focus"): Block {
  counter += 1;
  return {
    id: `b${counter}`,
    companyId: "c",
    day: "2026-09-07",
    startsAt,
    minutes,
    title: `${startsAt} for ${minutes}`,
    kind,
    notes: null,
    taskId: null,
    seriesId: null,
    priority: null,
    outcome: null,
    remindMinutes: null,
    remindedAt: null,
    taskTitle: null,
    pageId: null,
    pageTitle: null,
    source: "caulder",
    externalId: null,
    isDirty: false,
    createdAt: "",
    updatedAt: "",
  };
}

describe("times of day", () => {
  it("counts minutes from midnight", () => {
    expect(minutesOf("00:00")).toBe(0);
    expect(minutesOf("09:30")).toBe(570);
    expect(minutesOf("23:59")).toBe(1439);
  });

  it("comes back the same way round", () => {
    expect(timeOf(570)).toBe("09:30");
    expect(timeOf(0)).toBe("00:00");
  });

  it("stops at the end of the day rather than wrapping into the morning", () => {
    // The bug this exists to prevent: a block dragged past midnight
    // reappearing at the top of the same day, which looks like it moved
    // backwards in time.
    expect(shiftTime("23:30", 60)).toBe("23:59");
    expect(shiftTime("00:30", -60)).toBe("00:00");
  });

  it("says how much of the day is left", () => {
    expect(minutesLeftInDay("23:00")).toBe(60);
    expect(minutesLeftInDay("00:00")).toBe(1440);
  });

  it("does not treat back-to-back as overlapping", () => {
    // 09:00-10:00 and 10:00-11:00 are the most ordinary shape a day has. A
    // half-open comparison is what keeps them in one column.
    expect(overlaps("09:00", 60, "10:00", 60)).toBe(false);
    expect(overlaps("09:00", 61, "10:00", 60)).toBe(true);
    expect(overlaps("10:00", 60, "09:00", 90)).toBe(true);
  });
});

describe("laying blocks out", () => {
  it("gives a block on its own the whole width", () => {
    const [only] = layOut([block("09:00", 60)]);
    expect(only?.column).toBe(0);
    expect(only?.columns).toBe(1);
  });

  it("puts back-to-back blocks in the same column", () => {
    const laid = layOut([block("09:00", 60), block("10:00", 60)]);
    expect(laid.map((b) => b.columns)).toEqual([1, 1]);
    expect(laid.map((b) => b.column)).toEqual([0, 0]);
  });

  it("splits two that clash", () => {
    const laid = layOut([block("09:00", 60), block("09:30", 60)]);
    expect(laid.map((b) => b.columns)).toEqual([2, 2]);
    expect(laid.map((b) => b.column)).toEqual([0, 1]);
  });

  it("keeps a transitive cluster one width throughout", () => {
    // A 09:00-11:00 block, a 10:00-10:30 meeting inside it, and a 10:30-12:00
    // block. The first and last never touch, but both touch the middle - so
    // all three are one contended stretch and must share a width. Treating
    // them as two groups would draw the first at half width and the last at
    // full, which reads as two separate mornings.
    const laid = layOut([block("09:00", 120), block("10:00", 30), block("10:30", 90)]);
    expect(laid.map((b) => b.columns)).toEqual([2, 2, 2]);
  });

  it("reuses a column once its block has finished", () => {
    // 09:00-10:00 and 09:30-10:30 fill two columns; 10:00-11:00 overlaps only
    // the second, so it belongs back in the first rather than opening a third.
    const laid = layOut([block("09:00", 60), block("09:30", 60), block("10:00", 60)]);
    expect(laid.map((b) => b.column)).toEqual([0, 1, 0]);
    expect(laid.map((b) => b.columns)).toEqual([2, 2, 2]);
  });

  it("puts the longer block first when two start together", () => {
    // The thing anchoring the stretch sits leftmost, rather than being pushed
    // around by whatever happens to be shorter.
    const laid = layOut([block("09:00", 30), block("09:00", 120)]);
    expect(laid[0]?.minutes).toBe(120);
    expect(laid[0]?.column).toBe(0);
  });
});

describe("what the day added up to", () => {
  it("counts both halves of an overlap rather than sharing them out", () => {
    // Two things booked over each other is a double-booked hour, and reporting
    // it as one would make a broken morning look like a light one.
    const spent = spentByKind([block("09:00", 60, "focus"), block("09:00", 60, "meeting")]);
    expect(spent).toEqual([
      { kind: "focus", minutes: 60 },
      { kind: "meeting", minutes: 60 },
    ]);
  });

  it("keeps blocks with no kind rather than dropping them", () => {
    const spent = spentByKind([block("09:00", 30, null)]);
    expect(spent).toEqual([{ kind: "unsorted", minutes: 30 }]);
  });

  it("sorts by how much of the day each took", () => {
    const spent = spentByKind([
      block("09:00", 30, "admin"),
      block("10:00", 120, "focus"),
    ]);
    expect(spent[0]?.kind).toBe("focus");
  });
});

describe("how much has already gone", () => {
  const morning = [block("09:00", 60), block("14:00", 60)];

  it("counts only the part behind the cursor", () => {
    // 09:30 is half an hour into the first block and nowhere near the second.
    expect(elapsedMinutes(morning, minutesOf("09:30"))).toBe(30);
  });

  it("counts a finished block whole", () => {
    expect(elapsedMinutes(morning, minutesOf("12:00"))).toBe(60);
  });

  it("counts nothing before the day starts", () => {
    expect(elapsedMinutes(morning, minutesOf("06:00"))).toBe(0);
  });

  it("counts everything once the cursor is past the end", () => {
    expect(elapsedMinutes(morning, 24 * 60)).toBe(120);
  });
});

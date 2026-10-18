import { describe, expect, it } from "vitest";
import { NO_DAY, sideBefore, sideOf, usualLength, usualOf, yourDay } from "./habitual";
import type { Timed } from "./lines";
import { parseQuick } from "./quickadd";

/**
 * Your day settles the time (PLAN.md, part twelve, phase 46): what the
 * person's own blocks say about when they work answers "at 11", "first
 * thing" and "after lunch", and how long a call usually is - before anything
 * is asked. Monday 12 October 2026, ten in the morning.
 */

const today = "2026-10-12";
/** Four weeks of weekdays: in at nine, lunch at one, calls at three, gym till seven on Mondays. */
const weeks: Timed[] = [];
for (let back = 1; back <= 28; back += 1) {
  const at = new Date(`${today}T12:00:00Z`);
  at.setUTCDate(at.getUTCDate() - back);
  const weekday = ((at.getUTCDay() + 6) % 7) + 1;
  if (weekday > 5) continue;
  const day = at.toISOString().slice(0, 10);
  weeks.push({ title: "Deep work", startsAt: "09:00", minutes: 120, day });
  weeks.push({ title: "Lunch", startsAt: "13:00", minutes: 60, day });
  weeks.push({ title: "Call with Harbour", startsAt: "15:00", minutes: 30, day });
  if (weekday === 1) weeks.push({ title: "Gym", startsAt: "18:00", minutes: 60, day });
}
const day = yourDay(weeks, today);

describe("the shape of your day", () => {
  it("is read from the blocks: when it starts, when it ends, when lunch is over", () => {
    expect(day.starts).toBe(9 * 60);
    expect(day.ends).toBe(15 * 60 + 30);
    expect(day.lunchEnds).toBe(14 * 60);
  });

  it("leans on nothing with fewer than five days to count", () => {
    expect(yourDay(weeks.slice(0, 6), today)).toEqual(NO_DAY);
    expect(yourDay([], today)).toEqual(NO_DAY);
  });

  it("counts only the last eight weeks, and nothing from today on", () => {
    const old = weeks.map((each) => ({ ...each, day: each.day.replace("2026-", "2025-") }));
    expect(yourDay(old, today)).toEqual(NO_DAY);
  });
});

describe("morning or evening, from when your days are", () => {
  it("is the side of the day that falls inside it", () => {
    expect(sideOf(11, 0, day)).toBe("am");
    expect(sideOf(8, 30, day)).toBe("am"); // an hour before the day still counts
    expect(sideOf(10, 0, { starts: 14 * 60, ends: 23 * 60, lunchEnds: null })).toBe("pm");
  });

  it("is left to be asked when both sides fit, or neither does, or there is no day", () => {
    expect(sideOf(9, 0, { starts: 8 * 60, ends: 22 * 60, lunchEnds: null })).toBeNull();
    expect(sideOf(7, 0, { starts: 11 * 60, ends: 17 * 60, lunchEnds: null })).toBeNull();
    expect(sideOf(11, 0, NO_DAY)).toBeNull();
  });

  it("answers the line's question, and says so", () => {
    const asked = parseQuick("call priya at 11", { today, now: 600 });
    expect(asked.task.time).toBeNull();
    expect(asked.questions.map((q) => q.id)).toContain("meridiem");

    const settled = parseQuick("call priya at 11", { today, now: 600, day });
    expect(settled.task.time).toBe("11:00");
    expect(settled.questions.map((q) => q.id)).not.toContain("meridiem");
    expect(settled.notes).toContain("Read 11 as the morning, from the hours you work.");
  });

  it("never overrides what was said", () => {
    expect(parseQuick("call priya at 11pm", { today, now: 600, day }).task.time).toBe("23:00");
    expect(parseQuick("drinks at 9", { today, now: 600, day }).task.time).toBe("21:00");
  });
});

describe("the words for your day", () => {
  it("reads first thing as when your day starts", () => {
    expect(parseQuick("email jonas first thing tomorrow", { today, now: 600, day }).task).toMatchObject({
      title: "Email jonas",
      day: "2026-10-13",
      time: "09:00",
    });
    expect(parseQuick("tomorrow first thing call the bank", { today, now: 600, day: { ...day, starts: 8 * 60 } }).task.time).toBe("08:00");
  });

  it("reads after lunch as when lunch is over", () => {
    expect(parseQuick("review contract after lunch", { today, now: 600, day }).task).toMatchObject({
      title: "Review contract",
      day: today,
      time: "14:00",
    });
  });

  it("uses fixed hours with no history", () => {
    expect(parseQuick("review contract after lunch", { today, now: 600 }).task.time).toBe("14:00");
    expect(parseQuick("email jonas first thing tomorrow", { today, now: 600 }).task.time).toBe("09:00");
  });

  it("leaves 'first thing' alone when it is not about when", () => {
    const read = parseQuick("the first thing to fix is the login", { today, now: 600, day });
    expect(read.task.time).toBeNull();
    expect(read.task.title.toLowerCase()).toContain("first thing");
  });
});

describe("how long, from what it usually is", () => {
  it("gives a call the length calls have usually had", () => {
    expect(usualLength("call", weeks)).toMatchObject({ minutes: 30, about: "a call" });
    expect(usualOf("Call jonas", "call", weeks)).toMatchObject({ minutes: 30 });
  });

  it("prefers this very thing's own usual, and counts nothing it has too little of", () => {
    expect(usualOf("Gym", "todo", weeks)).toMatchObject({ time: "18:00", minutes: 60 });
    expect(usualLength("meeting", weeks)).toBeNull();
    expect(usualLength("todo", weeks)).toBeNull();
  });
});

describe("morning or evening, as this very thing has been before (part twelve, phase 48)", () => {
  const mum: Timed[] = [
    { title: "Call mum", startsAt: "20:00", minutes: 30, day: "2026-10-05" },
    { title: "Call mum", startsAt: "20:00", minutes: 30, day: "2026-10-08" },
  ];

  it("follows what it has been, ahead of the hours you work", () => {
    expect(sideBefore("Call mum", 8, 0, mum)).toBe("pm");
    const read = parseQuick("call mum at 8", { today, now: 600, day, past: [...weeks, ...mum] });
    expect(read.task.time).toBe("20:00");
    expect(read.notes).toContain("Read 8 as the evening, as it has been before.");
  });

  it("counts on nothing seen only once, or both ways", () => {
    expect(sideBefore("Call mum", 8, 0, mum.slice(0, 1))).toBeNull();
    expect(sideBefore("Call mum", 8, 0, [...mum, { title: "Call mum", startsAt: "08:00", minutes: 30, day: "2026-10-09" }])).toBeNull();
  });
});

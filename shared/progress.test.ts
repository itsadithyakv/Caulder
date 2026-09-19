import { describe, expect, it } from "vitest";
import { achievementsOf, levelOf, progressOf, runReached, weekOf, xpForLevel, xpOf, type Happening } from "./progress";

/**
 * Your level, worked out (PLAN.md, phase 17): points from what happened,
 * levels a hundred apart and growing, the week across the four areas, and
 * achievements dated by when they were earned.
 */

const today = "2026-09-18"; // a Friday

describe("XP", () => {
  it("is fifteen a kept hour and a fixed amount for everything else", () => {
    expect(xpOf({ kind: "time", day: today, area: null, minutes: 60 })).toBe(15);
    expect(xpOf({ kind: "time", day: today, area: null, minutes: 90 })).toBe(23);
    expect(xpOf({ kind: "task", day: today, area: null })).toBe(10);
    expect(xpOf({ kind: "goal", day: today, area: null })).toBe(150);
  });
});

describe("levels", () => {
  it("start at 0, 100, 300, 600 and 1,000", () => {
    expect([1, 2, 3, 4, 5].map(xpForLevel)).toEqual([0, 100, 300, 600, 1000]);
  });

  it("say where this one started and the next one starts", () => {
    expect(levelOf(0)).toEqual({ level: 1, xp: 0, from: 0, to: 100 });
    expect(levelOf(99).level).toBe(1);
    expect(levelOf(100)).toEqual({ level: 2, xp: 100, from: 100, to: 300 });
    expect(levelOf(599).level).toBe(3);
    expect(levelOf(600).level).toBe(4);
    expect(levelOf(4500).level).toBe(10);
  });
});

describe("the week across the four areas", () => {
  it("counts the last seven days by area, and names the ones nothing happened in", () => {
    const week = weekOf(
      [
        { kind: "time", day: today, area: "college", minutes: 120 },
        { kind: "task", day: "2026-09-12", area: "company" },
        { kind: "call", day: "2026-09-13", area: "company" },
        // Eight days ago: last week's.
        { kind: "habit", day: "2026-09-10", area: "health" },
        // No area: counted for XP, not for balance.
        { kind: "task", day: today, area: null },
      ],
      today,
    );
    expect(week.from).toBe("2026-09-12");
    expect(week.areas.find((row) => row.area === "college")).toMatchObject({ minutes: 120, done: 0, xp: 30 });
    expect(week.areas.find((row) => row.area === "company")).toMatchObject({ minutes: 0, done: 2, xp: 20 });
    expect(week.quiet).toEqual(["personal", "health"]);
  });
});

describe("achievements", () => {
  it("are dated by the happening that earned them, and say how far along the rest are", () => {
    const calls: Happening[] = Array.from({ length: 3 }, (_, index) => ({ kind: "call", day: `2026-09-0${index + 1}`, area: "company" }));
    const found = achievementsOf(calls, [], today);
    expect(found.find((each) => each.id === "first-call")).toMatchObject({ earnedOn: "2026-09-01", have: 1, need: 1 });
    expect(found.find((each) => each.id === "calls-50")).toMatchObject({ earnedOn: null, have: 3, need: 50, unit: "calls" });
    expect(found.find((each) => each.id === "first-deal")?.earnedOn).toBeNull();
  });

  it("count ten hours on the day the tenth was kept", () => {
    const blocks: Happening[] = [
      { kind: "time", day: "2026-09-01", area: "college", minutes: 300 },
      { kind: "time", day: "2026-09-05", area: "company", minutes: 240 },
      { kind: "time", day: "2026-09-09", area: "health", minutes: 60 },
    ];
    expect(achievementsOf(blocks, [], today).find((each) => each.id === "hours-10")).toMatchObject({
      earnedOn: "2026-09-09",
      have: 10,
      need: 10,
    });
  });

  it("find a week written, a day at a time, and a habit's run over its own days", () => {
    const entries: Happening[] = ["01", "02", "03", "05", "06", "07", "08", "09", "10", "11"].map((d) => ({
      kind: "entry",
      day: `2026-09-${d}`,
      area: "personal",
    }));
    // Monday, Wednesday and Friday: seven of them in a row from 31 August is 14 September.
    const gym = {
      weekdays: [1, 3, 5],
      days: ["2026-08-31", "2026-09-02", "2026-09-04", "2026-09-07", "2026-09-09", "2026-09-11", "2026-09-14"],
      since: "2026-08-31",
    };
    const found = achievementsOf(entries, [gym], today);
    // The fourth was missed; the run from the fifth reaches seven on the eleventh.
    expect(found.find((each) => each.id === "journal-week")?.earnedOn).toBe("2026-09-11");
    expect(found.find((each) => each.id === "habit-7")?.earnedOn).toBe("2026-09-14");
    expect(found.find((each) => each.id === "habit-30")).toMatchObject({ earnedOn: null, have: 7 });
  });

  it("see a week with something for all four areas, Monday to Sunday", () => {
    const split: Happening[] = [
      // Sunday the sixth and Monday the seventh are different weeks.
      { kind: "task", day: "2026-09-06", area: "college" },
      { kind: "task", day: "2026-09-07", area: "company" },
      { kind: "habit", day: "2026-09-08", area: "health" },
      { kind: "entry", day: "2026-09-09", area: "personal" },
    ];
    expect(achievementsOf(split, [], today).find((each) => each.id === "balanced")).toMatchObject({ earnedOn: null, have: 3 });
    const whole = [...split, { kind: "time", day: "2026-09-10", area: "college", minutes: 60 } as Happening];
    expect(achievementsOf(whole, [], today).find((each) => each.id === "balanced")?.earnedOn).toBe("2026-09-10");
  });
});

describe("a run of days", () => {
  it("does not break on today, which is not over", () => {
    const run = { weekdays: [1, 2, 3, 4, 5, 6, 7], days: ["2026-09-16", "2026-09-17"], since: "2026-09-16" };
    expect(runReached(run, today, 3)).toEqual({ on: null, best: 2 });
  });
});

describe("all of it", () => {
  it("adds up the XP, the week's share, and where it came from", () => {
    const progress = progressOf(
      [
        { kind: "deal", day: "2026-08-01", area: "company" },
        { kind: "task", day: today, area: "company" },
        { kind: "time", day: today, area: "college", minutes: 60 },
        // Tomorrow has not happened.
        { kind: "task", day: "2026-09-19", area: "company" },
      ],
      [],
      today,
    );
    expect(progress.level).toEqual({ level: 2, xp: 125, from: 100, to: 300 });
    expect(progress.weekXp).toBe(25);
    expect(progress.sources.map((source) => [source.kind, source.count, source.xp, source.week])).toEqual([
      ["deal", 1, 100, 0],
      ["time", 60, 15, 15],
      ["task", 1, 10, 10],
    ]);
  });
});

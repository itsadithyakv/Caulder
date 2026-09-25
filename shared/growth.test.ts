import { describe, expect, it } from "vitest";
import { WAYS_UP } from "./ascent";
import { DANCES } from "./ember";
import {
  collected,
  keyOf,
  LADDER,
  learnedBy,
  needsLabel,
  needsOf,
  streaksOf,
  upNext,
  warmthBand,
  warmthOf,
} from "./growth";
import type { HabitRun } from "./progress";
import { WARDROBE } from "./wardrobe";
import { GARMENTS } from "./closet";

const EVERY_DAY = [1, 2, 3, 4, 5, 6, 7];
// A Wednesday.
const TODAY = "2026-09-23";

function run(days: string[], since = "2026-08-01", weekdays = EVERY_DAY): HabitRun {
  return { weekdays, days, since };
}

function back(n: number): string {
  const date = new Date(`${TODAY}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - n);
  return date.toISOString().slice(0, 10);
}

describe("the ladder", () => {
  it("has every dance, costume and way up on it exactly once", () => {
    const keys = LADDER.map((rung) => keyOf(rung.item));
    expect(new Set(keys).size).toBe(keys.length);
    for (const dance of DANCES) expect(keys, dance).toContain(`dance:${dance}`);
    for (const look of WARDROBE) expect(keys, look.id).toContain(`costume:${look.id}`);
    for (const way of WAYS_UP) expect(keys, way).toContain(`way:${way}`);
    for (const piece of GARMENTS) expect(keys, piece.id).toContain(`garment:${piece.id}`);
  });

  it("starts her with a dance, a costume, a way home and her own clothes, and nothing else", () => {
    const start = learnedBy({ level: 1, best: 0 });
    expect([...start].sort()).toEqual(["costume:cowboy", "dance:dab", "garment:beanie", "garment:scarf", "garment:sneakers", "way:rope"]);
  });

  it("teaches her something at every level from the second", () => {
    for (let level = 2; level <= 25; level += 1) {
      const before = learnedBy({ level: level - 1, best: 0 });
      const after = learnedBy({ level, best: 0 });
      expect(after.size, `level ${level}`).toBeGreaterThan(before.size);
    }
  });

  it("gives the special costumes for runs of days, not for levels", () => {
    expect(learnedBy({ level: 99, best: 0 }).has("costume:mj")).toBe(false);
    expect(learnedBy({ level: 1, best: 30 }).has("costume:mj")).toBe(true);
    expect(learnedBy({ level: 1, best: 29 }).has("costume:mj")).toBe(false);
    expect(needsLabel(needsOf({ kind: "costume", id: "bolt" }))).toBe("7-day run");
    expect(needsLabel(needsOf({ kind: "dance", id: "moonwalk" }))).toBe("Level 3");
  });

  it("counts what she has collected", () => {
    const counts = collected(learnedBy({ level: 1, best: 0 }));
    expect(counts.dance).toEqual({ have: 1, of: DANCES.length });
    expect(counts.costume).toEqual({ have: 1, of: WARDROBE.length });
    expect(counts.way).toEqual({ have: 1, of: WAYS_UP.length });
    expect(counts.garment).toEqual({ have: 3, of: GARMENTS.length });
  });
});

describe("what comes next", () => {
  it("names the next level's rung and the next streak costume, with how far off each is", () => {
    const next = upNext({ level: 1, xp: 40, best: 2 }, 3);
    expect(next[0]).toMatchObject({ needs: { level: 2 }, togo: 60, unit: "XP" });
    expect(next[1]).toMatchObject({ item: { kind: "costume", id: "brucelee" }, togo: 1, unit: "days" });
  });

  it("runs out gracefully at the top", () => {
    expect(upNext({ level: 99, xp: 999_999, best: 999 })).toEqual([]);
  });
});

describe("streaks", () => {
  it("counts the longest run ever and the one going now", () => {
    const days = [back(10), back(9), back(8), back(7), back(2), back(1)];
    expect(streaksOf([run(days)], TODAY)).toEqual({ best: 4, streak: 2 });
  });

  it("is not broken by a day the habit is not for", () => {
    // Mondays and Thursdays only; every one of them kept.
    const days = ["2026-09-07", "2026-09-10", "2026-09-14", "2026-09-17", "2026-09-21"];
    expect(streaksOf([run(days, "2026-09-07", [1, 4])], TODAY).streak).toBe(5);
  });

  it("is not broken by today, before it is ticked", () => {
    expect(streaksOf([run([back(3), back(2), back(1)])], TODAY).streak).toBe(3);
  });
});

describe("warmth", () => {
  const allOf = (n: number) => Array.from({ length: n }, (_, k) => back(k + 1));

  it("is warm, not blazing, the morning after a perfect week - the blaze is today's ticks", () => {
    const morning = warmthOf([run(allOf(7))], TODAY);
    expect(warmthBand(morning)).toBe("warm");
    const ticked = warmthOf([run([TODAY, ...allOf(7)])], TODAY);
    expect(warmthBand(ticked)).toBe("blazing");
  });

  it("goes down to embers after days of nothing, and one day's habits bring her straight back", () => {
    const cold = warmthOf([run([back(9)])], TODAY);
    expect(warmthBand(cold)).toBe("embers");
    expect(warmthBand(warmthOf([run([TODAY, back(9)])], TODAY))).toBe("warm");
  });

  it("counts recent days more than old ones", () => {
    const yesterday = warmthOf([run([back(1)])], TODAY);
    const lastWeek = warmthOf([run([back(5)])], TODAY);
    expect(yesterday).toBeGreaterThan(lastWeek);
  });

  it("is simply warm with no habits at all", () => {
    expect(warmthBand(warmthOf([], TODAY))).toBe("warm");
  });

  it("counts half a set of habits as half", () => {
    const half = warmthOf([run([TODAY, ...allOf(5)]), run([])], TODAY);
    const all = warmthOf([run([TODAY, ...allOf(5)]), run([TODAY, ...allOf(5)])], TODAY);
    expect(half).toBeLessThan(all);
    expect(half).toBeGreaterThan(0);
  });
});

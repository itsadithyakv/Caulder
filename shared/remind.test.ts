import { describe, it, expect } from "vitest";
import { dueReminders, startsWording, REMIND_NEVER } from "./remind";
import type { Remindable } from "./remind";
import { minutesOf } from "./dates";

/**
 * When a reminder is owed, and the four times it is not.
 *
 * Every case here is one the obvious implementation gets wrong: a lead time
 * that reaches back into yesterday, a lead of zero that leaves no minute to
 * land in, a block already written off, and a machine that was asleep when
 * the window opened.
 */

function block(over: Partial<Remindable> & { startsAt: string }): Remindable {
  return {
    id: over.startsAt,
    outcome: null,
    remindMinutes: null,
    remindedAt: null,
    ...over,
  };
}

describe("the workspace switch", () => {
  it("says nothing at all while reminders are off", () => {
    const blocks = [block({ startsAt: "09:00", remindMinutes: 10 })];
    expect(dueReminders(blocks, minutesOf("08:55"), null)).toEqual([]);
  });

  it("is not overridden by a block that asks for one", () => {
    // The hidden-checkbox bug in another guise: off has to mean off, or the
    // switch is a lie the moment one block disagrees with it.
    const blocks = [block({ startsAt: "09:00", remindMinutes: 30 })];
    expect(dueReminders(blocks, minutesOf("08:40"), null)).toEqual([]);
  });
});

describe("the window", () => {
  const blocks = [block({ startsAt: "09:00" })];

  it("is shut before the lead time", () => {
    expect(dueReminders(blocks, minutesOf("08:49"), 10)).toEqual([]);
  });

  it("opens exactly at the lead time", () => {
    expect(dueReminders(blocks, minutesOf("08:50"), 10)).toHaveLength(1);
  });

  it("is still open at the start, so a late tick is not a missed reminder", () => {
    const due = dueReminders(blocks, minutesOf("09:00"), 10);
    expect(due).toHaveLength(1);
    expect(due[0]?.inMinutes).toBe(0);
  });

  it("shuts once the block has begun", () => {
    expect(dueReminders(blocks, minutesOf("09:01"), 10)).toEqual([]);
  });

  it("leaves a lead of zero a minute to land in", () => {
    // The bug an exclusive upper bound would cause: the window would be
    // [09:00, 09:00), which is empty, and "tell me as it starts" would never
    // tell you anything.
    expect(dueReminders(blocks, minutesOf("09:00"), 0)).toHaveLength(1);
    expect(dueReminders(blocks, minutesOf("08:59"), 0)).toEqual([]);
  });
});

describe("a lead time longer than the day is old", () => {
  it("does not reach back into yesterday evening", () => {
    // 00:05 with an hour's notice would be 23:05 the night before. The rest of
    // the time-of-day layer clamps rather than wrapping, and so does this.
    const blocks = [block({ startsAt: "00:05" })];
    expect(dueReminders(blocks, minutesOf("23:05"), 60)).toEqual([]);
  });

  it("says it at midnight instead", () => {
    const blocks = [block({ startsAt: "00:05" })];
    const due = dueReminders(blocks, 0, 60);
    expect(due).toHaveLength(1);
    expect(due[0]?.inMinutes).toBe(5);
  });
});

describe("what it refuses to mention", () => {
  it("stays quiet about a block it has already mentioned", () => {
    const blocks = [block({ startsAt: "09:00", remindedAt: "2026-09-08T08:50:00.000Z" })];
    expect(dueReminders(blocks, minutesOf("08:55"), 10)).toEqual([]);
  });

  it("stays quiet about a block you said is not happening", () => {
    const blocks = [block({ startsAt: "09:00", outcome: "skipped" })];
    expect(dueReminders(blocks, minutesOf("08:55"), 10)).toEqual([]);
  });

  it("stays quiet about one that opted out", () => {
    const blocks = [block({ startsAt: "09:00", remindMinutes: REMIND_NEVER })];
    expect(dueReminders(blocks, minutesOf("08:55"), 10)).toEqual([]);
  });
});

describe("a block that wants its own notice", () => {
  it("uses its own lead rather than the workspace's", () => {
    const blocks = [block({ startsAt: "09:00", remindMinutes: 30 })];
    expect(dueReminders(blocks, minutesOf("08:40"), 10)).toHaveLength(1);
  });

  it("uses it even when it is shorter", () => {
    const blocks = [block({ startsAt: "09:00", remindMinutes: 5 })];
    expect(dueReminders(blocks, minutesOf("08:50"), 30)).toEqual([]);
    expect(dueReminders(blocks, minutesOf("08:56"), 30)).toHaveLength(1);
  });
});

describe("two at once", () => {
  it("comes back in the order the day has them", () => {
    const blocks = [block({ startsAt: "09:30" }), block({ startsAt: "09:05" })];
    const due = dueReminders(blocks, minutesOf("09:00"), 60);
    expect(due.map((entry) => entry.block.startsAt)).toEqual(["09:05", "09:30"]);
  });
});

describe("what it says", () => {
  it("reports the real distance, not the setting", () => {
    // Asleep through 08:50, awake at 08:57. Telling you a nine o'clock lecture
    // starts in ten minutes would be reading the setting back at you.
    const blocks = [block({ startsAt: "09:00" })];
    expect(dueReminders(blocks, minutesOf("08:57"), 10)[0]?.inMinutes).toBe(3);
  });

  it("reads as English at the edges", () => {
    expect(startsWording(0)).toBe("starts now");
    expect(startsWording(1)).toBe("starts in a minute");
    expect(startsWording(60)).toBe("starts in an hour");
    expect(startsWording(7)).toBe("starts in 7 minutes");
  });
});

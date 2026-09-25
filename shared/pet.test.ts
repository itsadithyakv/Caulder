import { describe, expect, it } from "vitest";
import { errandOf, onTaskbar, petWanted, stroll, walkway, type Stroll } from "./pet";

describe("walkway", () => {
  it("is the seam above a bottom taskbar", () => {
    // 1920x1080 with a 48-pixel taskbar: the work area ends at 1032, and her
    // feet land on it, sixty pixels below the top of her window.
    const way = walkway({ x: 0, y: 0, width: 1920, height: 1032 });
    expect(way).toEqual({ y: 972, from: 0, to: 1856 });
  });

  it("is the bottom of the screen when the taskbar is at the top", () => {
    const way = walkway({ x: 0, y: 48, width: 1920, height: 1032 });
    expect(way.y).toBe(1020);
  });

  it("follows a second monitor's own coordinates", () => {
    const way = walkway({ x: 1920, y: 0, width: 1280, height: 984 });
    expect(way.from).toBe(1920);
    expect(way.to).toBe(3136);
  });
});

describe("stroll", () => {
  const way = { from: 0, to: 100 };
  const at = (over: Partial<Stroll> = {}): Stroll => ({ x: 50, dir: 1, rest: 0, walked: 0, ...over });

  it("takes a step in the direction she faces", () => {
    expect(stroll(at(), way, false).x).toBe(54);
    expect(stroll(at({ dir: -1 }), way, false).x).toBe(46);
  });

  it("turns round at the end and stands a while", () => {
    const next = stroll(at({ x: 98 }), way, false);
    expect(next).toEqual({ x: 100, dir: -1, rest: 40, walked: 0 });
  });

  it("stands still while something holds her", () => {
    expect(stroll(at(), way, true)).toEqual(at());
  });

  it("counts down a rest before walking on", () => {
    expect(stroll(at({ rest: 3 }), way, false)).toEqual(at({ rest: 2 }));
  });

  it("stops every so often mid-walk", () => {
    const next = stroll(at({ walked: 59 }), way, false);
    expect(next.rest).toBeGreaterThan(0);
    expect(next.walked).toBe(0);
  });

  it("comes back onto the walkway if the screen shrank under her", () => {
    // A monitor unplugged, a resolution changed: she was at 900, the walkway
    // now ends at 100, and she is not left standing off the edge of it.
    expect(stroll(at({ x: 900 }), way, true).x).toBe(100);
  });
});

describe("errandOf", () => {
  const empty = { day: "2026-09-23", blocks: [], replies: [], overdue: [] };
  const now = { day: "2026-09-23", hhmm: "08:52" };

  it("carries nothing on an empty day", () => {
    expect(errandOf(empty, now)).toBeNull();
  });

  it("rings the bell for a block starting within ten minutes", () => {
    const lecture = { day: "2026-09-23", startsAt: "09:00" };
    expect(errandOf({ ...empty, blocks: [lecture] }, now)).toBe("bell");
  });

  it("does not ring for a block that is further off, or already started", () => {
    const later = { day: "2026-09-23", startsAt: "09:30" };
    const started = { day: "2026-09-23", startsAt: "08:30" };
    expect(errandOf({ ...empty, blocks: [later, started] }, now)).toBeNull();
  });

  it("does not ring for a block marked as not happening", () => {
    const skipped = { day: "2026-09-23", startsAt: "09:00", outcome: "skipped" };
    expect(errandOf({ ...empty, blocks: [skipped] }, now)).toBeNull();
  });

  it("puts the bell before a reply, and a reply before overdue work", () => {
    // One pair of hands. Soonest first: a lecture cannot wait, a reply goes
    // cold, and overdue work was already late an hour ago.
    const lecture = { day: "2026-09-23", startsAt: "09:00" };
    expect(errandOf({ ...empty, blocks: [lecture], replies: [1], overdue: [1] }, now)).toBe("bell");
    expect(errandOf({ ...empty, replies: [1], overdue: [1] }, now)).toBe("letter");
    expect(errandOf({ ...empty, overdue: [1] }, now)).toBe("papers");
  });

  it("does not ring for a Today that is about another day", () => {
    // A stale Today from before midnight must not ring for yesterday's 9am.
    const lecture = { day: "2026-09-22", startsAt: "09:00" };
    expect(errandOf({ ...empty, day: "2026-09-22", blocks: [lecture] }, now)).toBeNull();
  });
});

describe("onTaskbar", () => {
  it("is out when wanted and Caulder is not in front", () => {
    expect(onTaskbar({ wanted: true, caulderInFront: false, fullScreenInFront: false })).toBe(true);
  });

  it("goes inside when Caulder is in front, so there is only one of her", () => {
    expect(onTaskbar({ wanted: true, caulderInFront: true, fullScreenInFront: false })).toBe(false);
  });

  it("gets out of the way of anything full-screen", () => {
    expect(onTaskbar({ wanted: true, caulderInFront: false, fullScreenInFront: true })).toBe(false);
  });

  it("stays away when put away", () => {
    expect(onTaskbar({ wanted: false, caulderInFront: false, fullScreenInFront: false })).toBe(false);
  });
});

describe("petWanted", () => {
  it("is on unless somebody put her away", () => {
    expect(petWanted(undefined)).toBe(true);
    expect(petWanted("1")).toBe(true);
    expect(petWanted("0")).toBe(false);
  });
});

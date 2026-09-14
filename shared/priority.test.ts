import { describe, it, expect } from "vitest";
import { priorityOf, clashesIn, whatNow } from "./priority";
import type { Timed } from "./priority";
import { minutesOf } from "./dates";

/**
 * What to be at, and where the app stops deciding.
 *
 * The refusal is the part worth testing hardest. An app that ranks two things
 * you have both called "has to happen" is guessing, and a guess presented as
 * advice is worse than silence.
 */

function at(
  id: string,
  startsAt: string,
  minutes: number,
  kind: string | null = "focus",
  priority: string | null = null,
): Timed {
  return { id, startsAt, minutes, kind, priority };
}

describe("what a block is worth by default", () => {
  it("treats a lecture and a meeting as things you turn up to", () => {
    expect(priorityOf("class", null)).toBe("must");
    expect(priorityOf("meeting", null)).toBe("must");
  });

  it("treats a break as the thing that gives way", () => {
    expect(priorityOf("break", null)).toBe("spare");
  });

  it("puts anything unrecognised in the safe middle", () => {
    expect(priorityOf("something-invented", null)).toBe("should");
    expect(priorityOf(null, null)).toBe("should");
  });

  it("lets an explicit choice beat the default", () => {
    expect(priorityOf("break", "must")).toBe("must");
  });

  it("ignores a stored value that is not a priority", () => {
    expect(priorityOf("class", "urgent-ish")).toBe("must");
  });
});

describe("what clashes with what", () => {
  it("says nothing about things that merely touch", () => {
    // 09:00-10:00 and 10:00-11:00 are back to back, which is the ordinary
    // shape of a day rather than a problem.
    const clashes = clashesIn([at("a", "09:00", 60), at("b", "10:00", 60)]);
    expect(clashes.get("a")).toEqual({ losesTo: [], tiesWith: [] });
  });

  it("marks the lesser one as losing", () => {
    const clashes = clashesIn([
      at("gym", "09:00", 60, "break"),
      at("client", "09:30", 60, "meeting"),
    ]);
    expect(clashes.get("gym")?.losesTo).toEqual(["client"]);
    expect(clashes.get("client")?.losesTo).toEqual([]);
  });

  it("refuses to rank two things of equal weight", () => {
    // The whole point. A lecture and a client meeting are both "must", and
    // Caulder does not know which matters more to you today.
    const clashes = clashesIn([
      at("lecture", "09:00", 60, "class"),
      at("client", "09:30", 60, "meeting"),
    ]);
    expect(clashes.get("lecture")?.tiesWith).toEqual(["client"]);
    expect(clashes.get("lecture")?.losesTo).toEqual([]);
    expect(clashes.get("client")?.tiesWith).toEqual(["lecture"]);
  });
});

describe("what to be doing now", () => {
  const day = [
    at("lecture", "09:00", 60, "class"),
    at("gym", "09:30", 30, "break"),
    at("client", "14:00", 60, "meeting"),
  ];

  it("names the most important thing happening", () => {
    const advice = whatNow(day, minutesOf("09:40"));
    expect(advice.at.map((block) => block.id)).toEqual(["lecture"]);
    expect(advice.yielding.map((block) => block.id)).toEqual(["gym"]);
  });

  it("names both when they are equal, rather than choosing", () => {
    const advice = whatNow(
      [at("lecture", "09:00", 60, "class"), at("client", "09:00", 60, "meeting")],
      minutesOf("09:30"),
    );
    expect(advice.at).toHaveLength(2);
    expect(advice.yielding).toHaveLength(0);
  });

  it("hands the boundary to whatever starts then", () => {
    // A block ending at 10:00 is over at 10:00. Otherwise the nine o'clock
    // lecture goes on being the answer while the ten o'clock meeting waits.
    const advice = whatNow([at("a", "09:00", 60), at("b", "10:00", 60)], minutesOf("10:00"));
    expect(advice.at.map((block) => block.id)).toEqual(["b"]);
  });

  it("says what is next, and how long there is", () => {
    const advice = whatNow(day, minutesOf("11:00"));
    expect(advice.at).toHaveLength(0);
    expect(advice.next?.id).toBe("client");
    expect(advice.nextIn).toBe(180);
  });

  it("has nothing to say about an empty evening", () => {
    const advice = whatNow(day, minutesOf("22:00"));
    expect(advice.at).toHaveLength(0);
    expect(advice.next).toBeNull();
    expect(advice.nextIn).toBeNull();
  });
});

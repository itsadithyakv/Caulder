import { describe, expect, it } from "vitest";
import { captionOf, costumeAt, doodleOf, lookOf, WARDROBE } from "./wardrobe";

describe("the wardrobe", () => {
  it("has no costume twice and no two doodles on one day", () => {
    const ids = WARDROBE.map((look) => look.id);
    expect(new Set(ids).size).toBe(ids.length);
    const days = WARDROBE.flatMap((look) => (look.on ? [look.on] : []));
    expect(new Set(days).size).toBe(days.length);
  });

  it("gives every dated costume a reason, and only real calendar days", () => {
    for (const look of WARDROBE) {
      if (!look.on) continue;
      expect(look.because, look.id).toBeTruthy();
      const [month, day] = look.on.split("-").map(Number);
      const date = new Date(Date.UTC(2024, (month ?? 0) - 1, day));
      expect(date.getUTCDate(), look.id).toBe(day);
    }
  });

  it("works through every costume in turn, then starts again", () => {
    const seen = Array.from({ length: WARDROBE.length }, (_, n) => costumeAt(n));
    expect(new Set(seen).size).toBe(WARDROBE.length);
    expect(costumeAt(WARDROBE.length)).toBe(costumeAt(0));
    expect(costumeAt(-3)).toBe(costumeAt(0));
  });
});

describe("doodles", () => {
  it("dresses her for the day that belongs to somebody", () => {
    expect(doodleOf("2027-03-14")).toBe("einstein");
    expect(doodleOf("2026-07-20")).toBe("armstrong");
    expect(doodleOf("2026-08-29")).toBe("mj");
  });

  it("leaves an ordinary day alone, and a day that is not a day", () => {
    expect(doodleOf("2026-09-23")).toBeNull();
    expect(doodleOf("March 14")).toBeNull();
  });

  it("says whose day it is when it is a doodle, and only who when it is not", () => {
    expect(captionOf("einstein", true)).toBe("Albert Einstein, born 14 March 1879.");
    expect(captionOf("einstein", false)).toBe("Albert Einstein: that photograph.");
    expect(captionOf("pirate", false)).toBe("A pirate: the cutlass.");
  });

  it("never invents an occasion for a costume without one", () => {
    expect(lookOf("zeus").on).toBeUndefined();
    expect(captionOf("zeus", true)).toBe("Zeus: a thunderbolt, then his own robe.");
  });
});

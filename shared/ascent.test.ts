import { describe, expect, it } from "vitest";
import { aimFor, climbed, stranded, wayUpAt, WAYS_UP } from "./ascent";

describe("ways up", () => {
  it("tries every way before any one twice, rope first", () => {
    const seen = Array.from({ length: WAYS_UP.length }, (_, n) => wayUpAt(n));
    expect(seen[0]).toBe("rope");
    expect(new Set(seen).size).toBe(WAYS_UP.length);
    expect(wayUpAt(WAYS_UP.length)).toBe("rope");
    expect(wayUpAt(-1)).toBe("rope");
  });

  it("only needs one from below her line", () => {
    expect(stranded(500, 200)).toBe(true);
    expect(stranded(204, 200)).toBe(false);
    expect(stranded(120, 200)).toBe(false);
  });

  it("aims straight up where her line reaches, and for its nearest end where it does not", () => {
    const home = { left: 300, right: 900 };
    expect(aimFor(500, home)).toBe(500);
    expect(aimFor(100, home)).toBe(300 - 32 + 12);
    expect(aimFor(2000, home)).toBe(900 - 32 - 12);
  });
});

describe("climbing the rope", () => {
  it("starts at the bottom and gets to the top", () => {
    expect(climbed(0).share).toBe(0);
    let t = 0;
    while (!climbed(t).done && t < 20) t += 0.05;
    expect(climbed(t).done).toBe(true);
    expect(climbed(t).share).toBe(1);
    expect(t).toBeGreaterThan(4);
    expect(t).toBeLessThan(8);
  });

  it("goes up in pulls, hanging between them, not in a glide", () => {
    // The top of the first pull and a moment later: the same height.
    expect(climbed(0.3).share).toBeCloseTo(climbed(0.42).share, 5);
    expect(climbed(0.5).share).toBeGreaterThan(climbed(0.42).share);
  });

  it("slips once, part way up, and loses ground", () => {
    let slips = 0;
    let was = false;
    let best = 0;
    let lost = false;
    for (let t = 0; t < 10 && !climbed(t).done; t += 0.02) {
      const now = climbed(t);
      if (now.slipping && !was) slips += 1;
      was = now.slipping;
      if (now.share < best - 0.1) lost = true;
      best = Math.max(best, now.share);
    }
    expect(slips).toBe(1);
    expect(lost).toBe(true);
  });

  it("counts her pulls, so her hands can take turns", () => {
    expect(climbed(0.1).pull).toBe(0);
    expect(climbed(0.5).pull).toBe(1);
    expect(climbed(1.4).pull).toBe(3);
  });
});

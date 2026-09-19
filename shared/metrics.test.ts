import { describe, expect, it } from "vitest";
import { changeOf, derivedMetric, metricInput, monthsEnding, towardTarget, valueInput } from "./metrics";

describe("metrics", () => {
  it("count twelve months back from the one a day is in, oldest first", () => {
    const months = monthsEnding("2026-09-18");
    expect(months).toHaveLength(12);
    expect(months[0]).toBe("2025-10");
    expect(months.at(-1)).toBe("2026-09");
    expect(monthsEnding("2026-01-31", 3)).toEqual(["2025-11", "2025-12", "2026-01"]);
  });

  it("say how far a number moved, and whether that is the good way", () => {
    expect(changeOf(120, 100, "up")).toEqual({ delta: 20, percent: 20, good: true });
    expect(changeOf(120, 100, "down")).toMatchObject({ good: false });
    expect(changeOf(5, 0, "up")).toEqual({ delta: 5, percent: null, good: true });
    expect(changeOf(null, 100, "up")).toBeNull();
  });

  it("say how near the target, either way round", () => {
    expect(towardTarget(62, 100, "up")).toBe(0.62);
    expect(towardTarget(50, 25, "down")).toBe(0.5);
    expect(towardTarget(10, null, "up")).toBeNull();
  });

  it("know the derived ones, and check what is typed", () => {
    expect(derivedMetric("cash")).toMatchObject({ flow: false, kind: "money" });
    expect(derivedMetric("made-up")).toBeNull();
    expect(metricInput.safeParse({ name: "" }).success).toBe(false);
    expect(valueInput.safeParse({ onDay: "2026-02-30", value: 3 }).success).toBe(false);
    expect(valueInput.safeParse({ onDay: "2026-09-18", value: Number.NaN }).success).toBe(false);
  });
});

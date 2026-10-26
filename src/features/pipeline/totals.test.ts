import { describe, it, expect } from "vitest";
import type { StageKind } from "@shared/domain";
import { dealTotals, stageWeight } from "./totals";

/**
 * The line above the board: open count, open value, and value weighted by stage.
 */

function column(stageId: string | null, kind: StageKind, total: number, value: number) {
  return { stageId, kind, total, value };
}

describe("stageWeight", () => {
  it("rises along the funnel and stays strictly between nothing and won", () => {
    const weights = [1, 2, 3, 4].map((position) => stageWeight(position, 4));
    expect(weights).toEqual([0.2, 0.4, 0.6, 0.8]);
    for (const weight of weights) {
      expect(weight).toBeGreaterThan(0);
      expect(weight).toBeLessThan(1);
    }
  });

  it("gives a funnel of one stage a half, not the whole", () => {
    expect(stageWeight(1, 1)).toBe(0.5);
  });

  it("holds when there are no open stages at all", () => {
    expect(stageWeight(1, 0)).toBe(0.5);
  });
});

describe("dealTotals", () => {
  it("counts only the open columns, and weights each by its place", () => {
    const totals = dealTotals([
      column("new", "open", 2, 10_000),
      column("met", "open", 1, 20_000),
      column("proposal", "open", 1, 30_000),
      column("won", "won", 5, 500_000),
      column("lost", "lost", 3, 90_000),
    ]);
    expect(totals.count).toBe(4);
    expect(totals.value).toBe(60_000);
    // 10,000 × 1/4 + 20,000 × 2/4 + 30,000 × 3/4
    expect(totals.weighted).toBe(35_000);
  });

  it("reads the funnel's order from the columns, whatever the stages are called", () => {
    const early = dealTotals([column("a", "open", 1, 1_000), column("b", "open", 0, 0)]);
    const late = dealTotals([column("a", "open", 0, 0), column("b", "open", 1, 1_000)]);
    expect(early.weighted).toBeLessThan(late.weighted);
  });

  it("puts Unstaged at the start of the funnel, though it is drawn last", () => {
    const totals = dealTotals([
      column("new", "open", 0, 0),
      column("met", "open", 0, 0),
      column(null, "open", 1, 3_000),
    ]);
    expect(totals.count).toBe(1);
    expect(totals.weighted).toBe(1_000);
  });

  it("rounds to the whole unit", () => {
    const totals = dealTotals([
      column("a", "open", 1, 100),
      column("b", "open", 0, 0),
      column("c", "open", 0, 0),
    ]);
    expect(totals.weighted).toBe(25);
    expect(dealTotals([column("a", "open", 1, 1), column("b", "open", 0, 0)]).weighted).toBe(0);
  });

  it("is all nought with nothing open", () => {
    expect(dealTotals([column("won", "won", 2, 5_000)])).toEqual({ count: 0, value: 0, weighted: 0 });
    expect(dealTotals([])).toEqual({ count: 0, value: 0, weighted: 0 });
  });
});

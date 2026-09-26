import { describe, expect, it } from "vitest";
import { answerSupport, supportAsk } from "./support";

/** The ask, WinRAR's way: a month in, then every three months until answered for good. */
describe("asking for support", () => {
  it("asks nothing the first time, and sets the day a month out", () => {
    expect(supportAsk(null, "2026-09-26")).toEqual({ ask: false, store: "2026-10-26" });
    expect(supportAsk(undefined, "2026-09-26")).toEqual({ ask: false, store: "2026-10-26" });
  });

  it("asks on the day and after it, not before", () => {
    expect(supportAsk("2026-10-26", "2026-10-25")).toEqual({ ask: false, store: null });
    expect(supportAsk("2026-10-26", "2026-10-26")).toEqual({ ask: true, store: null });
    expect(supportAsk("2026-10-26", "2027-01-01")).toEqual({ ask: true, store: null });
  });

  it("asks again three months after Not now", () => {
    expect(answerSupport("later", "2026-10-26")).toBe("2027-01-24");
  });

  it("never asks again once answered for good", () => {
    const stored = answerSupport("never", "2026-10-26");
    expect(supportAsk(stored, "2030-01-01")).toEqual({ ask: false, store: null });
  });

  it("starts again from a month out when what is stored makes no sense", () => {
    expect(supportAsk("soon", "2026-09-26")).toEqual({ ask: false, store: "2026-10-26" });
  });
});

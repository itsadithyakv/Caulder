import { describe, expect, it } from "vitest";
import { asksFor, hasMoreThanParts, splitEntry, tomorrowTasks, withPart } from "./entry";

const TEMPLATE = "## Today\n\n\n## Grateful for\n\n\n## Tomorrow\n\n";

describe("an entry's parts", () => {
  it("reads each part out of the entry", () => {
    const body = "## Today\n\nShipped it.\nCalled two schools.\n\n## Grateful for\n\nAsha\n\n## Tomorrow\n\n- Send the quote\n";
    expect(splitEntry(body)).toEqual({
      today: "Shipped it.\nCalled two schools.",
      grateful: "Asha",
      tomorrow: "- Send the quote",
    });
    expect(splitEntry(TEMPLATE)).toEqual({ today: "", grateful: "", tomorrow: "" });
  });

  it("puts a part back in its place, and leaves the rest as it was", () => {
    const body = "## Today\n\nShipped it.\n\n## Ideas\n\nA referral bonus\n\n## Tomorrow\n\n";
    const next = withPart(body, "tomorrow", "Send the quote");
    expect(next).toBe("## Today\n\nShipped it.\n\n## Ideas\n\nA referral bonus\n\n## Tomorrow\n\nSend the quote\n");
    // A part the entry lacks goes after the parts before it.
    expect(withPart(next, "grateful", "Asha")).toBe(
      "## Today\n\nShipped it.\n\n## Grateful for\n\nAsha\n\n## Ideas\n\nA referral bonus\n\n## Tomorrow\n\nSend the quote\n",
    );
    expect(splitEntry(withPart(TEMPLATE, "today", "A good day."))).toEqual({ today: "A good day.", grateful: "", tomorrow: "" });
  });

  it("reads a day written before parts as its Today, and files it there when a part is written", () => {
    expect(splitEntry("Told Asha the pilot slipped.")).toEqual({ today: "Told Asha the pilot slipped.", grateful: "", tomorrow: "" });
    expect(withPart("Told Asha the pilot slipped.", "tomorrow", "Call her")).toBe(
      "## Today\n\nTold Asha the pilot slipped.\n\n## Tomorrow\n\nCall her\n",
    );
    expect(hasMoreThanParts("Told Asha the pilot slipped.")).toBe(false);
  });

  it("knows when a day holds more than its parts", () => {
    expect(hasMoreThanParts(TEMPLATE)).toBe(false);
    expect(hasMoreThanParts("## Today\n\nx\n\n## Ideas\n\ny")).toBe(true);
    expect(hasMoreThanParts("A line on top\n\n## Today\n\nx")).toBe(true);
  });

  it("does not take a # inside fenced code for a heading", () => {
    const body = "## Today\n\n```\n# not a heading\n```\n\n## Tomorrow\n\nx";
    expect(splitEntry(body).today).toBe("```\n# not a heading\n```");
  });
});

describe("tomorrow, as tasks", () => {
  it("makes each line a task, without its bullet or box, links read as names", () => {
    const text = "- Send the quote\n- [ ] Call [[Rajesh|contact:9a1e2b3c-aaaa-4bbb-8ccc-ddddeeeeffff]]\n\n2. Gym";
    expect(tomorrowTasks(text)).toEqual(["Send the quote", "Call Rajesh", "Gym"]);
    expect(tomorrowTasks("")).toEqual([]);
    expect(tomorrowTasks("a\nb\nc\nd\ne\nf")).toHaveLength(5);
  });
});

describe("what a day asks", () => {
  it("asks the same on the same day, and something for every part", () => {
    expect(asksFor("2026-09-19")).toEqual(asksFor("2026-09-19"));
    const asks = asksFor("2026-09-20");
    expect(asks.today && asks.grateful && asks.tomorrow).toBeTruthy();
    const days = ["2026-09-19", "2026-09-20", "2026-09-21", "2026-09-22", "2026-09-23"];
    expect(new Set(days.map((day) => asksFor(day).grateful)).size).toBeGreaterThan(1);
  });
});

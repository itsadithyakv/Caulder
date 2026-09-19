import { describe, expect, it } from "vitest";
import { dueOfStep, matchesOwner, pageSteps } from "./steps";

describe("steps in a page", () => {
  it("read who, when and the step itself off each - [ ] line, in either order", () => {
    const body = [
      "## Action items",
      "- [ ] Send the proposal to Oakridge @Asha (by 2026-10-02)",
      "- [x] Book the hall (day 3)",
      "- [ ] Chase the invoice (day 5) (by 2026-11-01)",
      "* [ ] @Ravi fix the website",
      "- not a step",
      "- [ ] ",
    ].join("\n");
    expect(pageSteps(body)).toEqual([
      { line: 1, title: "Send the proposal to Oakridge", ticked: false, day: null, by: "2026-10-02", owner: "Asha" },
      { line: 2, title: "Book the hall", ticked: true, day: 3, by: null, owner: null },
      { line: 3, title: "Chase the invoice", ticked: false, day: 5, by: "2026-11-01", owner: null },
      { line: 4, title: "fix the website", ticked: false, day: null, by: null, owner: "Ravi" },
    ]);
  });

  it("leave an email address alone: an @ inside a word is not an owner", () => {
    expect(pageSteps("- [ ] Write to asha@unifloe.in")[0]).toMatchObject({ title: "Write to asha@unifloe.in", owner: null });
  });

  it("fall due on their own day, that many days on, or the fallback - never before today", () => {
    expect(dueOfStep({ day: null, by: "2026-10-02" }, "2026-09-18", "2026-09-18")).toBe("2026-10-02");
    expect(dueOfStep({ day: 3, by: null }, "2026-09-18", "2026-09-18")).toBe("2026-09-21");
    expect(dueOfStep({ day: null, by: null }, "2026-09-10", "2026-09-18", 7)).toBe("2026-09-18");
    expect(dueOfStep({ day: null, by: "2026-01-01" }, "2026-09-18", "2026-09-18")).toBe("2026-09-18");
  });

  it("match an owner by first name or the whole name run together", () => {
    expect(matchesOwner("Asha Rao", "asha")).toBe(true);
    expect(matchesOwner("Asha Rao", "AshaRao")).toBe(true);
    expect(matchesOwner("Asha Rao", "rao")).toBe(false);
  });
});

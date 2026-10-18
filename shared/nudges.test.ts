import { describe, expect, it } from "vitest";
import { nudgeDue, reminderDue, REMIND_ME, sayBrief, sayReminder } from "./nudges";

describe("a reminder asked for in the line", () => {
  it("is heard in the ways people ask", () => {
    for (const line of [
      "remind me in 20 mins to check the oven",
      "don't let me forget to pay rent tomorrow",
      "dont forget mom's birthday on 12th",
      "ping me at 5 to call rajesh",
      "set a reminder for the dentist thursday 10:30",
      "reminder: submit the form friday",
    ]) {
      expect(REMIND_ME.test(line), line).toBe(true);
    }
    expect(REMIND_ME.test("pay rent tomorrow")).toBe(false);
    expect(REMIND_ME.test("i forgot to pay rent")).toBe(false);
  });

  it("goes off at its time, at the start of its day without one, and at once when its day has gone", () => {
    expect(reminderDue({ day: "2026-09-23", time: "14:20" }, "2026-09-23", 14 * 60 + 19, "09:00")).toBe(false);
    expect(reminderDue({ day: "2026-09-23", time: "14:20" }, "2026-09-23", 14 * 60 + 20, "09:00")).toBe(true);
    expect(reminderDue({ day: "2026-09-24", time: null }, "2026-09-24", 8 * 60, "09:00")).toBe(false);
    expect(reminderDue({ day: "2026-09-24", time: null }, "2026-09-24", 9 * 60, "09:00")).toBe(true);
    expect(reminderDue({ day: "2026-09-22", time: "18:00" }, "2026-09-23", 60, "09:00")).toBe(true);
    expect(reminderDue({ day: "2026-09-25", time: null }, "2026-09-23", 23 * 60, "09:00")).toBe(false);
  });

  it("says a late one is late", () => {
    expect(sayReminder({ title: "Check the oven", day: "2026-09-23", time: "14:20" }, "2026-09-23", "Me")).toEqual({ title: "Check the oven", body: "Now · Me" });
    expect(sayReminder({ title: "Pay rent", day: "2026-09-22", time: null }, "2026-09-23", "Me").body).toMatch(/on 2026-09-22/);
  });
});

describe("the daily nudges", () => {
  it("are sent once a day, from their hour, and not so late they stop being useful", () => {
    expect(nudgeDue("09:00", 8 * 60 + 59, null, "2026-09-23")).toBe(false);
    expect(nudgeDue("09:00", 9 * 60, null, "2026-09-23")).toBe(true);
    expect(nudgeDue("09:00", 9 * 60 + 30, "2026-09-23", "2026-09-23")).toBe(false);
    expect(nudgeDue("09:00", 12 * 60, "2026-09-22", "2026-09-23")).toBe(true);
    expect(nudgeDue("09:00", 16 * 60, null, "2026-09-23")).toBe(false);
    expect(nudgeDue(null, 9 * 60, null, "2026-09-23")).toBe(false);
  });

  it("names the must-dos in the brief, and says nothing on a day with nothing", () => {
    expect(sayBrief([], 0)).toBeNull();
    expect(
      sayBrief(
        [
          { title: "Pay rent", must: true },
          { title: "Buy milk", must: false },
          { title: "Submit DBMS", must: true },
          { title: "Call mum", must: false },
        ],
        1,
      ),
    ).toEqual({ title: "Today: 2 must-dos", body: "Pay rent · Submit DBMS, and 2 more, 1 late from before" });
    expect(sayBrief([{ title: "Buy milk", must: false }], 0)).toEqual({ title: "Today: 1 to do", body: "Buy milk" });
    expect(sayBrief([], 3)).toEqual({ title: "3 late", body: "3 late from before" });
  });
});

describe("Monday's brief, with the week's three (part eight, phase 35)", () => {
  it("says the three first, then the day", () => {
    expect(sayBrief([{ title: "Call Priya", must: false }], 0, ["Close Harbour", "Ship the site"])).toEqual({
      title: "Today: 1 to do",
      body: "This week: Close Harbour · Ship the site. Call Priya",
    });
  });

  it("says the three alone on a Monday with nothing due", () => {
    expect(sayBrief([], 0, ["Close Harbour"])).toEqual({ title: "This week", body: "Close Harbour" });
    expect(sayBrief([], 0, [])).toBeNull();
  });
});

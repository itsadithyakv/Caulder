import { beforeEach, describe, expect, it, vi } from "vitest";
import Database from "better-sqlite3";

/**
 * Keeping up with a goal, and your week: check-ins and the line they draw,
 * taking the last one back, marking a goal reached, and a weekday's theme.
 */

vi.mock("./secrets", () => ({
  isSealed: () => false,
  sealSecret: () => {
    throw new Error("No secrets in these tests.");
  },
  openSecret: () => null,
}));

const { migrate } = await import("../db/migrations");
const brain = await import("./brain");
const goals = await import("./goals");
const { createCompany } = await import("../repositories/companies");

// The goal is set on 1 July; 18 September, 11:30 in Kolkata, is "now".
const set = new Date("2026-07-01T06:00:00.000Z");
const now = new Date("2026-09-18T06:00:00.000Z");
const later = (days: number) => new Date(now.getTime() + days * 86_400_000);

let db: Database.Database;
let companyId: string;

beforeEach(() => {
  db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  migrate(db);
  companyId = createCompany(db, { name: "Mine", accent: "blue", timezone: "Asia/Kolkata" }).id;
});

function goal(title: string, fields: Record<string, unknown>, section = "goals", template = "life-goal") {
  const page = brain.newPage(db, companyId, section, template, set);
  return brain.savePage(db, page.id, { title, body: "", fields, baseRevision: page.revision }, set);
}

describe("checking in on a goal", () => {
  it("keeps where it stood, starts the line where the goal began, and moves the page's So far", () => {
    const books = goal("Read 12 books", { target: 12, progress: 2, unit: "books", byOn: "2026-12-31" });
    const first = goals.checkIn(db, books.id, { add: 1, note: "Dune" }, now);
    expect(first).toMatchObject({ progress: 3, startedOn: "2026-07-01", startValue: 2, today: "2026-09-18" });
    expect(first.checkins).toEqual([expect.objectContaining({ day: "2026-09-18", value: 3, note: "Dune" })]);
    const second = goals.checkIn(db, books.id, { setTo: 8 }, later(1));
    expect(second.progress).toBe(8);
    expect(second.pace?.status).toBe("ahead");
    // The page says so too, and the line has a place it will get to.
    expect(brain.getPage(db, books.id).fields["progress"]).toBe(8);
    expect(second.pace?.projectedOn).not.toBeNull();
  });

  it("takes back only the latest, and the goal stands where it was", () => {
    const books = goal("Read 12 books", { target: 12, byOn: "2026-12-31" });
    const one = goals.checkIn(db, books.id, { add: 1 }, now);
    const two = goals.checkIn(db, books.id, { add: 2 }, later(1));
    expect(() => goals.undoCheckIn(db, one.checkins[0]?.id, later(1))).toThrow("Only the latest");
    const back = goals.undoCheckIn(db, two.checkins[1]?.id, later(1));
    expect(back.progress).toBe(1);
    // Taking back the only one leaves no line at all, as before it was checked in.
    const none = goals.undoCheckIn(db, back.checkins[0]?.id, later(1));
    expect(none.checkins).toEqual([]);
    expect(none.progress).toBe(0);
    expect(db.prepare(`SELECT COUNT(*) AS n FROM goal_checkins`).get()).toEqual({ n: 0 });
  });

  it("counts down as well as up, and says when a goal is reached", () => {
    const weight = goal("Get to 72 kg", { target: 72, progress: 80, unit: "kg", byOn: "2026-12-01" });
    const lighter = goals.checkIn(db, weight.id, { setTo: 76 }, now);
    expect(lighter.percent).toBe(50);
    const there = goals.checkIn(db, weight.id, { setTo: 72 }, later(3));
    expect(there.reached).toBe(true);
    const done = goals.setGoalDone(db, weight.id, true, later(3));
    expect(done).toMatchObject({ done: true, reached: false, percent: 100 });
  });

  it("is only for your goals", () => {
    const plan = goal("The plan", {}, "plan", "page");
    expect(() => goals.checkIn(db, plan.id, { add: 1 }, now)).toThrow("not one of your goals");
    expect(() => goals.checkIn(db, goal("x", { target: 3 }).id, {}, now)).toThrow();
  });

  it("lists every goal with its line, open ones first", () => {
    goal("Learn to swim", { done: true });
    goal("Read 12 books", { target: 12, byOn: "2026-12-31" });
    expect(goals.goalDetails(db, companyId, now).map((each) => each.title)).toEqual(["Read 12 books", "Learn to swim"]);
  });
});

describe("your week", () => {
  it("gives a weekday a theme, reads a page's theme by its name now, and takes it off", () => {
    const guitar = goal("Guitar", { hoursWanted: 3 }, "hobbies", "hobby");
    goals.setDayTheme(db, companyId, 2, { label: "Guitar", pageId: guitar.id });
    goals.setDayTheme(db, companyId, 1, { label: "Studies", area: "college" });
    brain.savePage(db, guitar.id, { title: "Guitar practice", body: "", fields: {}, baseRevision: brain.getPage(db, guitar.id).revision }, now);
    expect(goals.dayThemes(db, companyId)).toEqual([
      { weekday: 1, label: "Studies", pageId: null, area: "college" },
      { weekday: 2, label: "Guitar practice", pageId: guitar.id, area: null },
    ]);
    // Another theme on the same day replaces it; null takes it off.
    goals.setDayTheme(db, companyId, 1, { label: "Deep work" });
    expect(goals.setDayTheme(db, companyId, 2, null).map((theme) => theme.label)).toEqual(["Deep work"]);
  });

  it("refuses a day that is not one, and a page from somewhere else", () => {
    expect(() => goals.setDayTheme(db, companyId, 8, { label: "x" })).toThrow("not a day of the week");
    const other = createCompany(db, { name: "Other", accent: "blue", timezone: "UTC" }).id;
    const guitar = goal("Guitar", {}, "hobbies", "hobby");
    expect(() => goals.setDayTheme(db, other, 2, { label: "Guitar", pageId: guitar.id })).toThrow("not in this workspace");
  });
});

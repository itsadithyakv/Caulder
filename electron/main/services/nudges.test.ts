import { beforeEach, describe, expect, it, vi } from "vitest";
import Database from "better-sqlite3";

vi.mock("electron", () => ({ Notification: class {}, nativeTheme: { shouldUseDarkColorsForSystemIntegratedUI: false } }));
vi.mock("../identity", () => ({ markFile: () => "" }));

const { migrate } = await import("../db/migrations");
const { createCompany } = await import("../repositories/companies");
const { quickAdd } = await import("./quickadd");
const { checkNudges, setNudgeSettings } = await import("./nudges");

let db: Database.Database;
let home: string;
const shown: { title: string; body: string; place: string }[] = [];
const show = (note: { title: string; body: string }, place: string) => shown.push({ ...note, place });

/** Asia/Kolkata is UTC+5:30, so 08:30 UTC is 14:00 there. */
const at = (utc: string) => new Date(`2026-09-23T${utc}:00Z`);

beforeEach(() => {
  shown.length = 0;
  db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  migrate(db);
  home = createCompany(db, { name: "Me", accent: "coffee", timezone: "Asia/Kolkata", kind: "personal" }).id;
});

const add = (title: string, day: string, time: string | null, remind: boolean, priority: "must" | null = null) =>
  quickAdd(db, home, { title, day, time, minutes: null, kind: "todo", priority, leadId: null, notes: null, followUp: null, repeat: null, remind });

describe("a reminder asked for in the line", () => {
  // The brief is on unless switched off; these are about reminders alone.
  beforeEach(() => setNudgeSettings(db, { briefAt: null }));

  it("is sent at its time, once, and never before", () => {
    add("Check the oven", "2026-09-23", "14:20", true);
    checkNudges(db, at("08:49"), show); // 14:19 in Kolkata
    expect(shown).toEqual([]);
    checkNudges(db, at("08:50"), show); // 14:20
    expect(shown).toEqual([{ title: "Check the oven", body: "Now · Me", place: "today" }]);
    checkNudges(db, at("08:51"), show);
    expect(shown).toHaveLength(1);
  });

  it("is sent at the start of its day when it had no time, and not at all for a task done first", () => {
    add("Pay rent", "2026-09-23", null, true);
    const { task } = add("Buy milk", "2026-09-23", null, true);
    db.prepare(`UPDATE tasks SET status = 'done' WHERE id = ?`).run(task?.id);
    checkNudges(db, at("03:00"), show); // 08:30: before nine
    expect(shown).toEqual([]);
    checkNudges(db, at("03:30"), show); // 09:00
    expect(shown.map((note) => note.title)).toEqual(["Pay rent"]);
  });

  it("is not made for a line that did not ask", () => {
    add("Pay rent", "2026-09-23", "14:20", false);
    checkNudges(db, at("09:00"), show);
    expect(shown).toEqual([]);
  });
});

describe("the daily nudges", () => {
  it("sends the morning brief at nine with the must-dos first, unless switched off", () => {
    add("Buy milk", "2026-09-23", null, false);
    add("Submit DBMS", "2026-09-23", null, false, "must");
    add("Old thing", "2026-09-20", null, false);
    // Never set is on, at nine: a day's work is said without anybody asking for it (23 October 2026).
    checkNudges(db, at("03:29"), show);
    expect(shown).toEqual([]);
    checkNudges(db, at("03:30"), show);
    expect(shown).toEqual([{ title: "Today: one must-do", body: "Submit DBMS, and 1 more, 1 late from before", place: "today" }]);
  });

  it("says nothing once switched off", () => {
    add("Buy milk", "2026-09-23", null, false);
    setNudgeSettings(db, { briefAt: null });
    checkNudges(db, at("03:30"), show);
    expect(shown).toEqual([]);
  });
});

describe("what renews", () => {
  it("is said with the brief as it comes into view and again on its day, with the account it was bought with", async () => {
    const { newPage, savePage } = await import("./brain");
    const company = createCompany(db, { name: "Unifloe", accent: "blue", timezone: "Asia/Kolkata" }).id;
    const page = newPage(db, company, "tools", "domain", at("03:00"));
    savePage(db, page.id, { title: "unifloe.app", body: "", fields: { cost: 2640, renewsOn: "2026-10-20", account: "me@gmail.com" }, baseRevision: page.revision }, at("03:00"));

    checkNudges(db, at("03:30"), show);
    const said = shown.filter((note) => note.title.startsWith("unifloe.app"));
    expect(said).toHaveLength(1);
    expect(said[0]?.body).toContain("me@gmail.com");
    expect(said[0]?.body).toContain("Unifloe");

    // The next morning it is not said again; on its day, it is.
    shown.length = 0;
    checkNudges(db, new Date("2026-09-24T03:30:00Z"), show);
    expect(shown.filter((note) => note.title.startsWith("unifloe.app"))).toEqual([]);
    shown.length = 0;
    checkNudges(db, new Date("2026-10-20T03:30:00Z"), show);
    expect(shown.filter((note) => note.title.startsWith("unifloe.app"))).toEqual([{ title: "unifloe.app renews today", body: "me@gmail.com · 2,640 · Unifloe", place: "today" }]);
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import Database from "better-sqlite3";

vi.mock("electron", () => ({ Notification: class {}, nativeTheme: { shouldUseDarkColorsForSystemIntegratedUI: false } }));
vi.mock("../identity", () => ({ markFile: () => "" }));

const { migrate } = await import("../db/migrations");
const { createCompany } = await import("../repositories/companies");
const { quickAdd } = await import("./quickadd");
const { checkNudges, setNudgeSettings } = await import("./nudges");
const { ENTRY_TEMPLATE } = await import("@shared/brain");

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
  quickAdd(db, home, { title, day, time, minutes: null, kind: "todo", area: null, priority, leadId: null, notes: null, followUp: null, repeat: null, remind });

describe("a reminder asked for in the line", () => {
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
  it("asks about the journal at its hour on a day with nothing written, once, and never on a day already written", () => {
    setNudgeSettings(db, { journalAt: "21:00", briefAt: null });
    checkNudges(db, at("15:29"), show); // 20:59
    expect(shown).toEqual([]);
    checkNudges(db, at("15:30"), show); // 21:00
    expect(shown).toEqual([expect.objectContaining({ title: "Your journal", place: "journal" })]);
    checkNudges(db, at("15:45"), show);
    expect(shown).toHaveLength(1);

    // The next day, with the entry already written, it says nothing.
    db.prepare(
      `INSERT INTO brain_pages (id, company_id, section, template, title, body, fields, created_at, updated_at)
       VALUES ('e', ?, 'journal', ?, 'Thursday', 'wrote', '{"day":"2026-09-24"}', 'x', 'x')`,
    ).run(home, ENTRY_TEMPLATE);
    checkNudges(db, new Date("2026-09-24T15:31:00Z"), show);
    expect(shown).toHaveLength(1);
  });

  it("sends the morning brief with the must-dos first, and nothing when switched off", () => {
    add("Buy milk", "2026-09-23", null, false);
    add("Submit DBMS", "2026-09-23", null, false, "must");
    add("Old thing", "2026-09-20", null, false);
    checkNudges(db, at("03:30"), show);
    expect(shown).toEqual([]);
    setNudgeSettings(db, { journalAt: null, briefAt: "09:00" });
    checkNudges(db, at("03:30"), show);
    expect(shown).toEqual([{ title: "Today: one must-do", body: "Submit DBMS, and 1 more, 1 late from before", place: "today" }]);
  });
});

describe("a day that comes round", () => {
  it("says a birthday you told it, on the day and the day before, once, whatever the brief says", async () => {
    const { newPage, savePage } = await import("./brain");
    const made = newPage(db, home, "remembered", "page", new Date());
    savePage(db, made.id, { title: "Mummy", body: "- **Birthday: 24 September** · mummy's birthday is 24 sep _(2026-01-02)_\n", fields: {}, secrets: {}, baseRevision: made.revision }, new Date());
    checkNudges(db, at("03:29"), show); // 08:59 in Kolkata, before nine
    expect(shown).toEqual([]);
    checkNudges(db, at("03:30"), show); // 09:00
    expect(shown).toEqual([{ title: "Mummy's birthday is tomorrow", body: "From what you told Caulder to remember.", place: "today" }]);
    checkNudges(db, at("05:00"), show);
    expect(shown).toHaveLength(1);
  });
});

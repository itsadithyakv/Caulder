import { beforeEach, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { migrate } from "../db/migrations";
import { createCompany } from "../repositories/companies";
import { createLead } from "../repositories/leads";
import { listBlocks } from "../repositories/blocks";
import { addHabit, archiveHabit, listHabits, removeHabit, tickHabit } from "./habits";
import { journalToday, jot, logTime } from "./life";
import { newPage, savePage } from "./brain";
import { quickAdd } from "./quickadd";
import { leadInput } from "@shared/domain";
import { shiftDay } from "@shared/dates";

/**
 * Today's everyday things (PLAN.md, part four): habits and their streaks, a
 * line into the journal, time given to a hobby, and a task for a contact the
 * line named.
 */

// Friday 18 September 2026, 11:30 in Kolkata.
const now = new Date("2026-09-18T06:00:00.000Z");
const today = "2026-09-18";
const at = (day: string) => new Date(`${day}T06:00:00.000Z`);

let db: Database.Database;
let companyId: string;

beforeEach(() => {
  db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  migrate(db);
  companyId = createCompany(db, { name: "Unifloe", accent: "blue", timezone: "Asia/Kolkata" }).id;
});

describe("habits", () => {
  it("counts a streak over the habit's own days, and today not ticked yet does not break it", () => {
    const made = addHabit(db, companyId, { name: "Gym", area: "health", weekdays: [1, 3, 5] }, at("2026-08-31"));
    const id = made.habits[0]?.id ?? "";
    // Mon 7, Wed 9, Fri 11, Mon 14, Wed 16 - and a Tuesday nobody asked for does not count.
    for (const day of ["2026-09-07", "2026-09-09", "2026-09-11", "2026-09-14", "2026-09-16"]) tickHabit(db, id, day, true, at(day));
    const before = listHabits(db, companyId, now).habits[0];
    expect(before).toMatchObject({ name: "Gym", dueToday: true, doneToday: false, streak: 5 });

    const after = tickHabit(db, id, today, true, now).habits[0];
    expect(after).toMatchObject({ doneToday: true, streak: 6, best: 6 });
    // The first week: Mon 31 Aug and Wed 2 Sep missed, so the best run began on the 7th.
    expect(after?.rate).toBe(Math.round((6 / 9) * 100));
    // Twelve weeks of seven, Monday first; a Tuesday is not one of its days.
    expect(after?.weeks).toHaveLength(12);
    expect(after?.weeks[11]?.[1]).toBeNull();
    expect(after?.weeks[11]?.[4]).toBe(true);

    // A miss breaks it.
    const later = listHabits(db, companyId, at("2026-09-23")).habits[0];
    expect(later?.streak).toBe(0);
    expect(later?.best).toBe(6);
  });

  it("ticks today or the week before, never a day to come, and takes a tick back", () => {
    const id = addHabit(db, companyId, { name: "Read 20 pages" }, now).habits[0]?.id ?? "";
    expect(() => tickHabit(db, id, shiftDay(today, 1), true, now)).toThrow("still to come");
    expect(() => tickHabit(db, id, shiftDay(today, -8), true, now)).toThrow("last week");
    tickHabit(db, id, null, true, now);
    tickHabit(db, id, null, true, now);
    expect(listHabits(db, companyId, now).habits[0]?.doneToday).toBe(true);
    expect(tickHabit(db, id, today, false, now).habits[0]?.doneToday).toBe(false);
  });

  it("keeps an archived habit out of Today, and its ticks until it is deleted", () => {
    const id = addHabit(db, companyId, { name: "No phone after ten" }, now).habits[0]?.id ?? "";
    tickHabit(db, id, today, true, now);
    archiveHabit(db, id, true, now);
    expect(listHabits(db, companyId, now).habits).toHaveLength(0);
    expect(listHabits(db, companyId, now, true).habits[0]).toMatchObject({ archived: true, doneToday: true });
    removeHabit(db, id, now);
    expect(db.prepare(`SELECT COUNT(*) AS n FROM habit_checks`).get()).toEqual({ n: 0 });
  });

  it("refuses a habit with no name or no days", () => {
    expect(() => addHabit(db, companyId, { name: " " }, now)).toThrow("Say what the habit is");
    expect(() => addHabit(db, companyId, { name: "Gym", weekdays: [] }, now)).toThrow("at least one day");
  });
});

describe("Today's line", () => {
  it("puts a line into today's entry under Today, making the entry when there is none", () => {
    expect(journalToday(db, companyId, now).entry).toBeNull();
    jot(db, companyId, "Shipped the pricing page.", now);
    const entry = jot(db, companyId, "Called two schools.", now);
    expect(entry.body.startsWith("## Today\n\nShipped the pricing page.\n\nCalled two schools.")).toBe(true);
    expect(entry.body).toContain("## Grateful for");
    expect(journalToday(db, companyId, now).entry?.excerpt).toContain("Shipped the pricing page.");
  });

  it("keeps time given to a hobby as a block that ended now", () => {
    const hobby = newPage(db, companyId, "hobbies", "hobby", now);
    savePage(db, hobby.id, { title: "Guitar", body: "", fields: {}, baseRevision: hobby.revision }, now);
    logTime(db, hobby.id, 40, now);
    const block = listBlocks(db, companyId, today)[0];
    expect(block).toMatchObject({ title: "Guitar", startsAt: "10:50", minutes: 40, kind: "personal", pageId: hobby.id });
    expect(() => logTime(db, hobby.id, 2, now)).toThrow("Between five minutes");
  });

  it("makes a task for the contact a line named, and only one of this company's", () => {
    const lead = createLead(db, companyId, leadInput.parse({ name: "Oakridge School" }));
    const made = quickAdd(db, companyId, { title: "Call Oakridge", day: "2026-09-19", kind: "call", leadId: lead.id });
    expect(made.task).toMatchObject({ leadId: lead.id, leadName: "Oakridge School" });
    const other = createCompany(db, { name: "Other", accent: "blue", timezone: "Asia/Kolkata" });
    const theirs = createLead(db, other.id, leadInput.parse({ name: "Elsewhere" }));
    expect(() => quickAdd(db, companyId, { title: "Call them", day: "2026-09-19", leadId: theirs.id })).toThrow("not in this company");
  });
});

import { describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { migrate } from "../db/migrations";
import { createCompany, listStages } from "../repositories/companies";
import { createTask } from "../repositories/tasks";
import { createBlock, deleteBlock, moveBlock } from "../repositories/blocks";
import { createNote, listNotes } from "../repositories/notes";
import { buildDay, buildWeek } from "./day";
import { taskInput } from "@shared/domain";
import { today as todayIn } from "@shared/dates";
import type { Db } from "../db/connection";

/**
 * The personal side, against a real database.
 *
 * The layout arithmetic is checked by hand in shared/day.test.ts. What is
 * worth a database here is the other half: that a workspace kind survives being
 * written down, that a personal workspace does not quietly acquire a funnel,
 * and that a focus session cannot end up being two.
 */

const NOW = new Date("2026-09-07T06:00:00Z");
const TZ = "Asia/Kolkata";
const TODAY = todayIn(TZ, NOW);

let db: Db;
let companyId: string;

beforeEach(() => {
  db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  migrate(db);
  companyId = createCompany(db, {
    name: "Mine",
    accent: "blue",
    timezone: TZ,
    kind: "personal",
  }).id;
});

describe("what kind of workspace this is", () => {
  it("remembers it, which the old mode never did", () => {
    const solo = createCompany(db, { name: "Unifloe", accent: "teal", timezone: TZ });
    expect(solo.kind).toBe("solo");

    const mine = db.prepare(`SELECT kind FROM companies WHERE id = ?`).get(companyId) as {
      kind: string;
    };
    expect(mine.kind).toBe("personal");
  });

  it("gives a personal workspace no funnel at all", () => {
    // Not a tidy-up. There is no board to show stages on, and seeding seven
    // nobody can reach would leave the schema technically right and the app
    // carrying a funnel that means nothing.
    expect(listStages(db, companyId)).toHaveLength(0);
  });

  it("still seeds one for a solo workspace", () => {
    const solo = createCompany(db, { name: "Unifloe", accent: "teal", timezone: TZ });
    expect(listStages(db, solo.id).length).toBeGreaterThan(0);
  });

  it("defaults rows written before the column existed to solo", () => {
    // The backfill in migration 9. A workspace that predates the idea of
    // kinds has always been an outreach one.
    db.prepare(`UPDATE companies SET kind = '' WHERE id = ?`).run(companyId);
    const row = db.prepare(`SELECT * FROM companies WHERE id = ?`).get(companyId);
    expect(row).toBeTruthy();
  });
});

describe("a day", () => {
  it("is empty before anything is put in it", () => {
    const plan = buildDay(db, companyId, TODAY, NOW);
    expect(plan.blocks).toHaveLength(0);
    expect(plan.planned).toBe(0);
  });

  it("adds up what has been planned", () => {
    createBlock(db, companyId, { day: TODAY, startsAt: "09:00", minutes: 90, title: "Write" });
    createBlock(db, companyId, { day: TODAY, startsAt: "14:00", minutes: 60, title: "Calls" });

    const plan = buildDay(db, companyId, TODAY, NOW);
    expect(plan.planned).toBe(150);
    expect(plan.blocks).toHaveLength(2);
  });

  it("counts a day already past as entirely spent, and one ahead as not started", () => {
    // The two answers are opposite and neither is guessable from the blocks
    // alone, which is why the cursor is the service's decision to make.
    createBlock(db, companyId, {
      day: "2026-09-01",
      startsAt: "09:00",
      minutes: 60,
      title: "Gone",
    });
    createBlock(db, companyId, {
      day: "2026-12-01",
      startsAt: "09:00",
      minutes: 60,
      title: "Ahead",
    });

    expect(buildDay(db, companyId, "2026-09-01", NOW).elapsed).toBe(60);
    expect(buildDay(db, companyId, "2026-12-01", NOW).elapsed).toBe(0);
  });

  it("keeps the hour when the task it was set aside for is deleted", () => {
    // SET NULL rather than a cascade. Losing the task should not silently
    // empty an afternoon you had already committed to it.
    const task = createTask(
      db,
      companyId,
      taskInput.parse({ title: "Call the principal", dueOn: TODAY }),
    );
    const block = createBlock(db, companyId, {
      day: TODAY,
      startsAt: "10:00",
      minutes: 60,
      title: "That call",
      taskId: task.id,
    });

    expect(buildDay(db, companyId, TODAY, NOW).blocks[0]?.taskTitle).toBe(
      "Call the principal",
    );

    db.prepare(`DELETE FROM tasks WHERE id = ?`).run(task.id);

    const after = buildDay(db, companyId, TODAY, NOW).blocks;
    expect(after).toHaveLength(1);
    expect(after[0]?.id).toBe(block.id);
    expect(after[0]?.taskId).toBeNull();
  });

  it("moves a block to another day and it leaves this one", () => {
    const block = createBlock(db, companyId, {
      day: TODAY,
      startsAt: "09:00",
      minutes: 60,
      title: "Write",
    });

    moveBlock(db, block.id, { day: "2026-09-08", startsAt: "11:00", minutes: 30 });

    expect(buildDay(db, companyId, TODAY, NOW).blocks).toHaveLength(0);
    const moved = buildDay(db, companyId, "2026-09-08", NOW).blocks;
    expect(moved[0]?.startsAt).toBe("11:00");
    expect(moved[0]?.minutes).toBe(30);
  });

  it("shows the notes caught on that day, and only those", () => {
    createNote(db, companyId, "Ring the printer", TODAY);
    createNote(db, companyId, "Old thought", "2026-09-01");

    const plan = buildDay(db, companyId, TODAY, NOW);
    expect(plan.notes).toHaveLength(1);
    expect(plan.notes[0]?.body).toBe("Ring the printer");
  });

  it("stops holding a block once it is deleted", () => {
    const block = createBlock(db, companyId, {
      day: TODAY,
      startsAt: "09:00",
      minutes: 60,
      title: "Write",
    });
    deleteBlock(db, block.id);
    expect(buildDay(db, companyId, TODAY, NOW).blocks).toHaveLength(0);
  });
});

describe("notes", () => {
  it("finds one by what is in it, and escapes the wildcards", () => {
    createNote(db, companyId, "Discount is 50% for the first term", TODAY);
    createNote(db, companyId, "Ring the printer", TODAY);

    expect(listNotes(db, companyId, "printer")).toHaveLength(1);
    // Without ESCAPE, "50%" matches everything - the same trap the leads
    // search already has a rule about.
    expect(listNotes(db, companyId, "50%")).toHaveLength(1);
  });

  it("puts pinned ones first however old they are", () => {
    const old = createNote(db, companyId, "Older", "2026-09-01");
    createNote(db, companyId, "Newer", TODAY);
    db.prepare(`UPDATE notes SET is_pinned = 1 WHERE id = ?`).run(old.id);

    expect(listNotes(db, companyId)[0]?.body).toBe("Older");
  });
});

describe("the week a day falls in", () => {
  function put(day: string, startsAt: string, title: string) {
    createBlock(db, companyId, {
      day,
      startsAt,
      minutes: 60,
      title,
      kind: "class",
      notes: null,
      taskId: null,
      priority: null,
      remindMinutes: null,
      repeat: null,
    });
  }

  it("starts on Monday whichever day is asked for", () => {
    // 2026-09-07 is a Monday, 2026-09-13 the Sunday that closes the same week.
    expect(buildWeek(db, companyId, "2026-09-09").from).toBe("2026-09-07");
    expect(buildWeek(db, companyId, "2026-09-13").from).toBe("2026-09-07");
    expect(buildWeek(db, companyId, "2026-09-07").from).toBe("2026-09-07");
  });

  it("is always seven days, empty ones included", () => {
    put("2026-09-09", "09:00", "Databases");
    const week = buildWeek(db, companyId, "2026-09-09");

    expect(week.days).toHaveLength(7);
    expect(week.days.map((entry) => entry.blocks.length)).toEqual([0, 0, 1, 0, 0, 0, 0]);
  });

  it("does not reach into the week either side of it", () => {
    put("2026-09-06", "09:00", "The Sunday before");
    put("2026-09-14", "09:00", "The Monday after");
    put("2026-09-07", "09:00", "This Monday");

    const week = buildWeek(db, companyId, "2026-09-09");
    expect(week.days.flatMap((entry) => entry.blocks).map((block) => block.title)).toEqual([
      "This Monday",
    ]);
  });

  it("lays out overlaps within a day and never across the week", () => {
    // The mistake worth a test: nine o'clock on Tuesday and nine o'clock on
    // Wednesday are not competing for anything, and laying the week out as one
    // list would halve the width of both.
    put("2026-09-08", "09:00", "Tuesday nine");
    put("2026-09-09", "09:00", "Wednesday nine");
    put("2026-09-09", "09:30", "Wednesday half past");

    const week = buildWeek(db, companyId, "2026-09-09");
    const tuesday = week.days.find((entry) => entry.day === "2026-09-08");
    const wednesday = week.days.find((entry) => entry.day === "2026-09-09");

    expect(tuesday?.blocks.map((block) => block.columns)).toEqual([1]);
    expect(wednesday?.blocks.map((block) => block.columns)).toEqual([2, 2]);
  });

  it("totals each day, so a heavy one shows in the heading", () => {
    put("2026-09-09", "09:00", "One");
    put("2026-09-09", "11:00", "Two");

    const week = buildWeek(db, companyId, "2026-09-09");
    expect(week.days.find((entry) => entry.day === "2026-09-09")?.planned).toBe(120);
    expect(week.days.find((entry) => entry.day === "2026-09-08")?.planned).toBe(0);
  });
});

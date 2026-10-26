import { beforeEach, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { migrate } from "../db/migrations";
import { createCompany } from "./companies";
import { completeTask, createTask, findTask, reopenTask, updateTask } from "./tasks";
import { createBlock } from "./blocks";
import { blockInput, taskInput } from "@shared/domain";

/**
 * What a task keeps, read back out of a real database.
 *
 * Written because of a field that was accepted and thrown away: `priority`
 * sat in the input schema from migration 12 onward and neither the insert nor
 * the update ever wrote it, so every task anybody marked as having to happen
 * came back as though nobody had said. The type system could not catch it -
 * the input had the field and the row simply did not ask for it.
 */

let db: Database.Database;
let companyId: string;

beforeEach(() => {
  db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  migrate(db);
  companyId = createCompany(db, { name: "Mine", accent: "coffee", timezone: "Asia/Kolkata", kind: "personal" }).id;
});

const input = (over: Record<string, unknown>) =>
  taskInput.parse({ title: "Hand in the form", dueOn: "2026-09-10", ...over });

describe("priority", () => {
  it("is kept when a task is made", () => {
    const made = createTask(db, companyId, input({ priority: "must" }));
    expect(findTask(db, made.id)?.priority).toBe("must");
  });

  it("is kept when a task is edited, and can be taken back off", () => {
    const made = createTask(db, companyId, input({ priority: "spare" }));
    updateTask(db, made.id, input({ priority: "must" }));
    expect(findTask(db, made.id)?.priority).toBe("must");

    updateTask(db, made.id, input({ priority: null }));
    expect(findTask(db, made.id)?.priority).toBeNull();
  });

  it("is null rather than a guess when nobody set one", () => {
    expect(createTask(db, companyId, input({})).priority).toBeNull();
  });
});

describe("a task that comes back (part twelve, phase 47)", () => {
  const open = () =>
    (db.prepare(`SELECT id, due_on, repeats FROM tasks WHERE status = 'open' ORDER BY due_on`).all() as { id: string; due_on: string; repeats: string | null }[]);

  it("makes the next one when it is ticked off, a month on, and only one", () => {
    const rent = createTask(db, companyId, input({ title: "Pay rent", dueOn: "2026-10-01", repeats: "monthly" }));
    expect(findTask(db, rent.id)?.repeats).toBe("monthly");
    completeTask(db, rent.id);
    expect(open()).toEqual([expect.objectContaining({ due_on: "2026-11-01", repeats: "monthly" })]);

    // Ticked, put back and ticked again: still one November rent.
    reopenTask(db, rent.id);
    completeTask(db, rent.id);
    expect(open().filter((each) => each.due_on === "2026-11-01")).toHaveLength(1);
  });

  it("keeps the hour it had on the Calendar", () => {
    const sync = createTask(db, companyId, input({ title: "Team sync", dueOn: "2026-10-14", repeats: "fortnightly" }));
    createBlock(db, companyId, blockInput.parse({ day: "2026-10-14", startsAt: "10:00", minutes: 30, title: "Team sync", taskId: sync.id }));
    completeTask(db, sync.id);
    const [next] = open();
    expect(next?.due_on).toBe("2026-10-28");
    expect(db.prepare(`SELECT day, starts_at, minutes FROM blocks WHERE task_id = ?`).get(next?.id)).toEqual({ day: "2026-10-28", starts_at: "10:00", minutes: 30 });
  });

  it("is not stopped by a form that does not show the repeat, and can be stopped by one that does", () => {
    const made = createTask(db, companyId, input({ title: "GST return", dueOn: "2026-10-20", repeats: "monthly" }));
    updateTask(db, made.id, input({ title: "GST return (Oct)", dueOn: "2026-10-20" }));
    expect(findTask(db, made.id)?.repeats).toBe("monthly");
    updateTask(db, made.id, input({ title: "GST return (Oct)", dueOn: "2026-10-20", repeats: null }));
    expect(findTask(db, made.id)?.repeats).toBeNull();
  });

  it("does nothing more for a task that does not repeat", () => {
    const once = createTask(db, companyId, input({ title: "Hand in the form" }));
    completeTask(db, once.id);
    expect(open()).toEqual([]);
  });
});

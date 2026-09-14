import { beforeEach, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { migrate } from "../db/migrations";
import { createCompany } from "./companies";
import { createTask, findTask, updateTask } from "./tasks";
import { taskInput } from "@shared/domain";

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

describe("area", () => {
  it("is kept alongside it", () => {
    const made = createTask(db, companyId, input({ area: "college", priority: "must" }));
    const read = findTask(db, made.id);
    expect(read?.area).toBe("college");
    expect(read?.priority).toBe("must");
  });
});

import { beforeEach, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { migrate } from "../db/migrations";
import { createCompany } from "../repositories/companies";
import { quickAdd } from "./quickadd";

/**
 * One line, one or two rows, and never half of them.
 */

let db: Database.Database;
let companyId: string;

beforeEach(() => {
  db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  migrate(db);
  companyId = createCompany(db, {
    name: "Mine",
    accent: "coffee",
    timezone: "Asia/Kolkata",
    kind: "personal",
  }).id;
});

const count = (table: string) =>
  (db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n;

describe("a task with a time", () => {
  it("sets an hour aside for it, linked to the task", () => {
    const { task, blocked } = quickAdd(db, companyId, {
      title: "Datascience Assignment",
      day: "2026-09-10",
      time: "16:00",
      area: "college",
    });

    expect(blocked).toBe(true);
    const block = db.prepare(`SELECT * FROM blocks WHERE task_id = ?`).get(task?.id) as {
      starts_at: string;
      minutes: number;
      kind: string;
      title: string;
    };
    expect(block).toMatchObject({
      starts_at: "16:00",
      minutes: 60,
      kind: "study",
      title: "Datascience Assignment",
    });
  });

  it("uses the length it was given", () => {
    const { task } = quickAdd(db, companyId, {
      title: "Gym",
      day: "2026-09-11",
      time: "06:00",
      minutes: 45,
      area: "health",
    });
    const block = db.prepare(`SELECT minutes FROM blocks WHERE task_id = ?`).get(task?.id) as {
      minutes: number;
    };
    expect(block.minutes).toBe(45);
  });

  it("makes neither if the hour cannot be made", () => {
    // The half of the request nobody asked for: due today with the four
    // o'clock quietly missing. Forced here with a trigger, which is the only
    // way to make an insert fail on a schema that otherwise accepts it.
    db.exec(`CREATE TRIGGER refuse BEFORE INSERT ON blocks BEGIN SELECT RAISE(ABORT, 'refused'); END;`);

    expect(() =>
      quickAdd(db, companyId, { title: "Datascience", day: "2026-09-10", time: "16:00" }),
    ).toThrow(/refused/);
    expect(count("tasks")).toBe(0);
  });
});

describe("a task with no time", () => {
  it("is just a task", () => {
    const { task, blocked } = quickAdd(db, companyId, {
      title: "Pay the phone bill",
      day: "2026-09-11",
      area: "personal",
      priority: "must",
    });
    expect(blocked).toBe(false);
    expect(task).toMatchObject({ dueOn: "2026-09-11", area: "personal", priority: "must" });
    expect(count("blocks")).toBe(0);
  });
});

describe("a repeat", () => {
  it("makes the run of blocks and no task", () => {
    // Friday 11 September to Thursday 8 October, Mon/Wed/Fri: four weeks, so
    // exactly twelve.
    const result = quickAdd(db, companyId, {
      title: "Gym",
      day: "2026-09-11",
      time: "06:00",
      minutes: 45,
      area: "health",
      repeat: { weekdays: [1, 3, 5], until: "2026-10-08" },
    });

    expect(result).toMatchObject({ task: null, blocked: true, repeats: 12 });
    expect(count("tasks")).toBe(0);
    expect(count("block_series")).toBe(1);
    const days = (
      db.prepare(`SELECT day, starts_at, minutes, task_id FROM blocks ORDER BY day`).all() as {
        day: string;
        starts_at: string;
        minutes: number;
        task_id: string | null;
      }[]
    );
    expect(days).toHaveLength(12);
    expect(days[0]).toMatchObject({ day: "2026-09-11", starts_at: "06:00", minutes: 45, task_id: null });
    expect(days.at(-1)?.day).toBe("2026-10-07");
  });

  it("refuses a repeat with no time, even from a window that should have asked", () => {
    expect(() =>
      quickAdd(db, companyId, {
        title: "Gym",
        day: "2026-09-11",
        repeat: { weekdays: [1], until: "2026-10-08" },
      }),
    ).toThrow(/needs a time/);
    expect(count("blocks")).toBe(0);
  });
});

describe("what it refuses", () => {
  it("refuses a task with no title, even from a window that should have asked", () => {
    expect(() => quickAdd(db, companyId, { title: "  ", day: "2026-09-10" })).toThrow();
    expect(count("tasks")).toBe(0);
  });
});

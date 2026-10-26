import { beforeEach, describe, expect, it, vi } from "vitest";
import Database from "better-sqlite3";

vi.mock("electron", () => ({ Notification: class {}, nativeTheme: { shouldUseDarkColorsForSystemIntegratedUI: false }, net: {}, safeStorage: {} }));
vi.mock("../identity", () => ({ markFile: () => "" }));

const { migrate } = await import("../db/migrations");
const { createCompany, homeCompanyId } = await import("../repositories/companies");
const { seedDemo } = await import("./demo");
const { ensureHome } = await import("./yourhome");

/**
 * The calendar's own workspace: made once there is a real company, never
 * chosen, and holding the terms a timetable hangs on.
 */

const NOW = new Date("2026-09-25T06:00:00Z");
let db: Database.Database;

beforeEach(() => {
  db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  migrate(db);
});

const company = (name: string) => createCompany(db, { name, accent: "blue", timezone: "Asia/Kolkata" }).id;

describe("the calendar's own workspace", () => {
  it("is made once, like the company it was made beside, and takes the terms with it", () => {
    const first = company("Unifloe");
    db.prepare(`INSERT INTO terms (id, company_id, name, from_day, until_day, created_at) VALUES ('t', ?, 'Semester 5', '2026-08-01', '2026-12-01', ?)`).run(first, NOW.toISOString());

    const made = ensureHome(db);
    expect(made.home).not.toBeNull();
    expect(made.moved).toBe(1);
    const home = db.prepare(`SELECT kind, timezone FROM companies WHERE id = ?`).get(made.home) as { kind: string; timezone: string };
    expect(home).toEqual({ kind: "personal", timezone: "Asia/Kolkata" });
    expect((db.prepare(`SELECT company_id FROM terms WHERE id = 't'`).get() as { company_id: string }).company_id).toBe(made.home);
    expect(homeCompanyId(db)).toBe(made.home);

    // And never twice.
    expect(ensureHome(db)).toEqual({ home: made.home, moved: 0 });
    expect((db.prepare(`SELECT COUNT(*) AS n FROM companies WHERE kind = 'personal'`).get() as { n: number }).n).toBe(1);
  });

  it("leaves the company's own pages, contacts and tasks where they are", () => {
    const first = company("Unifloe");
    db.prepare(
      `INSERT INTO brain_pages (id, company_id, section, template, title, body, fields, revision, created_at, updated_at)
       VALUES ('p', ?, 'plan', 'page', 'Pricing', 'x', '{}', 1, 'x', 'x')`,
    ).run(first);
    ensureHome(db);
    expect((db.prepare(`SELECT company_id FROM brain_pages WHERE id = 'p'`).get() as { company_id: string }).company_id).toBe(first);
  });

  it("waits while there is only the sample company", () => {
    const sample = company("Sample company");
    seedDemo(db, sample, NOW);
    expect(ensureHome(db)).toEqual({ home: null, moved: 0 });
    expect((db.prepare(`SELECT COUNT(*) AS n FROM companies WHERE kind = 'personal'`).get() as { n: number }).n).toBe(0);
  });
});

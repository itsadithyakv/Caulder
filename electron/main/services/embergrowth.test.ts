import { beforeEach, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { migrate } from "../db/migrations";
import { createCompany } from "../repositories/companies";
import { addHabit, tickHabit } from "./habits";
import { emberStats } from "./embergrowth";
import { learnedBy, warmthBand } from "@shared/growth";

/**
 * Ember's stats, read from a real database: that ticking a habit feeds her,
 * that unticking it takes the marshmallow back, and that a habit kept in a
 * second workspace counts - she is yours, like your level.
 */

// Friday 18 September 2026, 11:30 in Kolkata.
const now = new Date("2026-09-18T06:00:00.000Z");
const at = (day: string) => new Date(`${day}T06:00:00.000Z`);

let db: Database.Database;
let companyId: string;

beforeEach(() => {
  db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  migrate(db);
  companyId = createCompany(db, { name: "Unifloe", accent: "blue", timezone: "Asia/Kolkata" }).id;
});

function habit(name: string, company = companyId): string {
  return addHabit(db, company, { name, area: "health", weekdays: [1, 2, 3, 4, 5, 6, 7] }, at("2026-09-01")).habits.find((one) => one.name === name)?.id ?? "";
}

describe("Ember's stats", () => {
  it("starts at level one, knowing only her first few things, warm and hungry for a habit", () => {
    const stats = emberStats(db, companyId, now);
    expect(stats).toMatchObject({ level: 1, best: 0, streak: 0, habits: 0, keptToday: 0 });
    expect(warmthBand(stats.warmth)).toBe("warm");
    expect(learnedBy(stats).size).toBe(6);
  });

  it("is fed by every habit ticked today, and a tick taken back takes the marshmallow with it", () => {
    const run = habit("Run");
    const read = habit("Read");
    const before = emberStats(db, companyId, now).warmth;
    tickHabit(db, run, "2026-09-18", true, now);
    tickHabit(db, read, "2026-09-18", true, now);
    const fed = emberStats(db, companyId, now);
    expect(fed.keptToday).toBe(2);
    expect(fed.warmth).toBeGreaterThan(before);
    tickHabit(db, read, "2026-09-18", false, now);
    expect(emberStats(db, companyId, now).warmth).toBeLessThan(fed.warmth);
  });

  it("counts a run of days, and earns the first streak costume at three", () => {
    const run = habit("Run");
    for (const day of ["2026-09-16", "2026-09-17", "2026-09-18"]) tickHabit(db, run, day, true, at(day));
    const stats = emberStats(db, companyId, now);
    expect(stats.best).toBe(3);
    expect(stats.streak).toBe(3);
    expect(learnedBy(stats).has("costume:brucelee")).toBe(true);
  });

  it("counts a habit kept in another workspace: she is yours, not a company's", () => {
    const other = createCompany(db, { name: "Me", accent: "blue", timezone: "Asia/Kolkata", kind: "personal" }).id;
    const stretch = habit("Stretch", other);
    tickHabit(db, stretch, "2026-09-18", true, now);
    expect(emberStats(db, companyId, now).keptToday).toBe(1);
  });
});

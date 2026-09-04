import { beforeEach, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { migrate } from "../db/migrations";
import { createCompany } from "../repositories/companies";
import { listLeads, listActivities } from "../repositories/leads";
import { buildToday } from "./today";
import { buildBoard } from "./pipeline";
import { undoImport } from "./import";
import { findDemoBatch, seedDemo } from "./demo";
import type { Company } from "@shared/domain";

/**
 * The sample data.
 *
 * What matters is not that rows exist but that every screen has something
 * worth looking at, because that is the entire reason for seeding it. So the
 * assertions are about Today having something late, the board having a shape,
 * and the whole thing coming out again cleanly.
 */

const NOW = new Date("2026-09-04T06:00:00Z");

let db: Database.Database;
let company: Company;

beforeEach(() => {
  db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  migrate(db);
  company = createCompany(db, { name: "Unifloe", accent: "blue", timezone: "Asia/Kolkata" });
});

describe("what the sample puts on the screen", () => {
  it("gives Today something overdue and something due", () => {
    seedDemo(db, company.id, NOW);
    const day = buildToday(db, company.id, NOW);

    // An empty Today teaches nothing about what the app is for.
    expect(day.overdue.length).toBeGreaterThan(0);
    expect(day.dueToday.length).toBeGreaterThan(0);
  });

  it("gives Today a lead that has gone quiet", () => {
    seedDemo(db, company.id, NOW);
    const day = buildToday(db, company.id, NOW);

    // The section a spreadsheet cannot produce, so the sample has to show it.
    expect(day.cold.length).toBeGreaterThan(0);
  });

  it("spreads the leads across the funnel rather than piling them in one column", () => {
    seedDemo(db, company.id, NOW);
    const board = buildBoard(db, company.id);
    const occupied = board.columns.filter((column) => column.total > 0);

    expect(occupied.length).toBeGreaterThan(2);
  });

  it("leaves a timeline that reads like a lead somebody has worked", () => {
    seedDemo(db, company.id, NOW);
    const lead = listLeads(db, { companyId: company.id }).find((l) =>
      l.name.startsWith("Oakridge"),
    );
    if (!lead) throw new Error("expected the sample");

    const kinds = listActivities(db, lead.id).map((entry) => entry.kind);
    expect(kinds).toContain("created");
    expect(kinds).toContain("call");
  });

  it("dates everything from now, so the sample never looks stale", () => {
    const later = new Date("2027-03-01T06:00:00Z");
    seedDemo(db, company.id, later);

    const day = buildToday(db, company.id, later);
    expect(day.overdue.length).toBeGreaterThan(0);
    expect(day.dueToday.length).toBeGreaterThan(0);
  });
});

describe("taking it out again", () => {
  it("comes out through the undo that already exists", () => {
    const batch = seedDemo(db, company.id, NOW);
    expect(findDemoBatch(db, company.id)).toBe(batch);

    undoImport(db, batch);

    expect(listLeads(db, { companyId: company.id })).toEqual([]);
    expect(findDemoBatch(db, company.id)).toBeNull();
  });

  it("takes the tasks and the timelines with it", () => {
    const batch = seedDemo(db, company.id, NOW);
    undoImport(db, batch);

    const day = buildToday(db, company.id, NOW);
    expect(day.overdue).toEqual([]);
    expect(day.dueToday).toEqual([]);
    expect(day.cold).toEqual([]);

    const orphans = db.prepare(`SELECT COUNT(*) AS n FROM activities`).get() as { n: number };
    expect(orphans.n).toBe(0);
  });

  it("reports no sample when none was seeded", () => {
    expect(findDemoBatch(db, company.id)).toBeNull();
  });
});

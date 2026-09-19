import { beforeEach, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import { migrate } from "../db/migrations";
import { createCompany } from "../repositories/companies";
import { createLead, findLead } from "../repositories/leads";
import { completeTask, createTask } from "../repositories/tasks";
import { createBlock, setOutcome } from "../repositories/blocks";
import { addHabit, tickHabit } from "./habits";
import { journalEntry } from "./life";
import { newPage, savePage } from "./brain";
import { addTile, editTile, listTiles, moveTile, removeTile } from "./vision";
import { happeningsOf, progress } from "./progress";
import { leadInput, taskInput } from "@shared/domain";

/**
 * Your life in check (PLAN.md, part four, phase 17): the vision board kept in
 * the database, and a level worked out from what the tables say happened.
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

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);
const picture = (over: Record<string, unknown> = {}) => ({ bytes: PNG, type: "image/png", width: 800, height: 600, ...over });

function goal(title: string, fields: Record<string, unknown> = {}, on = now) {
  const page = newPage(db, companyId, "goals", "life-goal", on);
  return savePage(db, page.id, { title, body: "", fields, baseRevision: page.revision }, on);
}

describe("the vision board", () => {
  it("keeps words and pictures in the order they were put, the picture ready to show", () => {
    addTile(db, companyId, { words: "Graduate with honours" }, null, now);
    const board = addTile(db, companyId, { words: "Kyoto, in spring", area: "personal" }, picture(), now);
    expect(board.map((tile) => tile.words)).toEqual(["Graduate with honours", "Kyoto, in spring"]);
    expect(board[1]).toMatchObject({ area: "personal", width: 800, height: 600, goal: null });
    expect(board[1]?.picture).toMatch(/^data:image\/png;base64,iVBORw0KGgo/);
    expect(board[0]?.picture).toBeNull();
  });

  it("checks a picture by its bytes, and refuses one that was not made smaller", () => {
    expect(() => addTile(db, companyId, {}, picture({ bytes: new TextEncoder().encode("<svg onload=alert(1)>") }), now)).toThrow(
      "not a picture Caulder can keep",
    );
    // The bytes are a PNG whatever the window says.
    expect(() => addTile(db, companyId, {}, picture({ type: "image/jpeg" }), now)).toThrow("not a picture");
    expect(() => addTile(db, companyId, {}, picture({ width: 4000 }), now)).toThrow("made smaller first");
    expect(() => addTile(db, companyId, {}, picture({ bytes: new Uint8Array(1_600_000).fill(0x89) }), now)).toThrow("too large");
    expect(() => addTile(db, companyId, { words: "   " }, null, now)).toThrow("a picture or some words");
    expect(listTiles(db, companyId)).toEqual([]);
  });

  it("ties a tile to one of your goals, and keeps the tile when the goal goes", () => {
    const tenK = goal("Run a 10k", { area: "health" });
    const board = addTile(db, companyId, { words: "Finish line", goalId: tenK.id }, null, now);
    expect(board[0]?.goal).toEqual({ id: tenK.id, title: "Run a 10k" });

    const idea = newPage(db, companyId, "ideas", "idea", now);
    expect(() => editTile(db, board[0]?.id ?? "", { words: "Finish line", goalId: idea.id }, now)).toThrow("not one of yours");

    db.prepare(`DELETE FROM brain_pages WHERE id = ?`).run(tenK.id);
    expect(listTiles(db, companyId)[0]).toMatchObject({ words: "Finish line", goal: null });
  });

  it("moves a tile to a place, the rest closing up, and takes one away", () => {
    for (const words of ["One", "Two", "Three", "Four"]) addTile(db, companyId, { words }, null, now);
    const [one, , three] = listTiles(db, companyId);
    expect(moveTile(db, three?.id ?? "", 0).map((tile) => tile.words)).toEqual(["Three", "One", "Two", "Four"]);
    expect(moveTile(db, one?.id ?? "", 99).map((tile) => tile.words)).toEqual(["Three", "Two", "Four", "One"]);
    expect(removeTile(db, three?.id ?? "").map((tile) => tile.words)).toEqual(["Two", "Four", "One"]);
  });

  it("will not empty a tile of words by editing", () => {
    const [tile] = addTile(db, companyId, { words: "Keep going" }, null, now);
    expect(() => editTile(db, tile?.id ?? "", { words: "" }, now)).toThrow("needs its words");
  });
});

describe("your level", () => {
  it("is worked out from what the tables say happened, each on its day and in its area", () => {
    const lead = createLead(db, companyId, leadInput.parse({ name: "Oakridge School" }));

    // A task done for a contact is the company's.
    const task = createTask(db, companyId, taskInput.parse({ title: "Send the proposal", dueOn: "2026-09-17", leadId: lead.id }));
    completeTask(db, task.id);
    db.prepare(`UPDATE tasks SET completed_at = '2026-09-17T09:00:00.000Z' WHERE id = ?`).run(task.id);

    // Kept time: a study block counts; a skipped one, a break, and one still to come today do not.
    createBlock(db, companyId, { day: "2026-09-17", startsAt: "09:00", minutes: 120, title: "Revision", kind: "study" });
    const skipped = createBlock(db, companyId, { day: "2026-09-17", startsAt: "14:00", minutes: 60, title: "Gym", kind: "gym" });
    setOutcome(db, skipped.id, "skipped");
    createBlock(db, companyId, { day: "2026-09-17", startsAt: "16:00", minutes: 30, title: "Tea", kind: "break" });
    createBlock(db, companyId, { day: today, startsAt: "15:00", minutes: 60, title: "Later", kind: "focus" });

    db.prepare(`INSERT INTO calls (id, company_id, lead_id, outcome, created_at) VALUES (?, ?, ?, 'spoke', '2026-09-16T05:00:00.000Z')`).run(
      randomUUID(),
      companyId,
      lead.id,
    );
    const won = db.prepare(`SELECT id FROM pipeline_stages WHERE company_id = ? AND kind = 'won'`).get(companyId) as { id: string };
    db.prepare(
      `INSERT INTO deals (id, company_id, lead_id, title, stage_id, closed_at, created_at, updated_at)
       VALUES (?, ?, ?, 'Oakridge', ?, '2026-09-15T08:00:00.000Z', '2026-09-01T00:00:00.000Z', '2026-09-15T08:00:00.000Z')`,
    ).run(randomUUID(), companyId, findLead(db, lead.id)?.id, won.id);
    db.prepare(
      `INSERT INTO invoices (id, company_id, lead_id, number, status, issued_on, due_on, paid_on, created_at, updated_at)
       VALUES (?, ?, ?, 1, 'paid', '2026-09-01', '2026-09-10', '2026-09-14', '2026-09-01T00:00:00.000Z', '2026-09-14T00:00:00.000Z')`,
    ).run(randomUUID(), companyId, lead.id);

    journalEntry(db, companyId, "2026-09-16", at("2026-09-16"));
    const gym = addHabit(db, companyId, { name: "Gym", area: "health" }, at("2026-09-10")).habits[0]?.id ?? "";
    tickHabit(db, gym, "2026-09-17", true, at("2026-09-17"));

    // Reached on the day it was marked done, not the day it was written.
    const tenK = goal("Run a 10k", { area: "health", done: false }, at("2026-09-01"));
    savePage(db, tenK.id, { title: "Run a 10k", body: "", fields: { area: "health", done: true }, baseRevision: tenK.revision }, at("2026-09-12"));

    const { happenings } = happeningsOf(db, companyId, now);
    expect(happenings.map((each) => `${each.kind}:${each.day}:${each.area}${each.minutes ? `:${each.minutes}` : ""}`).sort()).toEqual([
      "call:2026-09-16:company",
      "deal:2026-09-15:company",
      "entry:2026-09-16:personal",
      "goal:2026-09-12:health",
      "habit:2026-09-17:health",
      "paid:2026-09-14:company",
      "task:2026-09-17:company",
      "time:2026-09-17:college:120",
    ]);

    // 10 + 10 + 100 + 50 + 10 + 5 + 150 + 30 = 365: level 3, 65 of the way to 600.
    const mine = progress(db, companyId, now);
    expect(mine.level).toEqual({ level: 3, xp: 365, from: 300, to: 600 });
    expect(mine.week.quiet).toEqual([]);
    expect(mine.achievements.find((each) => each.id === "balanced")?.earnedOn).toBe("2026-09-17");
    expect(mine.achievements.find((each) => each.id === "first-deal")?.earnedOn).toBe("2026-09-15");
  });

  it("takes back what is taken back: an unticked habit is five points gone", () => {
    const gym = addHabit(db, companyId, { name: "Gym", area: "health" }, at("2026-09-10")).habits[0]?.id ?? "";
    tickHabit(db, gym, "2026-09-17", true, at("2026-09-17"));
    expect(progress(db, companyId, now).level.xp).toBe(5);
    tickHabit(db, gym, "2026-09-17", false, at("2026-09-17"));
    expect(progress(db, companyId, now).level.xp).toBe(0);
  });
});

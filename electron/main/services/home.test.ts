import { beforeEach, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { migrate } from "../db/migrations";
import { createCompany, homeCompanyId, withHome } from "../repositories/companies";
import { createTask } from "../repositories/tasks";
import { createBlock } from "../repositories/blocks";
import { addHabit, tickHabit } from "./habits";
import { buildToday } from "./today";
import { buildDay } from "./day";
import { progress } from "./progress";
import { newPage, savePage, search } from "./brain";
import { taskInput } from "@shared/domain";

/**
 * You and the company chosen: your own things live in one home, whichever
 * company is chosen in the sidebar, and your day is the two together.
 */

// Friday 18 September 2026, 11:30 in Kolkata.
const now = new Date("2026-09-18T06:00:00.000Z");
const today = "2026-09-18";

let db: Database.Database;

beforeEach(() => {
  db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  migrate(db);
});

const made = (name: string, kind: "solo" | "personal" = "solo") =>
  createCompany(db, { name, accent: "blue", timezone: "Asia/Kolkata", kind }).id;

describe("home", () => {
  it("is the one company for someone with one", () => {
    const only = made("Unifloe");
    expect(homeCompanyId(db)).toBe(only);
    expect(withHome(db, only)).toEqual([only]);
  });

  it("is a workspace of your own when there is one, whichever company came first", () => {
    const company = made("Unifloe");
    const mine = made("Mine", "personal");
    expect(homeCompanyId(db)).toBe(mine);
    expect(withHome(db, company)).toEqual([mine, company]);
  });

  it("is the first company made, when there is none of your own", () => {
    const first = made("Unifloe");
    const second = made("Side project");
    expect(homeCompanyId(db)).toBe(first);
    expect(withHome(db, second)).toEqual([first, second]);
  });
});

describe("your day", () => {
  it("is your own tasks and blocks and the chosen company's, in one order", () => {
    const mine = made("Mine", "personal");
    const company = made("Unifloe");
    createTask(db, mine, taskInput.parse({ title: "Revise for the exam", dueOn: "2026-09-16", area: "college" }));
    createTask(db, company, taskInput.parse({ title: "Send the proposal", dueOn: "2026-09-15", area: "company" }));
    createBlock(db, mine, { day: today, startsAt: "09:00", minutes: 60, title: "Lecture", kind: "class" });
    createBlock(db, company, { day: today, startsAt: "14:00", minutes: 60, title: "Client call", kind: "meeting" });

    const day = buildToday(db, withHome(db, company), now);
    expect(day.overdue.map((task) => task.title)).toEqual(["Send the proposal", "Revise for the exam"]);
    expect(day.blocks.map((block) => block.title)).toEqual(["Lecture", "Client call"]);
    // The chosen company alone is still just itself.
    expect(buildToday(db, company, now).overdue.map((task) => task.title)).toEqual(["Send the proposal"]);

    expect(buildDay(db, withHome(db, company), today, now).blocks.map((block) => block.title)).toEqual(["Lecture", "Client call"]);
  });
});

describe("your level", () => {
  it("counts what you did in every workspace", () => {
    const mine = made("Mine", "personal");
    const company = made("Unifloe");
    const gym = addHabit(db, mine, { name: "Gym", area: "health" }, now).habits[0]?.id ?? "";
    tickHabit(db, gym, today, true, now);
    const task = createTask(db, company, taskInput.parse({ title: "Send the proposal", dueOn: today, area: "company" }));
    db.prepare(`UPDATE tasks SET status = 'done', completed_at = ? WHERE id = ?`).run(now.toISOString(), task.id);

    expect(progress(db, mine, now).level.xp).toBe(15);
  });
});

describe("search", () => {
  it("finds your own pages whichever company is chosen", () => {
    const mine = made("Mine", "personal");
    const company = made("Unifloe");
    const page = newPage(db, mine, "hobbies", "hobby", now);
    savePage(db, page.id, { title: "Guitar", body: "Scales, then the song.", fields: {}, baseRevision: page.revision }, now);
    expect(search(db, company, "guitar").map((hit) => hit.title)).toEqual(["Guitar"]);
  });
});

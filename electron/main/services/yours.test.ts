import { afterEach, beforeEach, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import { migrate } from "../db/migrations";
import { createCompany } from "../repositories/companies";
import { newPage, savePage } from "./brain";
import { journalEntry } from "./life";
import { resetForTests, setPasscode } from "./journal-lock";
import { addHabit, tickHabit } from "./habits";
import { buildYours } from "./yours";

/**
 * Your own side, as it goes to an AI you have allowed to read it.
 *
 * Most of this is about what is NOT in it. A locked day and a private line
 * are the two things somebody would mind most, and the second is the one a
 * careless guard misses: until a passcode exists, a private line is plain
 * text in a table of its own, so "skip what is sealed" would hand it over.
 */

// Saturday 19 September 2026, 11:30 in Kolkata.
const now = new Date("2026-09-19T06:00:00.000Z");
const at = (day: string) => new Date(`${day}T06:00:00.000Z`);

let db: Database.Database;
let companyId: string;

beforeEach(() => {
  db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  migrate(db);
  companyId = createCompany(db, { name: "Mine", accent: "coffee", timezone: "Asia/Kolkata" }).id;
});

afterEach(() => resetForTests());

function page(section: string, template: string, title: string, body: string, fields: Record<string, unknown> = {}) {
  const blank = newPage(db, companyId, section, template, now);
  return savePage(db, blank.id, { title, body, fields, baseRevision: blank.revision }, now);
}

/** A day written in, the way the journal writes one. */
function wrote(day: string, words: string) {
  const entry = journalEntry(db, companyId, day, at(day));
  return savePage(db, entry.id, { title: entry.title, body: words, fields: entry.fields, baseRevision: entry.revision }, at(day));
}

const text = () => buildYours(db, companyId, now)?.text ?? "";

describe("what goes", () => {
  it("is nothing at all until something of yours is written down", () => {
    expect(buildYours(db, companyId, now)).toBeNull();
  });

  it("carries your goals, hobbies, habits and courses", () => {
    page("goals", "life-goal", "Read 12 books", "", { target: 12, progress: 5, unit: "books", byOn: "2026-12-31" });
    page("hobbies", "hobby", "Guitar", "", { hoursWanted: 3, status: "doing-it" });
    page("studies", "course", "Data Structures", "", { code: "CS201", status: "taking" });
    const habit = addHabit(db, companyId, { name: "Gym", weekdays: [1, 2, 3, 4, 5, 6, 7] }, now).habits[0];
    tickHabit(db, habit!.id, "2026-09-19", true, now);

    const said = text();
    expect(said).toContain("Read 12 books");
    expect(said).toContain("5 of 12 books");
    expect(said).toContain("Guitar");
    expect(said).toContain("Data Structures");
    expect(said).toContain("Gym");
  });

  it("carries the lines you asked to be remembered, with what they are about", () => {
    page("hobbies", "hobby", "Gym", "- **PR: 45 kg x 3** · hit a pr on the bench _(2026-09-18)_\n", {});
    const said = text();
    expect(said).toContain("PR: 45 kg x 3");
    expect(said).toContain("hit a pr on the bench");
  });

  it("carries what you told it about yourself, the people you know and where things are", () => {
    page("remembered", "page", "About me", "- **Blood group: O+** · said _(2026-09-18)_\n", {});
    page("remembered", "page", "Where things are", "- **Passport** · in the blue folder _(2026-09-17)_\n", {});
    const said = text();
    expect(said).toContain("Blood group: O+");
    expect(said).toContain("in the blue folder");
  });

  it("carries a journal day that is open, and says whose side of the app this is", () => {
    wrote("2026-09-19", "Wrote the pitch. Felt good about it.");
    const said = text();
    expect(said).toContain("Wrote the pitch");
    expect(said).toContain("Journal days that are locked");
  });

  it("leaves out a journal day older than the season it reads", () => {
    wrote("2026-01-05", "A long time ago.");
    expect(text()).not.toContain("A long time ago");
  });
});

describe("what never goes", () => {
  it("leaves out a journal day that is locked", () => {
    wrote("2026-09-17", "The thing I would not want read.");
    // A passcode seals every day that is already over.
    setPasscode(db, companyId, "tiger lily at dawn", now);

    const said = text();
    expect(said).not.toContain("The thing I would not want read");
    // And the day it is still open on is untouched by that.
    wrote("2026-09-19", "Today is still mine to write in.");
    expect(text()).toContain("Today is still mine to write in");
  });

  it("leaves out a private line even before there is a passcode to seal it with", () => {
    // What the line files as private lands here, in plain text, until a
    // passcode exists. This is the row a guard written as "skip what is
    // sealed" would hand straight to an AI.
    db.prepare(
      `INSERT INTO journal_private (id, company_id, day, box, body, created_at) VALUES (?, ?, ?, NULL, ?, ?)`,
    ).run(randomUUID(), companyId, "2026-09-19", "I have a crush on Julia.", now.toISOString());
    wrote("2026-09-19", "Ordinary day.");

    const said = text();
    expect(said).toContain("Ordinary day");
    expect(said).not.toContain("crush");
    expect(said).not.toContain("Julia");
  });

  it("leaves out the company's own pages: that is the dossier's job", () => {
    page("customers", "persona", "Schools in Mysuru", "They buy in April.", {});
    expect(text()).not.toContain("Schools in Mysuru");
  });
});

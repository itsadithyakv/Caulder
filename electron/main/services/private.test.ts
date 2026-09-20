import { beforeEach, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { migrate } from "../db/migrations";
import { createCompany } from "../repositories/companies";
import { forgetPasscode, lockNow, removePasscode, resetForTests, setPasscode, unlock } from "./journal-lock";
import { jotPrivate, privateDay, removePrivate } from "./private";

/**
 * Private lines: written without a passcode, read only with one.
 */

let db: Database.Database;
let companyId: string;

const NOW = new Date("2026-09-10T05:00:00Z");
const DAY = "2026-09-10";
const JULIA = { text: "I spoke to julia today about this, really liked it", feeling: "joy" as const, people: ["Julia"] };

const stored = () => db.prepare(`SELECT box, body FROM journal_private`).all() as { box: string | null; body: string | null }[];

beforeEach(() => {
  resetForTests();
  db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  migrate(db);
  companyId = createCompany(db, { name: "Mine", accent: "coffee", timezone: "Asia/Kolkata", kind: "personal" }).id;
});

describe("with a passcode", () => {
  beforeEach(() => {
    setPasscode(db, companyId, "open sesame", NOW);
  });

  it("seals a line the moment it is written, and the words are nowhere in the row", () => {
    lockNow(db);
    // Locked, and it still writes: sealing takes the public half of the key, which needs nothing.
    expect(jotPrivate(db, companyId, JULIA, NOW)).toEqual({ sealed: true });

    const [row] = stored();
    expect(row?.body).toBeNull();
    expect(row?.box).not.toContain("julia");
    expect(row?.box).not.toContain("Julia");
    expect(row?.box).not.toContain("joy");
  });

  it("says only how many while the journal is locked", () => {
    jotPrivate(db, companyId, JULIA, NOW);
    lockNow(db);
    expect(privateDay(db, companyId, DAY)).toEqual({ day: DAY, count: 1, locked: true, passcode: true, lines: [] });
  });

  it("reads it back whole with the passcode: the words, who, and what it was", () => {
    jotPrivate(db, companyId, JULIA, NOW);
    lockNow(db);
    unlock(db, "open sesame");
    const day = privateDay(db, companyId, DAY);
    expect(day.locked).toBe(false);
    expect(day.lines).toMatchObject([{ text: JULIA.text, feeling: "joy", people: ["Julia"] }]);
  });

  it("does not open for the wrong passcode", () => {
    jotPrivate(db, companyId, JULIA, NOW);
    lockNow(db);
    expect(() => unlock(db, "open says me")).toThrow();
    expect(privateDay(db, companyId, DAY).lines).toEqual([]);
  });

  it("opens them again when the passcode is taken off, and loses them when it is forgotten", () => {
    jotPrivate(db, companyId, JULIA, NOW);
    removePasscode(db, "open sesame");
    expect(privateDay(db, companyId, DAY)).toMatchObject({ locked: false, passcode: false, lines: [{ text: JULIA.text }] });

    setPasscode(db, companyId, "open sesame", NOW);
    forgetPasscode(db);
    expect(privateDay(db, companyId, DAY).count).toBe(0);
  });
});

describe("without one", () => {
  it("keeps the line apart and says it could not be locked", () => {
    expect(jotPrivate(db, companyId, JULIA, NOW)).toEqual({ sealed: false });
    expect(privateDay(db, companyId, DAY)).toMatchObject({ locked: false, passcode: false, lines: [{ text: JULIA.text }] });
  });

  it("seals what was written before, the moment a passcode is set", () => {
    jotPrivate(db, companyId, JULIA, NOW);
    setPasscode(db, companyId, "open sesame", NOW);
    expect(stored()).toMatchObject([{ body: null }]);
    lockNow(db);
    expect(privateDay(db, companyId, DAY)).toMatchObject({ count: 1, locked: true, lines: [] });
  });
});

describe("kept apart", () => {
  it("is in no page, no search, and on nobody's history", () => {
    jotPrivate(db, companyId, JULIA, NOW);
    const count = (sql: string) => (db.prepare(sql).get() as { n: number }).n;
    expect(count(`SELECT COUNT(*) AS n FROM brain_pages WHERE body LIKE '%julia%'`)).toBe(0);
    expect(count(`SELECT COUNT(*) AS n FROM brain_search WHERE brain_search MATCH 'julia'`)).toBe(0);
    expect(count(`SELECT COUNT(*) AS n FROM activities`)).toBe(0);
  });

  it("refuses an empty line, and deletes one for good", () => {
    expect(() => jotPrivate(db, companyId, { text: "  " }, NOW)).toThrow(/Write something/);
    jotPrivate(db, companyId, JULIA, NOW);
    const [line] = privateDay(db, companyId, DAY).lines;
    removePrivate(db, line?.id ?? "");
    expect(privateDay(db, companyId, DAY).count).toBe(0);
  });
});

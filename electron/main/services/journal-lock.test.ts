import { afterEach, beforeEach, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { migrate } from "../db/migrations";
import { createCompany } from "../repositories/companies";
import { savePage, search } from "./brain";
import { findEntry, journalEntry, journalMonth, setMood } from "./life";
import {
  changePasscode,
  forgetPasscode,
  lockNow,
  lockState,
  removePasscode,
  resealIfPast,
  resetForTests,
  setPasscode,
  unlock,
} from "./journal-lock";

/**
 * The journal's passcode: a day that is over is sealed without asking, and
 * reading it back needs the passcode. Sealed means the words are nowhere but
 * the box - not the page, not its history, not search.
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

function write(day: string, body: string) {
  const entry = journalEntry(db, companyId, day, at(day));
  return savePage(db, entry.id, { title: entry.title, body, fields: entry.fields, baseRevision: entry.revision }, at(day));
}

const stored = (id: string) => (db.prepare(`SELECT body FROM brain_pages WHERE id = ?`).get(id) as { body: string }).body;
const history = (id: string) =>
  (db.prepare(`SELECT body FROM brain_revisions WHERE page_id = ?`).all(id) as { body: string }[]).map((row) => row.body);

describe("the journal's passcode", () => {
  it("seals the days that are over, and leaves today open to write in", () => {
    const yesterday = write("2026-09-18", "Told Asha the pilot slipped. Felt awful about it.");
    const today = write("2026-09-19", "Better today.");

    setPasscode(db, companyId, "tiger lily", now);
    expect(stored(yesterday.id)).toBe("");
    expect(history(yesterday.id).every((body) => body === "")).toBe(true);
    expect(search(db, companyId, "pilot")).toEqual([]);
    expect(stored(today.id)).toBe("Better today.");

    // Just set, so it is open for now.
    expect(findEntry(db, companyId, "2026-09-18", now)?.body).toContain("pilot slipped");
    lockNow(db);
    const locked = findEntry(db, companyId, "2026-09-18", now);
    expect(locked).toMatchObject({ body: "", locked: true });
    expect(journalMonth(db, companyId, "2026-09", now).entries.find((entry) => entry.day === "2026-09-18")).toMatchObject({
      excerpt: "",
      locked: true,
    });
    // Today needs nothing.
    expect(findEntry(db, companyId, "2026-09-19", now)?.body).toBe("Better today.");
  });

  it("refuses a wrong passcode and opens with the right one", () => {
    write("2026-09-18", "Quiet day.");
    setPasscode(db, companyId, "tiger lily", now);
    lockNow(db);
    expect(() => unlock(db, "tiger lilly")).toThrow("not the passcode");
    expect(lockState(db)).toEqual({ set: true, open: false });
    unlock(db, "tiger lily");
    expect(findEntry(db, companyId, "2026-09-18", now)?.body).toBe("Quiet day.");
  });

  it("seals yesterday by the first look today, without being asked", () => {
    setPasscode(db, companyId, "tiger lily", at("2026-09-18"));
    const entry = write("2026-09-18", "Written the evening it happened.");
    expect(stored(entry.id)).toBe("Written the evening it happened.");
    journalMonth(db, companyId, "2026-09", now);
    expect(stored(entry.id)).toBe("");
  });

  it("takes an entry written into again while open straight back under the seal", () => {
    write("2026-09-18", "First go.");
    setPasscode(db, companyId, "tiger lily", now);
    const open = findEntry(db, companyId, "2026-09-18", now);
    if (!open) throw new Error("no entry");
    savePage(db, open.id, { title: open.title, body: "First go. And a second thought.", fields: open.fields, baseRevision: open.revision }, now);
    resealIfPast(db, open.id, now);
    expect(stored(open.id)).toBe("");
    expect(findEntry(db, companyId, "2026-09-18", now)?.body).toBe("First go. And a second thought.");
  });

  it("keeps a sealed day's mood and links when the mood changes", () => {
    const entry = write("2026-09-18", "Rough.");
    setPasscode(db, companyId, "tiger lily", now);
    lockNow(db);
    expect(setMood(db, entry.id, "rough", now)).toMatchObject({ fields: { mood: "rough" }, locked: true });
    unlock(db, "tiger lily");
    expect(findEntry(db, companyId, "2026-09-18", now)?.body).toBe("Rough.");
  });

  it("changes the passcode without sealing anything again", () => {
    write("2026-09-18", "Kept.");
    setPasscode(db, companyId, "tiger lily", now);
    changePasscode(db, "tiger lily", "north star");
    lockNow(db);
    expect(() => unlock(db, "tiger lily")).toThrow("not the passcode");
    unlock(db, "north star");
    expect(findEntry(db, companyId, "2026-09-18", now)?.body).toBe("Kept.");
  });

  it("puts every day back when the passcode is taken off", () => {
    const entry = write("2026-09-18", "Back where it was.");
    setPasscode(db, companyId, "tiger lily", now);
    lockNow(db);
    removePasscode(db, "tiger lily");
    expect(lockState(db)).toEqual({ set: false, open: false });
    expect(stored(entry.id)).toBe("Back where it was.");
    expect(search(db, companyId, "where").map((hit) => hit.id)).toEqual([entry.id]);
  });

  it("loses what it sealed when the passcode is forgotten, and keeps the days", () => {
    const entry = write("2026-09-18", "Gone for good.");
    setPasscode(db, companyId, "tiger lily", now);
    lockNow(db);
    forgetPasscode(db);
    expect(lockState(db)).toEqual({ set: false, open: false });
    expect(findEntry(db, companyId, "2026-09-18", now)).toMatchObject({ id: entry.id, body: "" });
  });

  it("asks for a passcode long enough to mean something", () => {
    expect(() => setPasscode(db, companyId, "abc", now)).toThrow("at least 4");
  });
});

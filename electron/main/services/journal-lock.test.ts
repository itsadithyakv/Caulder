import { afterEach, beforeEach, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { migrate } from "../db/migrations";
import { createCompany } from "../repositories/companies";
import { savePage, search } from "./brain";
import { appendToEntry, findEntry, jot, journalEntry, journalMonth, setMood } from "./life";
import { jotPrivate } from "./private";
import { journalDays, searchJournal } from "./journalread";
import {
  changePasscode,
  checkPasscode,
  forgetPasscode,
  lockNow,
  lockState,
  makeRecoveryKey,
  recoverWith,
  recoveryOf,
  removePasscode,
  resealIfPast,
  resetForTests,
  setLockToday,
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
    expect(lockState(db)).toMatchObject({ set: true, open: false });
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
    expect(lockState(db)).toMatchObject({ set: false, open: false });
    expect(stored(entry.id)).toBe("Back where it was.");
    expect(search(db, companyId, "where").map((hit) => hit.id)).toEqual([entry.id]);
  });

  it("loses what it sealed when the passcode is forgotten, and keeps the days", () => {
    const entry = write("2026-09-18", "Gone for good.");
    setPasscode(db, companyId, "tiger lily", now);
    lockNow(db);
    forgetPasscode(db);
    expect(lockState(db)).toMatchObject({ set: false, open: false });
    expect(findEntry(db, companyId, "2026-09-18", now)).toMatchObject({ id: entry.id, body: "" });
  });

  it("asks for a passcode long enough to mean something", () => {
    expect(() => setPasscode(db, companyId, "abc", now)).toThrow("At least 8");
    expect(() => setPasscode(db, companyId, "12345678", now)).toThrow("first anybody would try");
  });
});

describe("locking today as it is written", () => {
  it("seals today at once, and opens it only with the journal open", () => {
    const today = write("2026-09-19", "Something I have told nobody.");
    setPasscode(db, companyId, "tiger lily", now);
    expect(stored(today.id)).toBe("Something I have told nobody.");
    setLockToday(db, companyId, true, now);
    expect(lockState(db)).toMatchObject({ set: true, lockToday: true });
    expect(stored(today.id)).toBe("");
    expect(history(today.id).every((body) => body === "")).toBe(true);
    expect(search(db, companyId, "nobody")).toEqual([]);
    expect(findEntry(db, companyId, "2026-09-19", now)?.body).toBe("Something I have told nobody.");
    lockNow(db);
    expect(findEntry(db, companyId, "2026-09-19", now)).toMatchObject({ body: "", locked: true });
  });

  it("takes a line added while locked without the passcode, and reads the parts together", () => {
    write("2026-09-19", "Morning: nervous about the call.");
    setPasscode(db, companyId, "tiger lily", now);
    setLockToday(db, companyId, true, now);
    lockNow(db);
    const page = jot(db, companyId, "Evening: it went fine.", now);
    expect(page).toMatchObject({ body: "", locked: true });
    expect(stored(page.id)).toBe("");
    unlock(db, "tiger lily");
    const body = findEntry(db, companyId, "2026-09-19", now)?.body ?? "";
    expect(body).toContain("Morning: nervous about the call.");
    expect(body).toContain("Evening: it went fine.");
  });

  it("seals a line added to an open today straight away", () => {
    setPasscode(db, companyId, "tiger lily", now);
    setLockToday(db, companyId, true, now);
    const page = jot(db, companyId, "A line from the quick bar.", now);
    expect(stored(page.id)).toBe("");
    expect(page.body).toContain("A line from the quick bar.");
  });

  it("leaves today open again only with the journal open", () => {
    const today = write("2026-09-19", "Open again.");
    setPasscode(db, companyId, "tiger lily", now);
    setLockToday(db, companyId, true, now);
    lockNow(db);
    expect(() => setLockToday(db, companyId, false, now)).toThrow("Unlock the journal");
    unlock(db, "tiger lily");
    setLockToday(db, companyId, false, now);
    expect(stored(today.id)).toBe("Open again.");
    expect(lockState(db)).toMatchObject({ lockToday: false });
  });

  it("keeps a sealed day's words when a note is moved into it", () => {
    write("2026-09-18", "What was already there.");
    setPasscode(db, companyId, "tiger lily", now);
    lockNow(db);
    const page = appendToEntry(db, companyId, "2026-09-18", "A note caught that day.", now);
    resealIfPast(db, page.id, now);
    unlock(db, "tiger lily");
    const body = findEntry(db, companyId, "2026-09-18", now)?.body ?? "";
    expect(body).toContain("What was already there.");
    expect(body).toContain("A note caught that day.");
  });
});

describe("the recovery key", () => {
  it("is made with the passcode, and opens the journal with a new passcode", () => {
    write("2026-09-18", "Still here after forgetting.");
    const { recoveryKey, state } = setPasscode(db, companyId, "tiger lily", now);
    expect(state).toMatchObject({ set: true, recovery: true });
    expect(recoveryKey).toMatch(/^[0-9A-HJKMNP-TV-Z]{5}(-[0-9A-HJKMNP-TV-Z]{5}){4}$/);
    lockNow(db);
    expect(() => recoverWith(db, "00000-00000-00000-00000-00000", "a whole new one")).toThrow("not the recovery key");
    // Typed from paper: any case, any spacing.
    recoverWith(db, ` ${recoveryKey.toLowerCase().replace(/-/g, " ")} `, "a whole new one");
    expect(findEntry(db, companyId, "2026-09-18", now)?.body).toBe("Still here after forgetting.");
    lockNow(db);
    expect(() => unlock(db, "tiger lily")).toThrow("not the passcode");
    unlock(db, "a whole new one");
    // The same key still works after a change of passcode.
    changePasscode(db, "a whole new one", "north star rising");
    lockNow(db);
    recoverWith(db, recoveryKey, "and another one");
    expect(lockState(db).open).toBe(true);
  });

  it("reads the letters people misread as the digits they look like", () => {
    expect(recoveryOf("ol1i0-ABCDE-FGHJK-MNPQR-STVWX")).toBe("01110-ABCDE-FGHJK-MNPQR-STVWX");
    expect(() => recoveryOf("ABCDE")).toThrow("25 letters");
  });

  it("can be made again only with the journal open, and the old one stops working", () => {
    const first = setPasscode(db, companyId, "tiger lily", now).recoveryKey;
    lockNow(db);
    expect(() => makeRecoveryKey(db)).toThrow("Unlock the journal first");
    unlock(db, "tiger lily");
    const second = makeRecoveryKey(db).recoveryKey;
    expect(second).not.toBe(first);
    lockNow(db);
    expect(() => recoverWith(db, first, "a whole new one")).toThrow("not the recovery key");
    recoverWith(db, second, "a whole new one");
  });
});

describe("asking for the passcode again", () => {
  it("checks it without changing whether the journal is open", () => {
    setPasscode(db, companyId, "tiger lily", now);
    lockNow(db);
    expect(() => checkPasscode(db, "tiger lilly")).toThrow("not the passcode");
    checkPasscode(db, "tiger lily");
    expect(lockState(db).open).toBe(false);
  });
});

describe("reading the journal back", () => {
  it("searches sealed days and private lines only while open, and keeps nothing", () => {
    write("2026-08-02", "Talked to Dad about the move. It went badly.");
    write("2026-09-18", "Nothing much.");
    jotPrivate(db, companyId, { text: "I still think about what Dad said.", feeling: "other", people: [] }, at("2026-09-10"));
    setPasscode(db, companyId, "tiger lily", now);
    const found = searchJournal(db, companyId, "dad");
    expect(found.found.map((hit) => [hit.day, hit.kind])).toEqual([
      ["2026-09-10", "private"],
      ["2026-08-02", "entry"],
    ]);
    expect(found.found[1]?.snippet).toContain("Talked to Dad");
    lockNow(db);
    expect(searchJournal(db, companyId, "dad")).toMatchObject({ found: [], locked: true });
    // Nothing went into the index on the way.
    expect(search(db, companyId, "dad")).toEqual([]);
  });

  it("counts the days it could not read while locked", () => {
    write("2026-09-17", "One.");
    write("2026-09-18", "Two.");
    setPasscode(db, companyId, "tiger lily", now);
    expect(journalDays(db, companyId, "2026-09-01", "2026-09-19").days.map((day) => day.text)).toEqual(["One.", "Two."]);
    lockNow(db);
    expect(journalDays(db, companyId, "2026-09-01", "2026-09-19")).toMatchObject({ days: [], sealed: 2 });
  });
});

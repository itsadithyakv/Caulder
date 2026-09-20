import { beforeEach, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { migrate } from "../db/migrations";
import { createCompany } from "../repositories/companies";
import { createBlock } from "../repositories/blocks";
import { blockInput } from "@shared/domain";
import { shiftDay, today as todayIn } from "@shared/dates";
import { answerQuietDay, pulse, setPulse } from "./pulse";
import { jotPrivate } from "./private";
import { resetForTests, setPasscode } from "./journal-lock";

let db: Database.Database;
let home: string;
let work: string;
const NOW = new Date("2026-09-20T06:00:00Z");
const TODAY = todayIn("Asia/Kolkata", NOW);

function hours(companyId: string, daysAgo: number, minutes: number) {
  createBlock(
    db,
    companyId,
    blockInput.parse({ day: shiftDay(TODAY, -daysAgo), startsAt: "09:00", minutes, title: "Work", kind: "focus", notes: null, taskId: null, priority: null, remindMinutes: null, repeat: null }),
  );
}

beforeEach(() => {
  resetForTests();
  db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  migrate(db);
  home = createCompany(db, { name: "Me", accent: "coffee", timezone: "Asia/Kolkata", kind: "personal" }).id;
  work = createCompany(db, { name: "Unifloe", accent: "blue", timezone: "Asia/Kolkata" }).id;
});

describe("how somebody has been", () => {
  it("adds the load up across every workspace, because a person has one amount of energy", () => {
    for (let ago = 0; ago < 35; ago += 1) {
      hours(home, ago, 30);
      hours(work, ago, 60);
    }
    const read = pulse(db, home, NOW).pulse;
    expect(read?.enough).toBe(true);
    expect(read?.notes[0]).toBe("10.5 h this week, about your usual 10.5 h.");
  });

  it("asks about a quiet yesterday once, and keeps the answer", () => {
    for (let ago = 0; ago < 35; ago += 1) if (ago !== 1) hours(home, ago, 60);
    const yesterday = shiftDay(TODAY, -1);
    expect(pulse(db, home, NOW).pulse?.ask).toBe(yesterday);

    expect(answerQuietDay(db, home, yesterday, "scrolled", NOW).pulse?.ask).toBeNull();
    // Said again, the newer answer is the one kept.
    answerQuietDay(db, home, yesterday, "rested", NOW);
    expect(db.prepare(`SELECT answer FROM day_checkins`).all()).toEqual([{ answer: "rested" }]);
    expect(() => answerQuietDay(db, home, yesterday, "lazy", NOW)).toThrow(/not one of the answers/);
  });

  it("reads nothing, and says so, when it is switched off", () => {
    hours(home, 0, 60);
    setPulse(db, false);
    expect(pulse(db, home, NOW)).toEqual({ on: false, pulse: null });
    setPulse(db, true);
    expect(pulse(db, home, NOW).on).toBe(true);
  });

  it("never counts a private line as anything - not even as a sign the day was lived", () => {
    for (let ago = 2; ago < 35; ago += 1) hours(home, ago, 60);
    hours(home, 0, 60);
    setPasscode(db, home, "open sesame", NOW);
    // Yesterday: nothing but a private line, which this cannot see.
    jotPrivate(db, home, { text: "i feel completely burnt out and hopeless", feeling: "worry", people: [] }, new Date(NOW.getTime() - 24 * 60 * 60 * 1000));

    const read = pulse(db, home, NOW).pulse;
    expect(read?.ask).toBe(shiftDay(TODAY, -1));
    expect(JSON.stringify(read)).not.toContain("hopeless");
  });
});

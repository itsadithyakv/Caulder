import { beforeEach, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { migrate } from "../db/migrations";
import { createCompany } from "../repositories/companies";
import { readCapture, REMEMBER_PAGE } from "@shared/capture";
import { getPage } from "./brain";
import { allMemories, pageTitles } from "./memories";
import { remember } from "./remember";

/**
 * Keeping what the line was told to remember: one dated line, on the page it
 * is about, in the company's own brain - read by the line and kept by main,
 * the way the window does it.
 */

let db: Database.Database;
let work: string;
let other: string;
const NOW = new Date("2026-09-20T06:00:00Z");
const CLOCK = { today: "2026-09-20", now: 10 * 60 };

/** Said to the line, read by it, and kept. */
function say(line: string, companyId = work) {
  const read = readCapture(line, { contacts: [], pages: pageTitles(db, companyId) }, CLOCK);
  expect(read.kind).toBe("memory");
  return remember(db, { companyId, pageId: read.page?.id ?? null, topic: read.topic, said: read.text, fact: read.fact, day: CLOCK.today }, NOW);
}

beforeEach(() => {
  db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  migrate(db);
  work = createCompany(db, { name: "Unifloe", accent: "blue", timezone: "Asia/Kolkata" }).id;
  other = createCompany(db, { name: "Second", accent: "teal", timezone: "Asia/Kolkata" }).id;
});

describe("kept where it belongs", () => {
  it("starts the one page for what names no page, in Remembered, and says it started it", () => {
    const kept = say("remember that harbour pay on the 5th");
    expect(kept).toMatchObject({ title: REMEMBER_PAGE, started: [REMEMBER_PAGE] });
    const page = getPage(db, kept.pageId);
    expect(page).toMatchObject({ companyId: work, section: "remembered" });
    // Without the words that only said to keep it.
    expect(page.body).toBe("- harbour pay on the 5th _(2026-09-20)_\n");
  });

  it("adds the next one under the last, on the page there is", () => {
    say("remember that harbour pay on the 5th");
    const kept = say("remember: nordlys want one pdf, not a link");
    expect(kept.started).toEqual([]);
    expect(getPage(db, kept.pageId).body).toBe("- harbour pay on the 5th _(2026-09-20)_\n- nordlys want one pdf, not a link _(2026-09-20)_\n");
  });

  it("leads a fact about the company with what it is, so the newest is the answer", () => {
    say("our gst number is 29ABCDE1234F1Z5");
    say("our gst number is 29ZZZZZ9999Z1Z9");
    const { memories } = allMemories(db, work);
    expect(memories.map((memory) => [memory.fact, memory.current])).toEqual(
      expect.arrayContaining([
        ["Gst number: 29ZZZZZ9999Z1Z9", true],
        ["Gst number: 29ABCDE1234F1Z5", false],
      ]),
    );
  });

  it("goes on the page the line names, and leaves what was written there alone", () => {
    const first = remember(db, { companyId: work, pageId: null, topic: "Pricing", said: "999 a month for schools", fact: null, day: CLOCK.today }, NOW);
    const kept = say("pricing went up for colleges after the pilot");
    expect(kept.pageId).toBe(first.pageId);
    expect(getPage(db, kept.pageId).body).toContain("- 999 a month for schools _(2026-09-20)_\n- pricing went up for colleges after the pilot _(2026-09-20)_");
  });

  it("is one line whatever was typed, and clear of anything on the page that is not a memory", () => {
    const made = remember(db, { companyId: work, pageId: null, topic: "Hosting", said: "moved to\nthe bigger plan", fact: null, day: CLOCK.today }, NOW);
    db.prepare(`UPDATE brain_pages SET body = ? WHERE id = ?`).run("We host on one box.\n", made.pageId);
    remember(db, { companyId: work, pageId: made.pageId, topic: null, said: "renews in march", fact: null, day: CLOCK.today }, NOW);
    expect(getPage(db, made.pageId).body).toBe("We host on one box.\n\n- renews in march _(2026-09-20)_\n");
  });
});

describe("whose it is", () => {
  it("is the company's that was open: the same page name in another company is another page", () => {
    const here = say("remember that the printer takes a3");
    const there = say("remember that the landlord wants notice in writing", other);
    expect(there.pageId).not.toBe(here.pageId);
    expect(allMemories(db, work).memories).toHaveLength(1);
    expect(allMemories(db, other).memories).toHaveLength(1);
  });

  it("refuses a page of another company, and a company that is gone", () => {
    const theirs = say("remember that the landlord wants notice in writing", other);
    expect(() => remember(db, { companyId: work, pageId: theirs.pageId, topic: null, said: "x", fact: null, day: CLOCK.today }, NOW)).toThrow("another company");
    expect(() => remember(db, { companyId: "gone", pageId: null, topic: null, said: "x", fact: null, day: CLOCK.today }, NOW)).toThrow("no longer exists");
  });
});

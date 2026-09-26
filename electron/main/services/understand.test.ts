import { beforeEach, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { migrate } from "../db/migrations";
import { createCompany } from "../repositories/companies";
import { createLead } from "../repositories/leads";
import { createPage } from "../repositories/brain";
import { leadInput } from "@shared/domain";
import { normalise, toBytes } from "@shared/understand";
import { queueSize, vectorCount } from "../repositories/vectors";
import { nearestTo, readQueued, setUnderstanding, understandState, understandingOn, type Read } from "./understand";
import { MODEL } from "@shared/understand";

/**
 * The queue worked through with a stand-in for the model: one that turns a
 * line into a vector by which of a few words it has, so "near" is something a
 * test can say. What is checked is Caulder's half - what is read, when, and
 * what is kept - not the model's.
 */

const WORDS = ["coffee", "gym", "school", "guitar"];
const asked: string[][] = [];
const read: Read = async (lines) => {
  asked.push([...lines]);
  return lines.map((line) => toBytes(normalise(Float32Array.from(WORDS, (word) => (line.toLowerCase().includes(word) ? 1 : 0.01)))));
};

let db: Database.Database;
let home: string;
const NOW = "2026-09-26T10:00:00.000Z";

beforeEach(() => {
  asked.length = 0;
  db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  migrate(db);
  home = createCompany(db, { name: "Me", accent: "coffee", timezone: "Asia/Kolkata", kind: "personal" }).id;
});

describe("the queue", () => {
  it("is read in passes, and nothing is read twice that has not changed", async () => {
    const coffee = createPage(db, home, { section: "ideas", template: "page", title: "Coffee", body: "- **Beans** · ethiopian coffee _(2026-09-20)_" }, NOW);
    createLead(db, home, leadInput.parse({ name: "Oakridge School" }));
    expect(await readQueued(db, read)).toBe(2);
    expect(queueSize(db)).toBe(0);
    expect(vectorCount(db, MODEL)).toBe(3);

    // Saved again with the same words: queued, and read without asking the model.
    db.prepare(`UPDATE brain_pages SET title = title WHERE id = ?`).run(coffee);
    asked.length = 0;
    expect(await readQueued(db, read)).toBe(1);
    expect(asked).toEqual([]);
  });

  it("finds the nearest in meaning, of the kinds asked for", async () => {
    createPage(db, home, { section: "hobbies", template: "page", title: "Gym", body: "Push pull legs." }, NOW);
    createPage(db, home, { section: "ideas", template: "page", title: "Coffee", body: "Pour over." }, NOW);
    await readQueued(db, read);
    const found = await nearestTo(db, read, [home], "a new coffee grinder", { kinds: ["page"], most: 1 });
    expect(found).toHaveLength(1);
    expect(found[0]?.kind).toBe("page");
    const page = db.prepare(`SELECT title FROM brain_pages WHERE id = ?`).get(found[0]!.sourceId) as { title: string };
    expect(page.title).toBe("Coffee");
  });
});

describe("the switch", () => {
  it("is on until switched off, and says how far reading has got", () => {
    expect(understandingOn(db)).toBe(true);
    setUnderstanding(db, false);
    expect(understandState(db, true)).toEqual({ on: false, here: true, read: 0, waiting: 0 });
    setUnderstanding(db, true);
    expect(understandingOn(db)).toBe(true);
  });
});

import { beforeEach, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { migrate } from "../db/migrations";
import { addAreaWord, listAreaWords, removeAreaWord } from "./words";
import { areaWordInput } from "@shared/domain";

/**
 * Your words, kept in a real database.
 *
 * The part worth testing is the refusal: two spellings of one word pointing
 * at two areas is a list that disagrees with itself, and which of them wins
 * would be down to the order the rows happened to come back in.
 */

let db: Database.Database;

beforeEach(() => {
  db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  migrate(db);
});

describe("the list", () => {
  it("starts empty", () => {
    expect(listAreaWords(db)).toEqual([]);
  });

  it("comes back alphabetical, ignoring case", () => {
    addAreaWord(db, { word: "oakridge", area: "company" });
    addAreaWord(db, { word: "Datascience", area: "college" });
    addAreaWord(db, { word: "CS301", area: "college" });
    expect(listAreaWords(db).map((w) => w.word)).toEqual(["CS301", "Datascience", "oakridge"]);
  });

  it("returns the whole list from every change, which is what the screen draws", () => {
    const afterAdd = addAreaWord(db, { word: "Datascience", area: "college" });
    expect(afterAdd).toEqual([{ id: expect.any(String), word: "Datascience", area: "college" }]);
    expect(removeAreaWord(db, afterAdd[0]!.id)).toEqual([]);
  });
});

describe("adding", () => {
  it("keeps the spelling it was given, and collapses the spaces inside", () => {
    const [word] = addAreaWord(db, { word: "  Machine    Learning ", area: "college" });
    expect(word?.word).toBe("Machine Learning");
  });

  it("refuses a word it already knows in another case, and says where it points", () => {
    addAreaWord(db, { word: "CS301", area: "college" });
    expect(() => addAreaWord(db, { word: "cs301", area: "company" })).toThrow(
      '"cs301" is already a word for College. Remove it first to move it.',
    );
    expect(listAreaWords(db)).toHaveLength(1);
  });

  it("treats two spacings of one phrase as the same phrase", () => {
    addAreaWord(db, { word: "machine learning", area: "college" });
    expect(() => addAreaWord(db, { word: "machine  learning", area: "health" })).toThrow();
  });

  it("is backed by the database, not only by the check in front of it", () => {
    // Anything else that ever writes here - an import, a restore - meets the
    // same rule.
    const insert = db.prepare(
      `INSERT INTO area_words (id, word, area, created_at) VALUES (?, ?, ?, '2026-09-10')`,
    );
    insert.run("a", "Gym", "health");
    expect(() => insert.run("b", "GYM", "personal")).toThrow(/UNIQUE/);
  });

  it("can be moved by removing it and teaching it again", () => {
    const [word] = addAreaWord(db, { word: "Oakridge", area: "college" });
    removeAreaWord(db, word!.id);
    expect(addAreaWord(db, { word: "Oakridge", area: "company" })[0]?.area).toBe("company");
  });
});

describe("what the bridge accepts", () => {
  const check = (raw: unknown) => {
    const parsed = areaWordInput.safeParse(raw);
    return parsed.success ? "ok" : parsed.error.issues[0]?.message;
  };

  it("takes a course name and one of the four areas", () => {
    expect(check({ word: "Datascience", area: "college" })).toBe("ok");
  });

  it("says what is wrong in a sentence rather than a schema error", () => {
    expect(check({ word: "   ", area: "college" })).toBe("Type the word or phrase first.");
    expect(check({ word: "x".repeat(41), area: "college" })).toMatch(/under 40 characters/);
    expect(check({ word: "+++", area: "college" })).toMatch(/letter or number/);
  });

  it("takes a symbol as long as there is something to read in it", () => {
    expect(check({ word: "C++", area: "college" })).toBe("ok");
  });

  it("refuses an area that is not one of the four", () => {
    expect(check({ word: "Datascience", area: "school" })).not.toBe("ok");
  });
});

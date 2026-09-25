import { beforeEach, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { migrate } from "../db/migrations";
import { parseQuick } from "@shared/quickadd";
import { addLesson, listLessons, removeLesson } from "./lessons";

let db: Database.Database;
const NOW = new Date("2026-09-23T09:00:00Z");
const CLOCK = { today: "2026-09-23", now: 10 * 60 };

beforeEach(() => {
  db = new Database(":memory:");
  migrate(db);
});

describe("what the line learns from being moved", () => {
  it("keeps the words and the choice, and counts the same lesson again rather than adding it twice", () => {
    addLesson(db, { text: "I have to return my friends jacket", area: "personal" }, NOW);
    const twice = addLesson(db, { text: "i have to RETURN my friend's jacket", area: "personal" }, NOW);
    expect(twice).toEqual([
      expect.objectContaining({ words: ["friend", "jacket", "return"], area: "personal", kind: null, times: 2, sample: "I have to return my friends jacket" }),
    ]);
  });

  it("learns nothing from a line with nothing in it to learn from", () => {
    expect(addLesson(db, { text: "do it today", area: "personal" }, NOW)).toEqual([]);
  });

  it("is what the next line is read by: moved once, the next like it lands there too", () => {
    // In a company workspace a line with no area words would fall to Company; moved once, it does not.
    expect(parseQuick("give arjun the charger back", CLOCK).task.area).toBeNull();
    addLesson(db, { text: "give rahul the charger", area: "personal" }, NOW);
    expect(parseQuick("give arjun the charger back", { ...CLOCK, lessons: listLessons(db) }).task.area).toBe("personal");
    // Your words still win: they were taught outright.
    expect(
      parseQuick("charger for unifloe", { ...CLOCK, lessons: listLessons(db), words: [{ word: "unifloe", area: "company" }] }).task.area,
    ).toBe("company");
  });

  it("can be taken back", () => {
    const [lesson] = addLesson(db, { text: "return the jacket", kind: "task" }, NOW);
    expect(removeLesson(db, lesson?.id ?? "")).toEqual([]);
  });
});

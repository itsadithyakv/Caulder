import { beforeEach, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { migrate } from "../db/migrations";
import { addLesson, removeLesson } from "./lessons";

let db: Database.Database;
const NOW = new Date("2026-09-23T09:00:00Z");

beforeEach(() => {
  db = new Database(":memory:");
  migrate(db);
});

describe("what the line learns from being moved", () => {
  it("keeps the words and the choice, and counts the same lesson again rather than adding it twice", () => {
    addLesson(db, { text: "I have to return my friends jacket", kind: "task" }, NOW);
    const twice = addLesson(db, { text: "i have to RETURN my friend's jacket", kind: "task" }, NOW);
    expect(twice).toEqual([
      expect.objectContaining({ words: ["friend", "jacket", "return"], kind: "task", times: 2, sample: "I have to return my friends jacket" }),
    ]);
  });

  it("learns nothing from a line with nothing in it to learn from", () => {
    expect(addLesson(db, { text: "do it today", kind: "task" }, NOW)).toEqual([]);
  });

  it("can be taken back", () => {
    const [lesson] = addLesson(db, { text: "return the jacket", kind: "task" }, NOW);
    expect(removeLesson(db, lesson?.id ?? "")).toEqual([]);
  });
});

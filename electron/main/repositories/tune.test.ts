import { beforeEach, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { migrate } from "../db/migrations";
import { answerGuess, forgetGuess, keepAsTyped, learnedFrom, recordSeen, tuneState } from "./tune";

let db: Database.Database;

beforeEach(() => {
  db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  migrate(db);
});

const slip = { typed: "meetining", as: "meeting" };

describe("what the line saw", () => {
  it("asks about a slip the first time", () => {
    recordSeen(db, { slips: [slip] });
    expect(tuneState(db).asking.map((guess) => guess.typed)).toEqual(["meetining"]);
  });

  it("counts a second sighting rather than listing it twice, whatever the case", () => {
    recordSeen(db, { slips: [slip] });
    recordSeen(db, { slips: [{ typed: "Meetining", as: "meeting" }] });
    expect(tuneState(db).asking).toHaveLength(1);
    expect(tuneState(db).asking[0]?.times).toBe(2);
  });
});

describe("an answer", () => {
  it("'same thing' is read without comment from then on", () => {
    recordSeen(db, { slips: [slip] });
    const [asked] = tuneState(db).asking;
    const after = answerGuess(db, { id: asked?.id ?? "", verdict: "same" });

    expect(after.asking).toEqual([]);
    expect(after.settled).toMatchObject([{ typed: "meetining", meant: "meeting", verdict: "same" }]);
    expect(learnedFrom(db)).toEqual({ same: { meetining: "meeting" }, keep: [] });
  });

  it("'leave it' is never touched again, and is not asked about when it turns up again", () => {
    recordSeen(db, { slips: [slip] });
    const [asked] = tuneState(db).asking;
    answerGuess(db, { id: asked?.id ?? "", verdict: "keep" });
    recordSeen(db, { slips: [slip] });

    expect(tuneState(db).asking).toEqual([]);
    expect(learnedFrom(db)).toEqual({ same: {}, keep: ["meetining"] });
  });

  it("keeping a word under the line is an answer before the question", () => {
    expect(keepAsTyped(db, { typed: "frida", as: "friday" })).toEqual({ same: {}, keep: ["frida"] });
    expect(tuneState(db).asking).toEqual([]);
    expect(tuneState(db).settled).toMatchObject([{ typed: "frida", verdict: "keep" }]);
  });

  it("can be taken back, and the line is free to guess again", () => {
    const learned = keepAsTyped(db, { typed: "frida", as: "friday" });
    expect(learned.keep).toEqual(["frida"]);
    const [settled] = tuneState(db).settled;
    expect(forgetGuess(db, settled?.id ?? "").settled).toEqual([]);
    expect(learnedFrom(db)).toEqual({ same: {}, keep: [] });
  });

  it("refuses an answer to a question that is not there", () => {
    expect(() => answerGuess(db, { id: "nothing", verdict: "same" })).toThrow(/not there/);
  });
});

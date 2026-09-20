import { beforeEach, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { migrate } from "../db/migrations";
import { answerGuess, forgetGuess, keepAsTyped, learnedFrom, recordSeen, tuneState } from "./tune";
import { addAreaWord, listAreaWords } from "./words";

let db: Database.Database;

beforeEach(() => {
  db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  migrate(db);
});

const slip = { typed: "meetining", as: "meeting" };

describe("what the line saw", () => {
  it("asks about a slip the first time, and about a name only once it has come up again", () => {
    recordSeen(db, { slips: [slip], names: ["ms puc"] });
    expect(tuneState(db).asking.map((guess) => guess.typed)).toEqual(["meetining"]);

    recordSeen(db, { slips: [], names: ["ms puc"] });
    const asking = tuneState(db).asking;
    expect(asking.map((guess) => guess.typed)).toEqual(["ms puc", "meetining"]);
    expect(asking[0]).toMatchObject({ kind: "name", times: 2, meant: null });
  });

  it("counts a second sighting rather than listing it twice, whatever the case", () => {
    recordSeen(db, { slips: [slip], names: [] });
    recordSeen(db, { slips: [{ typed: "Meetining", as: "meeting" }], names: [] });
    expect(tuneState(db).asking).toHaveLength(1);
    expect(tuneState(db).asking[0]?.times).toBe(2);
  });

  it("does not count a name that is already one of Your words", () => {
    addAreaWord(db, { word: "Unifloe", area: "company" });
    recordSeen(db, { slips: [], names: ["unifloe"] });
    recordSeen(db, { slips: [], names: ["unifloe"] });
    expect(tuneState(db).asking).toEqual([]);
  });
});

describe("an answer", () => {
  it("'same thing' is read without comment from then on", () => {
    recordSeen(db, { slips: [slip], names: [] });
    const [asked] = tuneState(db).asking;
    const after = answerGuess(db, { kind: "slip", id: asked?.id ?? "", verdict: "same" });

    expect(after.asking).toEqual([]);
    expect(after.settled).toMatchObject([{ typed: "meetining", meant: "meeting", verdict: "same" }]);
    expect(learnedFrom(db)).toEqual({ same: { meetining: "meeting" }, keep: [] });
  });

  it("'leave it' is never touched again, and is not asked about when it turns up again", () => {
    recordSeen(db, { slips: [slip], names: [] });
    const [asked] = tuneState(db).asking;
    answerGuess(db, { kind: "slip", id: asked?.id ?? "", verdict: "keep" });
    recordSeen(db, { slips: [slip], names: [] });

    expect(tuneState(db).asking).toEqual([]);
    expect(learnedFrom(db)).toEqual({ same: {}, keep: ["meetining"] });
  });

  it("keeping a word under the line is an answer before the question", () => {
    expect(keepAsTyped(db, { typed: "frida", as: "friday" })).toEqual({ same: {}, keep: ["frida"] });
    expect(tuneState(db).asking).toEqual([]);
    expect(tuneState(db).settled).toMatchObject([{ typed: "frida", verdict: "keep" }]);
  });

  it("a name given an area becomes one of Your words", () => {
    recordSeen(db, { slips: [], names: ["ms puc"] });
    recordSeen(db, { slips: [], names: ["ms puc"] });
    const [asked] = tuneState(db).asking;
    const after = answerGuess(db, { kind: "name", id: asked?.id ?? "", area: "company" });

    expect(after.asking).toEqual([]);
    expect(listAreaWords(db)).toMatchObject([{ word: "ms puc", area: "company" }]);
  });

  it("a name that is none of them is not asked about twice, and teaches nothing", () => {
    recordSeen(db, { slips: [], names: ["rahul"] });
    recordSeen(db, { slips: [], names: ["rahul"] });
    const [asked] = tuneState(db).asking;
    answerGuess(db, { kind: "name", id: asked?.id ?? "", area: null });
    recordSeen(db, { slips: [], names: ["rahul"] });

    expect(tuneState(db).asking).toEqual([]);
    expect(listAreaWords(db)).toEqual([]);
  });

  it("can be taken back, and the line is free to guess again", () => {
    const learned = keepAsTyped(db, { typed: "frida", as: "friday" });
    expect(learned.keep).toEqual(["frida"]);
    const [settled] = tuneState(db).settled;
    expect(forgetGuess(db, settled?.id ?? "").settled).toEqual([]);
    expect(learnedFrom(db)).toEqual({ same: {}, keep: [] });
  });

  it("refuses an answer to a question that is not there", () => {
    expect(() => answerGuess(db, { kind: "slip", id: "nothing", verdict: "same" })).toThrow(/not there/);
  });
});

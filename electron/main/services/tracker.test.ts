import { beforeEach, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { migrate } from "../db/migrations";
import { createCompany } from "../repositories/companies";
import { measuresOf } from "@shared/subjects";
import { readBook } from "@shared/books";
import { logMeasures, shelf, shelfAdd, shelfMove, shelfRemove, yearInNumbers } from "./tracker";

let db: Database.Database;
let companyId: string;

const on = (day: string) => new Date(`${day}T06:00:00Z`);
const say = (line: string, day: string) => logMeasures(db, companyId, measuresOf(line), on(day));

beforeEach(() => {
  db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  migrate(db);
  companyId = createCompany(db, { name: "Mine", accent: "coffee", timezone: "Asia/Kolkata", kind: "personal" }).id;
});

describe("a year in numbers", () => {
  it("adds up what was said over the year, each thing the way it is worth saying", () => {
    say("I just did 20 push ups today", "2026-01-05");
    say("did 35 push ups", "2026-03-02");
    say("50 pushups before bed", "2026-03-20");
    say("bench press 40kg for 5 reps", "2026-02-01");
    say("i hit a pr today, 45kg on the bench press for 3 reps", "2026-03-10");
    say("went for a run today, 5kms at a 4.30 pace", "2026-03-11");
    say("ran 10k, 5:10/km", "2026-06-01");
    say("weighed in at 74 kg", "2026-01-02");
    say("weighed in at 70.5 kg", "2026-08-02");
    // Last year's is last year's.
    say("did 500 push ups", "2025-12-31");

    const year = yearInNumbers(db, companyId, 2026);
    const line = (topic: string) => year.lines.find((each) => each.topic === topic)?.says;
    expect(line("Push Ups")).toBe("105 in all over 3 days; the most in one go was 50.");
    expect(line("Bench Press")).toBe("Best 45 kg × 3, up from 40, over 2 days.");
    expect(line("Running")).toBe("15 km over 2 days; the longest was 10 km, the fastest 4:30 /km.");
    expect(line("Body Weight")).toBe("74 to 70.5 kg: down 3.5.");
    expect(year.activeDays).toBe(9);
    expect(year.busiest).toBe("March");
    // The most-logged thing leads.
    expect(year.lines[0]?.topic).toBe("Push Ups");
  });

  it("is an empty year, and says so by saying nothing", () => {
    expect(yearInNumbers(db, companyId, 2026)).toMatchObject({ activeDays: 0, lines: [], booksRead: [], busiest: null });
  });

  it("writes nothing for a line that measured nothing", () => {
    expect(say("call mom tomorrow", "2026-01-05")).toBe(0);
    expect(logMeasures(db, companyId, "not a list")).toBe(0);
  });
});

describe("the shelf", () => {
  const add = (line: string, day = "2026-05-01") => shelfAdd(db, companyId, readBook(line), on(day));

  it("puts a series on the pile in order, and a book being read where it is", () => {
    add("I want to read percy jackson series");
    const piles = add("i am reading harry potter and the goblet of fire");
    expect(piles.toRead.map((book) => book.title)).toEqual([
      "The Lightning Thief", "The Sea of Monsters", "The Titan's Curse", "The Battle of the Labyrinth", "The Last Olympian",
    ]);
    expect(piles.reading).toMatchObject([{ title: "Harry Potter and the Goblet of Fire", series: "Harry Potter" }]);
  });

  it("moves a book it already has rather than adding it twice, and never backwards with its series", () => {
    add("i want to read the lightning thief");
    add("i am reading the lightning thief");
    const finished = add("finished reading the lightning thief", "2026-06-10");
    expect(finished.read).toMatchObject([{ title: "The Lightning Thief", finishedOn: "2026-06-10" }]);

    const series = add("I want to read percy jackson series");
    expect(series.read.map((book) => book.title)).toEqual(["The Lightning Thief"]);
    expect(series.toRead).toHaveLength(4);
    expect(yearInNumbers(db, companyId, 2026).booksRead).toEqual(["The Lightning Thief"]);
  });

  it("moves and removes by hand", () => {
    const [book] = add("i want to read dune").toRead;
    expect(shelfMove(db, book?.id ?? "", "reading").reading).toHaveLength(1);
    expect(() => shelfMove(db, book?.id ?? "", "burnt")).toThrow(/not a pile/);
    expect(shelfRemove(db, book?.id ?? "")).toEqual({ reading: [], toRead: [], read: [] });
    expect(shelf(db, companyId).toRead).toEqual([]);
  });
});

describe("a page for each hobby", () => {
  it("gives each hobby what was logged that is its own, and the pages in the brain that hang off it", async () => {
    const { createPage } = await import("../repositories/brain");
    const { hobbyBoards } = await import("./tracker");
    const make = (title: string, body = "") =>
      createPage(db, companyId, { section: "hobbies", template: body ? "page" : "hobby", title, body }, new Date().toISOString());
    const gym = make("Gym");
    make("Guitar");
    make("Bench Press", `Part of [[Gym|page:${gym}]].\n\n- **PR: 45 kg × 3** · hit a pr`);

    const now = new Date();
    const at = (line: string) => logMeasures(db, companyId, measuresOf(line), now);
    at("i hit a pr today, 45kg on the bench press for 3 reps");
    at("did 20 push ups");
    at("went for a run, 5 km");

    const boards = hobbyBoards(db, companyId, now);
    expect(boards.map((board) => `${board.title}: ${board.kind}`)).toEqual(["Guitar: music", "Gym: gym"]);
    const board = boards.find((each) => each.title === "Gym");
    expect(board?.tracks.map((track) => track.topic)).toEqual(["Bench Press", "Push Ups"]);
    expect(board?.pages).toEqual([{ id: expect.any(String), title: "Bench Press" }]);
    // The run is nobody's here: there is no Running hobby to show it.
    expect(boards.find((each) => each.title === "Guitar")?.tracks).toEqual([]);
  });
});

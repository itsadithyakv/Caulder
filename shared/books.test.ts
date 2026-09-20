import { describe, expect, it } from "vitest";
import { readBook } from "./books";

describe("the lines this was built for", () => {
  it("knows a book being read, and the series it is part of", () => {
    expect(readBook("i am reading harry potter and the goblet of fire")).toEqual({
      status: "reading",
      series: "Harry Potter",
      titles: ["Harry Potter and the Goblet of Fire"],
    });
  });

  it("puts all five of a series on the pile, in order", () => {
    const asked = readBook("I want to read percy jackson series");
    expect(asked).toMatchObject({ status: "to-read", series: "Percy Jackson" });
    expect(asked?.titles).toEqual([
      "The Lightning Thief", "The Sea of Monsters", "The Titan's Curse", "The Battle of the Labyrinth", "The Last Olympian",
    ]);
  });

  it("puts one book on the pile", () => {
    expect(readBook("I want to read the lord of the flies")).toEqual({ status: "to-read", series: null, titles: ["The Lord of the Flies"] });
  });
});

describe("a book, and where it stands", () => {
  it.each([
    ["currently reading dune", "reading", "Dune"],
    ["just started reading project hail mary by andy weir", "reading", "Project Hail Mary"],
    ["finished reading golden son today", "read", "Golden Son"],
    ["add atomic habits to my reading list", "to-read", "Atomic Habits"],
    ["tbr: the midnight library", "to-read", "The Midnight Library"],
    ["i'd like to read sapiens this year", "to-read", "Sapiens"],
  ])("'%s' is %s: %s", (line, status, title) => {
    expect(readBook(line)).toMatchObject({ status, titles: [title] });
  });

  it("keeps a series it does not know as one entry, under its own name", () => {
    expect(readBook("i want to read the bobiverse series")).toEqual({ status: "to-read", series: "Bobiverse", titles: ["The Bobiverse Series"] });
  });
});

describe("reading that is not a book on a shelf", () => {
  it.each([
    "i want to read chapter 4 before class",
    "reading the docs for the api",
    "i should read up on pricing",
    "reading 20 pages a day",
    "finished the report",
    "call mom",
  ])("'%s' is something else", (line) => {
    expect(readBook(line)).toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import { prongsOf, sayTrail, trailOf } from "./branches";
import { readCapture } from "./capture";

const CLOCK = { today: "2026-09-20", now: 10 * 60 };
const titles = (line: string, pages: { id: string; title: string; section: string }[] = []) =>
  readCapture(line, { contacts: [], hobbies: [], pages }, CLOCK).trail.map((step) => step.title);

describe("the way down to a thing", () => {
  it("goes Me, Hobbies, Reading, the series, then the book", () => {
    expect(titles("red rising is the first book of the red rising series")).toEqual(["Me", "Hobbies", "Reading", "Red Rising series"]);
  });

  it("puts a genre above the series when the line names one, and not when it does not", () => {
    expect(titles("golden son is a sci-fi book in the red rising series")).toEqual(["Me", "Hobbies", "Reading", "Sci-fi books", "Red Rising series"]);
    expect(titles("piranesi is a book by susanna clarke")).toEqual(["Me", "Hobbies", "Reading"]);
    // A series Caulder knows is a level without being said.
    expect(titles("dune is a book by frank herbert")).toEqual(["Me", "Hobbies", "Reading", "Dune series"]);
    expect(titles("project hail mary is a science fiction novel")).toEqual(["Me", "Hobbies", "Reading", "Sci-fi books"]);
  });

  it("knows the series a book is of without being told, when it is one Caulder knows", () => {
    expect(prongsOf("book", "the lightning thief is a book i loved", "The Lightning Thief")).toEqual(["Percy Jackson series"]);
    expect(prongsOf("book", "some book nobody has heard of", "Some Book")).toEqual([]);
  });

  it("hangs off the hobby the brain already has, by its own name, rather than starting a second", () => {
    const pages = [{ id: "h1", title: "Books", section: "hobbies" }];
    expect(titles("piranesi is a book by susanna clarke", pages)).toEqual(["Me", "Hobbies", "Books"]);
  });

  it("branches a song by who it is by, a lift by what it works, a film by its franchise", () => {
    expect(titles("i learnt a new song called riptide by vance joy, had fun")).toEqual(["Me", "Hobbies", "Music", "Vance Joy"]);
    expect(titles("i hit a pr today, 45kg on the bench press for 3 reps")).toEqual(["Me", "Hobbies", "Gym", "Chest"]);
    expect(titles("hit a pr on deadlift, 100kg")).toEqual(["Me", "Hobbies", "Gym", "Back"]);
    expect(titles("the two towers is a movie in the lord of the rings trilogy")).toEqual([
      "Me",
      "Hobbies",
      "Films and shows",
      "Lord Of The Rings series",
    ]);
  });

  it("never takes a level it made for the hobby: 'Fantasy books' is a shelf in Reading, not Reading", () => {
    const pages = [
      { id: "f", title: "Fantasy books", section: "hobbies" },
      { id: "s", title: "Stormlight Archive series", section: "hobbies" },
      { id: "r", title: "Reading", section: "hobbies" },
    ];
    expect(titles("words of radiance is a book in the stormlight archive series", pages)).toEqual([
      "Me",
      "Hobbies",
      "Reading",
      "Stormlight Archive series",
    ]);
    // And with Reading known as a hobby, it is the hobby whatever order the pages come in.
    const read = readCapture(
      "words of radiance is a book in the stormlight archive series",
      { contacts: [], hobbies: [{ id: "r", title: "Reading" }], pages },
      CLOCK,
    );
    expect(read.branch?.parent).toEqual({ id: "r", title: "Reading" });
  });

  it("keeps a genre to its own hobby: a sci-fi film is not part of Reading", () => {
    expect(titles("interstellar is a sci-fi movie by nolan")).toEqual(["Me", "Hobbies", "Films and shows", "Sci-fi films"]);
    expect(titles("project hail mary is a sci-fi novel")).toEqual(["Me", "Hobbies", "Reading", "Sci-fi books"]);
  });

  it("writes a course called by its letters in them", () => {
    expect(readCapture("dbms is a course about databases", { contacts: [], hobbies: [], pages: [] }, CLOCK).topic).toBe("DBMS");
    expect(readCapture("algebra is a course i like", { contacts: [], hobbies: [], pages: [] }, CLOCK).topic).toBe("Algebra");
  });

  it("puts a course under Studies, and what is part of nothing under you", () => {
    expect(titles("dbms is a course about databases")).toEqual(["Me", "Studies"]);
    expect(titles("zettelkasten is a way of keeping notes")).toEqual(["Me"]);
    expect(titles("fun fact: honey never spoils")).toEqual(["Me"]);
  });

  it("is never part of itself, and says no level twice", () => {
    const trail = trailOf({
      section: "hobbies",
      trunk: { title: "Reading", section: "hobbies", template: "hobby" },
      is: "book",
      text: "reading is a book in the reading series",
      topic: "Reading",
    });
    expect(trail.map((step) => step.title)).toEqual(["Me", "Hobbies", "Reading series"]);
  });

  it("is said without the root everybody shares", () => {
    expect(sayTrail([{ title: "Me" }, { title: "Hobbies" }, { title: "Reading" }, { title: "Red Rising series" }])).toBe(
      "Hobbies › Reading › Red Rising series",
    );
    expect(sayTrail([{ title: "Me" }])).toBe("");
  });

  it("hangs a page the brain already has where it belongs too", () => {
    const pages = [{ id: "p2", title: "Red Rising", section: "hobbies" }];
    expect(titles("Read red rising book today, loved chapter 25", pages)).toEqual(["Me", "Hobbies", "Reading", "Red Rising series"]);
  });

  it("never files a line onto a level because a word in it is the level's name", () => {
    const pages = ["Me", "Hobbies", "Reading", "Gym", "Chest", "Sci-fi books", "Red Rising series", "Red Rising"].map((title, at) => ({
      id: `p${at}`,
      title,
      section: "hobbies",
    }));
    const read = (line: string) => readCapture(line, { contacts: [], hobbies: [], pages }, CLOCK);
    expect(read("reading the report tonight was painful").page).toBeNull();
    expect(read("chest day was brutal").page).toBeNull();
    // The series is a level; the book it is named after is not, and is what the line lands on.
    expect(read("red rising series is worth a reread").page?.title).not.toBe("Red Rising series");
    // A thing that is not a level is still found by its name.
    expect(read("red rising was even better the second time").page?.title).toBe("Red Rising");
  });

  it("gives a private line no trail at all", () => {
    expect(titles("private: i like julia")).toEqual([]);
  });
});

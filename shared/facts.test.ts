import { describe, expect, it } from "vitest";
import { readFact, TRIVIA_PAGE } from "./facts";
import { readCapture } from "./capture";

const CLOCK = { today: "2026-09-20", now: 10 * 60 };
const NOTHING = { contacts: [], hobbies: [], pages: [] };
const capture = (line: string, known: Parameters<typeof readCapture>[1] = NOTHING) => readCapture(line, known, CLOCK);

describe("a fact worth keeping", () => {
  it("is known by being said to be one, and kept without the words that said so", () => {
    expect(readFact("Shivajinagar was called black pally, interesting question")).toEqual({
      subject: "Shivajinagar",
      says: "Shivajinagar was called black pally",
      marked: true,
    });
    expect(readFact("fun fact: honey never spoils")).toEqual({ subject: null, says: "Honey never spoils", marked: true });
    expect(readFact("did you know octopuses have three hearts")?.says).toBe("Octopuses have three hearts");
    expect(readFact("TIL the eiffel tower grows 15cm in summer")?.says).toBe("The eiffel tower grows 15cm in summer");
    expect(readFact("apparently bananas are berries")?.says).toBe("Bananas are berries");
    expect(readFact("the great wall is not visible from space - who knew")?.says).toBe("The great wall is not visible from space");
    expect(readFact("napoleon was not actually short, good quiz question")?.marked).toBe(true);
  });

  it("is known by its shape too: a thing, then the way an encyclopaedia talks", () => {
    expect(readFact("the capital of australia is canberra not sydney")).toBeNull();
    expect(readFact("canberra is the capital of australia not sydney")).toMatchObject({ subject: "Canberra", marked: false });
    expect(readFact("bangalore was founded by kempe gowda in 1537")).toMatchObject({ subject: "Bangalore", marked: false });
    expect(readFact("the statue of liberty was designed by bartholdi")?.subject).toBe("Statue Of Liberty");
    expect(readFact("NASA stands for national aeronautics and space administration")?.subject).toBe("NASA");
    expect(readFact("namma means our in kannada")?.subject).toBe("Namma");
  });

  it("is never a line about yourself, your day, or nothing much", () => {
    for (const line of [
      "went to the gym, felt good",
      "the meeting was good",
      "i was called into the office today",
      "my dog is called bruno",
      "this means a lot to me",
      "it was founded on a misunderstanding",
      "buy milk",
      "call mum tmrw 7pm",
      "that was interesting",
      "fun fact",
    ]) {
      expect(readFact(line), line).toBeNull();
    }
  });
});

describe("the line, told a fact", () => {
  it("starts the one page for them, in Ideas, and does not say its subject twice", () => {
    const read = capture("Shivajinagar was called black pally, interesting question");
    expect(read).toMatchObject({
      kind: "memory",
      text: "Shivajinagar was called black pally",
      page: null,
      topic: TRIVIA_PAGE,
      branch: { section: "ideas", parent: null },
      fact: null,
    });
  });

  it("adds to that page once it is there, rather than starting another", () => {
    const known = { ...NOTHING, pages: [{ id: "p1", title: "Random knowledge", section: "ideas" as const }] };
    const read = capture("fun fact: honey never spoils", known);
    expect(read).toMatchObject({ kind: "memory", page: { id: "p1" }, topic: null, branch: null, text: "Honey never spoils" });
  });

  it("leaves alone what was already something else", () => {
    // A thing with a page of its own to start is that page's.
    expect(capture("red rising is a book by pierce brown")).toMatchObject({ kind: "memory", topic: "Red Rising" });
    // Even put the way a fact is: a book is a book, and hangs where books do.
    expect(capture("red rising is the first book of the red rising series")).toMatchObject({
      kind: "memory",
      topic: "Red Rising",
      branch: { section: "hobbies" },
    });
    // With nothing it could be part of, the same shape is a fact.
    expect(capture("everest is the tallest mountain on earth")).toMatchObject({ kind: "memory", topic: "Random knowledge" });
    // A thing to do is a thing to do, whatever it mentions.
    expect(capture("call mum tmrw 7pm").kind).toBe("task");
    expect(capture("i need to check if bangalore was founded by kempe gowda").kind).toBe("task");
    // And a day is a day.
    expect(capture("went to the gym, felt good").kind).not.toBe("memory");
    // About a page the brain has: that page's, not the pile's.
    const known = { ...NOTHING, pages: [{ id: "p9", title: "Bangalore", section: "ideas" as const }] };
    expect(capture("bangalore was founded by kempe gowda in 1537", known)).toMatchObject({ kind: "memory", page: { id: "p9" } });
  });
});

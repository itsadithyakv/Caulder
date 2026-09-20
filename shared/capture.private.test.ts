import { describe, expect, it } from "vitest";
import { readCapture, type Known } from "./capture";

/** A line that is nobody else's business goes to one place, whatever else it names. */

const at = { today: "2026-09-10", now: 10 * 60 };
const known: Known = {
  contacts: [{ id: "c1", name: "Oakridge", person: "Priya Khan" }],
  hobbies: [],
  pages: [{ id: "p1", title: "Mum", section: "ideas" }],
};
const read = (line: string) => readCapture(line, known, at);

describe("the lines this was built for", () => {
  it("locks a conversation that meant something, with who it was with", () => {
    expect(read("I spoke to julia today about this, really liked it")).toMatchObject({
      kind: "private",
      secret: { feeling: "joy", people: ["Julia"] },
    });
  });

  it("locks a regret about somebody close", () => {
    expect(read("I did not like how i spoke to my mum today")).toMatchObject({
      kind: "private",
      secret: { feeling: "regret", people: ["Mum"] },
    });
  });
});

describe("one place, and nowhere else", () => {
  it("does nothing else with it - no page started, none added to, nobody's history, nothing ticked", () => {
    // There is a page called Mum, and it is not written to.
    const reading = read("I did not like how i spoke to my mum today");
    expect(reading.kind).toBe("private");
    expect(reading.options).not.toContain("done");
    // A crush on a contact is not a note on their record.
    expect(read("i think i have a crush on priya")).toMatchObject({ kind: "private", secret: { feeling: "affection" } });
  });

  it("is kept exactly as it was typed", () => {
    expect(read("ion like how i spoke to my mum today").text).toBe("ion like how i spoke to my mum today");
  });

  it("can be said outright, and is always one press away", () => {
    expect(read("private: thinking about quitting")).toMatchObject({ kind: "private", text: "thinking about quitting" });
    expect(read("buy milk").options).toContain("private");
    expect(read("went to the gym, felt good").options).toContain("private");
  });
});

describe("what stays where it was", () => {
  it("leaves what is still to do on the list of things to do", () => {
    expect(read("i need to apologise to mum, i was rude").kind).toBe("task");
    expect(read("call mum tomorrow").kind).toBe("task");
  });

  it("leaves work as work, and an ordinary day as an ordinary day", () => {
    expect(read("spoke to priya about the quote, really liked it").kind).toBe("contact");
    expect(read("went to the gym, felt good").kind).not.toBe("private");
    expect(read("felt great today").kind).toBe("journal");
  });
});

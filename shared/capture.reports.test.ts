import { describe, expect, it } from "vitest";
import { readCapture, type Known } from "./capture";

/**
 * A line that reports on the day, or says something worth remembering - and
 * everything in Caulder it should touch. Thursday 10 September 2026, ten in
 * the morning.
 */

const at = { today: "2026-09-10", now: 10 * 60 };

const known: Known = {
  contacts: [],
  hobbies: [
    { id: "h1", title: "Gym" },
    { id: "h2", title: "Reading" },
  ],
  habits: [
    { id: "b1", name: "Meditate" },
    { id: "b2", name: "Gym" },
    { id: "b3", name: "Read 20 pages" },
    { id: "b4", name: "Morning walk" },
  ],
  tasks: [
    { id: "t1", title: "Gym" },
    { id: "t2", title: "Study for ml exam" },
  ],
  blocks: [],
  pages: [
    { id: "p1", title: "Reading", section: "hobbies" },
    { id: "p2", title: "Red Rising", section: "hobbies" },
  ],
};

const read = (line: string, knows: Known = known) => readCapture(line, knows, at);
const does = (line: string, knows: Known = known) => read(line, knows).effects.map((effect) => effect.do);

describe("the lines this was built for", () => {
  it("'i went to the gym today at 5' finishes the gym, ticks it, and puts the hour on the Calendar", () => {
    const reading = read("i went to the gym today at 5");
    expect(reading.kind).toBe("done");
    expect(reading.effects).toEqual([
      { do: "finish", task: { id: "t1", title: "Gym" } },
      { do: "tick", habit: { id: "b2", name: "Gym" } },
      // Said at ten in the morning of something already done: five this morning.
      { do: "block", title: "Gym", startsAt: "05:00", minutes: 60 },
    ]);
  });

  it("does not put the hour on the Calendar again when the day already has it", () => {
    const planned: Known = { ...known, blocks: [{ title: "Gym" }] };
    expect(does("i went to the gym today at 5", planned)).toEqual(["finish", "tick"]);
  });

  it("'I went to the gym hit legs for 2 hours feel good' does all four", () => {
    const reading = read("I went to the gym hit legs for 2 hours feel good");
    expect(reading.kind).toBe("done");
    expect(reading.effects).toEqual([
      { do: "finish", task: { id: "t1", title: "Gym" } },
      { do: "tick", habit: { id: "b2", name: "Gym" } },
      // Time on a hobby is an hour on the Calendar too: ending now, when it did not say when.
      { do: "time", hobby: { id: "h1", title: "Gym" }, minutes: 120, startsAt: null },
      { do: "journal" },
    ]);
  });

  it("'Read red rising book today, loved chapter 25' is remembered with the book, and in the journal", () => {
    const reading = read("Read red rising book today, loved chapter 25");
    expect(reading.kind).toBe("done");
    expect(reading.effects).toEqual([
      { do: "memory", page: { id: "p2", title: "Red Rising" }, topic: null, branch: null, fact: null },
      { do: "journal" },
    ]);
    // Kept as it was said, whole.
    expect(reading.text).toBe("Read red rising book today, loved chapter 25");
  });
});

describe("a day reported", () => {
  it("puts the hour on the day when there was nothing there to finish", () => {
    const nothing: Known = { contacts: [], hobbies: [] };
    expect(read("went to the gym today at 9", nothing).effects).toEqual([
      { do: "block", title: "Gym", startsAt: "09:00", minutes: 60 },
    ]);
    // "At 5", said at ten in the morning of something already done, was five this morning.
    const run = read("went for a run at 5 for 45 min", nothing).effects;
    expect(run).toContainEqual({ do: "block", title: "Run", startsAt: "05:00", minutes: 45 });
    // And it is a run, so it is kept with the running too.
    expect(run).toContainEqual(expect.objectContaining({ do: "memory", topic: "Running" }));
  });

  it("keeps a hobby's time at the hour it said", () => {
    expect(read("went to the gym at 7 for 90 min").effects).toContainEqual({
      do: "time",
      hobby: { id: "h1", title: "Gym" },
      minutes: 90,
      startsAt: "07:00",
    });
  });

  it("ends now when it only said how long", () => {
    const nothing: Known = { contacts: [], hobbies: [] };
    expect(read("went for a walk for 30 min", nothing).effects).toEqual([
      { do: "block", title: "Walk", startsAt: "09:30", minutes: 30 },
    ]);
  });

  it("does not set the hour aside twice", () => {
    const planned: Known = { contacts: [], hobbies: [], blocks: [{ title: "Gym" }] };
    expect(does("went to the gym today at 9", planned)).toEqual([]);
  });

  it("finishes a task said in another form of its words", () => {
    expect(read("studied for the ml exam, was tough").effects[0]).toEqual({
      do: "finish",
      task: { id: "t2", title: "Study for ml exam" },
    });
  });

  it("ticks a habit named in any form, mistyped, or said alone", () => {
    expect(does("meditated")).toEqual(["tick"]);
    expect(does("did my meditation today")).toEqual(["tick"]);
    expect(does("meditaet done")).toEqual(["tick"]);
    expect(does("finished my morning walk")).toEqual(["tick"]);
    expect(read("meditated").kind).toBe("done");
  });

  it("needs every word of a habit that carries meaning", () => {
    expect(read("rough morning but shipped the pricing page").kind).toBe("journal");
    expect(does("walked the dog")).toEqual([]);
  });

  it("leaves what is still to come a task", () => {
    expect(read("gym tmrw 6am").kind).toBe("task");
    expect(read("go to the gym today at 5").kind).toBe("task");
    expect(read("i need to go to the gym today").kind).toBe("task");
    expect(read("read red rising today").kind).toBe("task");
  });

  it("is a journal line when there is nothing of Caulder's to update", () => {
    const nothing: Known = { contacts: [], hobbies: [] };
    expect(read("read dune today, loved chapter 25", nothing).kind).toBe("journal");
    expect(read("went for a walk, feel good", nothing).kind).toBe("journal");
  });

  it("keeps plain time on a hobby what it always was", () => {
    expect(read("reading 40 min", { contacts: [], hobbies: known.hobbies })).toMatchObject({ kind: "hobby", minutes: 40 });
  });
});

describe("a memory", () => {
  it("is kept under the page it is about", () => {
    expect(read("red rising has six books in all")).toMatchObject({
      kind: "memory",
      page: { id: "p2", title: "Red Rising" },
      topic: null,
    });
  });

  it("starts a page for a thing said what it is, where it belongs, hung off what it is part of", () => {
    const reading = read("golden son is the second book of the red rising series by pierce brown", {
      ...known,
      pages: [{ id: "p1", title: "Reading", section: "hobbies" }],
    });
    expect(reading).toMatchObject({
      kind: "memory",
      page: null,
      topic: "Golden Son",
      branch: { section: "hobbies", parent: { id: "p1", title: "Reading" } },
    });
  });

  it("branches by what the thing is", () => {
    expect(read("dbms is a course about databases", { contacts: [], hobbies: [] }).branch).toEqual({ section: "studies", parent: null });
    expect(read("interstellar is a movie by nolan", { contacts: [], hobbies: [] }).branch).toEqual({ section: "hobbies", parent: null });
    expect(read("zettelkasten is a way of keeping notes", { contacts: [], hobbies: [] }).branch).toEqual({ section: "ideas", parent: null });
  });

  it("is not made of a sentence about the day, or about nothing in particular", () => {
    const nothing: Known = { contacts: [], hobbies: [] };
    expect(read("today was a good day", nothing).kind).toBe("journal");
    expect(read("it is a long story", nothing).kind).toBe("note");
    expect(read("the meeting was a disaster", nothing).kind).not.toBe("memory");
  });

  it("can be asked for outright", () => {
    expect(read("remember: the wifi password is on the fridge")).toMatchObject({
      kind: "memory",
      text: "the wifi password is on the fridge",
      topic: "The wifi password is on",
    });
  });
});

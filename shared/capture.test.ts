import { describe, expect, it } from "vitest";
import { addToEntry, minutesIn, namedContact, readCapture, type Known } from "./capture";

const known: Known = {
  contacts: [
    { id: "c1", name: "Oakridge International School", person: "Meera Iyer" },
    { id: "c2", name: "GIG International School", person: null },
    { id: "c3", name: "Al", person: null },
  ],
  hobbies: [
    { id: "h1", title: "Guitar" },
    { id: "h2", title: "Running" },
  ],
};

const kind = (line: string) => readCapture(line, known).kind;

describe("where a line goes", () => {
  it("takes a prefix at its word", () => {
    expect(kind("journal: long day")).toBe("journal");
    expect(kind("j: long day")).toBe("journal");
    expect(kind("idea: a parent app")).toBe("idea");
    expect(kind("note - the wifi password is on the fridge")).toBe("note");
    expect(kind("task: renew the domain")).toBe("task");
    expect(readCapture("idea: a parent app", known).text).toBe("a parent app");
  });

  it("puts what happened with a contact on their history, and what is still to do as a task for them", () => {
    const called = readCapture("Called Oakridge, they want a demo next week", known);
    expect(called).toMatchObject({ kind: "contact", contact: { id: "c1" }, logged: "call" });
    expect(readCapture("Met Meera at the fair", known)).toMatchObject({ kind: "contact", logged: "meeting" });
    expect(readCapture("Oakridge liked the pilot", known)).toMatchObject({ kind: "contact", logged: "note" });
    expect(readCapture("call Oakridge tmrw 11am", known)).toMatchObject({ kind: "task", contact: { id: "c1" } });
    expect(readCapture("email GIG International the quote by friday", known)).toMatchObject({ kind: "task", contact: { id: "c2" } });
    // A name too short to be sure of is not a match.
    expect(namedContact("Al said hi", known.contacts)).toBeNull();
  });

  it("counts time given to a hobby", () => {
    expect(readCapture("Guitar 40 min", known)).toMatchObject({ kind: "hobby", hobby: { id: "h1" }, minutes: 40 });
    expect(readCapture("played guitar after dinner", known)).toMatchObject({ kind: "hobby", minutes: null });
    // Guitar still to come is a task.
    expect(kind("guitar lesson tomorrow at 6pm")).toBe("task");
  });

  it("makes a task of anything with a when, or said as an instruction", () => {
    expect(kind("Finish the DBMS assignment by Friday")).toBe("task");
    expect(kind("submit the form")).toBe("task");
    expect(kind("pricing page copy tomorrow")).toBe("task");
  });

  it("keeps a day looked back on for the journal", () => {
    expect(kind("Rough day but shipped the pricing page")).toBe("journal");
    expect(kind("I'm tired, slept badly")).toBe("journal");
    expect(kind("grateful for Ravi covering the demo")).toBe("journal");
    expect(kind("Rough morning but shipped the pricing page")).toBe("journal");
    expect(kind("Shipped the pricing page")).toBe("journal");
    // A word ending in -ed that is not about the day does not count.
    expect(kind("need a new charger")).toBe("note");
  });

  it("files what it is unsure of as a note, and offers every sensible other", () => {
    const unsure = readCapture("the pricing page", known);
    expect(unsure.kind).toBe("note");
    expect(unsure.options).toEqual(["task", "journal", "private", "idea", "note"]);
    expect(readCapture("Called Oakridge", known).options).toContain("contact");
    expect(kind("what if schools paid per term")).toBe("idea");
  });
});

describe("lengths", () => {
  it("reads how long, the way it is said", () => {
    expect(minutesIn("40 min")).toBe(40);
    expect(minutesIn("1h")).toBe(60);
    expect(minutesIn("1.5 hours")).toBe(90);
    expect(minutesIn("half an hour")).toBe(30);
    expect(minutesIn("an hour of guitar")).toBe(60);
    expect(minutesIn("no length here")).toBeNull();
  });
});

describe("a line added to the journal", () => {
  const entry = "## Today\n\n\n## Grateful for\n\n\n## Tomorrow\n\n";

  it("goes under Today, after what is there", () => {
    const once = addToEntry(entry, "Shipped the pricing page.");
    expect(once).toBe("## Today\n\nShipped the pricing page.\n\n## Grateful for\n\n\n## Tomorrow\n\n".replace(/\n{3,}/g, "\n\n"));
    const twice = addToEntry(once, "Called two schools.");
    expect(twice.indexOf("Called two schools.")).toBeGreaterThan(twice.indexOf("Shipped the pricing page."));
    expect(twice.indexOf("Called two schools.")).toBeLessThan(twice.indexOf("## Grateful for"));
  });

  it("goes at the end of an entry with no Today heading", () => {
    expect(addToEntry("Quiet one.", "Went to bed early.")).toBe("Quiet one.\n\nWent to bed early.\n");
  });
});

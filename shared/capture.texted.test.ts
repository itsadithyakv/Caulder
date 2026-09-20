import { describe, expect, it } from "vitest";
import { readCapture, type Known } from "./capture";

/** Where a line goes, typed the way a text message is. Thursday 10 September 2026, ten in the morning. */

const known: Known = {
  contacts: [
    { id: "c1", name: "Oakridge International School", person: "Meera Iyer" },
    { id: "c2", name: "GIG International School", person: null },
  ],
  hobbies: [
    { id: "h1", title: "Guitar" },
    { id: "h2", title: "Running" },
  ],
};
const at = { today: "2026-09-10", now: 10 * 60 };
const goes = (line: string) => readCapture(line, known, at).kind;

describe("said the way it would be texted", () => {
  it("keeps a day looked back on for the journal, even when it says today", () => {
    expect(goes("felt great today")).toBe("journal");
    expect(goes("ion feel good today")).toBe("journal");
    expect(goes("im so tired")).toBe("journal");
    expect(goes("journal good day today")).toBe("journal");
    expect(readCapture("journal good day today", known, at).text).toBe("good day today");
  });

  it("leaves 'journal' a verb when what follows is still to come", () => {
    expect(readCapture("journal for ten minutes tomorrow", known, at)).toMatchObject({
      kind: "task",
      text: "journal for ten minutes tomorrow",
    });
  });

  it("makes a task of anything meant to be done, whatever the verb", () => {
    expect(goes("i need to call the bank")).toBe("task");
    expect(goes("gotta ship the pricing page")).toBe("task");
    expect(goes("remember to buy milk")).toBe("task");
    expect(goes("dont forget the charger")).toBe("task");
    expect(goes("i have to call the bank today")).toBe("task");
    expect(goes("pick up laundry")).toBe("task");
    expect(goes("cancel netflix")).toBe("task");
    expect(goes("sumbit the form")).toBe("task");
    expect(goes("milk today")).toBe("task");
    // Wanting something is not a thing to do.
    expect(goes("need a new charger")).toBe("note");
  });

  it("reads the when the way the task line does", () => {
    expect(goes("pricing page copy tomorow")).toBe("task");
    expect(goes("pricing page copy nxt wk")).toBe("task");
    // "Next" is not a when on its own.
    expect(goes("next steps for pricing")).toBe("note");
  });

  it("knows a contact and a hobby with a slip in the name", () => {
    expect(readCapture("called oakrige, no answer", known, at)).toMatchObject({ kind: "contact", contact: { id: "c1" } });
    expect(readCapture("gutar 40 mins", known, at)).toMatchObject({ kind: "hobby", hobby: { id: "h1" }, minutes: 40 });
    expect(readCapture("guitar 1h30", known, at).minutes).toBe(90);
  });

  it("keeps the words as typed, however it read them", () => {
    expect(readCapture("ion feel good today", known, at).text).toBe("ion feel good today");
  });
});

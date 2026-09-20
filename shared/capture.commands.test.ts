import { describe, expect, it } from "vitest";
import { readCapture, type Known } from "./capture";

/** The line, asked to do something rather than to keep something. Thursday 10 September 2026, ten in the morning. */

const at = { today: "2026-09-10", now: 10 * 60 };
const known: Known = {
  contacts: [{ id: "c1", name: "MS PUC", person: "Rahul Nair" }],
  hobbies: [],
  tasks: [{ id: "t1", title: "Gym" }],
};
const read = (line: string) => readCapture(line, known, at);

describe("asked to do something", () => {
  it("goes where it is told, logs what was spent, and adds who it is told to", () => {
    expect(read("go to money")).toMatchObject({ kind: "command", ask: { do: "go", place: "money" } });
    expect(read("pls open the calendar")).toMatchObject({ kind: "command", ask: { do: "go", place: "day" } });
    expect(read("spent 500 on hosting")).toMatchObject({ kind: "command", ask: { do: "spend", amount: 500, what: "Hosting" } });
    expect(read("add contact priya sharma from oakridge, 98450 12345")).toMatchObject({
      kind: "command",
      ask: { do: "contact", name: "Oakridge", person: "Priya Sharma", phone: "98450 12345" },
    });
  });

  it("offers the command first, and everything it could have been after it", () => {
    expect(read("go to money").options[0]).toBe("command");
    expect(read("go to money").options).toContain("task");
  });

  it("opens a contact to write to or call them now - and makes a task of it when it says when", () => {
    expect(read("email rahul")).toMatchObject({ kind: "command", ask: { do: "open", contact: { id: "c1" }, how: "email" } });
    expect(read("call ms puc")).toMatchObject({ kind: "command", ask: { do: "open", how: "call" } });
    expect(read("whatsapp rahul")).toMatchObject({ ask: { how: "message" } });
    expect(read("call rahul tmrw 11")).toMatchObject({ kind: "task", ask: null });
    expect(read("i need to email rahul")).toMatchObject({ kind: "task", ask: null });
    // Wanting to is now; needing to is for the list.
    expect(read("send email to rahul from ms puc")).toMatchObject({ kind: "command", ask: { do: "open", how: "email", contact: { id: "c1" } } });
    expect(read("i want to call ms puc college, rahul")).toMatchObject({ kind: "command", ask: { do: "open", how: "call" } });
    expect(read("lemme drop a message to rahul")).toMatchObject({ ask: { how: "message" } });
    expect(read("send an email to rahul tomorrow")).toMatchObject({ kind: "task" });
    // What happened is still their history, not a command.
    expect(read("called rahul, no answer")).toMatchObject({ kind: "contact", ask: null });
  });

  it("is not asked for by a thing to do, or a day looked back on", () => {
    expect(read("go to the gym today at 5").kind).toBe("task");
    expect(read("pay 500 for hosting tomorrow").kind).toBe("task");
    expect(read("went to the gym, felt good").kind).toBe("done");
    expect(read("add milk to the list")).toMatchObject({ ask: null });
  });

  it("is not read out of a line that said what it was", () => {
    expect(read("note: go to money")).toMatchObject({ kind: "note", ask: null });
  });
});
